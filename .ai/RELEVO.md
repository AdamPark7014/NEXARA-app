# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-30
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### NEXARA Hexa Hardening (olas 1–3)

**Ola 1 — Espina**
- `error.tsx` en crm/ops/studio/lab/integra (mismo patrón ERP).
- Integra HCT: caps hide people/visitors/vehicles/anpr; chrome redirect + AppShell filter.
- NOC: sin inventario sintético; EmptyState + CTA `/integra/settings`.

**Ola 2 — ROI paneles**
- ERP `/exports`: packs facturas/clientes/leads/oportunidades/proyectos/crm-activities.
- Studio leads → `POST ventas/leads` (source=Studio); CRM badge «origen Studio».
- Redirects `evidencias`→`evidences`, `viaticos`→`viatics`.
- Lab `/lab/flags` + access-matrix CEO.

**Ola 3 — Cliente / puente**
- Alarmas Integra → CTA Ticket → `/ops/support/new` (prefill + create ticket-request).
- Integra CLIENTE: cards tickets/video/accesos.
- Portal tickets: card «Mi seguridad» → Integra (`getIntegraUrl`).

## A medias
- (nada)

## No tocar
- tickets layout (solo card mínima en home), seed-demo-users, package-lock, xlsx
- Oficinas ACS

## Siguiente paso
1. Deploy `--force-all` + hard-refresh.
2. Smoke: Lab flags CEO; NOC vacío; HCT sin Personas; Studio→CRM; alarm→ticket.

## Estado
- Listo para cerrar + deploy.
