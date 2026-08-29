# ACS oficinas NEXARA

Control de acceso de **sedes propias** (no el panel Integra).

Cliente compartido: `apps/api/src/hikvision-artemis/` (HMAC Artemis).
Ver [ADR-0017](../../../../docs/ADR-0017-nexara-integra.md) y [INTEGRA-OPS](../../../../docs/INTEGRA-OPS.md).

## Endpoints

Base: `/api/access-control` (JWT + RBAC).

| Método | Ruta | Qué hace |
|--------|------|----------|
| GET | `/doors` | Lista puertas Artemis |
| GET | `/doors/:id/status` | Estado (desde listado) |
| POST | `/doors/:id/unlock` | `doControl` apertura |
| GET | `/events` | Eventos últimas 24 h |
| GET | `/health` | `version` Artemis |
| POST/DELETE | `/rules*` | 501 — usar Integra privilege groups |

`:id` es `doorIndexCode` (string Artemis).

## Env

```
OFFICES_HIK_HOST=
OFFICES_HIK_APP_KEY=
OFFICES_HIK_APP_SECRET=
OFFICES_HIK_TIMEOUT=15000
```

UI: `/erp/facilities/access`.
