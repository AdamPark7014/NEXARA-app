# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-30
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### NEXARA Hexa Fortify (post-Hexa)

**Ola A — Trust / RBAC**
- `PanelKey` + `ROLE_EXTRA_PANELS`: `lab`/`integra` (CEO, super_admin, cliente+integra, ops roles).
- CEO: `/lab/**` + `/api/lab/**` en url-matrix; `PANEL_LAB`/`LAB_ACCESS` en auth v2.
- `loading.tsx` en erp/crm/ops/studio/lab/integra.

**Ola B — HCT honesty (ADR-0019)**
- Alarms: sin Video/playback ni histórico Artemis en HCT.
- Video: bloque playback oculto en HCT (mensaje EZUIKit).
- Settings: toggles people/visitors/vehicles/anpr disabled en HCT.

**Ola C — Puentes**
- NOC empty CTA → `getIntegraUrl("/settings")`.
- Alarm→ticket: `siteId` + `clientHint`; support/new preselección por nombre.
- Studio promote: detecta leads CRM `source=Studio` (email / contactMessageId).
- Portal: cards Video + Accesos además de Mi seguridad.
- Map: EmptyState sin planos.

## A medias
- (nada)

## No tocar
- tickets layout (solo cards mínimas), seed-demo-users, package-lock, xlsx
- Oficinas ACS

## Siguiente paso
1. Hard-refresh tras deploy.
2. Smoke: CEO Lab flags write; HCT sin Playback; NOC CTA host integra; Studio refresh «En CRM».

## Estado
- Listo para cerrar + deploy.
