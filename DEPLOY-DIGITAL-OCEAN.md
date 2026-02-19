# 🚀 Deploy NEXARA-app a Digital Ocean

## 📋 Información del Servidor
- **IP:** 138.197.42.104
- **Usuario:** root
- **Acceso SSH:** `ssh root@138.197.42.104`

## 🛠️ Pasos de Deploy

### 1. Conectar al servidor
```bash
ssh root@138.197.42.104
```

### 2. Navegar al directorio de proyectos (o créalo)
```bash
cd /var/www
# Si no existe, créalo
mkdir -p /var/www
```

### 3. Clonar el repositorio desde GitHub
```bash
# Si es primera vez
git clone https://github.com/AdamPark7014/NEXARA-app.git nexara-app
cd nexara-app

# Si el proyecto ya existe
cd nexara-app
git pull origin main
```

### 4. Instalar dependencias del backend (NestJS)
```bash
cd apps/api
npm install

# Copiar variables de entorno
cp .env.example .env
# Editar .env con nano o vi y configurar DATABASE_URL
nano .env
```

Configurar DATABASE_URL en .env:
```env
DATABASE_URL="postgresql://usuario:password@localhost:5432/nexara_db?schema=public"
NEXT_PUBLIC_API_URL=http://138.197.42.104:3001
JWT_SECRET=tu_secret_super_seguro_aqui
```

### 5. Ejecutar migraciones de Prisma
```bash
npx prisma migrate deploy
npx prisma generate
node prisma/seed.js
```

### 6. Compilar backend
```bash
npm run build
```

### 7. Instalar PM2 para mantener el proceso corriendo
```bash
npm install -g pm2

# Iniciar backend
pm2 start dist/main.js --name nexara-api

# Guardar configuración PM2
pm2 save
pm2 startup
```

### 8. Instalar y compilar frontend (Next.js)
```bash
cd ../web
npm install

# Copiar variables de entorno
cp .env.example .env.local
nano .env.local
```

Configurar .env.local:
```env
NEXT_PUBLIC_API_URL=http://138.197.42.104:3001
NEXT_PUBLIC_BASE_URL=http://138.197.42.104:3000
```

### 9. Compilar frontend para producción
```bash
npm run build
```

### 10. Iniciar frontend con PM2
```bash
pm2 start npm --name nexara-web -- start
pm2 save
```

### 11. Configurar Nginx como proxy reverso

Crear archivo de configuración Nginx:
```bash
nano /etc/nginx/sites-available/nexara
```

Contenido del archivo:
```nginx
# Backend API (Puerto 3001)
server {
    listen 80;
    server_name api.tudominio.com;  # O usa la IP: 138.197.42.104

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# Frontend Web (Puerto 3000)
server {
    listen 80;
    server_name nexara.tudominio.com;  # O usa la IP: 138.197.42.104

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Activar configuración:
```bash
ln -s /etc/nginx/sites-available/nexara /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### 12. Configurar Firewall (UFW)
```bash
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS (para futuro)
ufw enable
```

### 13. Verificar que todo está corriendo
```bash
pm2 list
pm2 logs nexara-api
pm2 logs nexara-web

# Verificar puertos
netstat -tulpn | grep -E ':(3000|3001)'
```

## 🔄 Actualizar el proyecto (cuando hagas cambios)

Desde Windows (local):
```bash
# 1. Hacer cambios en tu código local
# 2. Commit y push
git add .
git commit -m "descripción de cambios"
git push origin main
```

Desde el servidor:
```bash
ssh root@138.197.42.104
cd /var/www/nexara-app

# Pull últimos cambios
git pull origin main

# Actualizar backend
cd apps/api
npm install
npm run build
pm2 restart nexara-api

# Actualizar frontend
cd ../web
npm install
npm run build
pm2 restart nexara-web

# Ver logs
pm2 logs
```

## 🗄️ PostgreSQL en el servidor
Si PostgreSQL no está instalado:
```bash
apt update
apt install postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql

# Crear base de datos y usuario
sudo -u postgres psql
CREATE DATABASE nexara_db;
CREATE USER nexara_user WITH ENCRYPTED PASSWORD 'tu_password';
GRANT ALL PRIVILEGES ON DATABASE nexara_db TO nexara_user;
\q
```

## ⚡ Comandos útiles PM2
```bash
pm2 list                    # Ver procesos
pm2 restart nexara-api     # Reiniciar backend
pm2 restart nexara-web     # Reiniciar frontend
pm2 stop nexara-api        # Detener backend
pm2 logs nexara-api        # Ver logs backend
pm2 logs nexara-web        # Ver logs frontend
pm2 monit                  # Monitor en tiempo real
pm2 delete nexara-api      # Eliminar proceso
```

## 🔒 Seguridad adicional (Recomendado)

### Crear usuario no-root
```bash
adduser nexara
usermod -aG sudo nexara
# Luego usa este usuario en lugar de root
```

### Instalar SSL con Let's Encrypt (HTTPS)
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d tudominio.com -d www.tudominio.com
```

## 📝 Notas
- El servidor ya tiene otro proyecto corriendo, asegúrate de usar puertos diferentes
- Si el puerto 3000 o 3001 están ocupados, cámbialos en los archivos de configuración
- Recuerda actualizar las variables de entorno con las URLs correctas de producción
- Los archivos .env NO deben estar en GitHub (ya están en .gitignore)

## 🆘 Troubleshooting
- **Error de puerto ocupado:** Cambia el puerto en `main.ts` (backend) o usa variable de entorno PORT
- **Error de conexión a DB:** Verifica DATABASE_URL en apps/api/.env
- **Error 502 Bad Gateway:** El servicio PM2 no está corriendo, usa `pm2 restart all`
- **Frontend no actualiza:** Limpia caché: `cd apps/web && rm -rf .next && npm run build`

---
**Fecha:** ${new Date().toLocaleDateString('es-MX')}
