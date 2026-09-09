import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runtimeEnvironment } from "../lib/semester-runtime.mjs";
import test from "node:test";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const windowsSetup = await readFile("scripts/setup-windows.ps1", "utf8");
const windowsInstaller = await readFile("scripts/install-windows.ps1", "utf8");
const windowsUpdater = await readFile("scripts/update-semester-navigator.ps1", "utf8");
const nodeUpdater = await readFile("lib/semester-update.mjs", "utf8");
const windowsHandoff = await readFile("reference/windows-codex-bootstrap.md", "utf8");
const windowsWorkflow = await readFile(".github/workflows/windows-portable-install.yml", "utf8");

test("npm lifecycle scripts are native-Windows compatible", () => {
  for (const scriptName of ["dev", "build", "start", "test"]) {
    assert.doesNotMatch(packageJson.scripts[scriptName], /^[A-Z_]+=\S+/);
  }
  assert.equal(
    packageJson.scripts["setup:windows"],
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-windows.ps1",
  );
});

test("Windows setup supplies a checked portable runtime and verifies the project", () => {
  assert.match(windowsSetup, /22\.13\.0/);
  assert.match(windowsSetup, /nodejs\.org\/dist/);
  assert.match(windowsSetup, /SHASUMS256\.txt/);
  assert.match(windowsSetup, /Get-FileHash -Algorithm SHA256/);
  assert.match(windowsSetup, /\.tools\\node/);
  assert.match(windowsSetup, /npm ci/);
  assert.match(windowsSetup, /npm test/);
  assert.match(windowsSetup, /\$LASTEXITCODE/);
  assert.match(windowsSetup, /update-semester-navigator\.mjs/);
  assert.match(windowsSetup, /--verify yes/);
  assert.match(windowsSetup, /Open this folder in Codex/);
  assert.match(windowsSetup, /browser's own signed-in session/);
});

test("public installer needs no GitHub authentication or system package manager", () => {
  assert.match(windowsInstaller, /archive\/refs\/heads\/main\.zip/);
  assert.match(windowsInstaller, /Invoke-WebRequest/);
  assert.match(windowsInstaller, /Test-Path \$Destination/);
  assert.match(windowsInstaller, /Nothing was overwritten/);
  assert.doesNotMatch(windowsInstaller, /gh auth|git clone|winget/i);
  assert.match(windowsHandoff, /raw\.githubusercontent\.com/);
  assert.match(windowsHandoff, /does not build the app/);
  assert.match(windowsWorkflow, /runs-on: windows-latest/);
  assert.match(windowsWorkflow, /setup-windows\.ps1/);
  assert.match(windowsWorkflow, /System32/);
  assert.match(windowsWorkflow, /scriptblock.*Create/i);
  assert.match(windowsWorkflow, /update-semester-navigator\.ps1/);
  assert.doesNotMatch(windowsUpdater, /git\s|gh\s|winget/i);
  assert.match(nodeUpdater, /update-state\.json/);
  assert.match(windowsUpdater, /--allow-offline/,);
});

test("portable runtime children work without an inherited Node PATH", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "semester-runtime-path-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root,"package.json"),JSON.stringify({scripts:{test:"node --version"}}));
  const environment = runtimeEnvironment({ ...process.env, PATH: process.platform === "win32" ? `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}` : "/usr/bin:/bin" });
  const child = spawnSync(process.platform === "win32" ? "cmd.exe" : "/bin/sh", process.platform === "win32" ? ["/d","/s","/c","node --version"] : ["-c","node --version"], {cwd:root,env:environment,encoding:"utf8"});
  assert.equal(child.status,0,child.stderr);
  assert.match(child.stdout,/v\d+\./);
});

test("Windows launcher finds its own runtime in a fresh PowerShell process", { skip: process.platform !== "win32" }, () => {
  const powershell = join(process.env.SystemRoot,"System32","WindowsPowerShell","v1.0","powershell.exe");
  const environment = {...process.env};
  for (const key of Object.keys(environment)) if (/^path$/i.test(key)) delete environment[key];
  environment.Path = `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`;
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const command = `& ${quote(join(process.cwd(),"scripts/run-semester.ps1"))} -ProjectRoot ${quote(process.cwd())} -Command npm -CommandArguments @('--version')`;
  const child = spawnSync(powershell,["-NoProfile","-ExecutionPolicy","Bypass","-Command",command], {env:environment,encoding:"utf8"});
  assert.equal(child.status,0,child.stdout+child.stderr);
  assert.match(child.stdout,/\d+\.\d+\.\d+/);
});
