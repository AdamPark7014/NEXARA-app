# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Stock historial hiper-detallado (cerrado + deploy)

Kardex por producto: quién / cuándo / por qué / origen→destino /
saldo antes→después / OC·OP·AN·referencia / notas. Export Excel + PDF.

### Entregado

1. Schema `fromQty*`/`toQty*` + migración `20260904180000_*` (en prod).
2. API captura saldos en create; list enrichido; PDF kardex + vale
   (`GET stock/movements/pdf`, `GET stock/movements/:id/pdf`).
3. UI Almacén: filtros, drawer timeline, Excel, PDF kardex, PDF por fila.

Commit base `8a17b9f` + polish PDF UI. Contenedores recreados en Hetzner.

Verificar: ERP → Almacén → Movimientos → filtros / PDF kardex / click
producto → drawer / PDF fila.

### Concurrente (siblings — no pisar)

Eventos ACS, asistencia híbrida, OC PDF, PTZ, Personas, CRM.

## A medias

1. Portal empleado · httpHost NVR · ANPR · micros · TCPMSS.
2. FieldDetection; employeeNumber↔personId Oficinas.

## No tocar

Puente NAS, Traefik, credenciales, ISAPI no verificada.
No pelear PTZ / Personas / OC PDF / asistencia / Eventos ACS siblings.
