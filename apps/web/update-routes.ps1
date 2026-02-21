param([string]$BaseDir)

if (-not $BaseDir) {
    $BaseDir = "C:\Users\chris\OneDrive\Documentos\SOFTWARE INTEGRADO\NEXARA SOFTWARE\Nexara-app\apps\web\app\__subdomains\[slug]"
}

if (-not (Test-Path $BaseDir)) {
    Write-Error "Carpeta no encontrada: $BaseDir"
    exit 1
}

Write-Host "Iniciando reemplazo de rutas..." -ForegroundColor Cyan

$UpdateCount = 0
$ErrorCount = 0

# Procesar archivos .tsx y .ts
try {
    $Files = Get-ChildItem -Path $BaseDir -Rec urse -Include "*.tsx", "*.ts" -ErrorAction SilentlyContinue
    
    foreach ($File in $Files) {
        try {
            $ContentBefore = [System.IO.File]::ReadAllText($File.FullName, [System.Text.Encoding]::UTF8)
            $ContentAfter = $ContentBefore
            
            # Hacer reemplazos
            $ContentAfter = $ContentAfter -replace "/panel/console/", "/"
            $ContentAfter = $ContentAfter -replace "/panel/ventas/", "/"
            $ContentAfter = $ContentAfter -replace "/panel/web/", "/"
            $ContentAfter = $ContentAfter -replace "/panel/contabilidad/", "/"
            $ContentAfter = $ContentAfter -replace "/panel/tickets/", "/"
            
            # Escribir si hubo cambios
            if ($ContentAfter -ne $ContentBefore) {
                [System.IO.File]::WriteAllText($File.FullName, $ContentAfter, [System.Text.Encoding]::UTF8)
                $UpdateCount++
            }
        } catch {
            $ErrorCount++
        }
    }
} catch {
    Write-Error "Error leyendo archivos: $_"
}

Write-Host ""
Write-Host "Completado:" -ForegroundColor Green
Write-Host "  Archivos actualizados: $UpdateCount" -ForegroundColor Green
if ($ErrorCount -gt 0) {
    Write-Host "  Errores: $ErrorCount" -ForegroundColor Yellow
}
