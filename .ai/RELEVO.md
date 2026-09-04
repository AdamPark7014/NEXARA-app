# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Asistencia híbrida Integra ↔ ERP (cerrado)

Contraste honest desplegable: **ACS = puertas**; **ERP = checador/nómina**.
No escribe fichajes desde la puerta ni inventa biometría.

### Qué hay

1. **API** `GET /api/attendance/hybrid?date=YYYY-MM-DD[&siteId=]`
   - Match `employeeNumber` / `UserCompany.employeeNumber` ↔ `personId` / `personCode`
   - `linked` | `erp_only` | `acs_only` + flags (desfase, sin checador, sin salida…)
2. **UI ERP** `/erp/hr/attendance` — panel **Híbrido Integra ↔ ERP** + rail RRHH
3. **UI Integra** `/integra/attendance` — badge/link ERP si hay match del día
4. Copy sección asistencia actualizado; tests `attendance-hybrid.match.spec.ts`

### Cómo usarlo (Adam)

1. Mismo código en ficha RRHH (`employeeNumber`) y en `employeeNo` / personCode del terminal.
2. **ERP → Asistencia** (rail «Asistencia · híbrido»): checador arriba, contraste abajo.
3. Alertas = contraste operativo. **Nómina = solo checador app.**

### Concurrente (siblings — no pisar)

OC PDF, stock historial, CRM quotes/pipeline, PTZ, Personas, playback NVR.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `deploy/update.sh --force-all` (rebuild api+web)

Verificar: `/erp/hr/attendance` panel híbrido; `GET /api/attendance/hybrid?date=…`

## A medias

1. Portal empleado (self-service más allá del checador).
2. Alinear códigos employeeNumber↔personId en plantilla real Oficinas.
3. httpHost NVR · ANPR ITC · micros · TCPMSS · FieldDetection re-apply.

## No tocar

Puente NAS, Traefik, credenciales, ISAPI no verificada.
Face ID óptico inventado. No CRM PDFs / stock / PTZ / Personas CRUD del sibling.
