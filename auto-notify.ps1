$ErrorActionPreference = 'Stop'

$nodeDir = 'C:\Program Files\nodejs'
$npm = Join-Path $nodeDir 'npm.cmd'

if (!(Test-Path $npm)) {
  throw "npm.cmd was not found: $npm"
}

$env:PATH = "$nodeDir;$env:PATH"
Set-Location $PSScriptRoot
& $npm run fetch
& $npm run notify
