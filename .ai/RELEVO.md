# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-30
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### NEXARA Armor Spine (post-Hexa/Fortify)

**Ola 1 — Sesión + RBAC**
- `POST /api/auth/session/extend`: sliding JWT + `UserSession.expiresAt` (tope 7d desde `createdAt`).
- `UserContext`: heartbeat ~15 min + `focus`/`visibilitychange` → extend; actualiza `expiresAt`.
- `ROLE_EXTRA_PANELS` web alineado a API; `CLIENTE_INTEGRA_MODULE_IDS` + `getAllowedModules(..., { v2Role })`.

**Ola 2 — Integra ↔ OPS**
- `IntegraSite.serviceClientId` cableado en list/create/update + DTOs + settings UI (select ERP).
- `POST /api/integra/alarms/:id/ticket` (staff): resuelve sitio → `serviceClientId` → `createTicketRequest`; 400 si sin cliente.
- Alarmas UI: API-first Ticket; fallback deep-link `/support/new` si falta cliente.
- Evidence close-gate: no marcar `Finalizada` sin llegada + (salida|hoja); 400 con `missingEvidence`.

**Ola 3 — Observabilidad**
- `/api/health`: checks Redis + go2rtc (`InfraHealthIndicator`); go2rtc soft-fail.
- Integra chrome: badge `media down` si go2rtc reporta down.
- Exports Excel: `AuditLog` action `EXPORT` (modelo, fields, rowCount).
- Cron SLA breach cada 5 min (`ticket-alerts:sla-breach`) + notify `SLA_BREACH`.

**Ola 4 — Borde**
- Integra home SSE: reconnect exponencial (cap 60s); poll solo mientras SSE down.
- Specs: session-extend, ROLE_EXTRA_PANELS parity, health redis key, alarm-ticket contract, evidence gate.

## A medias
- (nada)

## No tocar
- tickets layout (solo cards mínimas), seed-demo-users, package-lock, xlsx
- Oficinas ACS, Meta/ESP/OFX/ISAPI, PortalShell rewrite

## Siguiente paso
1. Deploy + hard-refresh.
2. Smoke: session extend; sitio con `serviceClientId` → Ticket alarma; OT sin evidencias → 400; `/api/health` redis/go2rtc; SSE recover.

## Estado
- Listo para cerrar + push + deploy `--force-all --with-migrate`.
