import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const agents = await readFile("AGENTS.md", "utf8");
const windowsSetup = await readFile("scripts/setup-windows.ps1", "utf8");
const windowsInstaller = await readFile("scripts/install-windows.ps1", "utf8");
const windowsUpdater = await readFile("scripts/update-semester-navigator.ps1", "utf8");
const nodeUpdater = await readFile("lib/semester-update.mjs", "utf8");
const windowsHandoff = await readFile("reference/windows-codex-bootstrap.md", "utf8");
const windowsWorkflow = await readFile(".github/workflows/windows-portable-install.yml", "utf8");
const gpt = await readFile("reference/semester-navigator-gpt.md", "utf8");

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
  assert.match(windowsSetup, /ChatGPT desktop app/);
  assert.match(windowsSetup, /browser's own signed-in session/);
});

test("public installer needs no GitHub authentication or system package manager", () => {
  assert.match(windowsInstaller, /archive\/refs\/heads\/main\.zip/);
  assert.match(windowsInstaller, /Invoke-WebRequest/);
  assert.match(windowsInstaller, /Test-Path \$Destination/);
  assert.match(windowsInstaller, /Nothing was overwritten/);
  assert.doesNotMatch(windowsInstaller, /gh auth|git clone|winget/i);
  assert.match(windowsHandoff, /raw\.githubusercontent\.com/);
  assert.match(windowsHandoff, /Do not install Git, GitHub CLI, Node\.js, npm, winget/);
  assert.match(windowsWorkflow, /runs-on: windows-latest/);
  assert.match(windowsWorkflow, /setup-windows\.ps1/);
  assert.match(windowsWorkflow, /System32/);
  assert.match(windowsWorkflow, /scriptblock.*Create/i);
  assert.match(windowsWorkflow, /update-semester-navigator\.ps1/);
  assert.doesNotMatch(windowsUpdater, /git\s|gh\s|winget/i);
  assert.match(nodeUpdater, /update-state\.json/);
  assert.match(windowsUpdater, /--allow-offline/,);
});

test("public handoff leads Codex into repository-scoped instructions", () => {
  assert.match(windowsHandoff, /Ctrl\+O/);
  assert.match(windowsHandoff, /root\s+AGENTS\.md/);
  assert.match(windowsHandoff, /issues\/new\?template=setup-problem\.yml/);
  assert.match(agents, /canonical Semester Navigator template/);
  assert.match(agents, /student:bootstrap/);
  assert.match(gpt, /### GitHub-to-Codex handoff/);
  assert.match(gpt, /public\s+GitHub repository is the source-distribution layer; Codex runs the installer/);
  assert.match(gpt, /Guided machine, desktop, and Site-browser readiness/);
  assert.match(gpt, /desktop app and your web browser keep separate sign-ins/);
  assert.match(gpt, /Automatic template updates/);
});
