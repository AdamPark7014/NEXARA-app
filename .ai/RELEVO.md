# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-21
- **Rama:** mejora/calidad-y-web

## Hecho

### Login app «incorrectas» (emulador)
- Causa: debug por defecto apunta a `http://10.0.2.2:3001/api` (API local apagada / otra firma).
- Las claves `play.review@nexara.com.mx` / `NexaraPlayReview2026!` y `gerencia` / `Nexara!NX001` **sí** pasan en `api.nexara.com.mx`.
- Reinstalado emulador con `-PSCREENSHOT_API=true` → BuildConfig = prod.
- Trim de password en `AuthRepository.login` (espacios al pegar).

### Deploy prod web
`011969f5` en Hetzner (flotilla, viáticos lote, FormField).

## A medias
- Play Console AAB.
- Más FormField / docs nativos.

## No tocar
Puente NAS · keystore Play · `NO TOCAR LIBREMENTE`.
