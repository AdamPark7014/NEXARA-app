# ACS oficinas NEXARA

Control de acceso de **sedes propias** (no el panel Integra).

Habla con **HikCentral Professional Artemis** (`/artemis/api/...`, firma HMAC).
Ver [ADR-0017](../../../../docs/ADR-0017-nexara-integra.md).

## Endpoints

Base: `/api/access-control` (JWT + RBAC).

| Método | Ruta | Qué hace |
|--------|------|----------|
| GET | `/doors` | Lista puertas Artemis |
| GET | `/doors/:id/status` | Estado (desde listado) |
| POST | `/doors/:id/unlock` | `doControl` apertura |
| GET | `/events` | Eventos últimas 24 h |
| GET | `/health` | `version` Artemis |
| POST/DELETE | `/rules*` | 501 hasta modelar privilege/group |

`:id` es `doorIndexCode` (string Artemis), no un entero inventado.

## Variables de entorno

```
OFFICES_HIK_HOST=https://hikcentral.oficina.local
OFFICES_HIK_APP_KEY=...
OFFICES_HIK_APP_SECRET=...
OFFICES_HIK_TIMEOUT=15000
```

Fallback de host: `HIKVISION_URL`. Fallback de key/secret: `HIK_APP_KEY` / `HIK_APP_SECRET`.
User/password legacy **ya no se usan**.

## UI

`/erp/facilities/access` en el panel Core.

## Código

```
access-control/
  access-control.controller.ts
  services/
    hikcentral-artemis.client.ts   # firma + POST
    hikvision-api.service.ts       # oficinas → Artemis
    access-control.service.ts      # DTOs
```
