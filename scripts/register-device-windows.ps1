param(
  [string]$BaseUrl = "http://consola.localhost:3000"
)

$computer = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS

$name = $env:COMPUTERNAME
$model = "$($computer.Manufacturer) $($computer.Model)".Trim()
$serial = "$($bios.SerialNumber)".Trim()

$encodedName = [System.Uri]::EscapeDataString($name)
$encodedModel = [System.Uri]::EscapeDataString($model)
$encodedSerial = [System.Uri]::EscapeDataString($serial)

$url = "$BaseUrl/device/register?name=$encodedName&model=$encodedModel&serial=$encodedSerial"
Write-Host "Opening: $url"
Start-Process $url
