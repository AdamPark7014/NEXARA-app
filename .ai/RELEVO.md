# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-18
- **Rama:** mejora/calidad-y-web
- **HEAD:** 428091d6 (+ este commit: pruebas web en verde)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno (claude-code, 18-09 noche) — las 26 pruebas web que fallaban

`apps/web`: `npx vitest run` 725/725 (antes 692 + 26 rojas), `tsc --noEmit` limpio. **Sin desplegar.**

Causa y lado corregido por prueba:

1. **Spec vieja — URLs de Finanzas/RRHH.** `be3f71f6` (Cursor, 11-09) les puso `routePanel: erp`; la spec armaba la URL con `panel` (`/finance/...`, `/hr/...`) y la matriz de páginas la negaba. Ahora usa `getModuleUrl`, igual que el menú.
2. **Spec vieja — menú operativo/avanzado** (mismo commit). El catálogo por rol se fija con «Menú avanzado» (todo lo que el puesto alcanza) y una prueba nueva exige que el operativo esconda exactamente `ADVANCED_ONLY_MODULE_IDS` (calendario, KB, BI…).
3. **Código — `/me/navigation` recortaba Finanzas/RRHH.** `filterModulesByNavigation` (`lib/me-navigation.ts`) comparaba contra `/{panel}/...` en vez de `routePanel`: CEO, direcciones, coord_admin, RH y contabilidad perdían contabilidad, facturación, pagos al personal, organigrama, etc. Hoy no se ve en producción porque Core-only solo pinta módulos de `/erp` sin `routePanel`; aparecía al apagar Core-only.
4. **Código — `lider_diseno` sin páginas de Core en la web.** `dad8869a` le dio `CORE_OLA1_URL_RULES` en la API («Daniela también es personal Core») pero no `CORE_OLA1_PAGE_PATHS` en `lib/rbac/page-matrix.ts`: en la web Core-only no abría `/erp/pizarra` ni `/erp/asistencias`. Corregido; **necesita deploy de la web** para que Daniela lo vea.
5. **Spec vieja — Core.** `pizarra` y `asistencias` entran al catálogo de los roles con páginas de Core; en la lista de «lo que el super admin no ve» entran `activities-*` (consolidadas en la pizarra, `visible: false`), `mis-actividades` (pestaña) y `erp-clients` (se da por persona/correo). Prueba nueva: todo módulo de Core enlaza bajo `/erp`.
6. **Spec vieja + no determinista — fecha de actividad.** `6994dbbf` (12-09) añadió campo de hora que arranca en 09:00; la prueba esperaba 08:00 y comparaba hora local contra hora local. `vitest.config.mts` fija `TZ=America/Mexico_City` y las pruebas esperan ISO UTC con el desfase escrito (09:00 → 15:00Z). Comprobado con la máquina en UTC, Tokio y Los Ángeles. Ojo: en Git Bash `TZ=... npx` no llega a Node; para probar otra zona usa PowerShell (`$env:TZ`).

### En curso (agentes en worktrees, ramas sin mergear) — sin cambios de este turno

- `feat/pdf-propuesta-identica` — PDF cliente idéntico a la referencia (portada/membrete como fondo).
- `feat/cotizaciones-ui-nueva` — editor tipo documento + vista previa PDF + nomenclatura visible + `scripts/refoliar-borradores.js` (NO correr sin revisar).
- `feat/actividades-solo-iniciar` — el asignado solo «Iniciar actividad» (sin rechazar), `POST me/activities/:id/iniciar`.
- `feat/periodos-actividades` — periodo de actividades desde el proyecto (sin recargar diario).
- `feat/kpis-dashboard` — retardos, uniforme (campo nuevo por checada), horas laboradas vs productivas, inactividad.
Requisitos de Adam: tabla «Tareas/Dashboard» + `Downloads/gantt_seguimiento_proyectos (1).xlsx` (hoja Desarrollo) + `V1_Nomenglaturas_Nexara.xlsx`.

### Pendiente / conocido

- **Pregunta para Adam — puestos sin Core.** `dir_operaciones`, `coord_admin`, `coord_ventas`, `vendedor`, `disenador`, `rh` y `contabilidad` no tienen las páginas de Core ni en la web ni en la API (coherente, pero con Core-only no abren `/erp/pizarra` ni `/erp/asistencias`). Si alguien real tiene esos puestos, hay que sumar `CORE_OLA1_PAGE_PATHS` (web) y `CORE_OLA1_URL_RULES` (API) juntos; la prueba «quien tiene paginas de Core llega a la pizarra» lista los puestos.
- **Google Maps**: sin cuenta de facturación activa; la clave web no tiene restricción de aplicación; Android usa otra clave (`local.properties`). No borrar la vieja. Ver memoria `nexara-google-maps-claves`.
- API de proyectos: al cambiar responsable queda el anterior como RESPONSABLE; PLANNED→ACTIVE no pone `actualStartDate`; borrar documento no borra el archivo.
- Web: el flujo de captura de evidencia del navegador no sabe de campos (solo apps).

### No tocar

Puente NAS.
