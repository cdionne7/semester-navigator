import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
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
import { initializeUpdateState, studentPackageManifest } from "./semester-update.mjs";
import { inspectStudentSite, validateDedicatedBrowser } from "./student-site-state.mjs";
import { runNpm } from "./semester-runtime.mjs";
import { normalizePlan } from "./plan-model.mjs";

const INSTANCE_KEYS = new Set(["student", "son", "daughter"]);
const RESERVED_PROFILE_IDS = new Set(["son", "daughter", "student", "child"]);
const MACHINE_PLATFORMS = new Set(["windows", "macos", "linux"]);
const DEVICE_MODES = new Set(["own-device", "own-os-user", "shared-os-user", "unknown"]);
const DESKTOP_APP_STATUSES = new Set(["installed", "not-installed", "declined", "not-supported", "unknown"]);
const SITE_BROWSERS = new Set(["edge", "chrome", "safari", "firefox", "other", "pending"]);
const VERIFICATION_STATUSES = new Set(["verified", "pending"]);
const PASSKEY_STATUSES = new Set(["enabled", "not-enabled", "unavailable", "unknown"]);
const SOURCE_ENTRIES = [
  ".gitignore",
  "app",
  "build",
  "cloudflare-env.d.ts",
  "dashboard",
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
  "vite.dashboard.config.ts",
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

async function physicalPath(path) {
  let existing = path;
  const suffix = [];
  while (!(await pathExists(existing))) {
    const parent = dirname(existing);
    if (parent === existing) fail("Cannot resolve the workspace destination.");
    suffix.unshift(relative(parent, existing));
    existing = parent;
  }
  return join(await realpath(existing), ...suffix);
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
- Optional hosting template: \`${join(site.source_root, ".openai", "hosting.example.json")}\`
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

export function validateIntake(value) {
  if (!value || value.schema_version !== 1 || value.verified !== true) fail("Intake must use schema_version 1 and have verified: true after student confirmation.");
  const allowed = new Set(["schema_version", "verified", "plan", "expected_accounts", "approved_cloud_root", "connected_sources", "preferences"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`Unsupported intake field: ${key}`);
  function rejectSecrets(item) {
    if (item && typeof item === "object") {
      for (const [key, nested] of Object.entries(item)) {
        if (/password|credential|cookie|token|secret|recovery.?code/i.test(key)) fail("Intake must not contain credentials or authentication material.");
        rejectSecrets(nested);
      }
    }
  }
  rejectSecrets(value);
  const accounts = value.expected_accounts ?? {};
  if (typeof accounts !== "object" || Array.isArray(accounts)) fail("expected_accounts must be an account map.");
  for (const [key, account] of Object.entries(accounts)) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(key) || !account || account.storage_approved !== true) fail("Every stored expected account requires its own storage_approved: true.");
    account.email = validateOptionalEmail(account.email, "expected account email");
    if (!account.email) fail("A stored expected account requires an email address.");
    if (Object.keys(account).some((field) => !["email", "storage_approved"].includes(field))) fail("Expected accounts may contain only email and storage_approved.");
  }
  if (value.connected_sources !== undefined && !Array.isArray(value.connected_sources)) fail("connected_sources must be a list.");
  for (const source of value.connected_sources ?? []) {
    const allowedSource = new Set(["id", "name", "source_type", "portal_url", "status", "access_mode", "expected_account_key", "last_checked", "evidence"]);
    if (!source || typeof source !== "object" || Object.keys(source).some((key) => !allowedSource.has(key))) fail("Connected source has unsupported fields.");
    if (source.portal_url) {
      const url = new URL(source.portal_url);
      if (!new Set(["https:", "http:"]).has(url.protocol) || url.username || url.password) fail("Source URLs must not contain credentials.");
    }
  }
  if (value.approved_cloud_root !== undefined && value.approved_cloud_root !== null) requireText(value.approved_cloud_root, "approved_cloud_root", 2048);
  if (value.plan !== undefined && (!value.plan || typeof value.plan !== "object" || Array.isArray(value.plan))) fail("Intake plan must be an object.");
  return structuredClone(value);
}

export async function resumeStudentSite(options) {
  const state = await inspectStudentSite(options);
  for (const [option, field] of [["profileId", "profile_id"], ["displayName", "display_name"], ["school", "school"], ["semester", "semester"], ["timezone", "timezone"], ["instanceKey", "instance_key"], ["browserProfile", "browser_profile"]]) {
    if (options[option] !== undefined && options[option] !== state.profile[field]) fail(`Resume ${option} does not match the existing student workspace. Nothing was overwritten.`);
  }
  for (const [option, field] of [["machinePlatform", "platform"], ["siteBrowser", "site_browser"], ["deviceMode", "device_mode"]]) {
    if (options[option] !== undefined && options[option] !== state.profile.machine?.[field]) fail(`Resume ${option} does not match the existing student workspace.`);
  }
  if (options.intake) {
    const intake = validateIntake(options.intake);
    const stored = JSON.parse(await readFile(join(state.studentRoot, ".semester-navigator", "intake.json"), "utf8"));
    if (JSON.stringify(intake) !== JSON.stringify(stored)) fail("Resume intake differs from the confirmed saved intake. Review changes in the existing workspace instead of overwriting them.");
  }
  return {
    instance_key: state.profile.instance_key, profile_id: state.profile.profile_id,
    student_root: state.studentRoot, browser_profile: state.profile.browser_profile,
    site_status: state.site.status, provisioning_status: state.site.provisioning_status,
    setup_status: state.profile.setup?.status ?? "source_ready", resumed: true,
    hosting_manifest: state.hostingExists ? state.hostingPath : null,
    hosting_template: join(state.studentRoot, ".openai", "hosting.example.json"),
    next_action: "Continue in this same student workspace. Saved plans and the existing Site are preserved.",
  };
}

export async function prepareStudentSite(options, run = runNpm) {
  const state = await inspectStudentSite(options);
  if (state.profile.setup?.status === "prepared" && options.force !== true) return { prepared: true, resumed: true };
  const previous = state.profile.setup ?? { intake_verified: true, last_completed_stage: "intake" };
  let stage = "dependencies";
  const checkpoint = async (status, extra = {}) => {
    state.profile.setup = { ...previous, ...state.profile.setup, status, failed_stage: null, last_error: null, updated_at: new Date().toISOString(), ...extra };
    await writeJson(state.profilePath, state.profile);
  };
  try {
    await checkpoint("preparing");
    await run(state.studentRoot, ["ci"]);
    await checkpoint("dependencies_ready", { last_completed_stage: "dependencies" });
    stage = "build_and_test";
    await run(state.studentRoot, ["test"]);
    await checkpoint("prepared", { last_completed_stage: "build_and_test" });
    return { prepared: true, resumed: true };
  } catch (error) {
    await checkpoint("failed", { failed_stage: stage, last_error: `Preparation failed during ${stage}. Retry preparation in this same student workspace.` });
    throw new Error(`Student preparation stopped during ${stage}. The saved intake, plan, and Site binding were kept. Retry in the same workspace. ${error.message}`);
  }
}

export async function bootstrapStudentSite(options) {
  const templateRoot = resolve(requireText(options.templateRoot, "templateRoot", 1024));
  const requestedRoot = requireText(options.studentRoot, "studentRoot", 1024);
  if (!isAbsolute(requestedRoot)) {
    fail("studentRoot must be an absolute path.");
  }
  const studentRoot = resolve(requestedRoot);
  const instanceKey = requireText(options.instanceKey ?? "student", "instanceKey", 20);
  if (!INSTANCE_KEYS.has(instanceKey)) {
    fail("instanceKey must be student, son, or daughter.");
  }
  if (options.ageEligible !== true) {
    fail("A student Site cannot be prepared until age eligibility is confirmed as yes.");
  }
  const physicalStudentRoot = await physicalPath(studentRoot);
  for (const candidateRoot of new Set([studentRoot, physicalStudentRoot])) {
    for (let ancestor = dirname(candidateRoot); ; ancestor = dirname(ancestor)) {
      if (await pathExists(join(ancestor, ".semester-navigator", "profile.json"))) {
        fail("studentRoot is inside another student workspace. Choose a separate sibling folder so each student's project contains only their own records. Nothing was overwritten.");
      }
      if (dirname(ancestor) === ancestor) break;
    }
  }
  if (await pathExists(studentRoot)) {
    if (!(await pathExists(join(studentRoot, ".semester-navigator", "profile.json")))) {
      fail(`studentRoot already exists but has no verified student profile. Nothing was overwritten: ${studentRoot}`);
    }
    return resumeStudentSite({ ...options, studentRoot });
  }
  if (await pathExists(join(templateRoot, ".semester-navigator", "profile.json"))) {
    fail("Create a new student from the verified template package, never from another student's workspace.");
  }
  const physicalTemplateRoot = await realpath(templateRoot);
  if (isWithin(physicalStudentRoot, physicalTemplateRoot) || isWithin(physicalTemplateRoot, physicalStudentRoot)) {
    fail("studentRoot must be separate from the canonical template root.");
  }

  const profileId = validateProfileId(options.profileId);
  const displayName = requireText(options.displayName, "displayName", 80);
  const school = requireText(options.school, "school", 160);
  const semester = requireText(options.semester, "semester", 80);
  const timezone = validateTimezone(options.timezone);
  const machinePlatform = requireChoice(options.machinePlatform ?? ({ win32: "windows", darwin: "macos", linux: "linux" }[process.platform]), "machinePlatform", MACHINE_PLATFORMS);
  const deviceMode = requireChoice(options.deviceMode ?? "unknown", "deviceMode", DEVICE_MODES);
  const desktopApp = requireChoice(options.desktopApp ?? "unknown", "desktopApp", DESKTOP_APP_STATUSES);
  if (machinePlatform === "windows" && desktopApp === "not-supported") {
    fail("desktopApp cannot be not-supported on Windows.");
  }
  const siteBrowser = requireChoice(options.siteBrowser ?? "pending", "siteBrowser", SITE_BROWSERS);
  const browserIntegration = options.browserIntegration === true;
  const browserProfile = options.browserProfile ? validateDedicatedBrowser(options.browserProfile) : null;
  if (browserIntegration && (!browserProfile || !new Set(["edge", "chrome"]).has(siteBrowser))) {
    fail("A browser integration requires a dedicated named Edge or Chrome profile. Upload-only setup can keep browser access pending.");
  }
  const browserSession = requireChoice(options.browserSession ?? "pending", "browserSession", VERIFICATION_STATUSES);
  const browserSessionPersistence = requireChoice(
    options.browserSessionPersistence ?? "pending",
    "browserSessionPersistence",
    VERIFICATION_STATUSES,
  );
  const passkeyStatus = requireChoice(options.passkeyStatus ?? "unknown", "passkeyStatus", PASSKEY_STATUSES);
  options = { storeSiteViewerEmail: false, sharedChatgptAccount: false, automaticUpdates: false, ...options };
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

  const intake = validateIntake(options.intake ?? { schema_version: 1, verified: true });

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
    const studentPackage = studentPackageManifest(JSON.parse(await readFile(studentPackagePath, "utf8")));
    await writeJson(studentPackagePath, studentPackage);

    await Promise.all([
      rm(join(stagingRoot, "scripts", "install-windows.ps1"), { force: true }),
      rm(join(stagingRoot, "tests", "gpt-instructions.test.mjs"), { force: true }),
      rm(join(stagingRoot, "tests", "semester-update.test.mjs"), { force: true }),
      rm(join(stagingRoot, "tests", "student-site-bootstrap.test.mjs"), { force: true }),
      rm(join(stagingRoot, "tests", "windows-onboarding.test.mjs"), { force: true }),
    ]);

    const portableNode = join(templateRoot, ".tools", "node");
    if (await pathExists(join(portableNode, "node.exe"))) {
      await cp(portableNode, join(stagingRoot, ".tools", "node"), { recursive: true, errorOnExist: true });
    }
    const playbookSource = join(templateRoot, "plugins", "semester-navigator", "skills", "semester-navigator");
    if (!(await pathExists(join(playbookSource, "SKILL.md")))) fail("The template is missing its bundled Semester Navigator playbook.");
    await cp(playbookSource, join(stagingRoot, ".semester-navigator", "playbook"), { recursive: true });
    // The private workspace can resume without opening the canonical template.
    await mkdir(join(stagingRoot, "reference"), { recursive: true });
    for (const filename of ["agents-template.md", "chatgpt-template.md", "update-manifest.json"]) {
      await cp(join(templateRoot, "reference", filename), join(stagingRoot, "reference", filename));
    }

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
      approved_cloud_root: intake.approved_cloud_root ?? null,
      browser_profile: browserProfile,
      machine: {
        platform: machinePlatform,
        browser_integration: browserIntegration,
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
      expected_accounts: Object.fromEntries(Object.entries(intake.expected_accounts ?? {}).map(([key, value]) => [key, value.email])),
      connected_sources: intake.connected_sources ?? [],
      setup: { status: "source_ready", intake_verified: true, last_completed_stage: "intake", failed_stage: null, last_error: null, updated_at: new Date().toISOString() },
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
    const initialPlan = intake.plan ?? {};
    for (const [key, expected] of [["profileId", profileId], ["name", displayName], ["school", school]]) {
      if (initialPlan[key] !== undefined && initialPlan[key] !== expected) fail(`Intake plan ${key} does not match the confirmed student.`);
    }
    const seed = normalizePlan({
      ...initialPlan, profileId, name: displayName, school, semester, timezone,
      theme: initialPlan.theme ?? "light", workHours: initialPlan.workHours ?? "",
      refreshedAt: initialPlan.refreshedAt ?? "Not refreshed yet",
      courses: initialPlan.courses ?? [], tasks: initialPlan.tasks ?? [],
    }, profileId);


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
      "[student-specific browser profile]": browserProfile ?? "pending",
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
    await writeJson(join(stagingRoot, ".openai", "hosting.example.json"), hosting);
    await writeJson(join(stagingRoot, ".semester-navigator", "profile.json"), profile);
    await writeJson(join(stagingRoot, ".semester-navigator", "site.json"), site);
    await writeJson(join(stagingRoot, "app", "student-seed.json"), seed);
    await writeJson(join(stagingRoot, ".semester-navigator", "intake.json"), intake);
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
    const stagedHosting = JSON.parse(await readFile(join(stagingRoot, ".openai", "hosting.example.json"), "utf8"));
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
      hosting_manifest: null,
      hosting_template: join(studentRoot, ".openai", "hosting.example.json"),
      update_release: JSON.parse(
        await readFile(join(studentRoot, ".semester-navigator", "update-state.json"), "utf8"),
      ).release,
      resumed: false,
      setup_status: "source_ready",
      next_action: "Open this student workspace and its local dashboard. Review the first plan; a hosted Site is optional.",
    };
  } finally {
    if (!completed) {
      await rm(stagingRoot, { recursive: true, force: true });
    }
  }
}

export { SOURCE_ENTRIES };
