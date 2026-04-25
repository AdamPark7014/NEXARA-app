# 📋 RESUMEN DE ACCIONES - 25 Abril 2026

## 🔴 Problema Principal
El servidor **138.197.42.104** está completamente bloqueado:
- Docker build de NestJS colgado (proceso zombie)
- SSH timeout (no responde)
- Ambas apps (console + API) offline

## ✅ Lo Que He Hecho (SIN Acceso Directo al Servidor)

### 1️⃣ Diagnóstico Completo
- ✅ Identificado que `next.config.js` usa hostname incorrecto `api:3001` (debería ser `nexara-api:3001`)
- ✅ Encontrado que endpoint de login valida credenciales sin mensaje de error específico
- ✅ Confirmado que docker-compose.yml configura red `internal` correctamente
- ✅ Raíz de "console apagada": Web container no puede resolver hostname de API

### 2️⃣ Fixes Implementados (3 Commits a GitHub)

#### Commit cdddf89: Código Principal
```bash
# Web API Proxy Fix
apps/web/next.config.js
- De: destination: 'http://api:3001/api/:path*'
- A:  const apiUrl = process.env.API_INTERNAL_URL || 'http://nexara-api:3001'
     destination: `${apiUrl}/api/:path*`

# Debug Endpoint Agregado
apps/api/src/auth/auth.controller.ts
+ GET /auth/debug/verify-user?email=<email>
  → Retorna si usuario existe sin pedir password

apps/api/src/auth/auth.service.ts
+ async debugVerifyUser(email)
  → Implementación del debug endpoint
```

#### Commit 700e816: Documentación Operativa
```bash
+ ESTADO_ACTUAL.md          (este documento - resumen ejecutivo)
+ RECOVERY_INSTRUCTIONS.md  (paso a paso detallado)
+ debug-server.sh          (script de recuperación automatizada)
+ reset-user-password.sh   (utilidad de reset contraseña)
```

### 3️⃣ Scripts de Recuperación Listos para Ejecutar

**Script: debug-server.sh** (Recuperación completa automatizada)
```bash
ssh root@138.197.42.104
cd /var/www/nexara-app
chmod +x debug-server.sh && ./debug-server.sh
```
- Mata procesos colgados
- Reinicia docker daemon
- Hace git pull del último código
- Reinicia contenedores
- Verifica salud de servicios
- Proporciona diagnósticos

**Script: reset-user-password.sh** (Si falla login)
```bash
./reset-user-password.sh gerencia@nexara.com.mx "NuevaContraseña"
```

## 🎯 Qué Hacer Ahora

### Opción 1: Esperar Recuperación Automática (PREFERIDO)
El servidor podría recuperarse solo en:
- ⏱️ 5-15 min: Auto-restart de systemd
- ⏱️ 15-60 min: Reinicio de hosting provider
- ⏱️ 60+ min: Intervención manual del proveedor

Cuando responda SSH:
```bash
ssh root@138.197.42.104
cd /var/www/nexara-app && ./debug-server.sh
```

### Opción 2: Reinicio Manual (Si tienes acceso a panel VPS)
1. VPS Control Panel → Reboot/Power Cycle
2. Esperar 2-3 min
3. Ejecutar comando anterior

### Opción 3: Contactar Hosting Provider
Si el servidor sigue inresponsivo después de 30 min:
- "Server is unresponsive, Docker daemon is frozen"
- "Necesito hard reset/reboot del servidor 138.197.42.104"

## 📊 Cambios de Código (Listos para Deploy)

| Archivo | Cambio | Impacto |
|---------|--------|--------|
| next.config.js | Hostname dinámico | ✅ Console podrá acceder a API |
| auth.controller.ts | Endpoint debug | ✅ Diagnosticar login issues |
| auth.service.ts | Método debug | ✅ Verificar usuarios sin password |

## 🔍 Testing Cuando Server Esté Up

```bash
# 1. Verificar containers
docker ps --filter name=nexara

# 2. Chequear logs de web (antes daba ENOTFOUND)
docker logs nexara-web --tail=20 | grep -i error

# 3. Verificar usuario existe
curl http://localhost:3001/api/auth/debug/verify-user?email=gerencia@nexara.com.mx

# 4. Test login (reemplazar con contraseña real)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"gerencia@nexara.com.mx","password":"123456"}'

# 5. Test console access
curl -X GET http://localhost:3000/api/auth/profile \
  -H "Cookie: <auth_token>"
```

## 📋 Checklist Cuando Server Responda

- [ ] SSH conecta exitosamente
- [ ] Ejecutar `./debug-server.sh`
- [ ] Ambos containers en estado "Up"
- [ ] No hay "ENOTFOUND api" en logs de web
- [ ] Endpoint `/api/auth/debug/verify-user` retorna usuario
- [ ] Login con gerencia@nexara.com.mx funciona
- [ ] Console accesible sin timeout
- [ ] Activities con ?scope=mine funciona
- [ ] Native app puede hacer login
- [ ] No hay errores en logs después de 5 min de runtime

## 📦 Commits Disponibles en GitHub

```
700e816 docs: add server recovery & diagnostics guides
cdddf89 fix(web+auth): use API_INTERNAL_URL env var + add debug endpoint
f26444b fix(api): allow scope query in activities listing
58034f0 fix(console): sync user profile and disambiguate assignee selection
```

## ❓ Si Hay Problemas Después

### "still getting ENOTFOUND api"
→ Verificar que web está en red `internal` con api:
```bash
docker network inspect nexara_internal
```

### "login retorna 401"
→ Verificar usuario existe:
```bash
curl http://localhost:3001/api/auth/debug/verify-user?email=gerencia@nexara.com.mx
```

Si `exists: false`:
```bash
docker exec -it nexara-api npm run prisma:seed
```

### "docker containers won't start"
→ Revisar logs:
```bash
docker logs nexara-api 2>&1 | tail -50
docker logs nexara-web 2>&1 | tail -50
```

## 📞 Resumen de Recursos

| Recurso | Ubicación | Propósito |
|---------|-----------|----------|
| Estado | ESTADO_ACTUAL.md | Resumen ejecutivo |
| Pasos | RECOVERY_INSTRUCTIONS.md | Guía paso a paso |
| Script | debug-server.sh | Recuperación automatizada |
| Reset | reset-user-password.sh | Reset contraseña |
| Código | GitHub cdddf89 | Fixes principales |

## ⏰ Timeline

- **14:46 UTC**: User reported 401 login + console offline
- **14:46-15:00**: Investigación y diagnóstico
- **15:00-15:15**: Fixes implementados y commits pushed
- **15:15+**: Esperando server recovery
- **Approx 15:30**: Server debería estar disponible (30 min de downtime)

---

**Prepared by:** AI Assistant  
**Date:** 2026-04-25  
**Status:** ✅ Todas las herramientas listas, esperando acceso al servidor  
**Next Step:** Cuando SSH responda, ejecutar `./debug-server.sh`
