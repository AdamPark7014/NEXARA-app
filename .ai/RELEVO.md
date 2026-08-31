# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-30
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### NEXARA Deep Link Honor

**Ola A — 404s / cross-host**
- Customer360: oportunidad → `/crm/opportunities?new=1&clientId=`; Cotizar con `clientId`; OPS vía `CrossPanelLink`.
- Quotes builder: preselect `clientId` / `clientName` desde searchParams.
- CRM projects: handoff OPS con `CrossPanelLink` (sin URL absoluta ops.nexara…).
- Opportunities form: honora `clientId` al crear desde deep-link.

**Ola B — Search + OT + cliente CRM**
- Assets: `?highlight=` sort + banner.
- Search user → `/erp/users?highlight=`.
- Service-client Crear OT → `/ops/activities/new?clientId=` + prefill en `OpsActivityForm`.
- Cliente CRM quotes → builder con `clientId`; tickets fila → `/ops/support/{id}` CrossPanelLink.

**Ola C — Notif landings**
- tools `?highlight=` abre tab solicitudes + sort en tablas.
- maintenance `?woId=` sort + banner.
- my-vehicles / my-viatics `?highlight=`.
- Lunch notifs → `/erp/hr/lunch-breaks?highlight=`; `appUrls.erpLunchBreaks` + `erpAttendance(lunch)`.

## A medias
- (nada)

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS, PortalShell rewrite, Meta/ESP, OFX, ISAPI invent

## Siguiente paso
1. Smoke: Customer360 → Nueva oportunidad (form con clientId).
2. Smoke: search asset → assets highlight.
3. Smoke: service-client Crear OT preselect cliente.
4. Smoke: notif tools?highlight= abre tab solicitudes.

## Estado
- Listo para cerrar + push + deploy `--force-all`.
