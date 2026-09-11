# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-10
- **Rama:** mejora/calidad-y-web
- **HEAD:** `b2288029`

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — localhost ON

### Hecho

1. `npm run dev` (turbo api+web) corriendo en background.
2. **Web** http://localhost:3000 (login `/login`, paneles `/erp` `/crm` `/ops` …) — 200.
3. **API** http://localhost:3001 — `/api/health/live` y `/ready` 200. (`/api/health` 500 en Windows por check de disco `/` — cosmético).
4. Postgres local `:5432` OK. Aplicadas **17 migraciones** pendientes (Integra edge/push, tickets notes, etc.).
5. Docker Desktop **no** está arriba (no hace falta: DB nativa + `npm run dev`).

### URLs locales

| Qué | URL |
|-----|-----|
| Login | http://localhost:3000/login |
| ERP | http://localhost:3000/erp |
| CRM | http://localhost:3000/crm |
| OPS | http://localhost:3000/ops |
| API | http://localhost:3001/api |
| Base .env | `NEXT_PUBLIC_API_URL=http://localhost:3001/api` |

Nota: `*.localhost` (erp.localhost) no resuelve en ping de este Windows; usar paths `/erp` etc. o añadir hosts.

## A medias / siguiente

- Adam va a trabajar local a fondo — stack ya prendido.
- Opcional: arrancar Docker Desktop solo si se quiere redis compose; hoy no hay REDIS en `.env` API.

## No tocar

Puente NAS. Credenciales. No fingir EN VIVO. No `git reset --hard` sin pedirlo Adam.
