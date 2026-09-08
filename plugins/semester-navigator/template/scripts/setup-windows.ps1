param(
  [string]$ProjectRoot = "",
  [switch]$SkipUpdate,
  [switch]$RuntimeOnly
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$minimumNode = [Version]"22.13.0"
$portableNodeVersion = "24.20.0"
$issueUrl = "https://github.com/cdionne7/semester-navigator/issues/new?template=setup-problem.yml"
$setupStage = "runtime"

trap {
  $failureMessage = $_.Exception.Message
  try {
    $failedCheckpointPath = Join-Path $ProjectRoot ".semester-navigator-install.json"
    if (Test-Path -LiteralPath $failedCheckpointPath) {
      $failedCheckpoint = Get-Content -LiteralPath $failedCheckpointPath -Raw | ConvertFrom-Json
      $failedCheckpoint | Add-Member -NotePropertyMembers @{ status = "failed"; failed_stage = $setupStage; last_error = "Setup stopped during $setupStage. Retry this same installation after reviewing the task error." } -Force
      [System.IO.File]::WriteAllText($failedCheckpointPath, ($failedCheckpoint | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
    }
  } catch { }
  Write-Host ""
  Write-Host "Semester Navigator setup stopped." -ForegroundColor Red
  Write-Host $failureMessage -ForegroundColor Red
  Write-Host "Report the problem here: $issueUrl"
  exit 1
}

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
} else {
  $ProjectRoot = Resolve-Path -LiteralPath $ProjectRoot
}
Set-Location -LiteralPath $ProjectRoot

function Test-UsableNodeAndNpm {
  try {
    $nodeText = (& node --version).Trim()
    $nodeVersion = [Version]($nodeText.TrimStart("v").Split("-")[0])
    $npmText = (& npm --version).Trim()
    return ($nodeVersion -ge $minimumNode -and -not [string]::IsNullOrWhiteSpace($npmText))
  } catch {
    return $false
  }
}

function Install-PortableNode {
  $architecture = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
  $archiveName = "node-v$portableNodeVersion-win-$architecture.zip"
  $downloadRoot = "https://nodejs.org/dist/v$portableNodeVersion"
  $toolsRoot = Join-Path $ProjectRoot ".tools"
  $nodeRoot = Join-Path $toolsRoot "node"
  $temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("semester-navigator-node-" + [Guid]::NewGuid())
  $archivePath = Join-Path $temporaryRoot $archiveName
  $expandedPath = Join-Path $temporaryRoot "expanded"

  New-Item -ItemType Directory -Force -Path $temporaryRoot | Out-Null
  New-Item -ItemType Directory -Force -Path $toolsRoot | Out-Null
  try {
    Write-Host "Downloading a private, portable Node.js runtime for Semester Navigator..."
    Invoke-WebRequest -UseBasicParsing -Uri "$downloadRoot/$archiveName" -OutFile $archivePath
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "$downloadRoot/SHASUMS256.txt").Content
    $checksumLine = ($checksums -split "`n" | Where-Object { $_.Trim().EndsWith($archiveName) } | Select-Object -First 1)
    if (-not $checksumLine) {
      throw "Node.js did not publish a checksum for $archiveName."
    }
    $expectedHash = ($checksumLine -split "\s+")[0].ToUpperInvariant()
    $actualHash = (Get-FileHash -Algorithm SHA256 -Path $archivePath).Hash.ToUpperInvariant()
    if ($actualHash -ne $expectedHash) {
      throw "The portable Node.js download failed its SHA-256 integrity check."
    }

    Expand-Archive -Path $archivePath -DestinationPath $expandedPath
    $expandedNode = Get-ChildItem -Path $expandedPath -Directory | Select-Object -First 1
    if (-not $expandedNode) {
      throw "The portable Node.js archive did not contain the expected folder."
    }
    if (Test-Path $nodeRoot) {
      Remove-Item -LiteralPath $nodeRoot -Recurse -Force
    }
    Move-Item -LiteralPath $expandedNode.FullName -Destination $nodeRoot
    $runtimeRecord = @{ schema_version = 1; version = $portableNodeVersion; archive_sha256 = $actualHash; source = "$downloadRoot/$archiveName" }
    [System.IO.File]::WriteAllText((Join-Path $nodeRoot ".semester-runtime.json"), ($runtimeRecord | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
  } finally {
    if (Test-Path $temporaryRoot) {
      Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
  }
  return $nodeRoot
}

if (-not (Test-UsableNodeAndNpm)) {
  $portableNodeRoot = Join-Path $ProjectRoot ".tools\node"
  if (-not (Test-Path (Join-Path $portableNodeRoot "npm.cmd"))) {
    $portableNodeRoot = Install-PortableNode
  }
  $env:Path = "$portableNodeRoot;$env:Path"
}

if (-not (Test-UsableNodeAndNpm)) {
  $portableNodeRoot = Install-PortableNode
  $env:Path = "$portableNodeRoot;$env:Path"
  if (-not (Test-UsableNodeAndNpm)) { throw "Node.js $minimumNode or newer with npm is unavailable, including after repair of the portable-runtime setup." }
}

if ($RuntimeOnly) {
  Write-Host "Semester Navigator runtime is ready in this process. Use scripts\run-semester.ps1 for future commands."
  return
}

$isGitCheckout = Test-Path (Join-Path $ProjectRoot ".git")
$setupStage = "source_verification"
$templateStatePath = Join-Path $ProjectRoot ".semester-navigator-template-state.json"
if (-not $isGitCheckout -and -not (Test-Path -LiteralPath $templateStatePath)) {
  throw "This existing folder has no verified installation baseline. Nothing was overwritten. Codex must inspect it against its original public release using the recovery command before setup can continue. A fresh installer-owned folder can be resumed with the same public installer."
}
$verifiedInstallation = $isGitCheckout
if (-not $isGitCheckout) {
  & node scripts/update-semester-navigator.mjs --root $ProjectRoot --mode canonical --check-local yes
  if ($LASTEXITCODE -ne 0) { throw "Local installation files changed. Review the exact files reported above before resuming." }
  $installState = Get-Content -LiteralPath $templateStatePath -Raw | ConvertFrom-Json
  $verifiedInstallation = $installState.verified -ne $false
}
if (-not $SkipUpdate -and -not $isGitCheckout -and $verifiedInstallation) {
  Write-Host "Checking the public Semester Navigator repository for a safe update..."
  $setupStage = "template_update"
  & node scripts/update-semester-navigator.mjs --root $ProjectRoot --mode canonical --verify yes --initialize no --allow-offline yes
  if ($LASTEXITCODE -ne 0) {
    throw "The automatic Semester Navigator update stopped with exit code $LASTEXITCODE."
  }
}

$hostingPath = Join-Path $ProjectRoot ".openai\hosting.json"
$hostingExamplePath = Join-Path $ProjectRoot ".openai\hosting.example.json"
if (-not (Test-Path $hostingPath)) {
  Copy-Item -LiteralPath $hostingExamplePath -Destination $hostingPath
}

$nodeVersionText = (& node --version).Trim()
$npmVersionText = (& npm --version).Trim()
Write-Host "Using Node.js $nodeVersionText and npm $npmVersionText."
Write-Host "Installing the exact repository dependencies..."
$setupStage = "dependencies"
& npm ci
if ($LASTEXITCODE -ne 0) {
  throw "npm ci failed with exit code $LASTEXITCODE."
}

Write-Host "Building and testing Semester Navigator..."
$setupStage = "build_and_test"
& npm test
if ($LASTEXITCODE -ne 0) {
  throw "npm test failed with exit code $LASTEXITCODE."
}

if (-not $isGitCheckout) {
  $setupStage = "verification_record"
  Write-Host "Enabling safe automatic updates for this installation..."
  & node scripts/update-semester-navigator.mjs --root $ProjectRoot --mode canonical --verify no --initialize yes --allow-offline yes
  if ($LASTEXITCODE -ne 0) {
    throw "Automatic update tracking could not be initialized."
  }
}

$installCheckpoint = Join-Path $ProjectRoot ".semester-navigator-install.json"
if (Test-Path -LiteralPath $installCheckpoint) {
  $checkpoint = Get-Content -LiteralPath $installCheckpoint -Raw | ConvertFrom-Json
  $checkpoint.status = "ready"
  $checkpoint | Add-Member -NotePropertyMembers @{ failed_stage = $null; last_error = $null } -Force
  [System.IO.File]::WriteAllText($installCheckpoint, ($checkpoint | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
}

Write-Host ""
Write-Host "Semester Navigator is ready." -ForegroundColor Green
Write-Host "Open this folder in Codex for local project work. An optional hosted Site uses the browser's own signed-in session."
Write-Host "Open this folder in Codex with Ctrl+O:"
Write-Host $ProjectRoot
Write-Host ""
Write-Host "Then paste:"
Write-Host "Read AGENTS.md completely, check for updates, detect this Windows setup, and start the guided student setup one question at a time. Do the technical work yourself after asking for any required permission."
Write-Host ""
Write-Host "Setup problems: $issueUrl"
