# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — OC PDF profesional DESPLEGADO

Órdenes de compra formales = **ERP → Compras** (`/erp/procurement`).
PDF (familia cotizaciones, más denso) es la salida principal; Excel de lista
sigue.

### Entrega

1. `purchase-order-pdf.ts` + `GET procurement/purchase-orders/:id/pdf`
2. UI: botón **PDF** en fila, **Descargar PDF** / **PDF profesional** en detalle
3. Smoke: `apps/api/scripts/smoke-purchase-order-pdf.ts`
4. Commit feature: `ab8ce5e`
5. **Prod:** `nexara-api` + `nexara-web` up; `purchase-order-pdf.js` en dist;
   bundle web con `Descargar PDF` + fetch `.../pdf`

### Dónde clic (Adam)

1. Panel **ERP** → **Compras** (`/erp/procurement`)
2. Tab **Órdenes de compra**
3. En la fila: botón **PDF** — o abre detalle → **Descargar PDF**
4. Excel sigue en la barra del filtro (lista)

### Concurrente (siblings — no pisar)

- PTZ/NVR/ACS al límite ISAPI (vehicle/motion/wire)
- Asistencia híbrida, stock historial, Personas, CRM pages

## A medias

1. Portal empleado · ANPR ITC hardware · micros · TCPMSS
2. Pedidos CT CRM (`SupplierPurchaseOrder`) sin PDF propio
3. Si motion PTZ sin push: linkage Event/triggers

## No tocar

Puente NAS, Traefik, credenciales, ISAPI no verificada.
No pelear pad PTZ / Personas / asistencia / stock del sibling.
