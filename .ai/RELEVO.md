# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-06
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Wave A paridad CASCARON (vehicles + dispatch)

### Android — vehículos admin
- `ConsoleApi` / `ConsoleRepository`: `approveVehicleRequest`, `createVehicleInventory`, `updateVehicleInventory`.
- `ConsoleVehiclesScreen`: pestañas Solicitudes + Flotilla; aprobar/rechazar pendientes; crear/editar/desactivar inventario.
- Catalog `vehicles` → **NATIVO**.

### Android — despacho
- `ConsoleDispatchScreen`: búsqueda, reintento/actualizar, asignación masiva (check + picker), reasignación individual (long-press).
- Catalog `dispatch` → **NATIVO**.

### Catalog truth (sin mutaciones aún)
- `work-projects` / `employee-payments` (console + contabilidad) → **SOLO_LECTURA** (lista+detalle ricos; API create/update existe pero no cableada en móvil).

### Verificación
- `:app:compileDebugKotlin` OK.

## A medias / Adam

1. **Desplegar** Traefik/API P0 → `/go2rtc/api/streams` 404; rotar passwords.
2. AAB Play VERSION_CODE 7+.
3. INTEGRA video/ANPR/mapa/detección = Bloque 2.
4. Portal sucursal: comentarios OT aún no (solo client-portal).
5. Cascarones / huecos: employee-payments mutaciones, work-projects internos (hoy lee portafolio), newsletter admin, checkout flotilla fotos admin, cambio de estatus OT desde despacho (web tampoco lo hace).
6. (hecho) CommandPalette + `/me/navigation`; Wave A vehicles/dispatch.

## No tocar

Puente NAS. Credenciales en repo. No inventar ANPR/ISAPI. No hls.js CDN.
