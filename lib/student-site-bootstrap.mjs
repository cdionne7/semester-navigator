import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { initializeUpdateState } from "./semester-update.mjs";

const INSTANCE_KEYS = new Set(["son", "daughter"]);
const RESERVED_PROFILE_IDS = new Set(["son", "daughter", "student", "child"]);
const MACHINE_PLATFORMS = new Set(["windows", "macos", "linux"]);
const DEVICE_MODES = new Set(["own-device", "own-os-user", "shared-os-user"]);
const DESKTOP_APP_STATUSES = new Set(["installed", "not-installed", "declined", "not-supported"]);
const SITE_BROWSERS = new Set(["edge", "chrome", "safari", "firefox", "other"]);
const VERIFICATION_STATUSES = new Set(["verified", "pending"]);
const PASSKEY_STATUSES = new Set(["enabled", "not-enabled", "unavailable", "unknown"]);
const SOURCE_ENTRIES = [
  ".gitignore",
  "app",
  "build",
  "db",
  "drizzle.config.ts",
  "drizzle",
  "eslint.config.mjs",
  "lib",
  "next-env.d.ts",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "postcss.config.mjs",
  "public",
  "scripts",
  "tests",
  "tsconfig.json",
  "vite.config.ts",
  "worker",
];

function fail(message) {
  throw new Error(message);
}

function requireText(value, label, maximumLength = 200) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${label} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    fail(`${label} must be ${maximumLength} characters or fewer.`);
  }
  return normalized;
}

function isWithin(candidate, root) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" ||
    (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}

function validateProfileId(value) {
  const profileId = requireText(value, "profileId", 64);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profileId)) {
    fail("profileId must use lowercase letters, numbers, and single hyphens.");
  }
  if (RESERVED_PROFILE_IDS.has(profileId)) {
    fail("profileId must identify the student and cannot be only son, daughter, student, or child.");
  }
  return profileId;
}

function validateTimezone(value) {
  const timezone = requireText(value, "timezone", 80);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    fail(`timezone is not a recognized IANA time zone: ${timezone}`);
  }
  return timezone;
}

function requireChoice(value, label, choices) {
  const choice = requireText(value, label, 80).toLowerCase();
  if (!choices.has(choice)) {
    fail(`${label} must be one of: ${[...choices].join(", ")}.`);
  }
  return choice;
}

function validateOptionalEmail(value, label) {
  if (value === null || value === undefined || value === "") return null;
  const email = requireText(value, label, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail(`${label} must be a valid email address.`);
  }
  return email;
}

function replaceAll(template, replacements) {
  let output = template;
  for (const [search, replacement] of Object.entries(replacements)) {
    output = output.split(search).join(replacement);
  }
  return output;
}

function renderStudentSiteSection(site) {
  const projectId = site.project_id ?? "not created";
  const url = site.url ?? "not deployed";
  return `## Student Site

- Status: ${site.status}
- Sites project ID: ${projectId}
- URL: ${url}
- Access: \`Owner-only unless a later audience change is explicitly approved\`
- Intended viewer account: \`${site.audience.viewer_email ?? "not stored"}\`
- Browser access test: \`${site.audience.browser_access_status}\`
- Durable storage: \`Dedicated D1 requested for this Site and student profile\`
- Source root: \`${site.source_root}\`
- Hosting manifest: \`${join(site.source_root, ".openai", "hosting.json")}\`
- Last verified: ${site.last_verified}

This student must not share a Sites project, URL, storage binding, source root, hosting manifest, or browser profile with another student. Do not use a student selector or combined family dashboard.`;
}

function replaceMarkdownSection(markdown, heading, nextHeading, replacement) {
  const start = markdown.indexOf(heading);
  if (start === -1) fail(`Template is missing ${heading}.`);
  const end = markdown.indexOf(nextHeading, start + heading.length);
  if (end === -1) fail(`Template is missing ${nextHeading}.`);
  return `${markdown.slice(0, start)}${replacement}\n\n${markdown.slice(end)}`;
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function bootstrapStudentSite(options) {
  const templateRoot = resolve(requireText(options.templateRoot, "templateRoot", 1024));
  const requestedRoot = requireText(options.studentRoot, "studentRoot", 1024);
  if (!isAbsolute(requestedRoot)) {
    fail("studentRoot must be an absolute path.");
  }
  const studentRoot = resolve(requestedRoot);
  const instanceKey = requireText(options.instanceKey, "instanceKey", 20);
  if (!INSTANCE_KEYS.has(instanceKey)) {
    fail("instanceKey must be son or daughter.");
  }
  if (options.ageEligible !== true) {
    fail("A student Site cannot be prepared until age eligibility is confirmed as yes.");
  }
  if (isWithin(studentRoot, templateRoot) || isWithin(templateRoot, studentRoot)) {
    fail("studentRoot must be separate from the canonical template root.");
  }
  if (await pathExists(studentRoot)) {
    fail(`studentRoot already exists; refusing to overwrite it: ${studentRoot}`);
  }

  const profileId = validateProfileId(options.profileId);
  const displayName = requireText(options.displayName, "displayName", 80);
  const school = requireText(options.school, "school", 160);
  const semester = requireText(options.semester, "semester", 80);
  const timezone = validateTimezone(options.timezone);
  const machinePlatform = requireChoice(options.machinePlatform, "machinePlatform", MACHINE_PLATFORMS);
  const deviceMode = requireChoice(options.deviceMode, "deviceMode", DEVICE_MODES);
  const desktopApp = requireChoice(options.desktopApp, "desktopApp", DESKTOP_APP_STATUSES);
  if (machinePlatform === "windows" && desktopApp === "not-supported") {
    fail("desktopApp cannot be not-supported on Windows.");
  }
  const siteBrowser = requireChoice(options.siteBrowser, "siteBrowser", SITE_BROWSERS);
  const browserProfile = requireText(options.browserProfile, "browserProfile", 120);
  if (/^(default|profile \d+)$/i.test(browserProfile)) {
    fail("browserProfile must be a dedicated named browser profile, not a default profile.");
  }
  const browserSession = requireChoice(options.browserSession, "browserSession", VERIFICATION_STATUSES);
  const browserSessionPersistence = requireChoice(
    options.browserSessionPersistence,
    "browserSessionPersistence",
    VERIFICATION_STATUSES,
  );
  const passkeyStatus = requireChoice(options.passkeyStatus, "passkeyStatus", PASSKEY_STATUSES);
  if (typeof options.storeSiteViewerEmail !== "boolean") {
    fail("storeSiteViewerEmail must be true or false.");
  }
  const siteViewerEmail = options.storeSiteViewerEmail
    ? validateOptionalEmail(options.siteViewerEmail, "siteViewerEmail")
    : null;
  if (options.storeSiteViewerEmail && !siteViewerEmail) {
    fail("siteViewerEmail is required when local storage of the viewer email is approved.");
  }
  if (typeof options.sharedChatgptAccount !== "boolean") {
    fail("sharedChatgptAccount must be true or false.");
  }
  if (typeof options.automaticUpdates !== "boolean") {
    fail("automaticUpdates must be true or false.");
  }

  const today = options.today ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    fail("today must use YYYY-MM-DD format.");
  }

  await mkdir(dirname(studentRoot), { recursive: true });
  const stagingRoot = await mkdtemp(join(dirname(studentRoot), ".semester-navigator-bootstrap-"));
  let completed = false;

  try {
    for (const entry of SOURCE_ENTRIES) {
      const source = join(templateRoot, entry);
      if (!(await pathExists(source))) fail(`Template source is missing required entry: ${entry}`);
      await cp(source, join(stagingRoot, entry), {
        recursive: true,
        errorOnExist: true,
        preserveTimestamps: true,
      });
    }

    await mkdir(join(stagingRoot, ".openai"), { recursive: true });
    await mkdir(join(stagingRoot, ".semester-navigator"), { recursive: true });

    const studentPackagePath = join(stagingRoot, "package.json");
    const studentPackage = JSON.parse(await readFile(studentPackagePath, "utf8"));
    delete studentPackage.scripts?.["setup:windows"];
    delete studentPackage.scripts?.["student:bootstrap"];
    delete studentPackage.scripts?.["student:record-site"];
    delete studentPackage.scripts?.["student:record-access"];
    studentPackage.scripts.test = "npm run build && node --test tests/rendered-html.test.mjs";
    await writeJson(studentPackagePath, studentPackage);

    await Promise.all([
      rm(join(stagingRoot, "scripts", "bootstrap-student-site.mjs"), { force: true }),
      rm(join(stagingRoot, "scripts", "record-student-site.mjs"), { force: true }),
      rm(join(stagingRoot, "scripts", "record-student-site-access.mjs"), { force: true }),
      rm(join(stagingRoot, "scripts", "install-windows.ps1"), { force: true }),
      rm(join(stagingRoot, "scripts", "setup-windows.ps1"), { force: true }),
      rm(join(stagingRoot, "lib", "student-site-bootstrap.mjs"), { force: true }),
      rm(join(stagingRoot, "lib", "student-site-state.mjs"), { force: true }),
      rm(join(stagingRoot, "tests", "gpt-instructions.test.mjs"), { force: true }),
      rm(join(stagingRoot, "tests", "semester-update.test.mjs"), { force: true }),
      rm(join(stagingRoot, "tests", "student-site-bootstrap.test.mjs"), { force: true }),
      rm(join(stagingRoot, "tests", "windows-onboarding.test.mjs"), { force: true }),
    ]);

    const hosting = { d1: "DB", r2: null };
    const profile = {
      schema_version: 2,
      instance_key: instanceKey,
      profile_id: profileId,
      display_name: displayName,
      school,
      semester,
      timezone,
      template_root: templateRoot,
      age_eligible: true,
      shared_chatgpt_account: options.sharedChatgptAccount,
      approved_local_root: studentRoot,
      approved_cloud_root: null,
      browser_profile: browserProfile,
      machine: {
        platform: machinePlatform,
        device_mode: deviceMode,
        chatgpt_desktop: desktopApp,
        site_browser: siteBrowser,
        browser_profile: browserProfile,
        browser_chatgpt_session: browserSession,
        browser_session_persistence: browserSessionPersistence,
        passkey_status: passkeyStatus,
        last_verified: today,
      },
      site_access: {
        intended_viewer_email: siteViewerEmail,
        viewer_email_storage_approved: options.storeSiteViewerEmail,
        recommended_mode: "owner-only",
        browser_access_status: "pending",
        last_verified: null,
      },
      updates: {
        enabled: options.automaticUpdates,
        repository: "https://github.com/cdionne7/semester-navigator",
        channel: "main",
        state_file: ".semester-navigator/update-state.json",
        last_checked: null,
      },
      expected_accounts: {},
      site_record: ".semester-navigator/site.json",
      last_verified: today,
    };
    const site = {
      schema_version: 2,
      instance_key: instanceKey,
      profile_id: profileId,
      student_display_name: displayName,
      status: "not_created",
      provisioning_status: "source_ready",
      project_id: null,
      url: null,
      access_mode: "owner-only",
      storage: "dedicated-d1",
      d1_binding: "DB",
      r2_binding: null,
      source_root: studentRoot,
      browser_profile: browserProfile,
      audience: {
        mode: "owner-only",
        viewer_email: siteViewerEmail,
        viewer_email_storage_approved: options.storeSiteViewerEmail,
        allowed_viewer_emails: [],
        browser_access_status: "pending",
        access_last_verified: null,
      },
      last_verified: today,
    };
    const seed = {
      profileId,
      name: displayName,
      school,
      theme: "light",
      workHours: "",
      refreshedAt: "Not refreshed yet",
      courses: [],
      tasks: [],
    };

    const chatgptTemplate = await readFile(join(templateRoot, "reference", "chatgpt-template.md"), "utf8");
    let chatgpt = replaceAll(chatgptTemplate, {
      "[student-slug]": profileId,
      "[student name]": displayName,
      "[school]": school,
      "[semester]": semester,
      "[time zone]": timezone,
      "[individual or trusted shared household account]": options.sharedChatgptAccount
        ? "trusted shared household account"
        : "individual account",
      "[student-specific browser profile]": browserProfile,
      "[machine platform]": machinePlatform,
      "[device mode]": deviceMode,
      "[installed/not-installed/declined/not-supported]": desktopApp,
      "[site browser]": siteBrowser,
      "[verified/pending browser session]": browserSession,
      "[verified/pending session persistence]": browserSessionPersistence,
      "[enabled/not-enabled/unavailable/unknown]": passkeyStatus,
      "[viewer email or not stored]": siteViewerEmail ?? "not stored",
      "[enabled/disabled]": options.automaticUpdates ? "enabled" : "disabled",
      "[absolute local path]": studentRoot,
      "[absolute student Site root]": studentRoot,
      "[YYYY-MM-DD]": today,
      "[YYYY-MM-DD/never]": today,
    });
    chatgpt = replaceMarkdownSection(
      chatgpt,
      "## Student Site",
      "## Connected sources",
      renderStudentSiteSection(site),
    );

    const agents = await readFile(join(templateRoot, "reference", "agents-template.md"), "utf8");
    await writeJson(join(stagingRoot, ".openai", "hosting.json"), hosting);
    await writeJson(join(stagingRoot, ".semester-navigator", "profile.json"), profile);
    await writeJson(join(stagingRoot, ".semester-navigator", "site.json"), site);
    await writeJson(join(stagingRoot, "app", "student-seed.json"), seed);
    await writeFile(join(stagingRoot, "chatgpt.md"), chatgpt, "utf8");
    await writeFile(join(stagingRoot, "AGENTS.md"), agents, "utf8");
    await initializeUpdateState({
      root: stagingRoot,
      mode: "student",
      templateRoot,
    });

    if (await pathExists(join(stagingRoot, ".git"))) {
      fail("Bootstrap copied repository history, which is not permitted.");
    }
    const stagedHosting = JSON.parse(await readFile(join(stagingRoot, ".openai", "hosting.json"), "utf8"));
    if (Object.hasOwn(stagedHosting, "project_id")) {
      fail("Fresh student hosting manifest must not contain project_id.");
    }

    await rename(stagingRoot, studentRoot);
    completed = true;
    return {
      instance_key: instanceKey,
      profile_id: profileId,
      student_root: studentRoot,
      browser_profile: browserProfile,
      site_status: site.status,
      provisioning_status: site.provisioning_status,
      hosting_manifest: join(studentRoot, ".openai", "hosting.json"),
      update_release: JSON.parse(
        await readFile(join(studentRoot, ".semester-navigator", "update-state.json"), "utf8"),
      ).release,
      next_action: "Install and test this exact student root, then open it with Sites and provision one new owner-only Site with dedicated D1 storage.",
    };
  } finally {
    if (!completed) {
      await rm(stagingRoot, { recursive: true, force: true });
    }
  }
}

export { SOURCE_ENTRIES };
