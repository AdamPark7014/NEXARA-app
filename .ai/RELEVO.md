# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-17
- **Rama:** mejora/calidad-y-web
- **HEAD:** 3485041a

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Integración agentes + Maps key

### Hecho

1. **Maps API key en Hetzner:** actualizada en `.env`, `deploy/.env` y `deploy/.env.nexara`; web rebuild bakeado (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` len=39). **Atención:** al verificar con `docker compose config` la clave salió otra vez en el historial de este chat → Adam debe **rotar otra vez** y no pegarla aquí; pegarla solo en el servidor con `read -s` / sed.
2. **Cruce Iván/David:** ya estaba corregido en `59e8d41d` (caché offline apagada en el navegador; solo queda en la app móvil). Cada quien debe recargar una vez.
3. **Merge + push + deploy** de las 5 ramas de agentes:
   - `feat/maps-consumo-minimo` — lazy load, static map cache API, autocomplete acotado
   - `feat/evidencia-campos` — foto por campo + ZIP + fix salida al corregir
   - `feat/cotizaciones-pdf-fiel` — PDF propuesta más fiel/liviano
   - `feat/apps-comenzar-y-campos` — «Comenzar actividad» + captura por campos (Android/iOS)
   - `feat/proyectos-profesional` — modelo (fechas plan/real, cronograma, alcance, equipo, docs) + salud calculada
4. **Fix post-merge:** ZIP de evidencia usaba `project.name`; OperationalProject es `title` (`3485041a`).
5. **Verificado local:** maps 18, evidencia 21, pdf 7, proyectos salud/alcance 28, Android `CoreActivityRules`+`ActivitySemaforo` BUILD SUCCESSFUL, `tsc` API 0 errores.
6. **Servidor prueba:** migraciones `20260917230000_evidencia_campos` y `20260917240000_proyectos_profesional` aplicadas; tablas `activity_evidence_fields*` y `project_*` existen; api/web HTTP 200; api healthy.

### A medias

- **Proyectos HTTP:** `ProyectosProfesionalService` está en el repo pero **no** está en `ProjectsModule` ni tiene controller (los drafts de Ollama inventaron AuthUser/JwtAuthGuard). Falta cablear bajo `/proyectos` con el patrón de `operational-projects.controller.ts`.
- **Google Cloud billing:** cuenta de facturación / alerta $200 / topes diarios / desactivar Places API (New) siguen pendientes de Adam (cuentas cerradas).
- Build web en server reportó Type error `RefObject` (LegacyRef); la imagen igual se construyó.

### Siguiente

1. Cablear controller + provider de proyectos profesional.
2. Rotar Maps key (filtrada) + presupuesto/quotas en consola Google.
3. Probar en app: Comenzar actividad + captura por campos; ZIP evidencia en web.
4. EXEC-PACKET de UX (13-09) sigue desactualizado respecto a este trabajo.

### No tocar

Puente NAS.
