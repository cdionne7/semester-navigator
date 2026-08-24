import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  initializeUpdateState,
  rollbackSemesterUpdate,
  UpdateNetworkError,
  updateSemesterNavigator,
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
  ]);
  await writeFile(
    join(templateRoot, "reference", "update-manifest.json"),
    `${JSON.stringify(manifest("2026.08.24.1"), null, 2)}\n`,
  );
  await writeFile(join(studentRoot, "managed.txt"), "version one\n");
  await writeFile(join(studentRoot, "app", "student-seed.json"), "private student data\n");
  await initializeUpdateState({ root: studentRoot, mode: "student", templateRoot });
  return { studentRoot, templateRoot };
}

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
    "private student data\n",
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
