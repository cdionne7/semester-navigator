import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { bootstrapStudentSite } from "../lib/student-site-bootstrap.mjs";
import { inspectStudentSite, recordStudentSite } from "../lib/student-site-state.mjs";

const templateRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function setupOptions(temporaryRoot, instanceKey) {
  const isSon = instanceKey === "son";
  return {
    templateRoot,
    instanceKey,
    profileId: isSon ? "alex-example-2026" : "jordan-school-2026",
    displayName: isSon ? "Alex" : "Jordan",
    school: isSon ? "Example University" : "Example School",
    semester: "Fall 2026",
    timezone: "America/New_York",
    studentRoot: join(temporaryRoot, isSon ? "alex-semester-navigator" : "jordan-semester-navigator"),
    browserProfile: isSon ? "Alex - Example" : "Jordan - School",
    ageEligible: true,
    sharedChatgptAccount: true,
    today: "2026-08-23",
  };
}

test("son and daughter bootstraps create isolated fresh Site projects", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "semester-navigator-isolation-"));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));

  const sonOptions = setupOptions(temporaryRoot, "son");
  const daughterOptions = setupOptions(temporaryRoot, "daughter");
  const [sonResult, daughterResult] = await Promise.all([
    bootstrapStudentSite(sonOptions),
    bootstrapStudentSite(daughterOptions),
  ]);

  assert.notEqual(sonResult.student_root, daughterResult.student_root);
  assert.notEqual(sonResult.profile_id, daughterResult.profile_id);
  assert.notEqual(sonResult.browser_profile, daughterResult.browser_profile);

  const [sonState, daughterState] = await Promise.all([
    inspectStudentSite({ studentRoot: sonResult.student_root }),
    inspectStudentSite({ studentRoot: daughterResult.student_root }),
  ]);
  for (const state of [sonState, daughterState]) {
    assert.equal(Object.hasOwn(state.hosting, "project_id"), false);
    assert.deepEqual(state.hosting, { d1: "DB", r2: null });
    assert.equal(state.site.status, "not_created");
    assert.equal(state.site.provisioning_status, "source_ready");
    assert.equal(state.site.project_id, null);
    assert.equal(state.site.url, null);
    assert.equal(state.site.access_mode, "owner-only");
    assert.equal(state.site.storage, "dedicated-d1");
  }

  const canonicalHosting = JSON.parse(await readFile(join(templateRoot, ".openai", "hosting.example.json"), "utf8"));
  assert.deepEqual(canonicalHosting, { d1: null, r2: null });
  for (const state of [sonState, daughterState]) {
    const generatedFiles = await Promise.all([
      readFile(state.hostingPath, "utf8"),
      readFile(state.profilePath, "utf8"),
      readFile(state.sitePath, "utf8"),
      readFile(join(state.studentRoot, "chatgpt.md"), "utf8"),
      readFile(join(state.studentRoot, "app", "student-seed.json"), "utf8"),
    ]);
    assert.ok(generatedFiles.every((content) => !content.includes("appgprj_")));
    const seed = JSON.parse(generatedFiles.at(-1));
    assert.equal(seed.profileId, state.profile.profile_id);
    assert.deepEqual(seed.courses, []);
    assert.deepEqual(seed.tasks, []);
  }

  const sonHosting = { ...sonState.hosting, project_id: "appgprj_son_isolated" };
  const daughterHosting = { ...daughterState.hosting, project_id: "appgprj_daughter_isolated" };
  await Promise.all([
    writeFile(sonState.hostingPath, `${JSON.stringify(sonHosting, null, 2)}\n`),
    writeFile(daughterState.hostingPath, `${JSON.stringify(daughterHosting, null, 2)}\n`),
  ]);
  const [sonDeployment, daughterDeployment] = await Promise.all([
    recordStudentSite({
      studentRoot: sonState.studentRoot,
      profileId: sonState.profile.profile_id,
      projectId: sonHosting.project_id,
      url: "https://alex-semester.openai.chatgpt.site",
      accessMode: "owner-only",
      today: "2026-08-23",
    }),
    recordStudentSite({
      studentRoot: daughterState.studentRoot,
      profileId: daughterState.profile.profile_id,
      projectId: daughterHosting.project_id,
      url: "https://jordan-semester.openai.chatgpt.site",
      accessMode: "owner-only",
      today: "2026-08-23",
    }),
  ]);
  assert.notEqual(sonDeployment.project_id, daughterDeployment.project_id);
  assert.notEqual(sonDeployment.url, daughterDeployment.url);
  assert.equal(sonDeployment.status, "deployed");
  assert.equal(daughterDeployment.status, "deployed");
});

test("bootstrap fails closed on unsafe or reused identities and roots", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "semester-navigator-rejection-"));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const valid = setupOptions(temporaryRoot, "son");
  await bootstrapStudentSite(valid);

  await assert.rejects(() => bootstrapStudentSite(valid), /already exists; refusing to overwrite/);
  await assert.rejects(
    () => bootstrapStudentSite({ ...setupOptions(temporaryRoot, "daughter"), profileId: "daughter" }),
    /profileId must identify the student/,
  );
  await assert.rejects(
    () => bootstrapStudentSite({ ...setupOptions(temporaryRoot, "daughter"), browserProfile: "Default" }),
    /dedicated named Chrome profile/,
  );
  await assert.rejects(
    () => bootstrapStudentSite({ ...setupOptions(temporaryRoot, "daughter"), studentRoot: join(templateRoot, "student") }),
    /separate from the canonical template root/,
  );
  await assert.rejects(
    () => bootstrapStudentSite({ ...setupOptions(temporaryRoot, "daughter"), ageEligible: false }),
    /age eligibility is confirmed as yes/,
  );
});

test("deployment recording rejects cross-student and access mismatches", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "semester-navigator-recording-"));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const result = await bootstrapStudentSite(setupOptions(temporaryRoot, "son"));
  const state = await inspectStudentSite({ studentRoot: result.student_root });
  await writeFile(
    state.hostingPath,
    `${JSON.stringify({ ...state.hosting, project_id: "appgprj_expected" }, null, 2)}\n`,
  );

  const base = {
    studentRoot: state.studentRoot,
    profileId: state.profile.profile_id,
    projectId: "appgprj_expected",
    url: "https://student.openai.chatgpt.site",
    accessMode: "owner-only",
    today: "2026-08-23",
  };
  await assert.rejects(
    () => recordStudentSite({ ...base, profileId: "different-student" }),
    /does not match this student workspace/,
  );
  await assert.rejects(
    () => recordStudentSite({ ...base, projectId: "appgprj_different" }),
    /must first write the same project ID/,
  );
  await assert.rejects(
    () => recordStudentSite({ ...base, accessMode: "public" }),
    /must remain owner-only/,
  );
});
