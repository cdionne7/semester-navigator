param(
  [string]$Destination = "",
  [string]$SourceArchivePath = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$repositoryArchive = "https://github.com/cdionne7/semester-navigator/archive/refs/heads/main.zip"
$issueUrl = "https://github.com/cdionne7/semester-navigator/issues/new?template=setup-problem.yml"

trap {
  Write-Host ""
  Write-Host "Semester Navigator installation stopped." -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "Report the problem here: $issueUrl"
  exit 1
}

if ([string]::IsNullOrWhiteSpace($Destination)) {
  $Destination = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Codex\Semester Navigator"
}
$Destination = [System.IO.Path]::GetFullPath($Destination)

if (Test-Path $Destination) {
  $checkpointPath = Join-Path $Destination ".semester-navigator-install.json"
  if (-not (Test-Path -LiteralPath $checkpointPath)) {
    throw "The destination already exists: $Destination. Nothing was overwritten. Open that folder in Codex for release verification and recovery; do not rename or delete student work."
  }
  $checkpoint = Get-Content -LiteralPath $checkpointPath -Raw | ConvertFrom-Json
  if ($checkpoint.schema_version -ne 1 -or $checkpoint.project_root -ne $Destination) {
    throw "The installation checkpoint does not match this folder. Nothing was overwritten."
  }
  $baselinePath = Join-Path $Destination ".semester-navigator-template-state.json"
  if (-not (Test-Path -LiteralPath $baselinePath)) { throw "The saved installation baseline is missing. Codex must inspect the existing folder; nothing was overwritten." }
  $baseline = Get-Content -LiteralPath $baselinePath -Raw | ConvertFrom-Json
  if ($baseline.schema_version -ne 1 -or $baseline.mode -ne "canonical" -or -not $baseline.managed_files) { throw "The saved installation baseline is invalid." }
  foreach ($entry in $baseline.managed_files.PSObject.Properties) {
    if ($entry.Name -match "(^/|\\|(^|/)\.\.(/|$)|:)" -or [string]::IsNullOrWhiteSpace($entry.Name)) { throw "The saved baseline contains an unsafe path." }
    $localFile = Join-Path $Destination $entry.Name
    if (-not (Test-Path -LiteralPath $localFile) -or (Get-FileHash -Algorithm SHA256 -LiteralPath $localFile).Hash.ToLowerInvariant() -ne $entry.Value) {
      throw "Installation resume stopped because this file changed or is missing: $($entry.Name). Nothing was overwritten."
    }
  }
  Write-Host "Resuming this same Semester Navigator installation..."
  & (Join-Path $Destination "scripts\setup-windows.ps1") -ProjectRoot $Destination
  if ($LASTEXITCODE -ne 0) { throw "Setup is still incomplete. Keep this folder and retry the same installer after the reported problem is corrected." }
  return
}

$destinationParent = Split-Path -Parent $Destination
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("semester-navigator-install-" + [Guid]::NewGuid())
$archivePath = Join-Path $temporaryRoot "semester-navigator.zip"
$expandedPath = Join-Path $temporaryRoot "expanded"

New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
New-Item -ItemType Directory -Force -Path $temporaryRoot | Out-Null
try {
  Write-Host "Downloading Semester Navigator from its public GitHub repository..."
  if ([string]::IsNullOrWhiteSpace($SourceArchivePath)) {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/cdionne7/semester-navigator/commits/main" -Headers @{ "User-Agent" = "Semester-Navigator-Installer" }
    if ($release.sha -notmatch "^[a-f0-9]{40}$") { throw "GitHub did not return a valid public release revision." }
    $repositoryArchive = "https://github.com/cdionne7/semester-navigator/archive/$($release.sha).zip"
    Invoke-WebRequest -UseBasicParsing -Uri $repositoryArchive -OutFile $archivePath
    $sourceRevision = $release.sha
  } else {
    Copy-Item -LiteralPath $SourceArchivePath -Destination $archivePath
    $sourceRevision = "approved-local-archive"
  }
  Expand-Archive -Path $archivePath -DestinationPath $expandedPath
  $sourceRoot = Get-ChildItem -Path $expandedPath -Directory | Select-Object -First 1
  if (-not $sourceRoot -or -not (Test-Path (Join-Path $sourceRoot.FullName "AGENTS.md"))) {
    throw "The GitHub archive did not contain a valid Semester Navigator project."
  }
  $manifestPath = Join-Path $sourceRoot.FullName "reference\update-manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath)) { throw "This release is missing resumable installation metadata. The maintainer must publish the current tested release before a new installation." }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ($manifest.schema_version -ne 1 -or -not $manifest.canonical_files) { throw "The release update manifest is invalid." }
  $managedFiles = [ordered]@{}
  foreach ($entry in $manifest.canonical_files) {
    $relativePath = if ($entry -is [string]) { $entry } elseif ($entry.destination) { $entry.destination } else { $entry.source }
    if ($relativePath -match "(^/|\\|(^|/)\.\.(/|$)|:)" -or [string]::IsNullOrWhiteSpace($relativePath)) { throw "Unsafe release path: $relativePath" }
    $managedFiles[$relativePath] = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $sourceRoot.FullName $relativePath)).Hash.ToLowerInvariant()
  }
  $encoding = New-Object System.Text.UTF8Encoding($false)
  $state = @{ schema_version = 1; mode = "canonical"; release = $manifest.release; repository = $manifest.repository; verified = $false; managed_files = $managedFiles; last_checked = [DateTime]::UtcNow.ToString("o") }
  [System.IO.File]::WriteAllText((Join-Path $sourceRoot.FullName ".semester-navigator-template-state.json"), ($state | ConvertTo-Json -Depth 8), $encoding)
  $checkpoint = @{ schema_version = 1; project_root = $Destination; source_revision = $sourceRevision; status = "source_ready" }
  [System.IO.File]::WriteAllText((Join-Path $sourceRoot.FullName ".semester-navigator-install.json"), ($checkpoint | ConvertTo-Json), $encoding)
  Move-Item -LiteralPath $sourceRoot.FullName -Destination $Destination
} finally {
  if (Test-Path $temporaryRoot) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}

& (Join-Path $Destination "scripts\setup-windows.ps1") -ProjectRoot $Destination -SkipUpdate
if ($LASTEXITCODE -ne 0) {
  throw "Semester Navigator setup failed with exit code $LASTEXITCODE."
}
