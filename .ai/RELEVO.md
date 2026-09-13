# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-13
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Core-only: ninguna ruta fuera de /erp

### Hecho

1. Síntoma: Luis (coord_operaciones) acabó en `/ops/dashboard` («No hay secciones disponibles en este panel para tu rol»). Adam: ya no debe existir ninguna ruta que no sea de erp.
2. Causa: la notificación «Nueva actividad asignada» (y otras de la API: `common/app-urls.ts`, `notification-hierarchy.service.ts`, SLA, chat, push) guarda `/ops/activities/:id`; la web no la traducía; dentro de OPS el breadcrumb lleva a `/ops/dashboard`. El middleware solo corregía subdominios de producción, no paths en localhost/apex. Además la ficha de la pizarra y Mis actividades enlazaban a `/ops/activities/:id`.
3. Detalle de actividad en Core: `/erp/actividades/:id` y `/erp/actividades/:id/evidencias`. Reutilizan las páginas de OPS (re-export) con `ActivityDetailShell core`: pestañas Detalle + Evidencias, enlaces a /erp, «← Mis actividades», proyecto y cliente como texto, y en Core puede capturar evidencias cualquiera menos el CEO (la API valida). `/erp/actividades` redirige a la pizarra.
4. `coreSurfaceRedirect` en `lib/core-surface.ts`: `/ops/activities/:id(/evidences)` → `/erp/actividades/:id(/evidencias)`; `/ops/my-evidences?activityId=` → evidencias; `*/my-profile` → `/erp/my-profile`; `/ops/my-activities` → `/erp/mis-actividades`; cualquier otro panel (ops, crm, studio, lab, integra, finance, hr, sales, console, contabilidad, people, operacion, noc, support, ventas) → `/erp/pizarra`.
5. Se aplica en `middleware.ts` (307, cualquier host, GET/HEAD, antes del auth gate) y en `normalizeLegacyRelatedUrl` (clic en campana y centro de notificaciones).
6. Enlaces de Core directos a `/erp/actividades/:id`: `erp/mis-actividades/page.tsx` y `erp/pizarra/[userId]/page.tsx`. `/erp` ya no manda a `/erp/dashboard` sino a la pizarra.
7. RBAC: `/erp/actividades` y `/**` en `CORE_OLA1_PAGE_PATHS` (web) y `CORE_OLA1_URL_RULES` (api).
8. EXEC-PACKET (Cursor): añadida regla «nunca enlazar fuera de /erp».

### Verificado

- `tsc --noEmit` API: limpio.
- `tsc --noEmit` web: sin errores nuevos; siguen 4 previos y ajenos.
- `vitest lib/legacy-path-remap.spec.ts lib/rbac/page-matrix.spec.ts`: 24/24.
- Docker 18:37 UTC `build api web` + `up -d`, API arrancó sin errores. Sin sesión (curl): `/ops/dashboard` y `/crm/dashboard` → 307 `/erp/pizarra`; `/ops/activities/1` → `/erp/actividades/1`; `/ops/activities/1/evidences` y `/ops/my-evidences?activityId=1` → `/erp/actividades/1/evidencias`; `/ops/my-profile` → `/erp/my-profile`; `/ops/my-activities` → `/erp/mis-actividades`; `/erp/actividades/1` y `/evidencias` → 200.

### Falta probar a mano

1. Como Luis: campana → «Nueva actividad asignada» abre `/erp/actividades/1` (no /ops).
2. Escribir `localhost:3000/ops/dashboard` en la barra → termina en `/erp/pizarra`.
3. «Abrir actividad →» en la ficha y «Abrir →» en Mis actividades abren `/erp/actividades/:id`; pestaña Evidencias permite capturar.

### A medias

Nada.

### Siguiente

Cursor ejecuta `.ai/EXEC-PACKET.md`. Opcional: que la API genere `/erp/actividades/:id` en `common/app-urls.ts` y en los strings de `notification-hierarchy.service.ts` (hoy lo corrige el middleware). Al desplegar a producción: la migración `20260913180000_drop_evidence_activity_unique_index` debe ir junto con `20260912010000`.

### No tocar

Puente NAS.
