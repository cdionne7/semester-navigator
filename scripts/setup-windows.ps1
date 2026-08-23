param(
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$minimumNode = [Version]"22.13.0"
$portableNodeVersion = "22.13.0"
$issueUrl = "https://github.com/cdionne7/semester-navigator/issues/new?template=setup-problem.yml"

trap {
  Write-Host ""
  Write-Host "Semester Navigator setup stopped." -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "Report the problem here: $issueUrl"
  exit 1
}

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
} else {
  $ProjectRoot = Resolve-Path $ProjectRoot
}
Set-Location $ProjectRoot

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
  throw "Node.js $minimumNode or newer with npm is unavailable, including after the portable-runtime setup."
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
& npm ci
if ($LASTEXITCODE -ne 0) {
  throw "npm ci failed with exit code $LASTEXITCODE."
}

Write-Host "Building and testing Semester Navigator..."
& npm test
if ($LASTEXITCODE -ne 0) {
  throw "npm test failed with exit code $LASTEXITCODE."
}

Write-Host ""
Write-Host "Semester Navigator is ready." -ForegroundColor Green
Write-Host "Open this folder in Codex with Ctrl+O:"
Write-Host $ProjectRoot
Write-Host ""
Write-Host "Then paste:"
Write-Host "Read AGENTS.md completely, confirm setup passed, and start the first-use student setup one question at a time. Do not deploy or publish anything without asking first."
Write-Host ""
Write-Host "Setup problems: $issueUrl"
