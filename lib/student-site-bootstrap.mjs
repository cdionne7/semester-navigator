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

const INSTANCE_KEYS = new Set(["son", "daughter"]);
const RESERVED_PROFILE_IDS = new Set(["son", "daughter", "student", "child"]);
const SOURCE_ENTRIES = [
  ".gitignore",
  "app",
  "build",
  "db",
  "drizzle.config.ts",
  "drizzle",
  "eslint.config.mjs",
  "next-env.d.ts",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "postcss.config.mjs",
  "public",
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
- Durable storage: \`Dedicated D1 requested for this Site and student profile\`
- Source root: \`${site.source_root}\`
- Hosting manifest: \`${join(site.source_root, ".openai", "hosting.json")}\`
- Last verified: ${site.last_verified}

This student must not share a Sites project, URL, storage binding, source root, hosting manifest, or Chrome profile with another student. Do not use a student selector or combined family dashboard.`;
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
  const browserProfile = requireText(options.browserProfile, "browserProfile", 120);
  if (/^(default|profile \d+)$/i.test(browserProfile)) {
    fail("browserProfile must be a dedicated named Chrome profile, not a default profile.");
  }
  if (typeof options.sharedChatgptAccount !== "boolean") {
    fail("sharedChatgptAccount must be true or false.");
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
    delete studentPackage.scripts?.["student:bootstrap"];
    delete studentPackage.scripts?.["student:record-site"];
    await writeJson(studentPackagePath, studentPackage);

    const hosting = { d1: "DB", r2: null };
    const profile = {
      schema_version: 1,
      instance_key: instanceKey,
      profile_id: profileId,
      display_name: displayName,
      school,
      semester,
      timezone,
      age_eligible: true,
      shared_chatgpt_account: options.sharedChatgptAccount,
      approved_local_root: studentRoot,
      approved_cloud_root: null,
      browser_profile: browserProfile,
      expected_accounts: {},
      site_record: ".semester-navigator/site.json",
      last_verified: today,
    };
    const site = {
      schema_version: 1,
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
      "[student-specific Chrome profile]": browserProfile,
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
      next_action: "Open this exact source root with Sites and provision one new owner-only Site with dedicated D1 storage.",
    };
  } finally {
    if (!completed) {
      await rm(stagingRoot, { recursive: true, force: true });
    }
  }
}

export { SOURCE_ENTRIES };
