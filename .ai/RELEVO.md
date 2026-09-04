# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — ERP rol → plantilla de acceso ACS

Unifiqué horarios de acceso con usuarios ERP vía `employeeNumber` =
`employeeNo` ACS. Al crear/editar/activar/cambiar rol o contrato se
empuja `UserInfo` + `RightPlan` + `Valid` a los terminales (fan-out
ISAPI). **No** se duplicó el editor semanal (UI sibling en Integra
Personas).

### Plantillas (roleKey / tipoContrato / isActive)

| Caso | Clave | Puertas | Vigencia | planTemplateNo |
|------|-------|---------|----------|----------------|
| Empleado indefinido | `office_hours` | todas | indefinida | `2` (env `INTEGRA_PLAN_OFFICE`) |
| CEO / super_admin / dir_ops / arquitecto | `always_on` | todas | indefinida 24/7 | `1` |
| Contratista / ing_campo | `contractor` | General + Sala Juntas | ingreso → +12 meses | `3` |
| Visitante / cliente | `visitor` | solo Sala de Juntas | día en curso | `1` |
| Inactivo | `disabled` | — | `Valid.enable=false` | — |

- `GET /users/:id/integra-access-schedule` — vista previa.
- UI ERP usuarios: bloque «Horario de acceso Integra» en drawer + hint en formulario.
- Archivos: `access-schedule-defaults.ts` (+spec), `integra-acs-fanout.pushErpUser` ampliado, hooks en `users.service`.

Las plantillas week 2/3 deben existir en el ACS (sibling calendarios /
`UserRightWeekPlanCfg`). Sin ellas el terminal puede rechazar o ignorar
el `planTemplateNo`.

### Concurrente (siblings — no pisar)

Editor semanal Personas · fan-out identity · business events ROI ·
asistencia ACS · hybrid attendance · PTZ.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `./deploy/update.sh --force-all --with-migrate`

### Verificar

1. ERP usuarios → abrir IAM: bloque Horario de acceso Integra.
2. Activar/desactivar empleado → ACS `Valid.enable`.
3. Rol CEO → plan 1 todas las puertas; cliente → solo Sala Juntas.
4. Mismo `employeeNumber` en ficha ERP y terminal.

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Asegurar plantillas week 2/3 en terminales Oficinas (sibling).
3. Backfill masivo `notifications.companyId`.
4. FieldDetection re-apply tras sync.

## No tocar

Puente NAS, Traefik, credenciales.
Face ID óptico inventado. Editor semanal UI (sibling).
