# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-30
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### NEXARA Deep Fortify + SEO Mega Presence

**Ola 1 — P0 verdad operativa**
- OPS projects list → `CrossPanelLink` a CRM (fix 404 sales.nexara…).
- API alerts: margen → `/crm/projects/`; SLA mantenimiento sin `woId` de contrato.
- OPS dashboard: `client-ticket-requests` (endpoint real).
- ticket-alerts + workflow-timeout: URLs con id/highlight.
- notification-hierarchy: attendance/lunch/multas con `?highlight=`.
- ERP attendance + expenses: honor `?highlight=` con banner y sort.

**Ola 2 — Cross-panel batch**
- CrossPanelLink en CRM↔OPS↔ERP (projects, datos, orden, activities, service-clients, BI).
- Integra alarms fallback ticket vía `resolveCrossPanelHref`.
- OPS NOC → Integra settings con CrossPanelLink.
- `appUrls`: `erpAttendance(highlight)`, `opsSupport`, `opsSupportNew`, `erpExpenses`.
- Emisores API usan `appUrls` (hierarchy, workflow).

**Ola 3 — SEO**
- Sitemap: `INDUSTRY_HUB_SLUGS` (sin hubs 404); `/qa` añadido.
- Legal layout OG/Twitter; login `noindex`; WebSite SearchAction JSON-LD.
- `manifest.ts`, `feed.xml` RSS, `opengraph-image.tsx` 1200×630.
- Industry hubs: JSON-LD CollectionPage + breadcrumb.
- Traefik: www → apex 301.

**Ola 4 — Calidad P2**
- CRM quotes/new → redirect builder (sin Math.random folio).
- NOC: tag «Simulado» en dispositivos synthetic.
- ERP dashboard: badge «estimado» en salud heurística.
- Warehouse: `movementId` abre tab movimientos + sort.
- Integra settings: aviso si sitio sin `serviceClientId`.

## A medias
- (nada)

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS, PortalShell rewrite, Meta/ESP, OFX, ISAPI invent

## Siguiente paso
1. Smoke prod: OPS projects → CRM (no 404).
2. Smoke: notif margen → CRM project; SLA → maintenance/activity.
3. `curl -I https://nexara.com.mx/sitemap.xml` → 200; sin hub `/soluciones/seguridad-electronica`.
4. GSC/Bing: enviar sitemap; Rich Results en home + money page + blog.

## Estado
- **Desplegado en prod** @ `2ba0cf8` (2026-08-30): `./deploy/update.sh --force-all` OK.
- Smoke: sitemap 200, `/qa` + hubs `hospitalidad`/`educacion` presentes, hub `seguridad-electronica` ausente, www→apex 308.
