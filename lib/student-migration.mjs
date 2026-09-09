import { createHash, randomUUID } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  lstat,
  realpath,
  rename,
  rm,
  open,
  cp,
} from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { normalizePlan, createPlanService } from "./plan-model.mjs";
import { createFilePlanStore } from "./plan-store.mjs";
import {
  updateSemesterNavigator,
  verifyLocalUpdateState,
} from "./semester-update.mjs";
import { startStudentServer } from "../scripts/serve-student.mjs";

const legacy = JSON.parse(
  await readFile(
    new URL("./legacy-student-501ddd.json", import.meta.url),
    "utf8",
  ),
);
const MARKER = ".semester-navigator/migration-state.json";
const PROTECTED = [
  ".semester-navigator/profile.json",
  ".semester-navigator/site.json",
  ".semester-navigator/plan.json",
  ".semester-navigator/update-state.json",
  "app/student-seed.json",
  ".openai/hosting.json",
  "chatgpt.md",
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const exists = async (path) =>
  !!(await lstat(path).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  }));
function fail(message) {
  throw new Error(message);
}
function inside(root, path) {
  if (
    typeof path !== "string" ||
    !path ||
    path.includes("\\") ||
    path.split("/").some((part) => ["", "..", "."].includes(part)) ||
    isAbsolute(path)
  )
    fail("Migration received an unsafe relative path.");
  const target = resolve(root, path);
  if (relative(root, target).startsWith(".."))
    fail("Migration path escaped the workspace.");
  return target;
}
async function noLinks(root, path) {
  let current = root;
  for (const part of path.split("/")) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        fail(`Migration stopped at a symbolic link: ${path}`);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
  }
}
async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {
      mode: 0o600,
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function inspectLegacy(root) {
  if ((await lstat(root)).isSymbolicLink())
    fail("Open the original student folder, not a symbolic link.");
  for (const path of PROTECTED) await noLinks(root, path);
  const profile = await json(join(root, ".semester-navigator/profile.json"));
  const site = await json(join(root, ".semester-navigator/site.json"));
  const hosting = await json(join(root, ".openai/hosting.json"));
  const seed = await json(join(root, "app/student-seed.json"));
  if (profile.schema_version !== 1 || site.schema_version !== 1)
    fail(
      "This migration supports only the verified 501ddd legacy student format. Use the existing workspace updater for a newer format.",
    );
  if (
    !["son", "daughter"].includes(profile.instance_key) ||
    !profile.profile_id ||
    !profile.display_name ||
    !profile.school ||
    !profile.timezone ||
    !profile.semester ||
    profile.age_eligible !== true
  )
    fail(
      "The legacy student identity or eligibility record is incomplete. Review it before migration.",
    );
  if (
    !isAbsolute(profile.approved_local_root ?? "") ||
    !isAbsolute(site.source_root ?? "") ||
    resolve(profile.approved_local_root) !== root ||
    resolve(site.source_root) !== root
  )
    fail(
      "The legacy student root does not match its approved root. Nothing was changed.",
    );
  if (
    site.profile_id !== profile.profile_id ||
    site.student_display_name !== profile.display_name ||
    site.instance_key !== profile.instance_key ||
    site.browser_profile !== profile.browser_profile
  )
    fail(
      "The legacy student and Site identities do not match. Nothing was changed.",
    );
  if (
    hosting.d1 !== "DB" ||
    hosting.r2 !== null ||
    !["owner-only", "selected-users"].includes(site.access_mode)
  )
    fail("The legacy private Site storage or audience needs review.");
  if ((site.project_id ?? null) !== (hosting.project_id ?? null))
    fail("The legacy Site project ID does not match its hosting manifest.");
  if (site.project_id) {
    let url;
    try {
      url = new URL(site.url);
    } catch {
      fail("The legacy Site URL needs review.");
    }
    if (
      site.status !== "deployed" ||
      url.protocol !== "https:" ||
      url.username ||
      url.password
    )
      fail("The legacy deployment record needs review.");
  } else if (site.status !== "not_created")
    fail(
      "The legacy Site state is ambiguous. Verify whether a Site already exists.",
    );
  for (const [key, value] of [
    ["profileId", profile.profile_id],
    ["name", profile.display_name],
    ["school", profile.school],
  ])
    if (seed[key] !== value)
      fail(`The legacy seed ${key} does not match the student profile.`);
  const conflicts = [];
  for (const [path, expected] of Object.entries(legacy.managedFiles)) {
    await noLinks(root, path);
    try {
      if (hash(await readFile(inside(root, path))) !== expected)
        conflicts.push(path);
    } catch (error) {
      if (error.code === "ENOENT") conflicts.push(path + " (missing)");
      else throw error;
    }
  }
  if (conflicts.length)
    fail(
      "Legacy source differs from the verified 501ddd release. Review these exact files before migration: " +
        conflicts.join(", "),
    );
  if (await exists(join(root, ".semester-navigator/update-state.json")))
    fail(
      "This legacy workspace already has update tracking; review its origin instead of replacing the baseline.",
    );
  const local = (await exists(join(root, ".semester-navigator/plan.json")))
    ? await json(join(root, ".semester-navigator/plan.json"))
    : null;
  if (local) normalizePlan(local.plan ?? local, profile.profile_id);
  return { profile, site, hosting, seed, local };
}

async function templateRelease(templateRoot, studentRoot) {
  if (await exists(join(templateRoot, ".semester-navigator/profile.json")))
    fail(
      "Migration requires the verified installed template, not another student workspace.",
    );
  const templatePhysical = await realpath(templateRoot),
    studentPhysical = await realpath(studentRoot);
  const contains = (parent, child) => {
    const path = relative(parent, child);
    return path === "" || (!path.startsWith("..") && !isAbsolute(path));
  };
  if (
    contains(templatePhysical, studentPhysical) ||
    contains(studentPhysical, templatePhysical)
  )
    fail(
      "The installed template and student workspace must be separate folders.",
    );
  const manifest = await json(
    join(templateRoot, "reference/update-manifest.json"),
  );
  if (
    manifest.schema_version !== 1 ||
    !/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(manifest.release) ||
    !Array.isArray(manifest.student_files)
  )
    fail("The installed template has no valid student release manifest.");
  const entries = manifest.student_files.map((entry) =>
    typeof entry === "string" ? { source: entry, destination: entry } : entry,
  );
  for (const entry of entries) {
    inside(templateRoot, entry.source);
    inside(studentRoot, entry.destination ?? entry.source);
    await noLinks(templateRoot, entry.source);
    await readFile(join(templateRoot, entry.source));
  }
  for (const required of [
    "public/dashboard/index.html",
    "scripts/serve-student.mjs",
    "lib/plan-model.mjs",
  ])
    if (
      !entries.some((entry) => (entry.destination ?? entry.source) === required)
    )
      fail("The installed bundle is incomplete: " + required);
  return { manifest, entries };
}

async function restore(root, marker) {
  if (
    marker.schemaVersion !== 1 ||
    marker.root !== root ||
    typeof marker.backupRoot !== "string" ||
    !marker.backupRoot.startsWith(".semester-navigator/migration-backups/")
  )
    fail("Migration recovery record does not match this workspace.");
  await noLinks(root, ".semester-navigator/profile.json");
  const currentProfile = await json(
    join(root, ".semester-navigator/profile.json"),
  );
  if (
    currentProfile.profile_id !== marker.profileId ||
    resolve(currentProfile.approved_local_root ?? "") !== root
  )
    fail(
      "The student identity changed after migration started. Nothing was restored over the different profile.",
    );
  const backup = await json(inside(root, marker.backupRoot + "/backup.json"));
  if (
    backup.root !== root ||
    backup.profileId !== marker.profileId ||
    !Array.isArray(backup.files)
  )
    fail("Migration backup does not match this student.");
  for (const record of backup.files) {
    const target = inside(root, record.path);
    await noLinks(root, record.path);
    if (record.existed) {
      const bytes = await readFile(
        inside(root, marker.backupRoot + "/files/" + record.path),
      );
      if (hash(bytes) !== record.sha256)
        fail("Migration backup is damaged: " + record.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    } else await rm(target, { force: true });
  }
  if (backup.createdRuntime)
    await rm(join(root, ".tools/node"), { recursive: true, force: true });
  await writeJson(join(root, MARKER), { ...marker, status: "rolled_back" });
}

async function lock(root) {
  const path = join(root, ".semester-navigator/migration.lock");
  await noLinks(root, ".semester-navigator/migration.lock");
  if (await exists(path)) {
    const owner = await json(path).catch(() => null);
    let dead = false;
    if (
      owner?.host === hostname() &&
      Number.isInteger(owner.pid) &&
      owner.pid > 0
    ) {
      try {
        process.kill(owner.pid, 0);
      } catch (error) {
        dead = error.code === "ESRCH";
      }
    }
    if (!dead)
      fail(
        "Another migration may still be running. Keep this folder and retry after it has stopped.",
      );
    await rm(path);
  }
  const handle = await open(path, "wx", 0o600);
  await handle.writeFile(
    JSON.stringify({ pid: process.pid, host: hostname() }),
  );
  return async () => {
    await handle.close();
    await rm(path, { force: true });
  };
}

/** The selected recovered plan and old browser state must be reviewed before apply.
 * Neither this routine nor the source updater accesses an old private Site. */
export async function migrateLegacyStudent({
  studentRoot,
  templateRoot,
  planFile,
  useSeed = false,
  legacyDataReviewed = false,
  apply = false,
  verify = async (root) => startStudentServer({ root, check: true }),
}) {
  const root = resolve(studentRoot),
    template = resolve(templateRoot);
  if (!isAbsolute(studentRoot) || !isAbsolute(templateRoot))
    fail("Use absolute student and template folder paths.");
  if ((await lstat(root)).isSymbolicLink())
    fail("Open the original student folder, not a symbolic link.");
  const previous = (await exists(join(root, MARKER)))
    ? await json(join(root, MARKER))
    : null;
  if (previous?.status === "complete") {
    const verified = await verifyLocalUpdateState({ root, mode: "student" });
    return {
      status: "already_migrated",
      profileId: previous.profileId,
      root,
      release: verified.release,
      backupRoot: inside(root, previous.backupRoot),
    };
  }
  if (previous && ["applying", "failed"].includes(previous.status) && !apply)
    return {
      status: "interrupted",
      root,
      profileId: previous.profileId,
      nextAction:
        "Repeat migration with the reviewed input to restore its backup and retry safely.",
    };
  let unlock;
  if (apply) {
    unlock = await lock(root);
  }
  try {
    if (apply && previous && ["applying", "failed"].includes(previous.status))
      await restore(root, previous);
    const state = await inspectLegacy(root);
    const release = await templateRelease(template, root);
    if (!apply)
      return {
        status: "migration_available",
        root,
        profileId: state.profile.profile_id,
        from: legacy.revision,
        to: release.manifest.release,
        deployedSite: !!state.site.project_id,
        requiresRecoveredPlan: !!state.site.project_id || !!state.local,
        nextAction:
          "Review the legacy Site/local plan and original browser backup. Supply its confirmed plan file, or explicitly choose seed-only for an undeployed workspace.",
      };
    if (!legacyDataReviewed)
      fail(
        "Review the legacy saved plan and original browser copy before migration. No student data was changed.",
      );
    if (planFile && useSeed)
      fail(
        "Choose a recovered plan file or verified seed-only recovery, not both.",
      );
    if (!planFile && (!useSeed || state.site.project_id || state.local))
      fail(
        "Supply a reviewed recovered plan file. Seed-only recovery is allowed only for an undeployed workspace with no local saved plan after its old browser state was reviewed.",
      );
    const identity = state.profile;
    const seed = normalizePlan(
      {
        ...state.seed,
        timezone: identity.timezone,
        semester: identity.semester,
      },
      identity.profile_id,
    );
    let recovered = seed;
    if (planFile) {
      const input = await json(resolve(planFile));
      const raw = input.plan ?? input;
      for (const [key, value] of [
        ["profileId", identity.profile_id],
        ["name", identity.display_name],
        ["school", identity.school],
      ])
        if (raw[key] !== value)
          fail(
            `Recovered plan ${key} does not match this student. Review the conflict before migration.`,
          );
      if (!Array.isArray(raw.courses) || !Array.isArray(raw.tasks))
        fail(
          "The reviewed recovery plan must contain its complete courses and tasks lists, not a partial source extraction.",
        );
      // This reviewed full copy is authoritative, including deliberate deletions.
      // Every older seed/local copy is retained in the migration backup.
      recovered = normalizePlan(
        {
          ...raw,
          timezone: raw.timezone ?? identity.timezone,
          semester: raw.semester ?? identity.semester,
        },
        identity.profile_id,
      );
    }
    const backupRoot =
      ".semester-navigator/migration-backups/" +
      new Date().toISOString().replaceAll(":", "-") +
      "-" +
      randomUUID();
    const paths = [
      ...new Set([
        ...Object.keys(legacy.managedFiles),
        ...release.entries.map((entry) => entry.destination ?? entry.source),
        ...PROTECTED,
      ]),
    ];
    const files = [];
    for (const path of paths) {
      await noLinks(root, path);
      const target = inside(root, path);
      const existed = await exists(target);
      if (existed) {
        const bytes = await readFile(target);
        const backup = inside(root, backupRoot + "/files/" + path);
        await mkdir(dirname(backup), { recursive: true });
        await writeFile(backup, bytes, { mode: 0o600 });
        files.push({ path, existed, sha256: hash(bytes) });
      } else files.push({ path, existed });
    }
    const createdRuntime =
      !(await exists(join(root, ".tools/node"))) &&
      (await exists(join(template, ".tools/node/node.exe")));
    await writeJson(inside(root, backupRoot + "/backup.json"), {
      schemaVersion: 1,
      root,
      profileId: identity.profile_id,
      files,
      createdRuntime,
    });
    const marker = {
      schemaVersion: 1,
      root,
      profileId: identity.profile_id,
      backupRoot,
      status: "applying",
      from: legacy.revision,
      to: release.manifest.release,
    };
    await writeJson(join(root, MARKER), marker);
    try {
      const upgraded = {
        ...identity,
        schema_version: 2,
        machine: {
          platform:
            { win32: "windows", darwin: "macos", linux: "linux" }[
              process.platform
            ] ?? "unknown",
          browser_profile: identity.browser_profile,
          browser_integration: false,
          device_mode: "unknown",
          chatgpt_desktop: "unknown",
          site_browser: "pending",
          browser_chatgpt_session: "pending",
          browser_session_persistence: "pending",
          passkey_status: "unknown",
          ...identity.machine,
        },
        site_access: {
          intended_viewer_email: null,
          viewer_email_storage_approved: false,
          recommended_mode: state.site.access_mode,
          browser_access_status: "pending",
          last_verified: null,
          ...identity.site_access,
        },
        setup: {
          status: "source_ready",
          last_completed_stage: "migration",
          intake_verified: false,
          failed_stage: null,
          last_error: null,
          ...identity.setup,
        },
      };
      const site = {
        ...state.site,
        schema_version: 2,
        audience: {
          mode: state.site.access_mode,
          viewer_email: upgraded.site_access.intended_viewer_email,
          viewer_email_storage_approved:
            upgraded.site_access.viewer_email_storage_approved,
          allowed_viewer_emails: [],
          browser_access_status: "pending",
          access_last_verified: null,
          ...state.site.audience,
        },
      };
      await writeJson(join(root, ".semester-navigator/profile.json"), upgraded);
      await writeJson(join(root, ".semester-navigator/site.json"), site);
      await writeJson(join(root, ".semester-navigator/update-state.json"), {
        schema_version: 1,
        mode: "student",
        verified: true,
        release: "legacy-" + legacy.revision,
        repository: "https://github.com/cdionne7/semester-navigator",
        managed_files: legacy.managedFiles,
        last_checked: new Date().toISOString(),
      });
      await updateSemesterNavigator({
        root,
        mode: "student",
        rawRoot: "https://installed-semester-template.invalid",
        fetchImpl: async (url) => {
          const parsed = new URL(url);
          if (parsed.origin !== "https://installed-semester-template.invalid")
            fail("Unexpected migration network request.");
          const path = decodeURIComponent(parsed.pathname.slice(1));
          await noLinks(template, path);
          return new Response(await readFile(inside(template, path)));
        },
      });
      if (createdRuntime)
        await cp(join(template, ".tools/node"), join(root, ".tools/node"), {
          recursive: true,
          errorOnExist: true,
        });
      await writeJson(join(root, "app/student-seed.json"), seed);
      if (await exists(join(root, ".semester-navigator/plan.json")))
        await rm(join(root, ".semester-navigator/plan.json"));
      const service = createPlanService(
        seed,
        createFilePlanStore(root, identity.profile_id),
      );
      const initial = await service.load();
      const saved = await service.save({
        plan: {
          ...recovered,
          revision: initial.revision,
          seedRevision: initial.plan.seedRevision,
        },
        baseRevision: initial.revision,
      });
      await verify(root);
      await verifyLocalUpdateState({ root, mode: "student" });
      await writeJson(join(root, MARKER), {
        ...marker,
        status: "complete",
        revision: saved.revision,
        completedAt: new Date().toISOString(),
      });
      return {
        status: "migrated",
        root,
        profileId: identity.profile_id,
        release: release.manifest.release,
        revision: saved.revision,
        courses: saved.plan.courses.length,
        tasks: saved.plan.tasks.length,
        unknownDeadlines: saved.plan.tasks.filter((task) => !task.dueAt).length,
        backupRoot: inside(root, backupRoot),
        siteBindingUnchanged: true,
        nextAction:
          "Open this workspace local dashboard and verify a saved edit. The original private Site was not deployed or changed.",
      };
    } catch (error) {
      await restore(root, marker);
      throw new Error(
        "Migration failed and its changed files were restored: " +
          error.message,
      );
    }
  } finally {
    await unlock?.();
  }
}
