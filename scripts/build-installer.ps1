$ErrorActionPreference = "Stop"

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$cacheDir = Join-Path $root ".electron-builder-cache"
New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null

$env:ELECTRON_BUILDER_CACHE = $cacheDir

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Command,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

Push-Location $root
try {
  Invoke-Native npm run build
  Invoke-Native npx electron-builder --win nsis
}
finally {
  Pop-Location
}
