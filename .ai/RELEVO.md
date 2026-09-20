# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** `be4e6824` (push a origin; deploy Hetzner en curso / verificar)
- **Migraciones nuevas:** `20260920010000_tool_labels_barcode`, `20260920010000_activity_peer_requests` (+ WS0 `20260918150000_modulos_ws0` si aún no en servidor)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno (backlog paralelo)

1. **Organigrama:** diagrama de flujo (`OrgChartView` + layout), API con `puesto`, seed/script `fix-org-puestos-jefes.js` (JA soporte, David instalación, Luis servicios, Daniela H. comercial; Josué → Christian).
2. **Herramientas:** `TOOLS_MANAGE` solo Christian + Iván; préstamos solo JA + David; etiquetas (`codigoInterno`/`barcode` + PDF/ZPL); escáner HID en `/erp/almacen?tab=scanner`; timeline de préstamo / UI punch.
3. **Actividades:** pestaña «Solicitudes de equipo» (`ActivityPeerRequest` + `me/activity-requests`); cards con foto grande; workflow KPIs helpers.
4. **Pre-nómina:** `calculatePrenominaAmount` + `preview-period` / `prenomina/batch`; pantallas `/erp/hr/prenomina` y `/erp/finance/prenomina`; módulo `OvertimeModule` para aprobar extras.

## A medias / verificar

- Deploy Hetzner con `--with-migrate --force-all` tras push `be4e6824`.
- Correr `node apps/api/scripts/fix-org-puestos-jefes.js` en el servidor (puestos/jefes en DB real).
- PDF evidencia embebido (unificar pdf.js) quedó parcial si el agente no tocó `ActivityEvidenceFlow`.
- Contraseñas Excel / facturación Google Maps: siguen en lado de Adam.

## Siguiente

- Validar en producción: organigrama, pedir herramienta (David/JA), aprobar (Iván), solicitudes de equipo, pre-nómina.
- Aplicar migraciones WS0 si el migrate no las corrió todas.
- Rotar Maps key si aún quedó en historial de chat.

## No tocar

Puente NAS.
