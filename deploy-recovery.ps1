# PowerShell Script para ejecutar desde Windows
# Copia y pega esto en PowerShell o en la Terminal de VS Code integrada

# OPCIÓN 1: Conectar por SSH y ejecutar script
$server = "138.197.42.104"
$user = "root"

Write-Host "🚀 Conectando a $server..." -ForegroundColor Green
ssh "$user@$server" @"
cd /var/www/nexara-app
chmod +x deploy-recovery.sh
bash deploy-recovery.sh
"@

# Esperar a que el usuario vea el resultado
Read-Host "✅ Presiona Enter para abrir logs en tiempo real..."

# OPCIÓN 2: Monitor en tiempo real
Write-Host "📊 Abriendo monitor de logs..." -ForegroundColor Cyan
ssh "$user@$server" @"
docker logs -f nexara-api --tail=50
"@
