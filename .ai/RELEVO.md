# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — PDF profesional de Órdenes de compra

Las OC formales con Excel estaban en **ERP Compras** (`/erp/procurement`),
no en el panel CRM. Se añadió PDF de producción (familia visual cotizaciones)
como acción principal; Excel de listado se conserva.

### Qué cambió

1. **`purchase-order-pdf.ts`**: letterhead tenant, proveedor / facturar-a /
   enviar-a, pago, entrega, Incoterms (si aparecen en notas), partidas
   (SKU, UdM, costo, IVA, importe), aprobaciones, firmas, multipágina.
2. **API** `GET procurement/purchase-orders/:id/pdf`.
3. **UI** Compras → tab Órdenes: botón **PDF** en fila, **Descargar PDF**
   en detalle (primario); Excel sigue en la barra.

Smoke: `apps/api/scripts/smoke-purchase-order-pdf.ts`.

### Concurrente en la rama (siblings — no pisar)

- Playback NVR / UI Integra ops / PTZ / Personas CRUD.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app`

Verificar: ERP → Compras → Órdenes de compra → PDF en fila o detalle.

## A medias

1. Portal empleado · httpHost NVR · ANPR ITC · micros · TCPMSS.
2. Re-aplicar FieldDetection en equipos tras sync/push install.
3. Pedidos CT (`SupplierPurchaseOrder` en CRM cotizaciones) sin PDF propio
   — solo OC ERP en este turno.

## No tocar

Puente NAS, Traefik, credenciales en repo, rutas ISAPI no verificadas.
Face ID óptico inventado. No pelear pad PTZ ni reescribir Personas CRUD.
