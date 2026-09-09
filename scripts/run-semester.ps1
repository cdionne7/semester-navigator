param(
  [string]$ProjectRoot = "",
  [ValidateSet("start", "bootstrap", "prepare", "update", "record-site", "record-access", "npm", "node")]
  [string]$Command = "start",
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CommandArguments = @()
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
  $ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
}

$nodePath = Join-Path $ProjectRoot ".tools\node\node.exe"
if (-not (Test-Path -LiteralPath $nodePath)) {
  $nodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    throw "Node.js is missing from this workspace. Run its approved runtime setup, then retry this same command."
  }
  $nodePath = $nodeCommand.Source
}
$nodeVersion = (& $nodePath --version).Trim()
if ($LASTEXITCODE -ne 0 -or [Version]($nodeVersion.TrimStart("v").Split("-")[0]) -lt [Version]"22.13.0") {
  throw "This workspace needs Node.js 22.13.0 or newer. Its runtime setup can repair the project-local copy."
}
$originalPath = $env:Path
try {
  $env:Path = "$(Split-Path -Parent $nodePath);$originalPath"
  $scriptNames = @{
    "start" = "serve-student.mjs"
    "bootstrap" = "bootstrap-student-site.mjs"
    "prepare" = "bootstrap-student-site.mjs"
    "update" = "update-semester-navigator.mjs"
    "record-site" = "record-student-site.mjs"
    "record-access" = "record-student-site-access.mjs"
  }
  Push-Location -LiteralPath $ProjectRoot
  try {
    if ($Command -eq "node") {
      & $nodePath @CommandArguments
    } elseif ($Command -eq "npm") {
      $npmCli = Join-Path (Split-Path -Parent $nodePath) "node_modules\npm\bin\npm-cli.js"
      if (-not (Test-Path -LiteralPath $npmCli)) { throw "npm is missing beside the selected Node.js runtime." }
      & $nodePath $npmCli @CommandArguments
    } else {
      $script = Join-Path $ProjectRoot ("scripts\" + $scriptNames[$Command])
      if (-not (Test-Path -LiteralPath $script)) { throw "The workspace is missing $($scriptNames[$Command]). Resume package setup first." }
      $prefixArguments = @()
      if ($Command -eq "start" -or $Command -eq "update") { $prefixArguments = @("--root", $ProjectRoot) }
      if ($Command -eq "prepare") { $prefixArguments = @("--student-root", $ProjectRoot, "--resume", "yes", "--prepare", "yes") }
      & $nodePath $script @prefixArguments @CommandArguments
    }
    $commandExitCode = $LASTEXITCODE
  } finally { Pop-Location }
} finally { $env:Path = $originalPath }
if ($commandExitCode -ne 0) { throw "Semester Navigator $Command stopped with exit code $commandExitCode. The existing workspace was kept for retry." }
