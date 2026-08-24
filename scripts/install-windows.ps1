param(
  [string]$Destination = ""
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
  throw "The destination already exists: $Destination. Nothing was overwritten. Open that folder in Codex, or rename it before retrying a clean installation."
}

$destinationParent = Split-Path -Parent $Destination
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("semester-navigator-install-" + [Guid]::NewGuid())
$archivePath = Join-Path $temporaryRoot "semester-navigator.zip"
$expandedPath = Join-Path $temporaryRoot "expanded"

New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
New-Item -ItemType Directory -Force -Path $temporaryRoot | Out-Null
try {
  Write-Host "Downloading Semester Navigator from its public GitHub repository..."
  Invoke-WebRequest -UseBasicParsing -Uri $repositoryArchive -OutFile $archivePath
  Expand-Archive -Path $archivePath -DestinationPath $expandedPath
  $sourceRoot = Get-ChildItem -Path $expandedPath -Directory | Select-Object -First 1
  if (-not $sourceRoot -or -not (Test-Path (Join-Path $sourceRoot.FullName "AGENTS.md"))) {
    throw "The GitHub archive did not contain a valid Semester Navigator project."
  }
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
