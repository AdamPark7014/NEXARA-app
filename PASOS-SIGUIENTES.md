# 🚀 PASOS PARA CONTINUAR EL DESPLIEGUE

## 📝 Estado Actual
✅ Código actualizado en GitHub (commit 46edd2e)
✅ Dependencias instaladas en el servidor
⏳ SIGUIENTE: Actualizar código y configurar variables de entorno

---

## 🔐 PASO 1: Conectarse al servidor

Abre PowerShell o CMD y ejecuta:

```bash
ssh root@138.197.42.104
```

Ingresa tu contraseña cuando te la pida.

---

## 📥 PASO 2: Actualizar el código en el servidor

Una vez conectado al servidor, copia y pega estos comandos:

```bash
cd /var/www/nexara-app
git pull origin main
```

---

## ⚙️ PASO 3: Configurar Variables de Entorno

### Backend (API) - archivo: `/var/www/nexara-app/apps/api/.env`

```bash
nano /var/www/nexara-app/apps/api/.env
```

Pega este contenido (AJUSTA LOS VALORES):

```env
# Base de datos PostgreSQL
DATABASE_URL="postgresql://nexara_user:TU_PASSWORD_AQUI@localhost:5432/nexara_db?schema=public"

# JWT Secret (genera uno seguro o usa: openssl rand -base64 32)
JWT_SECRET="tu_secret_super_seguro_cambiar_esto"

# API URL
NEXT_PUBLIC_API_URL="http://138.197.42.104:3001"
API_PORT=3001

# Node Environment
NODE_ENV=production

# Uploads directory
UPLOADS_DIR=/var/www/nexara-app/apps/api/uploads
```

Guarda con: `Ctrl + X`, luego `Y`, luego `Enter`

---

### Frontend (Web) - archivo: `/var/www/nexara-app/apps/web/.env.local`

```bash
nano /var/www/nexara-app/apps/web/.env.local
```

Pega este contenido:

```env
# API URL
NEXT_PUBLIC_API_URL=http://138.197.42.104:3001

# Base URL
NEXT_PUBLIC_BASE_URL=http://138.197.42.104:3000

# Node Environment
NODE_ENV=production
```

Guarda con: `Ctrl + X`, luego `Y`, luego `Enter`

---

## 🏗️ PASO 4: Compilar y reiniciar servicios

Ejecuta estos comandos en el servidor:

```bash
# Backend
cd /var/www/nexara-app/apps/api
npm install --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy
npm run build

# Frontend
cd /var/www/nexara-app/apps/web
rm -rf .next
npm install --legacy-peer-deps
npm run build

# Reiniciar servicios PM2
pm2 restart nexara-api
pm2 restart nexara-web

# Ver estado
pm2 list
pm2 logs
```

---

## 🔍 PASO 5: Verificar que funciona

Abre tu navegador:

- **Frontend**: http://138.197.42.104:3000
- **API**: http://138.197.42.104:3001
- **API Health Check**: http://138.197.42.104:3001/health

---

## 📊 Comandos útiles en el servidor

```bash
# Ver logs en tiempo real
pm2 logs

# Ver logs solo del backend
pm2 logs nexara-api

# Ver logs solo del frontend
pm2 logs nexara-web

# Reiniciar un servicio
pm2 restart nexara-api
pm2 restart nexara-web

# Ver estado y uso de recursos
pm2 monit

# Detener un servicio
pm2 stop nexara-api
pm2 stop nexara-web

# Ver procesos corriendo
pm2 list

# Ver puertos en uso
netstat -tulpn | grep -E ':(3000|3001|5432)'
```

---

## ⚠️ Troubleshooting

### Error: Puerto ocupado
```bash
# Ver qué está usando el puerto 3001
lsof -i :3001
# O
netstat -tulpn | grep 3001

# Matar proceso si es necesario
kill -9 PID_DEL_PROCESO
```

### Error de base de datos
```bash
# Verificar que PostgreSQL esté corriendo
systemctl status postgresql

# Iniciar PostgreSQL si no está corriendo
systemctl start postgresql

# Verificar conexión a la base de datos
psql -U nexara_user -d nexara_db
# (luego escribe \q para salir)
```

### Error de permisos
```bash
# Dar permisos correctos al directorio
chown -R www-data:www-data /var/www/nexara-app
# O si usas root:
chown -R root:root /var/www/nexara-app
```

### Limpiar y reinstalar desde cero
```bash
cd /var/www/nexara-app/apps/api
rm -rf node_modules dist
npm install --legacy-peer-deps
npm run build

cd /var/www/nexara-app/apps/web
rm -rf node_modules .next
npm install --legacy-peer-deps
npm run build

pm2 restart all
```

---

## 📌 Información importante

- **IP Servidor**: 138.197.42.104
- **Usuario**: root
- **Directorio proyecto**: /var/www/nexara-app
- **Puerto Backend**: 3001
- **Puerto Frontend**: 3000
- **Base de datos**: PostgreSQL (puerto 5432)

---

## 🔒 IMPORTANTE - Base de datos

Si aún NO has creado la base de datos en PostgreSQL, ejecuta:

```bash
sudo -u postgres psql

CREATE DATABASE nexara_db;
CREATE USER nexara_user WITH ENCRYPTED PASSWORD 'TU_PASSWORD_SEGURO';
GRANT ALL PRIVILEGES ON DATABASE nexara_db TO nexara_user;
\q
```

Luego actualiza el DATABASE_URL en el .env del backend con los datos correctos.

---

## 📞 ¿Necesitas ayuda?

Si algo no funciona, dime:
1. ¿Qué comando ejecutaste?
2. ¿Qué error te apareció?
3. ¿Qué resultado te da `pm2 list`?
