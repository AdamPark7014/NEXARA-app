# Script de Migracion Automatica de Paneles a Subdominios
# Uso: .\migrate-panels.ps1

param(
    [string[]]$Panels = @("console", "ventas", "web", "contabilidad", "tickets", "dashboard")
)

$BaseDir = Split-Path -Parent (Get-Location)
$PanelSourceDir = Join-Path $BaseDir "panel"
$SubdomainTargetDir = Join-Path $BaseDir "__subdomains\[slug]"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "   Script de Migracion: Paneles > Subdominios      " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host ""

# Asegurarse de que existe la carpeta destino
if (-not (Test-Path $SubdomainTargetDir)) {
    New-Item -ItemType Directory -Path $SubdomainTargetDir -Force | Out-Null
    Write-Host "[OK] Carpeta destino creada: $SubdomainTargetDir" -ForegroundColor Green
}

# Mapeo de paneles a subdominios
$PanelMap = @{
    'console' = 'console'
    'ventas' = 'ventas'
    'web' = 'web'
    'contabilidad' = 'contabilidad'
    'tickets' = 'tickets'
    'dashboard' = 'dashboard'
    'notificaciones' = 'notificaciones'
}

function Copy-PanelContent {
    param(
        [string]$PanelName
    )
    
    $SourcePath = Join-Path $PanelSourceDir $PanelName
    $TargetPath = $SubdomainTargetDir
    
    if (-not (Test-Path $SourcePath)) {
        Write-Host "[ERROR] Panel no encontrado: $PanelName" -ForegroundColor Red
        return $false
    }
    
    Write-Host ""
    Write-Host "-> Migrando panel: $PanelName" -ForegroundColor Yellow
    
    try {
        # Obtener todos los items del source
        $Items = Get-ChildItem -Path $SourcePath -Force
        
        foreach ($Item in $Items) {
            # Saltar layout.tsx y page.tsx (que ya existen)
            if ($Item.Name -eq "layout.tsx" -or $Item.Name -eq "page.tsx") {
                Write-Host "  [SKIP] Saltando $($Item.Name) (ya existe)" -ForegroundColor Gray
                continue
            }
            
            $SourceItem = Join-Path $SourcePath $Item.Name
            $TargetItem = Join-Path $TargetPath $Item.Name
            
            if ($Item.PSIsContainer) {
                # Es una carpeta
                if (Test-Path $TargetItem) {
                    Remove-Item $TargetItem -Recurse -Force
                }
                Copy-Item -Path $SourceItem -Destination $TargetItem -Recurse -Force | Out-Null
                Write-Host "  [OK] Carpeta copiada: $($Item.Name)" -ForegroundColor Green
            } else {
                # Es un archivo
                Copy-Item -Path $SourceItem -Destination $TargetItem -Force | Out-Null
                Write-Host "  [OK] Archivo copiado: $($Item.Name)" -ForegroundColor Green
            }
        }
        
        return $true
    } catch {
        Write-Host "[ERROR] Error al copiar $PanelName : $_" -ForegroundColor Red
        return $false
    }
}

function Update-FileRoutes {
    param(
        [string]$PanelName
    )
    
    Write-Host ""
    Write-Host "-> Actualizando rutas en archivos: $PanelName" -ForegroundColor Yellow
    
    $TargetPath = $SubdomainTargetDir
    $OldRoute = "/panel/$PanelName/"
    $NewRoute = "/"
    
    try {
        # Encontrar todos los archivos .tsx, .ts, .jsx, .js
        $Files = Get-ChildItem -Path $TargetPath -Recurse -Include @("*.tsx", "*.ts", "*.jsx", "*.js") -ErrorAction SilentlyContinue
        
        if ($null -eq $Files) {
            Write-Host "  [INFO] No hay archivos para procesar" -ForegroundColor Gray
            return $true
        }
        
        $ReplacedCount = 0
        
        foreach ($File in $Files) {
            if ($File.Name -eq "layout.tsx" -or $File.Name -eq "page.tsx") {
                continue
            }
            
            $Content = Get-Content -Path $File.FullName -Raw -Encoding UTF8
            $OriginalContent = $Content
            
            if ($Content -match [regex]::Escape($OldRoute)) {
                $Content = $Content -replace [regex]::Escape($OldRoute), $NewRoute
                Set-Content -Path $File.FullName -Value $Content -Force -Encoding UTF8
                Write-Host "  [OK] Rutas actualizadas en: $($File.Name)" -ForegroundColor Green
                $ReplacedCount++
            }
        }
        
        if ($ReplacedCount -gt 0) {
            Write-Host "  [INFO] Total de archivos actualizados: $ReplacedCount" -ForegroundColor Cyan
        }
        
        return $true
    } catch {
        Write-Host "[ERROR] Error al actualizar rutas: $_" -ForegroundColor Red
        return $false
    }
}

# Procesar paneles
$SuccessCount = 0
$FailCount = 0

foreach ($Panel in $Panels) {
    if ($PanelMap.ContainsKey($Panel)) {
        if (Copy-PanelContent -PanelName $Panel) {
            Update-FileRoutes -PanelName $Panel
            $SuccessCount++
        } else {
            $FailCount++
        }
    } else {
        Write-Host "[WARN] Panel no reconocido: $Panel" -ForegroundColor Yellow
    }
}

# Resumen final
Write-Host ""
Write-Host "====================================================" -ForegroundColor Green
Write-Host "         Migracion Completada                      " -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green
Write-Host ""
Write-Host "[OK] Paneles migrados exitosamente: $SuccessCount" -ForegroundColor Green
if ($FailCount -gt 0) {
    Write-Host "[ERROR] Paneles con errores: $FailCount" -ForegroundColor Red
}
Write-Host ""
Write-Host "Ubicacion destino:" -ForegroundColor Cyan
Write-Host "  $SubdomainTargetDir" -ForegroundColor White
Write-Host ""
Write-Host "Proximos pasos:" -ForegroundColor Yellow
Write-Host "  1. Verificar que todo se copio correctamente"
Write-Host "  2. Ejecutar: npm run dev"
Write-Host "  3. Probar en navegador: consola.localhost:3000"
Write-Host ""
