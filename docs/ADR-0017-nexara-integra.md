# ADR-0017: NEXARA Integra + ACS de oficinas

## Status
Accepted — 2026-08-29

## Context
NEXARA necesita un panel de seguridad física completo (CCTV, accesos, personas,
eventos, vehículos) sobre infraestructura Hikvision, y por separado controlar
las puertas de las **oficinas propias** sin mezclar ese flujo con el producto.

Ya existía `apps/api/src/access-control` apuntando a rutas inventadas
(`/api/v1/...` + Bearer). Eso no es HikCentral Professional (Artemis) ni HCT.

## Decision

### 1. Panel `integra` — sexto host de producto
- Host canónico: `integra.nexara.com.mx` → path interno `/integra`.
- Backend primario: **HikCentral Professional OpenAPI (Artemis)** on-premise
  (HMAC-SHA256, paths `/artemis/api/...`), por máxima paridad de recursos.
- Capas adicionales (mismo contrato interno, adapters):
  - HCT nube cuando el sitio no tenga HikCentral.
  - HikGateway / ISAPI cuando haga falta LAN pura.
- El panel es un **sistema operativo**, no un pitch comercial ni un skin del
  Web Client de Hikvision: UI NEXARA propia hablando a la OpenAPI.
- Credenciales de producto: `INTEGRA_HIK_HOST`, `INTEGRA_HIK_APP_KEY`,
  `INTEGRA_HIK_APP_SECRET` (TLS autofirmado típico: verify off salvo override).

### 2. `access-control` — solo oficinas NEXARA
- Sigue en `/api/access-control`.
- Alcance: puertas, apertura remota y eventos de **sedes NEXARA**.
- UI en ERP: `/erp/facilities/access`.
- Cliente Artemis real (misma firma que
  `HIKVISION-apps/templates/hikcentral-python`).
- Credenciales de oficinas: `OFFICES_HIK_HOST`, `OFFICES_HIK_APP_KEY`,
  `OFFICES_HIK_APP_SECRET` (fallback temporal a `HIKVISION_*` solo para host;
  user/password legacy dejan de usarse).

### 3. Frontera
- Integra ≠ oficinas. No reutilizar el controller de oficinas como superficie
  del producto cliente.
- No inventar endpoints: solo paths documentados en
  `HIKVISION-apps/docs/HikCentral-Professional/`.

## Consequences
- Traefik, middleware Next, `access-matrix`, `page-matrix` y `url-matrix`
  ganan el panel `integra`.
- El módulo inventado de auth Bearer se retira; reglas de privilegio Artemis
  avanzadas quedan fuera de oficinas hasta modelar `privilege/group`.
- Paridad CCTV “completa” es incremental por módulos dentro de `/integra`.
