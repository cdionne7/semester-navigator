param(
  [string]$ProjectRoot = "",
  [ValidateSet("canonical", "student")]
  [string]$Mode = "student",
  [switch]$NoVerify,
  [switch]$Initialize
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
  $ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
}
$arguments = @(
  "--mode", $Mode,
  "--verify", $(if ($NoVerify) { "no" } else { "yes" }),
  "--initialize", $(if ($Initialize) { "yes" } else { "no" }),
  "--allow-offline", "yes"
)
& (Join-Path $ProjectRoot "scripts\run-semester.ps1") -ProjectRoot $ProjectRoot -Command update -CommandArguments $arguments
