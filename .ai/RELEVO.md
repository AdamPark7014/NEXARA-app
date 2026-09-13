# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-13
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Tarea: tipo de tarea (Levantamiento, Junta, Otro…)

### Hecho

1. Al asignar una Tarea (pizarra → asignar, `OpsActivityForm` en tono core) aparece «Tipo de tarea *» con chips: Levantamiento, Recolección, Entrega, Junta, Compra de material, Preparación de equipo, Trámite, Capacitación, Reporte / documentación, Otro.
2. «Otro» abre un campo de texto obligatorio (máx. 120) para especificar.
3. No incluye servicio, proyecto, obra ni comercial porque ya tienen su propio tipo.
4. Se guarda como `ticketType: OTRO` + `ticketTypeCustom` = etiqueta o texto libre (mismo patrón que Comercial). `coreKind` sigue siendo `tarea`. Lista en `TAREA_TIPOS` de `apps/web/lib/activity-kinds.ts`; `ACTIVITY_KINDS.tarea.ticketType` pasó de PREVENTIVO a OTRO.
5. Sin tipo elegido, o con «Otro» vacío, no deja enviar.
6. El historial de la pizarra muestra el subtipo: «tarea · Levantamiento» (API `team-board.service.ts` expone `ticketTypeCustom` en historial; web `team-board-api.ts` y `pizarra/[userId]/page.tsx`).
7. Turno anterior (Luis: despacho solo en servicio; tarea/proyecto ejecución directa) ya commiteado en 9fe0cb49 / 9edd6535.

### Verificado

- `tsc --noEmit` API: limpio.
- `tsc --noEmit` web: sin errores nuevos; siguen 4 previos y ajenos (`CommandPalette.tsx`, `lib/evidence-flow-helpers.ts`, `lib/module-guides.ts`).
- `docker compose up -d --build web api` (17:12 UTC): ambos arriba; el bundle web trae «Especifica el tipo de tarea», `dist/me/team-board.service.js` expone `ticketTypeCustom` y `/login` responde 200.

### Falta probar a mano (con sesión de Christian)

1. Asignar Tarea: elegir un chip y crear; en el historial debe salir «tarea · <tipo>».
2. Elegir «Otro», dejar vacío → error «Especifica el tipo de tarea».
3. Servicio / Proyecto / Obra / Comercial no muestran el selector.

### A medias

Nada.

### Siguiente

Lo que Adam diga. Opcional: arreglar los 4 errores TS previos; mostrar el subtipo también en actividades abiertas de la pizarra.

### No tocar

Puente NAS.
