# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Stock: historial hiper-detallado por producto

Seguimiento auditado de movimientos: quién, cuándo, por qué, origen/destino,
saldo antes/después, documento (OC/OP/AN/referencia) y notas.

### Qué cambió

1. **Schema** `StockMovement`: `fromQtyBefore/After`, `toQtyBefore/After`
   + migración `20260904180000_stock_movement_qty_audit`.
2. **API** `createStockMovement`: captura saldos en la misma tx; acepta
   `productionOrderId` / `activityId`; create incluye docs ligados.
3. **API** `listStockMovements`: incluye PO, OP, actividad, lot, createdBy;
   tope 500.
4. **Web** `stock-api`: tipos + helpers de documento/saldo.
5. **UI warehouse**: tabla enriquecida; filtros producto/fecha/tipo/almacén;
   export Excel; form con traspaso/ajuste/notas; drawer de historial por
   producto (timeline + existencia por almacén).

### Concurrente en la rama (siblings — no pisar)

- Integra ops chrome / Personas / PTZ / playback NVR.
- CRM PO PDFs · Integra asistencia.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app`

Verificar: ERP → Almacén → Movimientos (filtros + Excel); click producto →
drawer con saldo antes→después; entrada/salida/traspaso escriben auditoría.

## A medias

1. Portal empleado · httpHost NVR · ANPR ITC · micros · TCPMSS.
2. Re-aplicar FieldDetection en equipos tras sync/push install.

## No tocar

Puente NAS, Traefik, credenciales en repo, rutas ISAPI no verificadas.
Face ID óptico inventado sobre AcuSense.
CRM PO PDFs · Integra asistencia (siblings).
No pelear pad PTZ ni reescribir Personas CRUD del sibling.
