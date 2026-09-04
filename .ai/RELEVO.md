# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Stock: historial hiper-detallado por producto

Seguimiento auditado de movimientos (quién / cuándo / por qué / origen-destino /
saldo antes→después / documento OC·OP·AN·referencia / notas). **Desplegado.**

### Qué cambió

1. **Schema** `StockMovement`: `fromQtyBefore/After`, `toQtyBefore/After`
   + migración `20260904180000_stock_movement_qty_audit` (aplicada en prod).
2. **API** `createStockMovement`: captura saldos en la misma tx; propaga
   `productionOrderId` / `activityId`; include de docs.
3. **API** `listStockMovements`: PO, OP, actividad, lote, createdBy; tope 500.
4. **Web** helpers en `stock-api` + UI warehouse:
   - Tabla con saldo y documento
   - Filtros producto / almacén / tipo / fechas
   - Form entrada / salida / traspaso / ajuste + notas
   - Drawer timeline por producto + export Excel

Commit base: `8a17b9f`. Build sibling: `3621b00` (import asistencia).

### Deploy

SSH Hetzner → `/var/www/nexara-app`. Imágenes api/web recreadas; migrate OK
(columnas `fromQty*`/`toQty*` presentes). Contenedores Up.

Verificar: ERP → Almacén → Movimientos (filtros + Excel); click producto →
drawer con saldo antes→después; registrar traspaso escribe auditoría.

### Concurrente (siblings — no pisar)

- OC PDF compras, asistencia híbrida, Integra Eventos ACS, PTZ, Personas, CRM.

## A medias

1. Portal empleado · httpHost NVR · ANPR ITC · micros · TCPMSS.
2. Re-aplicar FieldDetection; alinear employeeNumber↔personId Oficinas.

## No tocar

Puente NAS, Traefik, credenciales, ISAPI no verificada.
No pelear pad PTZ / Personas CRUD / OC PDF / asistencia híbrida del sibling.
