# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-21
- **Rama:** mejora/calidad-y-web

## Hecho

### Deploy en curso / typefix
- Push `28617a75` a origin; `update.sh` en Hetzner falló el build web por tipo en `puedeGestionarInventarioVehiculos` (`permissions: null` vs `undefined`).
- Fix tipado en `recursos-core.ts` → redeploy.

### Pasada UX formularios (tramos 1–2)
FormField + formularios Core/cliente/perfil/sucursales.

## A medias
- Redeploy tras el fix de tipos.
- Play Console / FormField restantes / docs nativos.

## No tocar
Puente NAS · keystore Play · `NO TOCAR LIBREMENTE`.
