# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-11
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Core ola1 A+B+C+D (completo)

### Hecho

1. **Fase A:** Core-only shell, menú ola1, home `/erp/pizarra`, seed `seed-core-roster.ts`, middleware NON_CORE → core.
2. **Fase B:** `GET /api/me/board` + `/erp/pizarra` (semáforo company/subtree).
3. **Fase C:** `/erp/asistencias` Equipo|Comidas|Trayectoria; attendance `scope=subtree`.
4. **Fase D:** `/erp/actividades/{diarias|proyectos|servicios}`; `findAllScoped`; `fechaInicio <= fechaMaxima`.
5. Merges A/B/CD → `mejora/calidad-y-web`. Seed OK (11 activos, 9 desactivados). `module-guides` tipado. `tsc` web+api OK. `npm run dev` arrancado.

### Logins

- CEO: `gerencia@nexara.com.mx` / `Nexara!NX001`
- David: `operaciones@nexara.com.mx` / `Nexara!NX302`
- Break-glass: `developer@nexara.com.mx` / `Nexara!NX002`

### Verificar

- http://127.0.0.1:3000/erp/pizarra · /erp/asistencias · /erp/actividades/diarias
- David: sin servicios; subtree en board/asistencias

### A medias / siguiente

- Ola E: módulos de otros encargados + instaladores campo
- Borrar worktrees `C:\dev\apps\_worktrees\nexara-core-*` cuando Adam confirme

## No tocar

Puente NAS. Credenciales. Plan file. No borrar código OPS/CRM.
