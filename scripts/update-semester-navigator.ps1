param(
  [string]$ProjectRoot = "",
  [ValidateSet("canonical", "student")]
  [string]$Mode = "student",
  [switch]$NoVerify,
  [switch]$Initialize
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
} else {
  $ProjectRoot = Resolve-Path $ProjectRoot
}

function Find-SemesterNavigatorNode {
  try {
    $command = Get-Command node -ErrorAction Stop
    return $command.Source
  } catch {
    $profilePath = Join-Path $ProjectRoot ".semester-navigator\profile.json"
    if (Test-Path $profilePath) {
      $profile = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json
      if ($profile.template_root) {
        $portableNode = Join-Path $profile.template_root ".tools\node\node.exe"
        if (Test-Path $portableNode) { return $portableNode }
      }
    }
    $localPortableNode = Join-Path $ProjectRoot ".tools\node\node.exe"
    if (Test-Path $localPortableNode) { return $localPortableNode }
    throw "The verified Semester Navigator Node.js runtime was not found. Open the canonical Semester Navigator folder and run scripts\setup-windows.ps1."
  }
}

$node = Find-SemesterNavigatorNode
$arguments = @(
  (Join-Path $ProjectRoot "scripts\update-semester-navigator.mjs"),
  "--root", $ProjectRoot,
  "--mode", $Mode,
  "--verify", $(if ($NoVerify) { "no" } else { "yes" }),
  "--initialize", $(if ($Initialize) { "yes" } else { "no" }),
  "--allow-offline", "yes"
)

& $node @arguments
if ($LASTEXITCODE -ne 0) {
  throw "Semester Navigator update failed with exit code $LASTEXITCODE."
}
