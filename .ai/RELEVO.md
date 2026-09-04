# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Asistencia híbrida Integra ↔ ERP

Contraste honest: ACS = puertas; ERP = checador/nómina. Sin biometría inventada
ni escritura automática de fichajes desde la puerta.

### Qué cambió

1. **API** `GET /api/attendance/hybrid?date=YYYY-MM-DD`
   - Une checador (`Attendance`/`AttendanceDay`) con jornadas ACS
     (`IntegraPushService.attendance`).
   - Match por `User.employeeNumber` / `UserCompany.employeeNumber` ↔
     `personId` / `personCode` (normalizado).
   - Estados: `linked` | `erp_only` | `acs_only` + flags (desfase, sin salida…).
   - Managers ven equipo; el resto solo a sí mismo (`selfOnly`).
2. **UI ERP** `/erp/hr/attendance` → panel **Híbrido Integra ↔ ERP**.
3. **UI Integra** `/integra/attendance` → badge/link ERP si hay match del día.
4. Tests: `attendance-hybrid.match.spec.ts`.

### Cómo usarlo (Adam)

1. En ficha RRHH / User: pon el **mismo** código que el `employeeNo` del
   terminal (o `personCode` del espejo Personas).
2. Abre **ERP → Asistencia**: abajo del equipo, sección híbrida del día.
3. Alertas = contraste (p. ej. pasó puerta sin checar app). **Nómina** sigue
   saliendo del checador app, no de la puerta.

### Concurrente (siblings — no pisar)

- UI Integra ops chrome, Personas CRUD, PTZ, playback NVR, CRM quotes PDFs,
  stock movements.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `deploy/update.sh`

Verificar: `/erp/hr/attendance` panel híbrido; `/integra/attendance` link ERP;
`GET /api/attendance/hybrid?date=…`.

## A medias

1. Portal empleado (self-service más allá del checador).
2. httpHost NVR · ANPR ITC · micros · TCPMSS.
3. Re-aplicar FieldDetection en equipos tras sync/push install.
4. Alinear códigos employeeNumber ↔ personId en plantilla real Oficinas.

## No tocar

Puente NAS, Traefik, credenciales en repo, rutas ISAPI no verificadas.
Face ID óptico inventado sobre AcuSense.
No pelear pad PTZ ni reescribir Personas CRUD / CRM PDFs / stock del sibling.
