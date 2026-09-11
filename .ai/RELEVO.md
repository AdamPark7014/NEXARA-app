# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-11
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Acomodado total NEXARA (sin duplicados)

### Hecho

1. **8 paneles en switcher** (`access-matrix.ts`): NEXARA Core, Contabilidad (`finance`), RRHH (`hr`), Operaciones corporativas, CRM, Integra, Studio, Nexara Desarrollo. `routePanel` mantiene URLs canónicas bajo `/erp/...`.
2. **Shell dinámico:** `shell-panel.ts` + `erp/layout.tsx` + `cross-panel-handoff.ts` — Contabilidad/RRHH/OPS-asistencia según pathname.
3. **Menú operativo vs avanzado:** `nav-mode.ts` + toggle en AppShell (`nxNavMode`).
4. **Fusiones UI:**
   - Reuniones › Agenda (calendar redirect + `PersonalCalendar`)
   - RRHH rail: plantilla / organigrama / incidencias / KPIs (sin asistencia)
   - OPS Asistencia rail: checadas + comidas
   - CRM Pipeline rail: lista + kanban
   - Soporte inbox + SLA; Vehículos + GPS
5. **Dedup menú:** facilities → Integra; ops-service-clients → CRM clients (redirects).
6. **Copy/defaults:** Catálogo CRM sin KPIs stock; Almacén default Inventario; Conta default Pólizas; glosario «Una verdad por dominio» en architecture + `domain-truths.ts`.
7. Layouts thin `(panels)/finance` y `(panels)/hr` + redirects índice.
8. `tsc` web OK.

### Verificar

- Switcher: Core / Contabilidad / RRHH / Operaciones…
- Toggle Operativo↔Avanzado en topbar
- `/erp/reuniones?tab=agenda`, `/erp/hr`, `/erp/hr/attendance`, `/crm/opportunities`
- `/erp/facilities/access` → Integra; `/ops/service-clients` → CRM clients

### A medias / siguiente

- Opcional: páginas catch-all bajo `/finance/*` y `/hr/*` (hoy se navega por URLs `/erp/...` con shell correcto).
- Hard-delete Nest/Prisma de módulos absorbidos = ola Claude Max.

## No tocar

Puente NAS. Credenciales. Plan file. No fingir EN VIVO.
