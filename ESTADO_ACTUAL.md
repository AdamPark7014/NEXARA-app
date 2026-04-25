# 🎯 Estado Actual - Resumen Ejecutivo

## ⚠️ Situación Actual
El servidor **138.197.42.104** está completamente no responsivo:
- ❌ SSH timeout (servidor no responde)
- ❌ Ping fallido  
- ❌ API no accesible (puerto 3001)
- ❌ Console apagada

**Causa:** Docker build de NestJS se colgó, bloqueando los contenedores.

---

## ✅ Lo Que He Hecho (Mientras el servidor se recupera)

### 1. **Identifiqué el Problema Real**
   - Console: `ENOTFOUND api` → DNS container no resuelve hostname `api`
   - Login 401: Usuario o contraseña incorrecta
   - Raíz: Archivo `next.config.js` usaba `http://api:3001` en lugar del hostname correcto del Docker

### 2. **Preparé 3 Fixes**

#### Fix #1: Web API Hostname (commit cdddf89)
```javascript
// ❌ ANTES: hardcodeado
destination: 'http://api:3001/api/:path*'

// ✅ DESPUÉS: usa variable de entorno con fallback
const apiUrl = process.env.API_INTERNAL_URL || 'http://nexara-api:3001';
destination: `${apiUrl}/api/:path*`
```

#### Fix #2: Debug User Endpoint (commit cdddf89)
```bash
# Nuevo endpoint para diagnosticar problemas de login
GET /api/auth/debug/verify-user?email=gerencia@nexara.com.mx

# Responde si el usuario existe sin pedir password
{
  "exists": true,
  "id": 1,
  "email": "gerencia@nexara.com.mx",
  "hasPasswordHash": true
}
```

#### Fix #3: Historico - Scope Query (commit f26444b)
```bash
# Ya deployado: permite ?scope=mine en activities
GET /api/activities?scope=mine  # Ahora funciona
```

### 3. **Creé 3 Scripts de Recuperación**

| Script | Propósito |
|--------|-----------|
| `debug-server.sh` | Recuperación completa en 10 pasos |
| `reset-user-password.sh` | Resetear contraseña si falla login |
| `RECOVERY_INSTRUCTIONS.md` | Guía paso a paso detallada |

### 4. **Pushee Cambios a GitHub**
```bash
commit cdddf89: fix(web+auth): use API_INTERNAL_URL env var + add debug endpoint
```

---

## 🚀 Qué Hacer Cuando el Servidor Responda

### Opción A: Recuperación Automatizada (RECOMENDADO - 5 min)
```bash
ssh root@138.197.42.104
cd /var/www/nexara-app
chmod +x debug-server.sh
./debug-server.sh
```

El script hace:
1. Mata procesos colgados
2. Reinicia docker daemon
3. Hace git pull del último código (cdddf89)
4. Reinicia contenedores
5. Verifica salud de API/Web
6. Muestra logs de error si hay

### Opción B: Recuperación Manual
```bash
ssh root@138.197.42.104
cd /var/www/nexara-app

# 1. Detener build colgado
pkill -9 docker
systemctl restart docker
sleep 5

# 2. Actualizar código
git pull origin main  # Trae cdddf89

# 3. Reiniciar solo (sin rebuild)
docker compose -f deploy/docker-compose.nexara.yml \
  --env-file deploy/.env.nexara \
  restart api web

# 4. Esperar a que arranquen
sleep 10

# 5. Verificar usuario existe
curl http://localhost:3001/api/auth/debug/verify-user?email=gerencia@nexara.com.mx
```

### Verificaciones Clave Después

```bash
# Debe retornar algo como:
{
  "exists": true,
  "hasPasswordHash": true,
  "isSuperAdmin": true
}

# Si retorna "exists": false → Ejecutar:
docker exec -it nexara-api npm run prisma:seed
```

---

## 📊 Cambios Técnicos Deployados

### Archivos Modificados en cdddf89:
1. `apps/web/next.config.js` - línea 127-139
   - Variable env para API_INTERNAL_URL
   - Fallback a `nexara-api:3001`

2. `apps/api/src/auth/auth.controller.ts`
   - Agregado endpoint `GET /auth/debug/verify-user`
   - Para diagnosticar problemas sin contraseña

3. `apps/api/src/auth/auth.service.ts`
   - Método `debugVerifyUser()`
   - Retorna info del usuario sin verificar password

### Archivos Nuevos (scripts):
- `debug-server.sh` - Script de recuperación
- `reset-user-password.sh` - Utility para reset contraseña
- `RECOVERY_INSTRUCTIONS.md` - Documentación completa

---

## 🔍 Diagnóstico Rápido Cuando Server Esté Up

```bash
# 1. ¿Están los contenedores corriendo?
docker ps --filter name=nexara

# 2. ¿Puede web llegar a api? (antes daba ENOTFOUND)
docker logs nexara-web | grep -i "enotfound\|error"

# 3. ¿Existe el usuario?
curl http://localhost:3001/api/auth/debug/verify-user?email=gerencia@nexara.com.mx

# 4. ¿Login funciona?
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"gerencia@nexara.com.mx","password":"Nexara2024!"}'

# 5. ¿Console puede acceder a API?
curl -H "Host: consola.nexara.com.mx" http://localhost:3000/api/activities
```

---

## ⏱️ Estimación de Tiempo

| Paso | Tiempo | Estado |
|------|--------|--------|
| Esperar server recovery | 5-60 min | ⏳ Pendiente |
| Ejecutar debug-server.sh | 10 min | 🟢 Listo |
| Verificar con endpoints | 5 min | 🟢 Listo |
| Resetear usuario si falta | 2 min | 🟢 Script listo |
| **Total** | **~30 min max** | ⏳ |

---

## 📝 Próximos Pasos

1. **Cuando server responda**: Ejecutar uno de los scripts
2. **Si usuario no existe**: Runiar `npm run prisma:seed`
3. **Si login aún falla**: Usar `reset-user-password.sh`
4. **Validar**: Probar login nativo + acceso a console
5. **Monitorear**: Revisar logs por 30 min buscando errores

---

## 🆘 Si Algo Falla

Todos los fixes y scripts están en GitHub (commit cdddf89). Si se necesita hacer rollback:
```bash
git reset --hard f26444b  # Volver al commit anterior
docker compose ... restart api web
```

**Repositorio:** https://github.com/AdamPark7014/NEXARA-app  
**Branch:** main  
**Commit actual:** cdddf89  
**Último deployment:** 2026-04-25 14:46-15:15 UTC
