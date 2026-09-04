# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Exports PDF/Excel HR·Ops·Finance + UX listas

Gaps ERP de documentos: PDFs/Excels faltantes y botones «Excel» sueltos.
Sin tocar cámaras Integra ni núcleo CRM OC / stock / FieldDetection.

### Exports añadidos / cableados

1. **Actividades OPS PDF** — `GET activities/report.pdf` (landscape, KPIs
   estatus/prioridad, detalle OT). UI en `OpsActivitiesBoard` + pack
   `/erp/exports`.
2. **Viáticos PDF** — ya existía API; ahora en OPS campo, Mis viáticos y
   ERP finance con patrón **Exportar PDF / Exportar Excel**.
3. **Asistencia híbrida Excel** — `GET attendance/hybrid/export.xlsx` +
   botón en `HybridAttendancePanel` + tarjeta en `/erp/exports`.
4. **Componente** `ListExportActions` — labels consistentes en listas.

### UX polish

- OT: empty con Limpiar filtros + Nueva OT; Excel con más columnas.
- Viáticos ops/mis: empty con CTA primaria; PDF 90 días.
- Finance viáticos: «Exportar PDF» (antes «PDF control»).
- Asistencia HR: «Exportar Excel».

### Concurrente — no pisar

Integra UX Video/Personas/Eventos · ACS face JPEG · FieldDetection ·
identity-link · stock historial · CRM OC PDF · facilities access.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `./deploy/update.sh --force-all`

### Verificar (hard refresh)

1. `/ops/activities` → Exportar Excel + Exportar PDF.
2. `/ops/viatics` y `/ops/my-viatics` → Exportar PDF/Excel.
3. `/erp/finance/viatics` → Exportar PDF + Excel en toolbar.
4. `/erp/hr/attendance` → híbrido Exportar Excel; pack `/erp/exports`
   Actividades PDF + Asistencia híbrida.

## A medias

1. Portal empleado · httpHost NVR · ANPR ITC · micros · TCPMSS.
2. PDF nómina/pagos empleado si falta en UI (API `employee-payments/report.pdf` ya existe).
3. identity-link WIP — no cableado a AppModule.
4. go2rtc.yaml en disco corruptible — streams en RAM.

## No tocar

Puente NAS, Traefik, credenciales.
Face ID óptico inventado. No pelear PTZ / biometrics CRUD / FieldDetection /
stock detail / OC PDF del sibling.
