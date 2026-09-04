# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Stock historial hiper-detallado (FIN)

Kardex por producto desplegado: quién / cuándo / por qué / origen→destino /
saldo before→after / docs OC·OP·AN / notas. Excel + PDF kardex + vale PDF.

### Entregado

1. Migración `20260904180000_stock_movement_qty_audit` (columnas en prod).
2. `createStockMovement` audita saldos; list con PO/OP/actividad.
3. PDF: `GET stock/movements/pdf` + `GET stock/movements/:id/pdf`.
4. UI `/erp/warehouse`: filtros, drawer, Excel, PDF kardex, PDF por fila.

Commit base `8a17b9f`. Redeploy Hetzner con migrate (ya aplicada).

Verificar: ERP → Almacén → Movimientos.

### Concurrente (siblings — no pisar)

Live detection / PTZ / Eventos ACS / asistencia / OC PDF / Personas / ACS fan-out.

## A medias

1. Portal empleado · NVR httpHost · ANPR · micros · TCPMSS.
2. FieldDetection; employeeNumber↔personId.

## No tocar

Puente NAS, Traefik, credenciales, ISAPI no verificada.
No pelear siblings PTZ/Personas/Eventos/asistencia/OC PDF/ACS.
