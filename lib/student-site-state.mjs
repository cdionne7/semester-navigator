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

function renderStudentSiteSection(site) {
  return `## Student Site

- Status: ${site.status}
- Sites project ID: ${site.project_id}
- URL: ${site.url}
- Access: \`Owner-only unless a later audience change is explicitly approved\`
- Durable storage: \`Dedicated D1 confirmed for this Site and student profile\`
- Source root: \`${site.source_root}\`
- Hosting manifest: \`${join(site.source_root, ".openai", "hosting.json")}\`
- Last verified: ${site.last_verified}

This student must not share a Sites project, URL, storage binding, source root, hosting manifest, or Chrome profile with another student. Do not use a student selector or combined family dashboard.`;
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
    fail("profile.json and site.json Chrome profiles do not match.");
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
