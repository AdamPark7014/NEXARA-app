# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — PDF profesional de Órdenes de compra

Las OC con Excel viven en **ERP → Compras** (`/erp/procurement`), no en el
panel CRM. PDF de producción (familia cotizaciones) como salida principal;
Excel de listado se conserva.

### Qué cambió (OC PDF)

1. **`purchase-order-pdf.ts`**: letterhead tenant, proveedor / facturar-a /
   enviar-a, pago, entrega, Incoterms (si en notas), partidas SKU/UdM/IVA,
   aprobaciones, firmas, multipágina ES-MX.
2. **API** `GET procurement/purchase-orders/:id/pdf`.
3. **UI** tab Órdenes: **PDF** en fila + **Descargar PDF** en detalle.
4. Smoke: `apps/api/scripts/smoke-purchase-order-pdf.ts`.

Commit: `ab8ce5e`. Build API desbloqueado con `3621b00` (import asistencia).

### Concurrente (siblings — no pisar)

- Asistencia híbrida Integra↔ERP (`3621b00` + rescates `hr/`, integra-push).
- Stock historial, PTZ, Personas, playback NVR, CRM clients/opportunities.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app`

Verificar: ERP → Compras → Órdenes de compra → PDF.

## A medias

1. Portal empleado · httpHost NVR · ANPR ITC · micros · TCPMSS.
2. Re-aplicar FieldDetection; alinear employeeNumber↔personId Oficinas.
3. Pedidos CT CRM (`SupplierPurchaseOrder`) sin PDF propio.

## No tocar

Puente NAS, Traefik, credenciales, ISAPI no verificada.
No pelear pad PTZ / Personas CRUD / asistencia híbrida del sibling.
