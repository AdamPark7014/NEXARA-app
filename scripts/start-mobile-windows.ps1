param(
  [string]$ApiUrl,
  [int]$Port = 8081
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$nodeDir = "C:\Program Files\nodejs"
$nodeExe = Join-Path $nodeDir "node.exe"
$npmCmd = Join-Path $nodeDir "npm.cmd"
$system32 = "C:\Windows\System32"

if (-not (Test-Path $nodeExe)) {
  throw "Node no esta instalado en $nodeExe"
}

if (-not (Test-Path $npmCmd)) {
  throw "npm no esta disponible en $npmCmd"
}

$cleanPath = ($env:PATH -replace '%PATH%;?', '')
$env:PATH = "$system32;$nodeDir;$cleanPath"
$env:CI = "1"
$env:EXPO_NO_INTERACTIVE = "1"

if ($ApiUrl) {
  $env:EXPO_PUBLIC_API_URL = $ApiUrl.TrimEnd('/')
}

while (Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue) {
  $Port += 1
}

Write-Host "Starting Expo on port $Port"

Push-Location $repoRoot
try {
  & $npmCmd run start --workspace=apps/mobile -- --port $Port
}
finally {
  Pop-Location
}