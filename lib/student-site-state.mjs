import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

function fail(message) {
  throw new Error(message);
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    fail(`Cannot read valid ${label} at ${path}: ${error.message}`);
  }
}

function requireText(value, label, maximumLength = 500) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} is required.`);
  const normalized = value.trim();
  if (normalized.length > maximumLength) fail(`${label} is too long.`);
  return normalized;
}

function validateUrl(value) {
  const url = new URL(requireText(value, "url", 2048));
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    fail("url must be an HTTPS deployment URL without credentials or a fragment.");
  }
  return url.toString();
}

function validateEmail(value, label = "viewer email") {
  const email = requireText(value, label, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail(`${label} must be a valid email address.`);
  }
  return email;
}

function renderStudentSiteSection(site) {
  return `## Student Site

- Status: ${site.status}
- Sites project ID: ${site.project_id}
- URL: ${site.url}
- Access: \`${site.access_mode}\`
- Intended viewer account: \`${site.audience?.viewer_email ?? "not stored"}\`
- Allowed viewer accounts: \`${site.audience?.allowed_viewer_emails?.join(", ") || "not stored"}\`
- Browser access test: \`${site.audience?.browser_access_status ?? "pending"}\`
- Durable storage: \`Dedicated D1 confirmed for this Site and student profile\`
- Source root: \`${site.source_root}\`
- Hosting manifest: \`${join(site.source_root, ".openai", "hosting.json")}\`
- Last verified: ${site.last_verified}

This student must not share a Sites project, URL, storage binding, source root, hosting manifest, or browser profile with another student. Do not use a student selector or combined family dashboard.`;
}

function replaceStudentSiteSection(markdown, replacement) {
  const start = markdown.indexOf("## Student Site");
  const end = markdown.indexOf("## Connected sources", start + 1);
  if (start === -1 || end === -1) fail("chatgpt.md is missing the Student Site section boundary.");
  return `${markdown.slice(0, start)}${replacement}\n\n${markdown.slice(end)}`;
}

export async function inspectStudentSite(options) {
  const requestedRoot = requireText(options.studentRoot, "studentRoot", 1024);
  if (!isAbsolute(requestedRoot)) fail("studentRoot must be an absolute path.");
  const studentRoot = resolve(requestedRoot);
  const profilePath = join(studentRoot, ".semester-navigator", "profile.json");
  const sitePath = join(studentRoot, ".semester-navigator", "site.json");
  const hostingPath = join(studentRoot, ".openai", "hosting.json");
  const [profile, site, hosting] = await Promise.all([
    readJson(profilePath, "profile.json"),
    readJson(sitePath, "site.json"),
    readJson(hostingPath, "hosting.json"),
  ]);

  if (profile.profile_id !== site.profile_id) fail("profile.json and site.json profile IDs do not match.");
  if (resolve(profile.approved_local_root) !== studentRoot || resolve(site.source_root) !== studentRoot) {
    fail("Student root does not match the approved root in profile.json and site.json.");
  }
  if (profile.browser_profile !== site.browser_profile) {
    fail("profile.json and site.json browser profiles do not match.");
  }
  if (hosting.d1 !== "DB" || hosting.r2 !== null) {
    fail("Hosting manifest must request this student's dedicated DB binding and no R2 binding.");
  }
  if (site.project_id && hosting.project_id !== site.project_id) {
    fail("site.json project ID does not match the hosting manifest.");
  }

  return { studentRoot, profilePath, sitePath, hostingPath, profile, site, hosting };
}

export async function recordStudentSite(options) {
  const state = await inspectStudentSite(options);
  const expectedProfileId = requireText(options.profileId, "profileId", 64);
  if (state.profile.profile_id !== expectedProfileId) {
    fail("The requested profile ID does not match this student workspace.");
  }

  const projectId = requireText(options.projectId, "projectId", 200);
  if (state.hosting.project_id !== projectId) {
    fail("Sites must first write the same project ID to .openai/hosting.json.");
  }
  const url = validateUrl(options.url);
  if (options.accessMode !== "owner-only") {
    fail("The first student Site deployment must remain owner-only.");
  }
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) fail("today must use YYYY-MM-DD format.");

  const updatedSite = {
    ...state.site,
    status: "deployed",
    provisioning_status: "confirmed",
    project_id: projectId,
    url,
    access_mode: "owner-only",
    audience: {
      ...(state.site.audience ?? {}),
      mode: "owner-only",
      allowed_viewer_emails: [],
      browser_access_status: "pending",
      access_last_verified: null,
    },
    storage: "dedicated-d1",
    d1_binding: "DB",
    r2_binding: null,
    last_verified: today,
  };
  const chatgptPath = join(state.studentRoot, "chatgpt.md");
  const chatgpt = await readFile(chatgptPath, "utf8");
  const updatedChatgpt = replaceStudentSiteSection(chatgpt, renderStudentSiteSection(updatedSite));

  await writeFile(state.sitePath, `${JSON.stringify(updatedSite, null, 2)}\n`, "utf8");
  await writeFile(chatgptPath, updatedChatgpt, "utf8");

  return {
    profile_id: updatedSite.profile_id,
    project_id: updatedSite.project_id,
    url: updatedSite.url,
    access_mode: updatedSite.access_mode,
    status: updatedSite.status,
  };
}

export async function recordStudentSiteAccess(options) {
  const state = await inspectStudentSite(options);
  if (state.site.status !== "deployed" || !state.site.project_id || !state.site.url) {
    fail("The student Site must be deployed before its visitor access can be recorded.");
  }
  const expectedProfileId = requireText(options.profileId, "profileId", 64);
  if (state.profile.profile_id !== expectedProfileId) {
    fail("The requested profile ID does not match this student workspace.");
  }
  const browserProfile = requireText(options.browserProfile, "browserProfile", 120);
  if (browserProfile !== state.profile.browser_profile) {
    fail("The tested browser profile does not match this student workspace.");
  }
  if (options.verified !== true) {
    fail("Browser access must be tool- or user-verified before it is recorded.");
  }
  const accessMode = requireText(options.accessMode, "accessMode", 40);
  if (!new Set(["owner-only", "selected-users"]).has(accessMode)) {
    fail("Student Sites may record only owner-only or selected-users access. Public access is not allowed for private student data.");
  }
  const viewerEmails = [...new Set((options.viewerEmails ?? []).map((email) => validateEmail(email)))];
  if (accessMode === "selected-users" && viewerEmails.length === 0) {
    fail("selected-users access requires at least one verified viewer email.");
  }
  const expectedViewer = state.profile.site_access?.intended_viewer_email ?? state.site.audience?.viewer_email ?? null;
  if (expectedViewer && !viewerEmails.includes(expectedViewer)) {
    fail("The verified viewer accounts do not include this student's intended Site viewer account.");
  }
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) fail("today must use YYYY-MM-DD format.");

  const updatedSite = {
    ...state.site,
    access_mode: accessMode,
    audience: {
      ...(state.site.audience ?? {}),
      mode: accessMode,
      allowed_viewer_emails: state.site.audience?.viewer_email_storage_approved ? viewerEmails : [],
      browser_access_status: "verified",
      access_last_verified: today,
    },
    last_verified: today,
  };
  const updatedProfile = {
    ...state.profile,
    site_access: {
      ...(state.profile.site_access ?? {}),
      recommended_mode: accessMode,
      browser_access_status: "verified",
      last_verified: today,
    },
    last_verified: today,
  };
  const chatgptPath = join(state.studentRoot, "chatgpt.md");
  const chatgpt = await readFile(chatgptPath, "utf8");
  const updatedChatgpt = replaceStudentSiteSection(chatgpt, renderStudentSiteSection(updatedSite));

  await Promise.all([
    writeFile(state.sitePath, `${JSON.stringify(updatedSite, null, 2)}\n`, "utf8"),
    writeFile(state.profilePath, `${JSON.stringify(updatedProfile, null, 2)}\n`, "utf8"),
    writeFile(chatgptPath, updatedChatgpt, "utf8"),
  ]);

  return {
    profile_id: updatedSite.profile_id,
    project_id: updatedSite.project_id,
    url: updatedSite.url,
    access_mode: updatedSite.access_mode,
    browser_profile: browserProfile,
    browser_access_status: updatedSite.audience.browser_access_status,
  };
}
