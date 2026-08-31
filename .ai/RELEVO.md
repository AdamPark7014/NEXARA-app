# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-30
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### NEXARA Handoff Armor

**Ola1 — Support→OT**
- CTAs Support → `/ops/activities/new?requestId=` (ya no `ticketId` muerto).
- API `GET client-ticket-requests/:id` + `getTicketRequest` + prefill en `OpsActivityForm` (NEW/by-id).

**Ola2 — Build limpio**
- Tipado `c` en support/new; `aria-label` único en AppShell drawer.
- `V2_PANEL_TO_ID`: lab, integra; portal→ops.
- `tsconfig` web excluye `*.spec.ts` — `tsc --noEmit` OK sin IGNORE.

**Ola3 — Deep-links / verdad**
- CRM quotes `?new=1` → builder; leads `?new=1` abre form; dashboard “Nuevo lead” con query.
- Studio dashboard: páginas CMS live (`studio/page-content`), sin “Publicada” fake.
- Search `asset` → `/ops/assets?highlight=`.

**Ola4 — Integra hint**
- support/new: `siteId` → `integra/sites` `serviceClientId`; fallback `clientHint` por nombre.

## A medias
- (nada)

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS

## Siguiente paso
1. Smoke: Support “Crear OT” abre form prefilled.
2. Smoke: CRM quotes?new=1 y leads?new=1.
3. Smoke: Studio dashboard pills “Con contenido / Sin contenido”.
4. Smoke: alarma Integra → support/new con cliente si el sitio tiene serviceClientId.

## Estado
- Listo para cerrar + deploy `--force-all` (API+web).
