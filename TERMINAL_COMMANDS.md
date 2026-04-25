# 🚀 COMANDOS PARA EJECUTAR EN TERMINAL DE VS CODE

## ⚡ Opción 1: Script Automatizado (RECOMENDADO - 1 Comando)

### Copiar y pegar ESTO en la terminal integrada de VS Code:

```bash
chmod +x deploy-recovery.sh && ./deploy-recovery.sh
```

O si ejecutas desde SSH:

```bash
ssh root@138.197.42.104 "cd /var/www/nexara-app && chmod +x deploy-recovery.sh && bash deploy-recovery.sh"
```

---

## 📋 Opción 2: Comandos Manuales (Si prefieres paso a paso)

### Paso 1: Detener y limpiar (1 min)
```bash
pkill -9 docker-buildx
pkill -9 nest
sleep 2
```

### Paso 2: Reiniciar Docker (2 min)
```bash
systemctl restart docker
sleep 5
```

### Paso 3: Actualizar código (1 min)
```bash
cd /var/www/nexara-app
git fetch origin
git reset --hard origin/main
```

### Paso 4: Reiniciar contenedores (2 min)
```bash
docker compose -f deploy/docker-compose.nexara.yml --env-file deploy/.env.nexara down
sleep 2
docker compose -f deploy/docker-compose.nexara.yml --env-file deploy/.env.nexara up -d
sleep 10
```

### Paso 5: Verificar estado (1 min)
```bash
docker ps -a --filter name=nexara --format "table {{.Names}}\t{{.Status}}"
```

Expected output:
```
NAMES                    STATUS
nexara-api               Up X seconds
nexara-web               Up X seconds
nexara-db                Up X seconds
```

### Paso 6: Verificar usuario en BD (1 min)
```bash
docker exec nexara-db psql -U nexara -d nexara \
  -c "SELECT id, nombre, email FROM \"User\" WHERE email='gerencia@nexara.com.mx';"
```

Expected output:
```
 id | nombre | email
----+--------+--------------------------------
  1 | ...    | gerencia@nexara.com.mx
```

### Paso 7: Test Debug Endpoint (30 seg)
```bash
curl http://localhost:3001/api/auth/debug/verify-user?email=gerencia@nexara.com.mx
```

Expected output:
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

### Paso 8: Test Login (1 min)
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"gerencia@nexara.com.mx","password":"123456"}'
```

Expected output:
```json
{
  "access_token": "eyJ...",
  "user": {
    "id": 1,
    "email": "gerencia@nexara.com.mx",
    ...
  }
}
```

### Paso 9: Monitorear Logs en Tiempo Real
```bash
docker logs -f nexara-api --tail=20
```

Press Ctrl+C para salir

---

## 🔍 Si Algo Falla

### Console aún dice "apagada" (ENOTFOUND api)?
```bash
docker logs nexara-web | grep -i enotfound
# Si ves "ENOTFOUND api", reiniciar web:
docker restart nexara-web
sleep 5
```

### Usuario no existe en BD?
```bash
docker exec -it nexara-api npm run prisma:seed
```

### Login retorna 401?
```bash
# 1. Verificar usuario
curl http://localhost:3001/api/auth/debug/verify-user?email=gerencia@nexara.com.mx

# 2. Si no existe: seed
docker exec -it nexara-api npm run prisma:seed

# 3. Si existe pero contraseña falla: resetear
bash reset-user-password.sh gerencia@nexara.com.mx "NuevaContraseña"
```

---

## 📊 Monitoreo Completo

### Abrir 3 terminales en VS Code (Terminal → Split Terminal):

**Terminal 1: API logs**
```bash
docker logs -f nexara-api --tail=50 | grep -v "Client connected"
```

**Terminal 2: Web logs**
```bash
docker logs -f nexara-web --tail=50
```

**Terminal 3: DB connection test**
```bash
while true; do
  echo "=== $(date) ==="
  curl -s http://localhost:3001/api/auth/debug/verify-user?email=gerencia@nexara.com.mx | jq .
  sleep 10
done
```

Press Ctrl+C en terminal 3 para salir del loop

---

## ✅ Checklist Final

Cuando veas esto, está todo correcto:

- [ ] `docker ps` muestra 3 containers en status "Up"
- [ ] `docker logs nexara-web` NO tiene "ENOTFOUND api"
- [ ] Endpoint debug retorna `"exists": true`
- [ ] Login retorna `access_token`
- [ ] `docker logs -f` no muestra errores por 5 minutos

---

## 🎯 TLDR (Muy Corto)

```bash
chmod +x deploy-recovery.sh && ./deploy-recovery.sh
```

Luego espera output y verifica que no haya errores.
