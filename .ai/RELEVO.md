# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Asistencia híbrida Integra ↔ ERP (desplegado)

**ACS = puertas** (eventos push). **ERP = checador / nómina**. Contraste
read-only: no inventa fichajes ni biometría.

### Entregado

1. **API** `GET /api/attendance/hybrid?date=YYYY-MM-DD`
   - Match `employeeNumber` / `UserCompany.employeeNumber` ↔ `personId` / `personCode`
   - Estados `linked` | `erp_only` | `acs_only` + flags (desfase, sin salida…)
2. **UI** `/erp/hr/attendance` — panel **Híbrido Integra ↔ ERP** + rail RRHH
3. **UI** `/integra/attendance` — badge/link ERP si hay match
4. Commit UI/copy `5801d73`; build+deploy `--force-all` con hybrid en
   `dist/attendance/attendance-hybrid*.js` y `HybridAttendancePanel.tsx`

### Cómo usarlo (Adam)

1. Mismo código en ficha RRHH y en `employeeNo` del terminal.
2. **ERP → Asistencia** (rail «Asistencia · híbrido»): checador + contraste.
3. Alertas = contraste. **Nómina solo del checador app.**

### Concurrente (siblings — no pisar)

Integra Eventos ACS UI · identity-link WIP · CRM · stock · PTZ · Personas · OC PDF.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109`

## A medias

1. Portal empleado · alinear códigos Oficinas employeeNumber↔personId.
2. `identity-link` / `identity._wip_sibling` (rescate) — no cableado a AppModule.
3. httpHost NVR · ANPR · FieldDetection re-apply.

## No tocar

Puente NAS, Traefik, credenciales, ISAPI no verificada.
Face ID óptico inventado. No CRM / stock / PTZ / Eventos ACS del sibling.
