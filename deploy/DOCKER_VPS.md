# Dockerizar VPS DigitalOcean (2 proyectos)

Esta guia deja un VPS corriendo varios proyectos Docker con un solo proxy HTTPS (Traefik).

## 1) Preparar VPS (Ubuntu)

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

## 2) Configurar DNS

Crea registros A apuntando a la IP del VPS:

- `nexara.com.mx`
- `www.nexara.com.mx`
- `api.nexara.com.mx`
- `app.nexara.com.mx`
- `traefik.tudominio.com` (opcional dashboard)

## 3) Levantar proxy global (una sola vez para todo el VPS)

```bash
cd /var/www/nexara-app
```

Copia el contenido de `infra/proxy` a tu carpeta de deploy y luego:

```bash
cd /var/www/nexara-app/infra/proxy
cp .env.example .env
mkdir -p letsencrypt
touch letsencrypt/acme.json
chmod 600 letsencrypt/acme.json
docker compose up -d
```

## 4) Desplegar Nexara

### Si `git pull` dice que `deploy/update.sh` (u otro) tiene cambios locales

Eso impide traer el `Dockerfile` nuevo y el servidor sigue construyendo imagen vieja (sin `apps/api/node_modules` → sigue fallando `@nestjs/terminus`).

Descarta solo ese archivo y vuelve a tirar de `main` (ajusta la ruta si tu repo no es `nexara-app`):

```bash
cd /var/www/nexara-app
git checkout -- deploy/update.sh
git pull --ff-only origin main
```

(O guarda tus cambios: `git stash push -m "servidor" -- deploy/update.sh` y luego `git pull`.)

### Rutas de `docker compose` (evitar `deploy/deploy/...`)

- Desde la **raíz del repo** (`/var/www/nexara-app`): usa `--env-file deploy/.env.nexara` y `-f deploy/docker-compose.nexara.yml`.
- Desde la carpeta **`deploy/`**: usa `--env-file .env.nexara` y **`-f docker-compose.nexara.yml`** (sin prefijo `deploy/`).

```bash
cd /var/www
git clone <tu-repo-nexara-url> nexara-app
cd nexara-app/deploy
cp .env.nexara.example .env.nexara
```

Edita `.env.nexara` con tus secretos reales.

Levanta stack:

```bash
docker compose --env-file .env.nexara -f docker-compose.nexara.yml up -d --build
```

Para actualizaciones con menos uso de RAM (build secuencial, sin limpiar cache en cada deploy):

```bash
cd /var/www/nexara-app
chmod +x deploy/update.sh
./deploy/update.sh --with-migrate
```

Antes de levantar los contenedores, `update.sh` ejecuta `deploy/stop-legacy-host.sh`: detiene y elimina apps **PM2** con nombres típicos (`nexara-api`, `web`, etc.) y apaga unidades **systemd** conocidas (`nexara-api.service`, …) si existían. Así no quedan dos backends (Docker + Node en el host) detrás del mismo dominio.

- Para saltar esa limpieza (p. ej. otro proyecto en PM2 con nombre genérico): `./deploy/update.sh --with-migrate --no-stop-legacy`

## 5) Migraciones Prisma

Al primer despliegue (y cuando cambie schema):

```bash
cd /var/www/nexara-app
docker compose --env-file deploy/.env.nexara -f deploy/docker-compose.nexara.yml exec api npm run prisma:deploy --workspace=apps/api
```

Si `nexara-api` está en **restarting** (crash-loop), `exec` falla. Usa un contenedor one-off (misma imagen y env):

```bash
docker compose --env-file deploy/.env.nexara -f deploy/docker-compose.nexara.yml run --rm -T api sh -c "cd apps/api && npx prisma migrate deploy"
```

(La imagen API no incluye el `package.json` del monorepo raíz; las migraciones deben ejecutarse desde `apps/api` con `npx prisma`.)

Diagnóstico rápido del API:

```bash
docker inspect -f 'Status={{.State.Status}} Exit={{.State.ExitCode}}' nexara-api
docker logs nexara-api --tail 150
```

Opcional seed:

```bash
docker compose --env-file deploy/.env.nexara -f deploy/docker-compose.nexara.yml exec api npm run prisma:seed --workspace=apps/api
```

## 6) Segundo proyecto en el mismo VPS

Para tu otro proyecto repite el patron:

1. Crea su propio compose (ejemplo `docker-compose.proyecto2.yml`).
2. Conecta servicios al mismo network externo `proxy`.
3. Usa labels Traefik con dominios distintos.
4. No publiques puertos 80/443 en ese compose (solo Traefik publica 80/443).

Regla clave: solo un Traefik global por VPS.

## 7) Comandos utiles

```bash
# Ver servicios
docker compose --env-file deploy/.env.nexara -f deploy/docker-compose.nexara.yml ps

# Ver logs API
docker compose --env-file deploy/.env.nexara -f deploy/docker-compose.nexara.yml logs -f api

# Update recomendado (incremental)
./deploy/update.sh --with-migrate

# Forzar rebuild completo cuando sea necesario
./deploy/update.sh --force-all --with-migrate

# Limpieza moderada (imagenes/cache viejas)
./deploy/update.sh --with-prune

# Reiniciar solo web
docker compose --env-file deploy/.env.nexara -f deploy/docker-compose.nexara.yml restart web

# No usar scripts legacy PM2 (ya redirigen a Docker)
# bash deploy.sh
# bash update-server.sh
```

## 8) Recomendaciones de produccion

- No uses `.env.local` en servidor, solo archivos `.env` de deploy.
- Guarda backups de volumen Postgres.
- Si usas Spaces/R2 para archivos, evita depender de disco local.
- Activa firewall (UFW): permitir solo 22, 80, 443.
- Evita `docker system prune -a` en cada deploy; usa limpieza moderada con `--with-prune` solo cuando haga falta.
