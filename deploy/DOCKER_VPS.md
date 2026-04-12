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
cd /opt
sudo mkdir -p proxy
sudo chown -R $USER:$USER /opt/proxy
```

Copia el contenido de `infra/proxy` a `/opt/proxy` y luego:

```bash
cd /opt/proxy
cp .env.example .env
mkdir -p letsencrypt
touch letsencrypt/acme.json
chmod 600 letsencrypt/acme.json
docker compose up -d
```

## 4) Desplegar Nexara

```bash
cd /opt
git clone <tu-repo-nexara-url> nexara
cd nexara/deploy
cp .env.nexara.example .env.nexara
```

Edita `.env.nexara` con tus secretos reales.

Levanta stack:

```bash
docker compose --env-file .env.nexara -f docker-compose.nexara.yml up -d --build
```

## 5) Migraciones Prisma

Al primer despliegue (y cuando cambie schema):

```bash
cd /opt/nexara
docker compose --env-file deploy/.env.nexara -f deploy/docker-compose.nexara.yml exec api npm run prisma:deploy --workspace=apps/api
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

# Rebuild + restart
docker compose --env-file deploy/.env.nexara -f deploy/docker-compose.nexara.yml up -d --build

# Reiniciar solo web
docker compose --env-file deploy/.env.nexara -f deploy/docker-compose.nexara.yml restart web
```

## 8) Recomendaciones de produccion

- No uses `.env.local` en servidor, solo archivos `.env` de deploy.
- Guarda backups de volumen Postgres.
- Si usas Spaces/R2 para archivos, evita depender de disco local.
- Activa firewall (UFW): permitir solo 22, 80, 443.
