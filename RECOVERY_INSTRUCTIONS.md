# 🚨 Server Recovery Instructions
## Ejecutar cuando el servidor 138.197.42.104 responda a SSH

### ✅ Quick Steps (5-10 minutes)

**1. SSH a servidor y ejecutar script de recuperación:**
```bash
ssh root@138.197.42.104
cd /var/www/nexara-app
chmod +x debug-server.sh
./debug-server.sh
```

**2. Esperar a que los contenedores estén running (docker ps check):**
```bash
docker ps --filter name=nexara --format "table {{.Names}}\t{{.Status}}"
```

**3. Verificar que el usuario 'gerencia@nexara.com.mx' existe:**
```bash
curl http://localhost:3001/api/auth/debug/verify-user?email=gerencia@nexara.com.mx
```

Expected output (si existe):
```json
{
  "exists": true,
  "id": 1,
  "nombre": "...",
  "email": "gerencia@nexara.com.mx",
  "hasPasswordHash": true,
  "isSuperAdmin": true
}
```

Si `exists: false`, ejecutar seeding de usuarios.

### 🆘 If User Doesn't Exist (Seeding Required)

```bash
# Entrar al contenedor de API
docker exec -it nexara-api sh

# Ejecutar seed
npm run prisma:seed

# O ejecutar seed específico de usuarios
npm run prisma:seed -- --users

# Salir del contenedor
exit
```

### 🧪 Test Console Access

**Local (si tienes acceso a servidor via VPN/local):**
```bash
curl -X GET http://localhost:3000/api/activities
```

**From production domain:**
```bash
curl -X GET https://consola.nexara.com.mx/api/activities
# Should fail with 401 (expected, no auth token)
```

### 🔐 Test Login Flow

**1. Try native app login with these credentials:**
- Email: gerencia@nexara.com.mx
- Password: (check .env.nexara or verify with seed)

**2. If login still fails with 401, check:**
```bash
docker logs nexara-api --since 5m | grep "Credenciales"
```

**3. If password is wrong, reset it:**
```bash
docker exec -it nexara-db psql -U $POSTGRES_USER -d nexara -c \
  "UPDATE \"User\" SET passwordHash = '\$2a\$10\$...' WHERE email='gerencia@nexara.com.mx';"
```

### 📋 Fixes Applied (commit cdddf89)

1. **Web API Proxy Hostname Fix**
   - Changed: `http://api:3001/api/` → `http://nexara-api:3001/api/`
   - Or use env var: `API_INTERNAL_URL` from docker-compose.yml
   - File: `apps/web/next.config.js` line 132

2. **Added Debug Endpoint**
   - Endpoint: `GET /api/auth/debug/verify-user?email=...`
   - Use: Check if user exists in database without trying password
   - File: `apps/api/src/auth/auth.controller.ts`

3. **Activities Scope Query Fix** (previous commit f26444b)
   - Fixed: `scope=mine` parameter validation
   - File: `apps/api/src/activities/activities.controller.ts`

### 📊 Expected Outcomes After Recovery

✅ Console at https://consola.nexara.com.mx loads without "apagada" error
✅ Native app can login with `gerencia@nexara.com.mx`
✅ Activities with `scope=mine` parameter work
✅ Web container can reach API container on internal network

### 🚀 If Everything Works

1. Pull latest code to confirm:
   ```bash
   cd /var/www/nexara-app && git log --oneline -3
   # Should show: cdddf89 (current) > f26444b > 58034f0
   ```

2. Monitor logs in real-time:
   ```bash
   docker logs -f nexara-api | grep -i error
   docker logs -f nexara-web | grep -i error
   ```

3. Test from client devices

### 🐛 Troubleshooting

**Container not starting:**
```bash
docker logs nexara-api
docker logs nexara-web
# Check for errors
```

**DNS resolution still failing (ENOTFOUND api):**
```bash
# Verify Docker network
docker network inspect nexara_internal
# Both containers should be connected
```

**Login still returns 401:**
1. Check user exists: `/api/auth/debug/verify-user?email=...`
2. Check password is correct in seed or .env
3. Check role exists and has accesoConsole permissions

### 📞 Additional Resources

- Recovery script: `./debug-server.sh`
- Docker compose: `deploy/docker-compose.nexara.yml`
- Auth service: `apps/api/src/auth/auth.service.ts`
- Web config: `apps/web/next.config.js`

---

**Last updated:** 2026-04-25  
**Commits ready to deploy:** cdddf89 (web fix + debug endpoint)  
**Previous fixes:** f26444b (activities scope), 58034f0 (profile sync)
