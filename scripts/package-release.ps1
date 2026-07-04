$ErrorActionPreference = "Stop"

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$packageJson = Get-Content -LiteralPath (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$releaseDir = Join-Path $root "release"
$appDir = Join-Path $releaseDir "win-unpacked"
$zipPath = Join-Path $releaseDir ("Tempo-{0}-win-unpacked.zip" -f $packageJson.version)

if (-not (Test-Path -LiteralPath $appDir)) {
  throw "Missing win-unpacked output. Run npm run dist:dir first."
}

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $appDir "*") -DestinationPath $zipPath -Force
Write-Host "Created $zipPath"
