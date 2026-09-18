# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-18
- **Rama:** mejora/calidad-y-web
- **HEAD:** 6a1ffeb0 (+ este commit de relevo)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno (claude-code, 17→18-09) — Proyectos, evidencia por campos, logo PDF

### Hecho y desplegado en Hetzner (prueba)

1. **Proyectos API** `/api/proyectos` (`ProyectosProfesionalController`): lista con salud, detalle, alta completa, cabecera, estado (reusa `operational-projects` changeStatus), hitos, alcance (+ importar de cotización), requerimientos, equipo, documentos (`uploads/project-docs`). `url-matrix`: `/api/proyectos/**`. Fix de tenencia: no se liga cliente de otra empresa (`9bc054e8`).
2. **Proyectos web** `/erp/proyectos` (lista, alta en 7 pasos con un solo POST, detalle con Gantt CSS, pestañas) — merge `feat/erp-proyectos-web`.
3. **Evidencia por campos**: web define campos al asignar (`OpsActivityForm`), los ve/edita en `/erp/actividades/:id` y baja el ZIP (`EvidenciaPorCampos.tsx`, `DescargarEvidenciaZip.tsx`). Apps alineadas al contrato del API (antes mandaban `fotoBase64/lat/lng` y esperaban un campo, el API devuelve `CampoDto[]` con claves `ANTES/EN_PROGRESO/DESPUES`). Android e iOS mandan lista vacía en «Fotos en sitio» cuando hay campos (se duplicaban en el ZIP). iOS **sin compilar**.
4. **Build web**: `useVisibleOnce` devuelve `RefObject<T>` (era el Type error del build).
5. **Logo en PDFs de producción**: `loadNexaraLogo` solo probaba rutas relativas al cwd (`/app`); ahora prueba `__dirname/../../assets` (`6a1ffeb0`). Afectaba TODOS los PDFs.
6. **Arte de la propuesta**: `apps/api/src/assets/propuesta-portada.jpg` y `propuesta-membrete.jpg` sacados del PDF de referencia de Adam (`Downloads/Primera cotizacion  (1).pdf`).
7. **E2E en servidor** (JWT firmado dentro del contenedor, limpio al final): 15/15 (proyectos, campos, ZIP).

### En curso (agentes en worktrees, ramas sin mergear)

- `feat/pdf-propuesta-identica` — PDF cliente idéntico a la referencia (portada/membrete como fondo).
- `feat/cotizaciones-ui-nueva` — editor tipo documento + vista previa PDF + nomenclatura visible + `scripts/refoliar-borradores.js` (NO correr sin revisar).
- `feat/actividades-solo-iniciar` — el asignado solo «Iniciar actividad» (sin rechazar), `POST me/activities/:id/iniciar`.
- `feat/periodos-actividades` — periodo de actividades desde el proyecto (sin recargar diario).
- `feat/kpis-dashboard` — retardos, uniforme (campo nuevo por checada), horas laboradas vs productivas, inactividad.
Requisitos de Adam: tabla «Tareas/Dashboard» + `Downloads/gantt_seguimiento_proyectos (1).xlsx` (hoja Desarrollo) + `V1_Nomenglaturas_Nexara.xlsx`.

### Pendiente / conocido

- **Google Maps**: sin cuenta de facturación activa; la clave web no tiene restricción de aplicación; Android usa otra clave (`local.properties`). No borrar la vieja. Ver memoria `nexara-google-maps-claves`.
- 26 pruebas web ya fallaban antes (`lib/rbac/role-modules.spec.ts`, timezone en `lib/ops-activity-form.spec.ts`).
- API de proyectos: al cambiar responsable queda el anterior como RESPONSABLE; PLANNED→ACTIVE no pone `actualStartDate`; borrar documento no borra el archivo.
- Web: el flujo de captura de evidencia del navegador no sabe de campos (solo apps).

### No tocar

Puente NAS.
