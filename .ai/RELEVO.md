# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-30
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### NEXARA Pro Polish (todos los paneles)

**Ola1 — Cross-panel**
- `CrossPanelLink` + `CrossPanelRedirect`; notificaciones crm/ops/studio/lab/integra → ERP canónico + handoff.
- AppShell campana/popover con URL cross-host; `openPath` ERP + CommandPalette.
- Barrido handoffs CRM/ERP/Studio/CommandCenter/DashKit; specs en `cross-panel-handoff.spec.ts`.

**Ola2 — Copy sin vendors (UI pública)**
- Integra home/chrome/cards, NOC, facilities/access, subdomain-config, access-matrix, alarms/people/visitors.
- Residuales scrub: video empty, EzuiKitPlayer mensajes, `_lib` module cards. Settings sigue con labels de proveedor (staff).

**Ola3 — Campo + tablet**
- Evidence gate UX en `ops/my-activities` (checklist `missingEvidence`).
- Banner sesión por expirar / kick + `extendSession` en UserContext/AppShell.
- Drawer AppShell `@media` alineado a 900px (`PANEL_DRAWER_BREAKPOINT_PX`).

**Ola4 — Chrome**
- Popover notificaciones en AppShell; eliminado `NotificationCenter.tsx` huérfano.
- Skip-to-main CSS + focus trap drawer (ya en shell).
- Studio cases/social: `EmptyState`; cover sin emoji por defecto.

## A medias
- (nada)

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS

## Siguiente paso
1. Smoke: campana desde `ops.*` / `sales.*` → `core.*` notifications.
2. Smoke: link CRM→OPS cross-host con handoff.
3. Smoke: cerrar actividad Finalizada sin evidencias → checklist.
4. Hard-refresh login + drawer tablet ~900px.

## Estado
- Listo para cerrar + deploy web (`--force-all`, sin migrate).
