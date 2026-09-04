# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — CRM UI production polish

Chrome B2B denso (sin purple AI-slop) en ventas + detalle OC. No toqué
Integra, asistencia híbrida ni stock historial (siblings).

### Qué hay

1. **`components/crm/crm-chrome.module.css`** — shells, forms, pipeline board,
   quoteDoc, detalle OC compartido.
2. **Clientes / oportunidades** — EmptyState, formularios chrome, KPI/dist cards.
3. **Pipeline** — columnas densas, empty states, colores de etapa sin índigo/púrpura;
   label **Descubrimiento** (antes Discovery).
4. **Cotización detalle** — bloques documentales alineados al PDF; copy ES
   (Información, Cotización, Teléfono, Anticipo, Elaboró).
5. **Dashboard / agenda** — acentos teal/slate (sin #a855f7 / #6366f1).
6. **Procurement UX** — folio clickeable, detalle OC/req con meta grid + empty;
   PDF download intacto (renderer del sibling no tocado).

### Concurrente (siblings — no pisar)

Asistencia híbrida, stock movements, Integra Personas/PTZ/playback, OC PDF
renderer (`purchase-order-pdf.ts`).

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `deploy/update.sh --force-all` (rebuild api+web)

Verificar: `/crm/quotes`, `/crm/clients`, `/crm/pipeline`, `/crm/opportunities`,
detalle cotización PDF-like, `/erp/procurement` detalle OC + PDF.

## A medias

1. Portal empleado · httpHost NVR · ANPR ITC · micros · TCPMSS.
2. Alinear códigos employeeNumber↔personId en plantilla real Oficinas.
3. go2rtc.yaml en disco corruptible — streams viven en RAM.
4. FieldDetection re-apply tras sync/push install.

## No tocar

Puente NAS, Traefik, credenciales, ISAPI no verificada.
Face ID óptico inventado. No pelear PTZ pad / Personas CRUD / hybrid
attendance / stock detail del sibling.
