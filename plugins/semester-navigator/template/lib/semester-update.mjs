import { createHash } from "node:crypto";
import {
  copyFile,
  cp,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { inspectStudentSite } from "./student-site-state.mjs";
import { runNpm } from "./semester-runtime.mjs";

const DEFAULT_REPOSITORY = "https://github.com/cdionne7/semester-navigator";
const DEFAULT_RAW_ROOT = "https://raw.githubusercontent.com/cdionne7/semester-navigator/main";
const MANIFEST_PATH = "reference/update-manifest.json";
const LEGACY_REVISION = "501ddd22889c080ac58e64bed7e68fe83c8a57f2";
const MODES = new Set(["canonical", "student"]);
const STUDENT_PROTECTED_PATHS = new Set([
  ".openai/hosting.json",
  ".semester-navigator/profile.json",
  ".semester-navigator/site.json",
  ".semester-navigator/update-state.json",
  "app/student-seed.json",
  "chatgpt.md",
]);

export class UpdateNetworkError extends Error {}

function fail(message) {
  throw new Error(message);
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

async function assertNoSymbolicLinks(root, relativePath) {
  let current = resolve(root);
  for (const segment of relativePath.split("/")) {
    current = join(current, segment);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink()) {
        fail(`Update path contains a symbolic link and was not changed: ${relativePath}`);
      }
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
  }
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function safeRelativePath(value, label) {
  if (typeof value !== "string" || value.trim() === "" || /[\\<>:"|?*]/.test(value) || value.includes(String.fromCharCode(0))) {
    fail(`${label} must be a non-empty repository path using forward slashes.`);
  }
  const normalized = posix.normalize(value);
  if (
    normalized !== value ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/")
  ) {
    fail(`${label} is not a safe relative path: ${value}`);
  }
  return normalized;
}

function pathInside(root, relativePath) {
  const candidate = resolve(root, ...relativePath.split("/"));
  const fromRoot = relative(resolve(root), candidate);
  if (fromRoot === "" || fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    fail(`Update path escaped the project root: ${relativePath}`);
  }
  return candidate;
}

function normalizeEntry(value, mode) {
  const entry = typeof value === "string" ? { source: value, destination: value } : value;
  if (!entry || typeof entry !== "object") fail(`Invalid ${mode} update entry.`);
  const source = safeRelativePath(entry.source, `${mode} source`);
  const destination = safeRelativePath(entry.destination ?? source, `${mode} destination`);
  const transform = entry.transform ?? null;
  if (transform !== null && transform !== "student-package") {
    fail(`Unsupported update transform: ${transform}`);
  }
  if (mode === "student") {
    const protectedDestination = destination.toLowerCase();
    if (
      STUDENT_PROTECTED_PATHS.has(protectedDestination) ||
      (protectedDestination.startsWith(".semester-navigator/") && !protectedDestination.startsWith(".semester-navigator/playbook/")) ||
      protectedDestination.startsWith(".git/")
    ) {
      fail(`Student update manifest attempted to manage protected path: ${destination}`);
    }
  }
  return { source, destination, transform };
}

function validateManifest(manifest, mode) {
  if (!MODES.has(mode)) fail(`Update mode must be canonical or student: ${mode}`);
  if (!manifest || manifest.schema_version !== 1) {
    fail("Update manifest must use schema_version 1.");
  }
  if (typeof manifest.release !== "string" || manifest.release.trim() === "") {
    fail("Update manifest release is missing.");
  }
  const values = manifest[`${mode}_files`];
  if (!Array.isArray(values) || values.length === 0) {
    fail(`Update manifest has no ${mode}_files.`);
  }
  const entries = values.map((value) => normalizeEntry(value, mode));
  const destinations = new Set();
  for (const entry of entries) {
    if (destinations.has(entry.destination)) {
      fail(`Update manifest repeats destination: ${entry.destination}`);
    }
    destinations.add(entry.destination);
  }
  return {
    schemaVersion: manifest.schema_version,
    release: manifest.release,
    repository: manifest.repository ?? DEFAULT_REPOSITORY,
    entries,
  };
}

function datedReleaseTuple(value) {
  if (typeof value !== "string" || !/^[1-9]\d{3}\.\d{2}\.\d{2}\.\d+$/.test(value)) return null;
  const parts = value.split(".").map(Number);
  if (!parts.every(Number.isSafeInteger)) return null;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return parts;
}

function compareReleaseOrder(installed, offered) {
  const next = datedReleaseTuple(offered);
  if (!next) fail(`Public release ${offered} is not a valid YYYY.MM.DD.N version. No update files were changed.`);
  // This is the one legacy release whose installed files can be verified by
  // recoverCanonicalUpdateState. Arbitrary labels must never imply an upgrade.
  const current = datedReleaseTuple(installed) ??
    (installed === `legacy-${LEGACY_REVISION}` ? [2026, 8, 24, 1] : null);
  if (!current) fail(`Installed release ${installed} cannot be compared safely. No update files were changed.`);
  for (let index = 0; index < current.length; index += 1) {
    if (current[index] !== next[index]) return Math.sign(current[index] - next[index]);
  }
  return 0;
}

function transformContent(content, transform) {
  if (transform === null) return content;
  if (transform === "student-package") {
    const packageJson = studentPackageManifest(JSON.parse(content.toString("utf8")));
    return Buffer.from(`${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  }
  fail(`Unsupported update transform: ${transform}`);
}

export function studentPackageManifest(source) {
  const packageJson = structuredClone(source);
  packageJson.scripts ??= {};
  for (const name of ["setup:windows", "plugin:build", "plugin:check", "test:e2e"]) delete packageJson.scripts[name];
  const studentTests = "node --test tests/plan-model.test.mjs tests/plan-route.test.mjs tests/plan-http.test.mjs tests/student-tools.test.mjs";
  packageJson.scripts.test = `npm run build && ${studentTests}`;
  packageJson.scripts["test:unit"] = studentTests;
  packageJson.scripts.start = "node scripts/serve-student.mjs";
  return packageJson;
}

export function updateStatePath(root, mode) {
  if (mode === "student") {
    return join(resolve(root), ".semester-navigator", "update-state.json");
  }
  return join(resolve(root), ".semester-navigator-template-state.json");
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    fail(`Cannot read valid ${label} at ${path}: ${error.message}`);
  }
}

async function readLocalRelease(templateRoot, mode) {
  const manifest = await readJson(join(resolve(templateRoot), ...MANIFEST_PATH.split("/")), "update manifest");
  return validateManifest(manifest, mode);
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function buildState(root, mode, release) {
  const managedFiles = {};
  for (const entry of release.entries) {
    await assertNoSymbolicLinks(root, entry.destination);
    const destination = pathInside(root, entry.destination);
    if (!(await pathExists(destination))) {
      fail(`Cannot initialize update tracking because a managed file is missing: ${entry.destination}`);
    }
    managedFiles[entry.destination] = sha256(await readFile(destination));
  }
  return {
    schema_version: 1,
    mode,
    verified: true,
    release: release.release,
    repository: release.repository,
    managed_files: managedFiles,
    last_checked: new Date().toISOString(),
  };
}

export async function initializeUpdateState({ root, mode, templateRoot = root }) {
  const projectRoot = resolve(root);
  if (await pathExists(updateStatePath(projectRoot, mode))) {
    const previous = await readJson(updateStatePath(projectRoot, mode), "update state");
    validateState(previous, mode);
    await verifyTrackedFiles(projectRoot, previous);
  }
  const release = await readLocalRelease(templateRoot, mode);
  const state = await buildState(projectRoot, mode, release);
  await writeJson(updateStatePath(projectRoot, mode), state);
  return state;
}

// Verification builds regenerate platform-dependent dashboard assets and the
// package manifest. Run them against a disposable copy, never the trusted ZIP
// installation whose original release hashes must remain valid for retry.
export async function verifyCanonicalRelease({ root, run = runNpm }) {
  const projectRoot = resolve(root);
  if (await pathExists(join(projectRoot, ".semester-navigator/profile.json"))) {
    fail("Canonical build verification cannot run in a student workspace.");
  }
  const statePath = updateStatePath(projectRoot, "canonical");
  const originalState = await readFile(statePath);
  const state = JSON.parse(originalState.toString("utf8"));
  validateState(state, "canonical");
  await verifyTrackedFiles(projectRoot, state);
  const verificationRoot = await mkdtemp(join(tmpdir(), "semester-release-verification-"));
  try {
    for (const [destination, expectedHash] of Object.entries(state.managed_files)) {
      const content = await readFile(pathInside(projectRoot, destination));
      if (sha256(content) !== expectedHash) fail(`Source changed before verification: ${destination}`);
      const target = pathInside(verificationRoot, destination);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    await writeFile(updateStatePath(verificationRoot, "canonical"), originalState);
    const dependencies = join(projectRoot, "node_modules");
    if (await pathExists(dependencies)) {
      await symlink(dependencies, join(verificationRoot, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    }
    const portableNode = join(projectRoot, ".tools/node");
    if (await pathExists(join(portableNode, "node.exe"))) {
      await cp(portableNode, join(verificationRoot, ".tools/node"), { recursive: true });
    }
    const example = join(verificationRoot, ".openai/hosting.example.json");
    if (await pathExists(example)) await copyFile(example, join(verificationRoot, ".openai/hosting.json"));
    await run(verificationRoot, ["test"]);
    if (!(await readFile(statePath)).equals(originalState)) fail("Installation tracking changed during build verification. Nothing was marked verified.");
    await verifyTrackedFiles(projectRoot, state);
    return { status: "build_verified", release: state.release, source_unchanged: true };
  } finally {
    await rm(verificationRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

async function fetchBuffer(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "Semester-Navigator-Updater" } });
  } catch (error) {
    throw new UpdateNetworkError(`Cannot reach the public Semester Navigator repository: ${error.message}`);
  }
  if (!response?.ok) {
    const status = response?.status ?? 0;
    if (status === 408 || status === 429 || status >= 500 || status === 0) {
      throw new UpdateNetworkError(`Repository request failed with HTTP ${status || "unknown"}: ${url}`);
    }
    fail(`Public update release is incomplete or unavailable (HTTP ${status}): ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function downloadRelease({ mode, rawRoot, fetchImpl, installedRelease }) {
  if (rawRoot === DEFAULT_RAW_ROOT) {
    const revision = JSON.parse((await fetchBuffer("https://api.github.com/repos/cdionne7/semester-navigator/commits/main", fetchImpl)).toString("utf8")).sha;
    if (!/^[a-f0-9]{40}$/.test(revision ?? "")) fail("The public update revision is invalid.");
    // This exact, independently verified legacy revision predates update
    // manifests. A newer beta must not turn its expected 404 into a setup error.
    if (revision === LEGACY_REVISION && compareReleaseOrder(installedRelease, "2026.08.24.1") > 0) {
      return { release: "2026.08.24.1", localNewer: true };
    }
    rawRoot = `https://raw.githubusercontent.com/cdionne7/semester-navigator/${revision}`;
  }
  const cacheKey = encodeURIComponent(new Date().toISOString());
  const manifestBuffer = await fetchBuffer(`${rawRoot}/${MANIFEST_PATH}?check=${cacheKey}`, fetchImpl);
  let manifest;
  try {
    manifest = JSON.parse(manifestBuffer.toString("utf8"));
  } catch (error) {
    fail(`The public update manifest is not valid JSON: ${error.message}`);
  }
  const release = validateManifest(manifest, mode);
  if (compareReleaseOrder(installedRelease, release.release) > 0) {
    return { ...release, localNewer: true };
  }
  const contents = new Map();
  const batchSize = 8;
  for (let index = 0; index < release.entries.length; index += batchSize) {
    const batch = release.entries.slice(index, index + batchSize);
    const downloaded = await Promise.all(batch.map(async (entry) => {
      const content = await fetchBuffer(`${rawRoot}/${entry.source}?release=${cacheKey}`, fetchImpl);
      return [entry.destination, transformContent(content, entry.transform)];
    }));
    for (const [destination, content] of downloaded) contents.set(destination, content);
  }
  return { ...release, contents };
}

function validateState(state, mode) {
  if (!state || state.schema_version !== 1 || state.mode !== mode) {
    fail(`Update state is missing or does not match ${mode} mode.`);
  }
  if (!state.managed_files || typeof state.managed_files !== "object") {
    fail("Update state has no managed_files map.");
  }
}

async function verifyTrackedFiles(root, state) {
  const conflicts = [];
  for (const [destination, expectedHash] of Object.entries(state.managed_files)) {
    safeRelativePath(destination, "tracked destination");
    await assertNoSymbolicLinks(root, destination);
    const path = pathInside(root, destination);
    if (!(await pathExists(path))) {
      conflicts.push(`${destination} (missing)`);
      continue;
    }
    const actualHash = sha256(await readFile(path));
    if (actualHash !== expectedHash) conflicts.push(destination);
  }
  if (conflicts.length > 0) {
    fail(`Update stopped because locally changed managed files need review: ${conflicts.join(", ")}`);
  }
}

function backupRootFor(root, mode) {
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return mode === "student"
    ? join(root, ".semester-navigator", "update-backups", stamp)
    : join(root, ".semester-navigator-template-backups", stamp);
}

export async function updateSemesterNavigator({
  root,
  mode,
  rawRoot = DEFAULT_RAW_ROOT,
  fetchImpl = globalThis.fetch,
}) {
  const projectRoot = resolve(root);
  if (mode === "student") await inspectStudentSite({ studentRoot: projectRoot });
  const statePath = updateStatePath(projectRoot, mode);
  if (!(await pathExists(statePath))) {
    fail(`Update tracking is not initialized at ${statePath}.`);
  }
  const state = await readJson(statePath, "update state");
  validateState(state, mode);
  if (state.verified === false) fail("This installation has not passed verification. Resume setup in this same folder before updating.");
  await verifyTrackedFiles(projectRoot, state);

  const release = await downloadRelease({ mode, rawRoot, fetchImpl, installedRelease: state.release });
  if (release.localNewer) {
    return {
      status: "local_newer",
      release: state.release,
      offered_release: release.release,
      message: `Your verified release ${state.release} is newer than the public release ${release.release}. Keeping your current version; no downgrade was applied.`,
      changed_files: 0,
      backup_root: null,
    };
  }
  const nextDestinations = new Set(release.entries.map((entry) => entry.destination));
  const changed = [];
  const created = [];
  const removed = [];

  for (const entry of release.entries) {
    await assertNoSymbolicLinks(projectRoot, entry.destination);
    const path = pathInside(projectRoot, entry.destination);
    const remoteContent = release.contents.get(entry.destination);
    if (!(await pathExists(path))) {
      created.push(entry.destination);
      continue;
    }
    if (sha256(await readFile(path)) !== sha256(remoteContent)) {
      if (!Object.hasOwn(state.managed_files, entry.destination)) {
        fail(`Update stopped because a new managed path conflicts with an existing local file: ${entry.destination}`);
      }
      changed.push(entry.destination);
    }
  }
  for (const destination of Object.keys(state.managed_files)) {
    if (!nextDestinations.has(destination)) removed.push(destination);
  }

  if (changed.length === 0 && created.length === 0 && removed.length === 0) {
    const currentState = await buildState(projectRoot, mode, release);
    await writeJson(statePath, currentState);
    return {
      status: "current",
      release: release.release,
      changed_files: 0,
      backup_root: null,
    };
  }

  const backupRoot = backupRootFor(projectRoot, mode);
  await mkdir(join(backupRoot, "files"), { recursive: true });
  for (const destination of [...changed, ...removed]) {
    await assertNoSymbolicLinks(projectRoot, destination);
    const source = pathInside(projectRoot, destination);
    const backup = pathInside(join(backupRoot, "files"), destination);
    await mkdir(dirname(backup), { recursive: true });
    await copyFile(source, backup);
  }

  const backupManifest = {
    schema_version: 1,
    mode,
    project_root: projectRoot,
    previous_state: state,
    backed_up_files: [...changed, ...removed],
    created_files: created,
  };
  await writeJson(join(backupRoot, "backup.json"), backupManifest);

  try {
    for (const entry of release.entries) {
      await assertNoSymbolicLinks(projectRoot, entry.destination);
      const destination = pathInside(projectRoot, entry.destination);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, release.contents.get(entry.destination));
    }
    for (const destination of removed) {
      await assertNoSymbolicLinks(projectRoot, destination);
      await rm(pathInside(projectRoot, destination), { force: true });
    }

    const nextState = await buildState(projectRoot, mode, release);
    await writeJson(statePath, nextState);
  } catch (error) {
    await rollbackSemesterUpdate({ root: projectRoot, backupRoot });
    throw new Error(`Update application failed and was rolled back: ${error.message}`);
  }
  return {
    status: "updated",
    release: release.release,
    changed_files: changed.length + created.length + removed.length,
    backup_root: backupRoot,
  };
}

export async function rollbackSemesterUpdate({ root, backupRoot }) {
  const projectRoot = resolve(root);
  const resolvedBackup = resolve(backupRoot);
  const relativeBackup = relative(projectRoot, resolvedBackup);
  if (relativeBackup.startsWith("..") || relativeBackup === "") {
    fail("Update backup must be a specific directory inside the project root.");
  }
  const backup = await readJson(join(resolvedBackup, "backup.json"), "update backup");
  if (resolve(backup.project_root) !== projectRoot) {
    fail("Update backup belongs to a different project root.");
  }
  for (const destination of backup.created_files) {
    const safeDestination = safeRelativePath(destination, "created file");
    await assertNoSymbolicLinks(projectRoot, safeDestination);
    await rm(pathInside(projectRoot, safeDestination), { force: true });
  }
  for (const destination of backup.backed_up_files) {
    const safeDestination = safeRelativePath(destination, "backed-up file");
    await assertNoSymbolicLinks(projectRoot, safeDestination);
    await assertNoSymbolicLinks(join(resolvedBackup, "files"), safeDestination);
    const source = pathInside(join(resolvedBackup, "files"), safeDestination);
    const target = pathInside(projectRoot, safeDestination);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  await writeJson(updateStatePath(projectRoot, backup.mode), backup.previous_state);
  return { status: "rolled_back", backup_root: resolvedBackup };
}

export { DEFAULT_RAW_ROOT, MANIFEST_PATH };

export async function verifyLocalUpdateState({ root, mode }) {
  if (mode === "student") await inspectStudentSite({ studentRoot: root });
  const state = await readJson(updateStatePath(root, mode), "update state");
  validateState(state, mode);
  await verifyTrackedFiles(root, state);
  return { status: "local_files_verified", release: state.release, installation_verified: state.verified !== false };
}

// Migration is tied to an immutable, known public release. Git's blob SHA-1 is
// compared with every source file before writing only a tracking record. Never
// establish trust by hashing whatever happens to be in an untracked folder.
export async function recoverCanonicalUpdateState({ root, fetchImpl = globalThis.fetch }) {
  const projectRoot = resolve(root);
  if (await pathExists(join(projectRoot, ".semester-navigator", "profile.json"))) fail("Canonical recovery cannot run in a student workspace.");
  if (await pathExists(updateStatePath(projectRoot, "canonical"))) return verifyLocalUpdateState({ root: projectRoot, mode: "canonical" });
  const treeUrl = `https://api.github.com/repos/cdionne7/semester-navigator/git/trees/${LEGACY_REVISION}?recursive=1`;
  const tree = JSON.parse((await fetchBuffer(treeUrl, fetchImpl)).toString("utf8"));
  if (tree.truncated || !Array.isArray(tree.tree) || tree.tree.length === 0) fail("The known release file listing is incomplete.");
  const entries = tree.tree.filter((entry) => entry.type === "blob" && entry.path !== ".openai/hosting.json");
  if (entries.length === 0) fail("The known release has no source files.");
  const conflicts = [];
  const managedFiles = {};
  for (const entry of entries) {
    const path = safeRelativePath(entry.path, "legacy release path");
    await assertNoSymbolicLinks(projectRoot, path);
    if (!(await pathExists(pathInside(projectRoot, path)))) { conflicts.push(`${path} (missing)`); continue; }
    const bytes = await readFile(pathInside(projectRoot, path));
    const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (blob !== entry.sha) conflicts.push(path);
    managedFiles[path] = sha256(bytes);
  }
  if (conflicts.length) fail(`Recovery stopped: files differ from the known installed release and need review: ${conflicts.join(", ")}. Nothing was overwritten.`);
  const state = { schema_version: 1, mode: "canonical", release: `legacy-${LEGACY_REVISION}`, repository: DEFAULT_REPOSITORY, verified: false, managed_files: managedFiles, last_checked: new Date().toISOString() };
  await writeJson(updateStatePath(projectRoot, "canonical"), state);
  return { status: "legacy_source_verified", release: state.release, next_action: "Run the checks for this verified legacy source, then approve its upgrade. No source files were overwritten." };
}
