import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  lstat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { migrateLegacyStudent } from "../lib/student-migration.mjs";
import { startStudentServer } from "../scripts/serve-student.mjs";

// Captured once from the actual immutable 501ddd bootstrap. Developer evidence
// is deliberately excluded from the plugin so no legacy app or seed ships.
const captured = await readFile(
  new URL("../reviews/fixtures/legacy-501ddd-source.json", import.meta.url),
  "utf8",
)
  .then(JSON.parse)
  .catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
const skip = captured
  ? false
  : "Historical developer fixture is not distributed in the student/plugin bundle.";
const templateRoot = resolve(".");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const exists = async (path) =>
  !!(await lstat(path).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  }));
async function fixture(context, { deployed = false } = {}) {
  const parent = await mkdtemp(join(tmpdir(), "semester-migration-test-"));
  context.after(() =>
    rm(parent, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    }),
  );
  const root = join(parent, "Existing student");
  await mkdir(root);
  for (const [path, value] of Object.entries(captured.contents)) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(value, "base64"));
  }
  await mkdir(join(root, ".semester-navigator"));
  await mkdir(join(root, ".openai"));
  const profile = {
    schema_version: 1,
    instance_key: "son",
    profile_id: "synthetic-legacy-student",
    display_name: "Synthetic Legacy Student",
    school: "Example School",
    semester: "Fall 2026",
    timezone: "America/New_York",
    age_eligible: true,
    shared_chatgpt_account: false,
    approved_local_root: root,
    approved_cloud_root: "approved coursework folder",
    browser_profile: "School browser",
    expected_accounts: { school: "synthetic@example.invalid" },
    site_record: ".semester-navigator/site.json",
    last_verified: "2026-08-24",
  };
  const site = {
    schema_version: 1,
    instance_key: "son",
    profile_id: profile.profile_id,
    student_display_name: profile.display_name,
    status: deployed ? "deployed" : "not_created",
    provisioning_status: deployed ? "confirmed" : "source_ready",
    project_id: deployed ? "synthetic-existing-project" : null,
    url: deployed ? "https://synthetic-existing.example.invalid" : null,
    access_mode: "owner-only",
    storage: "dedicated-d1",
    d1_binding: "DB",
    r2_binding: null,
    source_root: root,
    browser_profile: profile.browser_profile,
    last_verified: "2026-08-24",
  };
  const seed = {
    profileId: profile.profile_id,
    name: profile.display_name,
    school: profile.school,
    theme: "light",
    workHours: "",
    refreshedAt: "Not refreshed yet",
    courses: [
      {
        id: "math",
        name: "Math",
        instructor: "Known instructor",
        officeHours: "Tuesday 2 PM",
        grade: "88%",
        status: "On track",
        next: "Homework",
        completed: 0,
        total: 2,
      },
    ],
    tasks: [
      {
        id: "hw",
        course: "Math",
        title: "Homework",
        when: "Today",
        minutes: 30,
        state: "next",
        reason: "Read the prompt",
      },
    ],
  };
  const hosting = {
    d1: "DB",
    r2: null,
    ...(deployed ? { project_id: site.project_id } : {}),
  };
  for (const [path, value] of [
    [".semester-navigator/profile.json", profile],
    [".semester-navigator/site.json", site],
    [".openai/hosting.json", hosting],
    ["app/student-seed.json", seed],
  ])
    await writeFile(join(root, path), JSON.stringify(value, null, 2) + "\n");
  await writeFile(
    join(root, "chatgpt.md"),
    "# Existing private context\nKeep this exact approved context.\n",
  );
  const recovered = {
    ...seed,
    theme: "dark",
    workHours: "Monday after practice",
    tasks: [
      { ...seed.tasks[0], state: "done", notes: "Recovered draft notes" },
      {
        id: "exam",
        course: "Math",
        title: "Exam",
        when: "2026-09-18",
        minutes: 45,
        state: "next",
        reason: "Use actual class notes",
      },
    ],
  };
  const planFile = join(parent, "reviewed-recovered-plan.json");
  await writeFile(planFile, JSON.stringify({ plan: recovered }));
  return { root, parent, profile, site, seed, hosting, recovered, planFile };
}
const apply = (value, extra = {}) =>
  migrateLegacyStudent({
    studentRoot: value.root,
    templateRoot,
    planFile: value.planFile,
    legacyDataReviewed: true,
    apply: true,
    ...extra,
  });
const preservedPaths = [
  ".semester-navigator/profile.json",
  ".semester-navigator/site.json",
  ".openai/hosting.json",
  "app/student-seed.json",
  "chatgpt.md",
];
async function snapshot(root) {
  return Object.fromEntries(
    await Promise.all(
      preservedPaths.map(async (path) => [
        path,
        await readFile(join(root, path), "utf8"),
      ]),
    ),
  );
}

test(
  "actual 501ddd student source migrates locally with recovered work, identity and Site binding preserved",
  { skip },
  async (context) => {
    const value = await fixture(context, { deployed: true });
    const before = await snapshot(value.root);
    const preview = await migrateLegacyStudent({
      studentRoot: value.root,
      templateRoot,
    });
    assert.equal(preview.status, "migration_available");
    assert.equal(preview.requiresRecoveredPlan, true);
    assert.deepEqual(await snapshot(value.root), before);
    assert.equal(
      await exists(join(value.root, ".semester-navigator/update-state.json")),
      false,
    );
    const result = await apply(value);
    assert.equal(result.status, "migrated");
    assert.equal(result.revision, 1);
    assert.equal(result.tasks, 2);
    assert.equal(result.unknownDeadlines, 1);
    assert.equal(result.siteBindingUnchanged, true);
    assert.equal(
      await readFile(join(value.root, ".openai/hosting.json"), "utf8"),
      before[".openai/hosting.json"],
    );
    assert.equal(
      await readFile(join(value.root, "chatgpt.md"), "utf8"),
      before["chatgpt.md"],
    );
    const profile = await json(
      join(value.root, ".semester-navigator/profile.json"),
    );
    assert.equal(profile.profile_id, value.profile.profile_id);
    assert.equal(profile.approved_local_root, value.root);
    assert.deepEqual(
      profile.expected_accounts,
      value.profile.expected_accounts,
    );
    assert.equal(
      profile.approved_cloud_root,
      value.profile.approved_cloud_root,
    );
    assert.equal(profile.machine.browser_chatgpt_session, "pending");
    const site = await json(join(value.root, ".semester-navigator/site.json"));
    for (const key of [
      "project_id",
      "url",
      "access_mode",
      "browser_profile",
      "source_root",
    ])
      assert.equal(site[key], value.site[key]);
    const envelope = await json(
      join(value.root, ".semester-navigator/plan.json"),
    );
    assert.equal(envelope.plan.tasks[0].state, "done");
    assert.equal(envelope.plan.tasks[0].notes, "Recovered draft notes");
    assert.equal(envelope.plan.tasks[0].dueAt, null);
    assert.equal(envelope.plan.tasks[1].dueAt, "2026-09-18");
    assert.equal(envelope.plan.timezone, value.profile.timezone);
    assert.equal(envelope.plan.semester, value.profile.semester);
    assert.equal(envelope.plan.workHours, "Monday after practice");
    for (const path of preservedPaths)
      assert.equal(
        await readFile(join(result.backupRoot, "files", path), "utf8"),
        before[path],
      );
    assert.match(
      execFileSync(
        process.execPath,
        [
          join(value.root, "scripts/serve-student.mjs"),
          "--root",
          value.root,
          "--check",
        ],
        { encoding: "utf8" },
      ),
      /"ready":true/,
    );
    const runtime = await startStudentServer({ root: value.root, port: 0 });
    context.after(() => new Promise((done) => runtime.server.close(done)));
    const loaded = await (await fetch(runtime.url + "/api/plan")).json();
    loaded.plan.tasks[1].state = "done";
    assert.equal(
      (
        await fetch(runtime.url + "/api/plan", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            plan: loaded.plan,
            baseRevision: loaded.revision,
          }),
        })
      ).status,
      200,
    );
    assert.equal((await apply(value)).status, "already_migrated");
    assert.equal(
      (await json(join(value.root, ".semester-navigator/plan.json"))).revision,
      2,
    );
  },
);
test(
  "legacy migration refuses unknown source edits and wrong identities before writing a baseline",
  { skip },
  async (context) => {
    const value = await fixture(context);
    await writeFile(
      join(value.root, "app/page.tsx"),
      "Unknown student customization",
    );
    const before = await snapshot(value.root);
    await assert.rejects(() => apply(value), /exact files.*app\/page.tsx/);
    assert.deepEqual(await snapshot(value.root), before);
    assert.equal(
      await exists(join(value.root, ".semester-navigator/update-state.json")),
      false,
    );
    await writeFile(
      join(value.root, "app/page.tsx"),
      Buffer.from(captured.contents["app/page.tsx"], "base64"),
    );
    const profile = { ...value.profile, approved_local_root: value.parent };
    await writeFile(
      join(value.root, ".semester-navigator/profile.json"),
      JSON.stringify(profile),
    );
    await assert.rejects(() => apply(value), /approved root/);
  },
);
test(
  "reviewed legacy data is required and seed-only cannot hide an existing private Site plan",
  { skip },
  async (context) => {
    const value = await fixture(context, { deployed: true });
    const before = await snapshot(value.root);
    await assert.rejects(
      () => apply(value, { legacyDataReviewed: false }),
      /original browser copy/,
    );
    await assert.rejects(
      () => apply(value, { planFile: undefined, useSeed: true }),
      /Seed-only recovery/,
    );
    await writeFile(
      value.planFile,
      JSON.stringify({ ...value.recovered, profileId: "wrong-student" }),
    );
    await assert.rejects(() => apply(value), /Recovered plan profileId/);
    assert.deepEqual(await snapshot(value.root), before);
    const undeployed = await fixture(context);
    const result = await apply(undeployed, {
      planFile: undefined,
      useSeed: true,
    });
    assert.equal(result.status, "migrated");
    assert.equal(result.tasks, 1);
  },
);
test(
  "the complete reviewed recovery plan preserves deletions instead of resurrecting seed or local work",
  { skip },
  async (context) => {
    const value = await fixture(context);
    await writeFile(
      join(value.root, ".semester-navigator/plan.json"),
      JSON.stringify(value.recovered),
    );
    await writeFile(
      value.planFile,
      JSON.stringify({ ...value.recovered, courses: [], tasks: [] }),
    );
    const result = await apply(value);
    assert.equal(result.courses, 0);
    assert.equal(result.tasks, 0);
    const envelope = await json(
      join(value.root, ".semester-navigator/plan.json"),
    );
    assert.deepEqual(envelope.plan.courses, []);
    assert.deepEqual(envelope.plan.tasks, []);
    assert.equal(envelope.plan.theme, "dark");
    assert.equal(
      (await json(join(result.backupRoot, "files/app/student-seed.json"))).tasks
        .length,
      1,
    );
    assert.equal(
      (
        await json(
          join(result.backupRoot, "files/.semester-navigator/plan.json"),
        )
      ).tasks.length,
      2,
    );
  },
);
test(
  "failed verification restores original files and the next migration can retry safely",
  { skip },
  async (context) => {
    const value = await fixture(context);
    const before = await snapshot(value.root);
    await assert.rejects(
      () =>
        apply(value, {
          verify: async () => {
            throw new Error("Synthetic readiness failure");
          },
        }),
      /changed files were restored.*Synthetic readiness failure/,
    );
    assert.deepEqual(await snapshot(value.root), before);
    assert.equal(
      await exists(join(value.root, "scripts/serve-student.mjs")),
      false,
    );
    assert.equal(
      await exists(join(value.root, ".semester-navigator/update-state.json")),
      false,
    );
    for (const [path, base64] of Object.entries(captured.contents))
      assert.equal(
        createHash("sha256")
          .update(await readFile(join(value.root, path)))
          .digest("hex"),
        createHash("sha256")
          .update(Buffer.from(base64, "base64"))
          .digest("hex"),
      );
    assert.equal((await apply(value)).status, "migrated");
  },
);
test(
  "a process interrupted after writing new files restores its verified snapshot before retrying",
  { skip },
  async (context) => {
    const value = await fixture(context);
    const moduleUrl = pathToFileURL(resolve("lib/student-migration.mjs")).href;
    const options = {
      studentRoot: value.root,
      templateRoot,
      planFile: value.planFile,
      legacyDataReviewed: true,
      apply: true,
    };
    const code = `const {migrateLegacyStudent}=await import(${JSON.stringify(moduleUrl)});await migrateLegacyStudent({...${JSON.stringify(options)},verify:async()=>process.exit(77)});`;
    assert.throws(
      () =>
        execFileSync(process.execPath, ["--input-type=module", "-e", code], {
          stdio: "pipe",
        }),
      (error) => error.status === 77,
    );
    assert.equal(
      (await json(join(value.root, ".semester-navigator/migration-state.json")))
        .status,
      "applying",
    );
    assert.equal(
      (await migrateLegacyStudent({ studentRoot: value.root, templateRoot }))
        .status,
      "interrupted",
    );
    const profilePath = join(value.root, ".semester-navigator/profile.json");
    const interruptedProfile = await json(profilePath);
    await writeFile(
      profilePath,
      JSON.stringify({
        ...interruptedProfile,
        profile_id: "different-student",
      }),
    );
    await assert.rejects(
      () => apply(value),
      /identity changed after migration started/,
    );
    assert.equal(
      await exists(join(value.root, ".semester-navigator/migration.lock")),
      false,
    );
    assert.equal((await json(profilePath)).profile_id, "different-student");
    await writeFile(profilePath, JSON.stringify(interruptedProfile));
    assert.equal((await apply(value)).status, "migrated");
    assert.equal(
      (await json(join(value.root, ".semester-navigator/plan.json"))).plan
        .tasks[0].notes,
      "Recovered draft notes",
    );
  },
);
