# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-31
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### NEXARA Ultra Deep + Mega Presence

**Ola A — Verdad operativa P0**
- CrossPanelLink: default import (activities, noc).
- ServiceClient ≠ SalesClient: link CRM solo con `salesClients[0]`; fallback `/ops/service-clients/{id}` + API include.
- Calendar: URLs canónicas vía `appUrls` + CrossPanelLink en ERP calendar.
- Evidence: `normalizeLegacyRelatedUrl` (sin doble `?`); honor `activityId` en my-activities.
- SW: navigate/postMessage en notificationclick + listener en ServiceWorkerHeadsUpPrep.
- BI: `resolveCrossPanelHref` en top cliente ROI.

**Ola B — Crawl SEO P0**
- SeoInterlinkHub + money breadcrumbs: hubs solo con `isIndustryHubSlug`; parent `/servicios`.
- robots: quitar disallow `/qa/`; Twitter en QA; un solo FAQPage (componente FAQ).
- Nexara-Ingenieros: noindex + fuera del sitemap.
- Hubs sin landings: CTA servicios/cobertura; inventario documentado en industry-hubs.ts.

**Ola C — Mega presencia**
- `lib/seo/json-ld.tsx` + JSON-LD en home/servicios/proyectos/blog/cobertura/contacto.
- DEFAULT_OG → `/opengraph-image`; RSS alternate en root + blog; feed en sitemap.
- Legal: sin canonical fantasma `/legal`; marca description.
- Breadcrumbs: blog post + cobertura city.

**Ola D — relatedUrl entity/tab**
- Multas tipadas → `/erp/hr/fines?highlight=`.
- Vehicles requests `?tab=requests&highlight=`; tools renewals `?tab=renewals`.
- CRM servicios → contrato con highlight; contracts page honora `?highlight=`.

## A medias
- (nada)

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS, PortalShell rewrite, Meta/ESP, OFX, ISAPI invent

## Siguiente paso
1. Smoke: notif evidence URL un solo `?`; calendar click → panel correcto.
2. Smoke: SeoInterlinkHub no apunta a hubs 404.
3. GSC/Bing sitemap + Rich Results home/money/blog.
4. Verificar `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` en prod.

## Estado
- **Desplegado en prod** @ `850355b` (2026-08-31): `./deploy/update.sh --force-all` OK.
- Smoke: sitemap 200 (`/qa`, `/feed.xml`, hospitalidad); sin Nexara-Ingenieros; feed.xml RSS 200; opengraph-image PNG 200.
