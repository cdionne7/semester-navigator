import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  initializeUpdateState,
  rollbackSemesterUpdate,
  UpdateNetworkError,
  updateSemesterNavigator,
  verifyLocalUpdateState,
  recoverCanonicalUpdateState,
  verifyCanonicalRelease,
} from "../lib/semester-update.mjs";

function response(content, status = 200) {
  const bytes = new TextEncoder().encode(content);
  return {
    ok: status >= 200 && status < 300,
    status,
    async arrayBuffer() {
      return bytes.buffer;
    },
  };
}

function fetchFrom(files) {
  return async (url) => {
    const path = new URL(url).pathname.replace(/^\//, "");
    if (!files.has(path)) return response("not found", 404);
    return response(files.get(path));
  };
}

function manifest(release, studentFiles = ["managed.txt"]) {
  return {
    schema_version: 1,
    release,
    repository: "https://github.com/example/semester-navigator",
    canonical_files: ["managed.txt"],
    student_files: studentFiles,
  };
}

async function makeTrackedStudentRoot(parent) {
  const templateRoot = join(parent, "template");
  const studentRoot = join(parent, "student");
  await Promise.all([
    mkdir(join(templateRoot, "reference"), { recursive: true }),
    mkdir(join(studentRoot, "app"), { recursive: true }),
    mkdir(join(studentRoot, ".semester-navigator"), { recursive: true }),
    mkdir(join(studentRoot, ".openai"), { recursive: true }),
  ]);
  await writeFile(
    join(templateRoot, "reference", "update-manifest.json"),
    `${JSON.stringify(manifest("2026.08.24.1"), null, 2)}\n`,
  );
  await writeFile(join(studentRoot, "managed.txt"), "version one\n");
  await writeFile(join(studentRoot, "app", "student-seed.json"), JSON.stringify({profileId: "alex-example", name: "Alex", school: "School", tasks: []}));
  await writeFile(join(studentRoot, "chatgpt.md"), "Private student context");
  await writeFile(join(studentRoot, ".openai", "hosting.json"), JSON.stringify({d1: "DB", r2: null}));
  await writeFile(join(studentRoot, ".semester-navigator", "profile.json"), JSON.stringify({profile_id:"alex-example",display_name:"Alex",instance_key:"student",school:"School",approved_local_root:studentRoot,browser_profile:null,machine:{browser_profile:null},site_access:{intended_viewer_email:null,viewer_email_storage_approved:false}}));
  await writeFile(join(studentRoot, ".semester-navigator", "site.json"), JSON.stringify({profile_id:"alex-example",student_display_name:"Alex",instance_key:"student",source_root:studentRoot,browser_profile:null,access_mode:"owner-only",audience:{mode:"owner-only",viewer_email:null,viewer_email_storage_approved:false}}));
  await initializeUpdateState({ root: studentRoot, mode: "student", templateRoot });
  return { studentRoot, templateRoot };
}

async function snapshotFiles(root) {
  const files = {};
  for (const path of (await readdir(root, { recursive: true })).sort()) {
    const target = join(root, path);
    try {
      files[path] = (await readFile(target)).toString("base64");
    } catch (error) {
      if (error.code !== "EISDIR") throw error;
      files[path] = "directory";
    }
  }
  return files;
}

test("the student update CLI honors an exact release source instead of silently using main", async (context) => {
  const parent = await mkdtemp(join(tmpdir(), "semester-update-cli-tag-"));
  context.after(() => rm(parent, { recursive: true, force: true }));
  const { studentRoot } = await makeTrackedStudentRoot(parent);
  const requested = [];
  const files = new Map([
    ["/release-tag/reference/update-manifest.json", JSON.stringify(manifest("2026.09.09.1"))],
    ["/release-tag/managed.txt", "pinned release contents\n"],
  ]);
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    requested.push(pathname);
    response.writeHead(files.has(pathname) ? 200 : 404);
    response.end(files.get(pathname) ?? "not found");
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  context.after(() => new Promise(resolve => server.close(resolve)));
  const result = await promisify(execFile)(process.execPath, [
    resolve("scripts/update-semester-navigator.mjs"), "--root", studentRoot,
    "--mode", "student", "--raw-root", `http://127.0.0.1:${server.address().port}/release-tag`,
    "--verify", "no", "--allow-offline", "no",
  ], { timeout: 30000 });
  assert.equal(JSON.parse(result.stdout).status, "updated");
  assert.deepEqual(requested.sort(), [...files.keys()].sort());
  assert.equal(await readFile(join(studentRoot, "managed.txt"), "utf8"), "pinned release contents\n");
  assert.equal(await readFile(join(studentRoot, "chatgpt.md"), "utf8"), "Private student context");
});

test("an older public release cannot downgrade a newer student's assets, plan, or update state", async (context) => {
  const parent = await mkdtemp(join(tmpdir(), "semester-update-no-downgrade-"));
  context.after(() => rm(parent, { recursive: true, force: true }));
  const { studentRoot, templateRoot } = await makeTrackedStudentRoot(parent);
  await mkdir(join(studentRoot, "public/dashboard"), { recursive: true });
  await writeFile(join(studentRoot, "public/dashboard/index.html"), "current prebuilt dashboard");
  await writeFile(join(studentRoot, ".semester-navigator/plan.json"), JSON.stringify({
    schemaVersion: 1, profileId: "alex-example", revision: 4,
    plan: { profileId: "alex-example", tasks: [{ id: "lab1", state: "done", notes: "Keep my work" }] },
  }));
  await writeFile(join(templateRoot, "reference/update-manifest.json"), JSON.stringify(
    manifest("2026.09.08.2", ["managed.txt", "public/dashboard/index.html"]),
  ));
  await initializeUpdateState({ root: studentRoot, mode: "student", templateRoot });
  const before = await snapshotFiles(studentRoot);
  const requests = [];
  const update = await updateSemesterNavigator({
    root: studentRoot, mode: "student", rawRoot: "https://updates.example",
    fetchImpl: async (url) => {
      requests.push(new URL(url).pathname);
      assert.equal(new URL(url).pathname, "/reference/update-manifest.json", "an older release must not download payloads");
      return response(JSON.stringify(manifest("2026.08.24.1")));
    },
  });
  assert.equal(update.status, "local_newer");
  assert.equal(update.release, "2026.09.08.2");
  assert.equal(update.offered_release, "2026.08.24.1");
  assert.equal(update.changed_files, 0);
  assert.equal(update.backup_root, null);
  assert.match(update.message, /no downgrade was applied/);
  assert.deepEqual(requests, ["/reference/update-manifest.json"]);
  assert.deepEqual(await snapshotFiles(studentRoot), before, "all root paths and bytes, including state timestamps, must remain unchanged");
});

test("the actual pre-manifest public main cannot block or downgrade a newer beta", async (context) => {
  const parent = await mkdtemp(join(tmpdir(), "semester-update-legacy-main-"));
  context.after(() => rm(parent, { recursive: true, force: true }));
  const { studentRoot, templateRoot } = await makeTrackedStudentRoot(parent);
  await writeFile(join(templateRoot, "reference/update-manifest.json"), JSON.stringify(manifest("2026.09.08.2")));
  await initializeUpdateState({ root: studentRoot, mode: "student", templateRoot });
  const before = await snapshotFiles(studentRoot);
  const requests = [];
  const update = await updateSemesterNavigator({ root: studentRoot, mode: "student", fetchImpl: async (url) => {
    requests.push(url);
    assert.equal(url, "https://api.github.com/repos/cdionne7/semester-navigator/commits/main");
    return response(JSON.stringify({ sha: "501ddd22889c080ac58e64bed7e68fe83c8a57f2" }));
  }});
  assert.equal(update.status, "local_newer");
  assert.equal(update.changed_files, 0);
  assert.equal(requests.length, 1);
  assert.deepEqual(await snapshotFiles(studentRoot), before);
});

test("release ordering uses numeric revision components and permits the verified known legacy upgrade", async (context) => {
  for (const installed of ["2026.08.24.2", "legacy-501ddd22889c080ac58e64bed7e68fe83c8a57f2"]) {
    await context.test(installed, async (subcontext) => {
      const parent = await mkdtemp(join(tmpdir(), "semester-update-order-"));
      subcontext.after(() => rm(parent, { recursive: true, force: true }));
      const { studentRoot } = await makeTrackedStudentRoot(parent);
      const statePath = join(studentRoot, ".semester-navigator/update-state.json");
      const state = JSON.parse(await readFile(statePath, "utf8"));
      await writeFile(statePath, JSON.stringify({ ...state, release: installed }));
      const update = await updateSemesterNavigator({
        root: studentRoot, mode: "student", rawRoot: "https://updates.example",
        fetchImpl: fetchFrom(new Map([
          ["reference/update-manifest.json", JSON.stringify(manifest("2026.08.24.10"))],
          ["managed.txt", "version ten\n"],
        ])),
      });
      assert.equal(update.status, "updated");
      assert.equal(update.release, "2026.08.24.10");
      assert.equal(await readFile(join(studentRoot, "managed.txt"), "utf8"), "version ten\n");
    });
  }
});

test("arbitrary or malformed release labels cannot be assumed to be newer", async (context) => {
  for (const [installed, offered] of [
    ["2026.08.24.1", "latest"],
    ["2026.08.24.1", "2026.02.30.1"],
    ["2026.08.24.1", "2026.08.24.9007199254740992"],
    ["custom-build", "2026.09.08.2"],
    ["legacy-0000000000000000000000000000000000000000", "2026.09.08.2"],
  ]) {
    await context.test(`${installed} -> ${offered}`, async (subcontext) => {
      const parent = await mkdtemp(join(tmpdir(), "semester-update-invalid-order-"));
      subcontext.after(() => rm(parent, { recursive: true, force: true }));
      const { studentRoot } = await makeTrackedStudentRoot(parent);
      const statePath = join(studentRoot, ".semester-navigator/update-state.json");
      const state = JSON.parse(await readFile(statePath, "utf8"));
      await writeFile(statePath, JSON.stringify({ ...state, release: installed }));
      const before = await snapshotFiles(studentRoot);
      await assert.rejects(() => updateSemesterNavigator({
        root: studentRoot, mode: "student", rawRoot: "https://updates.example",
        fetchImpl: async (url) => {
          assert.equal(new URL(url).pathname, "/reference/update-manifest.json");
          return response(JSON.stringify(manifest(offered)));
        },
      }), /No update files were changed/);
      assert.deepEqual(await snapshotFiles(studentRoot), before);
    });
  }
});

test("student updater backs up managed files and never touches protected student data", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "semester-navigator-update-"));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const { studentRoot } = await makeTrackedStudentRoot(temporaryRoot);
  const remote = new Map([
    ["reference/update-manifest.json", JSON.stringify(manifest("2026.08.24.2"))],
    ["managed.txt", "version two\n"],
  ]);

  const update = await updateSemesterNavigator({
    root: studentRoot,
    mode: "student",
    rawRoot: "https://updates.example",
    fetchImpl: fetchFrom(remote),
  });

  assert.equal(update.status, "updated");
  assert.equal(update.release, "2026.08.24.2");
  assert.equal(await readFile(join(studentRoot, "managed.txt"), "utf8"), "version two\n");
  assert.equal(
    await readFile(join(studentRoot, "app", "student-seed.json"), "utf8"),
    JSON.stringify({profileId: "alex-example", name: "Alex", school: "School", tasks: []}),
  );
  const state = JSON.parse(
    await readFile(join(studentRoot, ".semester-navigator", "update-state.json"), "utf8"),
  );
  assert.equal(state.release, "2026.08.24.2");
  assert.equal(Object.hasOwn(state.managed_files, "app/student-seed.json"), false);

  await rollbackSemesterUpdate({ root: studentRoot, backupRoot: update.backup_root });
  assert.equal(await readFile(join(studentRoot, "managed.txt"), "utf8"), "version one\n");
  const rolledBack = JSON.parse(
    await readFile(join(studentRoot, ".semester-navigator", "update-state.json"), "utf8"),
  );
  assert.equal(rolledBack.release, "2026.08.24.1");
});

test("student updater stops before overwriting local changes or protected paths", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "semester-navigator-update-conflict-"));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const { studentRoot } = await makeTrackedStudentRoot(temporaryRoot);
  await writeFile(join(studentRoot, "managed.txt"), "family customization\n");

  await assert.rejects(
    () => updateSemesterNavigator({
      root: studentRoot,
      mode: "student",
      rawRoot: "https://updates.example",
      fetchImpl: fetchFrom(new Map()),
    }),
    /locally changed managed files need review: managed\.txt/,
  );

  await writeFile(join(studentRoot, "managed.txt"), "version one\n");
  const unsafeRemote = new Map([
    [
      "reference/update-manifest.json",
      JSON.stringify(manifest("2026.08.24.2", ["app/student-seed.json"])),
    ],
  ]);
  await assert.rejects(
    () => updateSemesterNavigator({
      root: studentRoot,
      mode: "student",
      rawRoot: "https://updates.example",
      fetchImpl: fetchFrom(unsafeRemote),
    }),
    /attempted to manage protected path/,
  );
});

test("temporary repository failures are distinguishable from an invalid release", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "semester-navigator-update-network-"));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const { studentRoot } = await makeTrackedStudentRoot(temporaryRoot);

  await assert.rejects(
    () => updateSemesterNavigator({
      root: studentRoot,
      mode: "student",
      rawRoot: "https://updates.example",
      fetchImpl: async () => { throw new Error("offline"); },
    }),
    UpdateNetworkError,
  );
  await assert.rejects(
    () => updateSemesterNavigator({
      root: studentRoot,
      mode: "student",
      rawRoot: "https://updates.example",
      fetchImpl: async () => response("missing", 404),
    }),
    /release is incomplete or unavailable/,
  );
});

test("a newly managed destination cannot overwrite an existing untracked file", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "semester-navigator-update-new-path-"));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const { studentRoot } = await makeTrackedStudentRoot(temporaryRoot);
  await writeFile(join(studentRoot, "new-managed.txt"), "family file\n");
  const remote = new Map([
    [
      "reference/update-manifest.json",
      JSON.stringify(manifest("2026.08.24.2", ["managed.txt", "new-managed.txt"])),
    ],
    ["managed.txt", "version one\n"],
    ["new-managed.txt", "template file\n"],
  ]);
  await assert.rejects(
    () => updateSemesterNavigator({
      root: studentRoot,
      mode: "student",
      rawRoot: "https://updates.example",
      fetchImpl: fetchFrom(remote),
    }),
    /new managed path conflicts with an existing local file: new-managed\.txt/,
  );
  assert.equal(await readFile(join(studentRoot, "new-managed.txt"), "utf8"), "family file\n");
});

test("the published update manifest references files present in this repository", async () => {
  const current = JSON.parse(await readFile("reference/update-manifest.json", "utf8"));
  for (const value of [...current.canonical_files, ...current.student_files]) {
    const source = typeof value === "string" ? value : value.source;
    await assert.doesNotReject(() => readFile(source), `manifest source is missing: ${source}`);
  }
  const studentDestinations = current.student_files.map((value) =>
    typeof value === "string" ? value : (value.destination ?? value.source));
  for (const protectedPath of [
    ".openai/hosting.json",
    ".semester-navigator/profile.json",
    ".semester-navigator/site.json",
    "app/student-seed.json",
    "chatgpt.md",
  ]) {
    assert.equal(studentDestinations.includes(protectedPath), false);
  }
});

test("an interrupted install verifies its original baseline before being marked ready", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "semester-install-baseline-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root,"reference"));
  await writeFile(join(root,"reference/update-manifest.json"), JSON.stringify(manifest("fixture")));
  await writeFile(join(root,"managed.txt"), "original");
  await initializeUpdateState({root,mode:"canonical"});
  const statePath = join(root,".semester-navigator-template-state.json");
  const state = JSON.parse(await readFile(statePath,"utf8"));
  await writeFile(statePath,JSON.stringify({...state,verified:false}));
  assert.equal((await verifyLocalUpdateState({root,mode:"canonical"})).installation_verified,false);
  await assert.rejects(() => updateSemesterNavigator({root,mode:"canonical",fetchImpl:async()=>{throw new Error("must not fetch");}}), /Resume setup/);
  await writeFile(join(root,"managed.txt"), "local modification");
  await assert.rejects(() => initializeUpdateState({root,mode:"canonical"}), /locally changed/);
  assert.equal(JSON.parse(await readFile(statePath,"utf8")).verified,false);
  await writeFile(join(root,"managed.txt"), "original");
  await initializeUpdateState({root,mode:"canonical"});
  assert.equal((await verifyLocalUpdateState({root,mode:"canonical"})).installation_verified,true);
});

async function canonicalVerificationFixture(context) {
  const root = await mkdtemp(join(tmpdir(), "semester-build-verification-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const files = new Map([
    ["managed.txt", "trusted release source"],
    ["public/dashboard/index.html", "published dashboard"],
    ["public/dashboard/assets/published.js", "published asset"],
    [".openai/hosting.example.json", JSON.stringify({ d1: "DB", r2: null })],
  ]);
  const release = { ...manifest("2026.09.08.2"), canonical_files: [...files.keys(), "reference/update-manifest.json"] };
  files.set("reference/update-manifest.json", JSON.stringify(release));
  for (const [path, content] of files) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  await mkdir(join(root, "node_modules"));
  await writeFile(join(root, "node_modules/dependency.txt"), "installed dependency");
  await writeFile(join(root, ".openai/hosting.json"), JSON.stringify({ project_id: "must-not-copy", d1: "DB", r2: null }));
  const state = await initializeUpdateState({ root, mode: "canonical" });
  await writeFile(join(root, ".semester-navigator-template-state.json"), JSON.stringify({ ...state, verified: false }));
  return root;
}

test("canonical verification isolates generated assets and manifest while retaining the trusted installed baseline", async (context) => {
  const root = await canonicalVerificationFixture(context);
  const before = await snapshotFiles(root);
  let stagedRoot;
  const result = await verifyCanonicalRelease({ root, run: async (stage, args) => {
    stagedRoot = stage;
    assert.notEqual(stage, root);
    assert.deepEqual(args, ["test"]);
    assert.equal(await readFile(join(stage, "managed.txt"), "utf8"), "trusted release source");
    assert.equal(await readFile(join(stage, "node_modules/dependency.txt"), "utf8"), "installed dependency");
    assert.deepEqual(JSON.parse(await readFile(join(stage, ".openai/hosting.json"), "utf8")), { d1: "DB", r2: null });
    await writeFile(join(stage, "public/dashboard/index.html"), "platform-specific verified build");
    await rm(join(stage, "public/dashboard/assets/published.js"));
    await writeFile(join(stage, "public/dashboard/assets/platform-build.js"), "different platform asset");
    await writeFile(join(stage, "reference/update-manifest.json"), "regenerated manifest");
  } });
  assert.equal(result.status, "build_verified");
  assert.equal(result.source_unchanged, true);
  assert.deepEqual(await snapshotFiles(root), before);
  await assert.rejects(() => readFile(join(stagedRoot, "managed.txt")), /ENOENT/);
  assert.equal((await initializeUpdateState({ root, mode: "canonical" })).verified, true);
});

test("failed isolated verification preserves source, assets, and baseline for a same-folder retry", async (context) => {
  const root = await canonicalVerificationFixture(context);
  const before = await snapshotFiles(root);
  let stagedRoot;
  await assert.rejects(() => verifyCanonicalRelease({ root, run: async (stage) => {
    stagedRoot = stage;
    await writeFile(join(stage, "public/dashboard/index.html"), "partial failed build");
    await rm(join(stage, "public/dashboard/assets/published.js"));
    await writeFile(join(stage, "reference/update-manifest.json"), "partial failed manifest");
    throw new Error("simulated verification failure");
  } }), /simulated verification failure/);
  assert.deepEqual(await snapshotFiles(root), before);
  await assert.rejects(() => readFile(join(stagedRoot, "managed.txt")), /ENOENT/);
  assert.equal((await verifyLocalUpdateState({ root, mode: "canonical" })).installation_verified, false);
  await verifyCanonicalRelease({ root, run: async () => {} });
  assert.equal((await initializeUpdateState({ root, mode: "canonical" })).verified, true);
});

test("canonical verification refuses preexisting or concurrent source edits instead of blessing them", async (context) => {
  const root = await canonicalVerificationFixture(context);
  await writeFile(join(root, "managed.txt"), "existing local edit");
  await assert.rejects(() => verifyCanonicalRelease({ root, run: async () => assert.fail("changed source must not run") }), /locally changed managed files/);
  await writeFile(join(root, "managed.txt"), "trusted release source");
  await assert.rejects(() => verifyCanonicalRelease({ root, run: async () => {
    await writeFile(join(root, "managed.txt"), "concurrent local edit");
  } }), /locally changed managed files/);
  assert.equal(await readFile(join(root, "managed.txt"), "utf8"), "concurrent local edit");
  const state = JSON.parse(await readFile(join(root, ".semester-navigator-template-state.json"), "utf8"));
  assert.equal(state.verified, false);
  assert.notEqual(state.managed_files["managed.txt"], createHash("sha256").update("concurrent local edit").digest("hex"));
});

test("legacy recovery compares known release blob hashes and never blesses arbitrary local changes", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "semester-legacy-recovery-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const content = "verified release source\n";
  const sha = createHash("sha1").update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest("hex");
  const fetchImpl = async () => response(JSON.stringify({tree:[{path:"managed.txt",type:"blob",sha}],truncated:false}));
  await writeFile(join(root,"managed.txt"),"local customization");
  await assert.rejects(() => recoverCanonicalUpdateState({root,fetchImpl}), /files differ.*managed.txt/);
  await assert.rejects(() => readFile(join(root,".semester-navigator-template-state.json")), /ENOENT/);
  await writeFile(join(root,"managed.txt"),content);
  assert.equal((await recoverCanonicalUpdateState({root,fetchImpl})).status,"legacy_source_verified");
  assert.equal(await readFile(join(root,"managed.txt"),"utf8"),content);
});

test("student updater rejects a moved root before network or managed writes", async (context) => {
  const parent = await mkdtemp(join(tmpdir(), "semester-update-identity-"));
  context.after(() => rm(parent, { recursive: true, force: true }));
  const {studentRoot} = await makeTrackedStudentRoot(parent);
  const path = join(studentRoot,".semester-navigator/profile.json");
  const profile = JSON.parse(await readFile(path,"utf8"));
  await writeFile(path,JSON.stringify({...profile,approved_local_root:join(parent,"different-root")}));
  await assert.rejects(() => updateSemesterNavigator({root:studentRoot,mode:"student",fetchImpl:async()=>{throw new Error("must not fetch");}}), /does not match the approved root/);
  assert.equal(await readFile(join(studentRoot,"managed.txt"),"utf8"),"version one\n");
});
