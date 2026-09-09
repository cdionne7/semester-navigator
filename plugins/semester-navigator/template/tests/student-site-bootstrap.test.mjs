import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { bootstrapStudentSite, prepareStudentSite, validateIntake } from "../lib/student-site-bootstrap.mjs";
import {
  inspectStudentSite,
  recordStudentSite,
  recordStudentSiteAccess,
} from "../lib/student-site-state.mjs";

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
    machinePlatform: "windows",
    deviceMode: "own-device",
    desktopApp: "installed",
    siteBrowser: "edge",
    browserProfile: isSon ? "Alex - Example" : "Jordan - School",
    browserSession: "verified",
    browserSessionPersistence: "verified",
    passkeyStatus: "enabled",
    storeSiteViewerEmail: true,
    siteViewerEmail: isSon ? "alex@example.com" : "jordan@example.com",
    ageEligible: true,
    sharedChatgptAccount: true,
    automaticUpdates: true,
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
    assert.equal(state.hostingExists, false);
    await assert.rejects(() => readFile(state.hostingPath), /ENOENT/);
    assert.equal(Object.hasOwn(state.hosting, "project_id"), false);
    assert.deepEqual(state.hosting, { d1: "DB", r2: null });
    assert.equal(state.site.status, "not_created");
    assert.equal(state.site.provisioning_status, "source_ready");
    assert.equal(state.site.project_id, null);
    assert.equal(state.site.url, null);
    assert.equal(state.site.access_mode, "owner-only");
    assert.equal(state.site.storage, "dedicated-d1");
    assert.equal(state.profile.schema_version, 2);
    assert.equal(state.profile.machine.platform, "windows");
    assert.equal(state.profile.machine.site_browser, "edge");
    assert.equal(state.profile.machine.browser_session_persistence, "verified");
    assert.equal(state.profile.site_access.recommended_mode, "owner-only");
    assert.equal(state.profile.updates.enabled, true);
    assert.equal(state.site.audience.mode, "owner-only");
    assert.equal(state.site.audience.browser_access_status, "pending");
    assert.match(state.site.audience.viewer_email, /@example\.com$/);
  }

  const canonicalHosting = JSON.parse(await readFile(join(templateRoot, ".openai", "hosting.example.json"), "utf8"));
  assert.deepEqual(canonicalHosting, { d1: "DB", r2: null });
  for (const state of [sonState, daughterState]) {
    const generatedFiles = await Promise.all([
      readFile(state.hostingSourcePath, "utf8"),
      readFile(state.profilePath, "utf8"),
      readFile(state.sitePath, "utf8"),
      readFile(join(state.studentRoot, "chatgpt.md"), "utf8"),
      readFile(join(state.studentRoot, "app", "student-seed.json"), "utf8"),
      readFile(join(state.studentRoot, ".semester-navigator", "update-state.json"), "utf8"),
      readFile(join(state.studentRoot, "package.json"), "utf8"),
    ]);
    assert.ok(generatedFiles.every((content) => !content.includes("appgprj_")));
    const seed = JSON.parse(generatedFiles[4]);
    assert.equal(seed.profileId, state.profile.profile_id);
    assert.deepEqual(seed.courses, []);
    assert.deepEqual(seed.tasks, []);
    const updateState = JSON.parse(generatedFiles[5]);
    assert.equal(updateState.mode, "student");
    assert.ok(updateState.managed_files["scripts/update-semester-navigator.mjs"]);
    assert.equal(Object.hasOwn(updateState.managed_files, "chatgpt.md"), false);
    const studentPackage = JSON.parse(generatedFiles[6]);
    assert.equal(studentPackage.scripts.test, "npm run build && node --test tests/plan-model.test.mjs tests/plan-route.test.mjs tests/plan-http.test.mjs tests/student-tools.test.mjs");
    assert.equal(Object.hasOwn(studentPackage.scripts, "student:bootstrap"), true);
    assert.equal(Object.hasOwn(studentPackage.scripts, "student:record-site"), true);
    await readFile(join(state.studentRoot, ".semester-navigator", "playbook", "SKILL.md"), "utf8");
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

  assert.equal((await bootstrapStudentSite(valid)).resumed, true);
  await assert.rejects(() => bootstrapStudentSite({ ...valid, profileId: "another-student" }), /does not match the existing|does not match this student/);
  await assert.rejects(
    () => bootstrapStudentSite({ ...setupOptions(temporaryRoot, "daughter"), profileId: "daughter" }),
    /profileId must identify the student/,
  );
  await assert.rejects(
    () => bootstrapStudentSite({ ...setupOptions(temporaryRoot, "daughter"), browserProfile: "Default" }),
    /dedicated named browser profile/,
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

  await recordStudentSite(base);
  const accessBase = {
    studentRoot: state.studentRoot,
    profileId: state.profile.profile_id,
    accessMode: "owner-only",
    viewerEmails: ["alex@example.com"],
    browserProfile: state.profile.browser_profile,
    verified: true,
    today: "2026-08-23",
  };
  await assert.rejects(
    () => recordStudentSiteAccess({ ...accessBase, accessMode: "public" }),
    /Public access is not allowed/,
  );
  await assert.rejects(
    () => recordStudentSiteAccess({ ...accessBase, browserProfile: "Wrong profile" }),
    /does not match this student workspace/,
  );
  await assert.rejects(
    () => recordStudentSiteAccess({ ...accessBase, verified: false }),
    /must be tool- or user-verified/,
  );
  await assert.rejects(
    () => recordStudentSiteAccess({ ...accessBase, accessMode: "selected-users", viewerEmails: [] }),
    /requires at least one verified viewer email/,
  );
  await assert.rejects(
    () => recordStudentSiteAccess({ ...accessBase, viewerEmails: [] }),
    /do not include this student's intended Site viewer account/,
  );
  const access = await recordStudentSiteAccess(accessBase);
  assert.equal(access.access_mode, "owner-only");
  assert.equal(access.browser_access_status, "verified");
  const verified = await inspectStudentSite({ studentRoot: result.student_root });
  assert.equal(verified.site.audience.browser_access_status, "verified");
  assert.deepEqual(verified.site.audience.allowed_viewer_emails, ["alex@example.com"]);
});

test("upload-first setup persists a first plan without a browser or dependency build", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "semester-navigator-upload-first-"));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const options = { ...setupOptions(temporaryRoot, "son"), instanceKey: "student", browserProfile: undefined,
    siteBrowser: undefined, browserSession: undefined, browserSessionPersistence: undefined,
    storeSiteViewerEmail: false, automaticUpdates: false,
    intake: { schema_version: 1, verified: true, plan: { workHours: "Tuesday 4-8", courses: [], tasks: [] },
      expected_accounts: { school: { email: "alex@example.com", storage_approved: true } } } };
  const result = await bootstrapStudentSite(options);
  const state = await inspectStudentSite({ studentRoot: result.student_root });
  assert.equal(state.profile.instance_key, "student");
  assert.equal(state.profile.browser_profile, null);
  assert.equal(state.profile.machine.site_browser, "pending");
  assert.equal(state.profile.setup.status, "source_ready");
  assert.equal(state.seed.workHours, "Tuesday 4-8");
  assert.equal(state.profile.expected_accounts.school, "alex@example.com");
  await assert.rejects(() => readFile(join(result.student_root, "node_modules", ".package-lock.json")), /ENOENT/);
  await assert.rejects(() => bootstrapStudentSite({ ...options, displayName: "Jordan" }), /does not match/);
  assert.throws(() => validateIntake({ schema_version: 1, verified: true, expected_accounts: {school:{email:"alex@example.com",storage_approved:false}} }), /storage_approved/);
  assert.throws(() => validateIntake({ schema_version: 1, verified: true, preferences:{oauth_token:"not-a-real-token"} }), /credentials/);
});

test("failed optional preparation resumes the same saved workspace and Site binding", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "semester-navigator-resume-"));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const options = setupOptions(temporaryRoot, "son");
  const result = await bootstrapStudentSite(options);
  const seedPath = join(result.student_root, "app", "student-seed.json");
  const seedBefore = await readFile(seedPath, "utf8");
  const siteBefore = await readFile(join(result.student_root, ".semester-navigator", "site.json"), "utf8");
  await assert.rejects(() => prepareStudentSite({studentRoot:result.student_root}, async () => { throw new Error("simulated package network interruption"); }), /same workspace/);
  let state = await inspectStudentSite({studentRoot:result.student_root});
  assert.equal(state.profile.setup.status, "failed");
  assert.equal(state.profile.setup.failed_stage, "dependencies");
  assert.equal((await bootstrapStudentSite(options)).resumed, true);
  const stages = [];
  await prepareStudentSite({studentRoot:result.student_root}, async (_root, args) => { stages.push(args[0]); });
  state = await inspectStudentSite({studentRoot:result.student_root});
  assert.equal(state.profile.setup.status, "prepared");
  assert.deepEqual(stages, ["ci", "test"]);
  assert.equal(await readFile(seedPath, "utf8"), seedBefore);
  assert.equal(await readFile(state.sitePath, "utf8"), siteBefore);
  await prepareStudentSite({studentRoot:result.student_root}, async () => { throw new Error("already prepared should not repeat"); });
});

test("identity verification detects seed and machine browser mismatches before recording", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "semester-navigator-identity-"));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const result = await bootstrapStudentSite(setupOptions(temporaryRoot, "son"));
  const state = await inspectStudentSite({ studentRoot: result.student_root });
  const seedPath = join(result.student_root, "app", "student-seed.json");
  const originalSeed = await readFile(seedPath, "utf8");
  await writeFile(seedPath, JSON.stringify({...JSON.parse(originalSeed), profileId:"another-student"}));
  await assert.rejects(() => inspectStudentSite({studentRoot:result.student_root}), /student seed profileId/);
  await writeFile(seedPath, originalSeed);
  await writeFile(state.profilePath, JSON.stringify({...state.profile,machine:{...state.profile.machine,browser_profile:"Another student"}}));
  await assert.rejects(() => inspectStudentSite({studentRoot:result.student_root}), /browser profiles do not match/);
});

test("a directory alias cannot put a student inside the canonical template", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "semester-root-alias-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const alias = join(root,"template-alias");
  await symlink(templateRoot,alias,process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(() => bootstrapStudentSite({...setupOptions(root,"son"),studentRoot:join(alias,"student-must-not-be-created")}), /separate from the canonical template/);
});
