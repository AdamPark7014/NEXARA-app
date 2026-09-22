# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-22
- **Rama:** mejora/calidad-y-web

## Hecho

### Pedir una actividad a un compañero: todos ven a todos
Adam (22-09): «este perfil no ve todos los usuarios en apoyo, todos deben ver
todos los usuarios y se debe decir explícitamente que es pedir una actividad a
un compañero».

- **Causa 1 (el selector).** `SolicitudesEquipoView` llenaba «Para quién» con
  `fetchTeamBoard` (`GET me/board`). La pizarra recorta por organigrama
  (`resolveScope` en `team-board.service.ts`): quien no es CEO/developer solo ve
  su rama. Daniela (Administrativo) veía un único nombre, el suyo.
- **Causa 2 (la API).** `canPeerRequestTarget` exigía rango igual o superior y
  devolvía 403. Con el selector abierto a todos, esa regla dejaba opciones que el
  servidor rechazaba.

Cambios:
- API nueva `GET me/activity-requests/candidates` → `PeerRequestsService.listCandidates`:
  todo el personal activo de la empresa, menos el propio usuario y menos las
  cuentas de plataforma (`isNonEmployeeEmail`). Sin recorte por organigrama.
- Borrada la regla de rango: `peer-org-rank.ts` y su spec ya no existen; `create()`
  ya no lanza 403 por jerarquía. Cualquiera le puede pedir a cualquiera.
- Web: `fetchPeerCandidates` en `lib/peer-requests-api.ts`; la vista ya no usa la
  pizarra para llenar el selector.
- Textos explícitos: encabezado «Pedirle una actividad a un compañero», párrafo
  que explica que si acepta la actividad queda a su nombre, ayuda del campo
  «Cualquier compañero de la empresa» (antes «De tu mismo rango o superior»),
  campo «¿Qué actividad le pides?» y vacío reescrito.
- Pruebas: `peer-requests-candidates.spec.ts` (API, 3 casos) y dos casos nuevos en
  `SolicitudesEquipoView.spec.tsx`.

Verificado: `npm run typecheck` limpio · `npm run test:api` 2 328 pruebas en verde.

## A medias
- **Sin desplegar.** Adam pidió desplegar al Hetzner; falta correr
  `./deploy/update.sh --force-all --with-migrate` en `/var/www/nexara-app`.
  No hay migración de base en este cambio.
- Esta pantalla no existe en `apps/mobile-native`: no hay paridad móvil pendiente.

## Ojo (no es mío)
- `apps/web/lib/recursos-core.spec.ts` falla desde antes de este turno:
  `coreVehiclesHome` devuelve `/erp/vehiculos/mis-vehiculos` y la prueba espera
  `/erp/vehiculos`. Viene del trabajo de flotilla (`011969f5`, `c222b7a1`). No lo
  toqué para no mezclarlo con esto.

## No tocar
Puente NAS · keystore Play · `NO TOCAR LIBREMENTE`.
