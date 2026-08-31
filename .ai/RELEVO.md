# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-30
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### NEXARA Edge Fix (post Pro Polish)

**Ola A — Links**
- DashKit `StatCard` / `DashPanel.actionHref` → `CrossPanelLink`.
- Rutas fantasma: CRM `/crm/agenda`, ERP `/erp/analytics/bi`.
- CRM orden → ERP invoicing vía `resolveCrossPanelHref` + handoff.
- AppShell notif popover: items clickables (`relatedUrl` + mark read).

**Ola B — API + campo**
- `appUrls.crmQuote` / `crmProject` en cotizaciones + ventas `relatedUrl`.
- Helper `parse-missing-evidence`; evidence-gate en `ops/activities/[id]` + my-activities.
- Gate API también reconoce `COMPLETADA` (además de Finalizada).

**Ola C — Lab + higiene**
- Lab home: KPIs live (ready + flags count), sin fake SAT/version; link a `/lab/flags`.
- Purge `QuickActionsFab` huérfano (`NotificationCenter` ya no estaba).

## A medias
- (nada)

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS

## Siguiente paso
1. Smoke: executive “Ver todo” OPS desde `core.*`.
2. Smoke: CRM orden → `core` invoicing cross-host.
3. Smoke: Lab home sin KPIs inventados; flags count live.
4. Smoke: completar OT sin evidencias en detalle → checklist.

## Estado
- Listo para cerrar + deploy `--force-all` (API+web; sin migrate).
