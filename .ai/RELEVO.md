# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-06
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Integración /me/navigation (paridad real)

Problema: pantallas nativas existían pero el menú/RBAC no estaba cableado igual que la web
(keys Android vs ModuleId web, clip duro incompleto, panels locales, INTEGRA sin filtro).

### API
- `navigation-module-map.ts`: path → `moduleKeys` (Android) + `webModuleIds` (web); sin ghost `integra-acs`.
- `MeService.navigation` emite ambos namespaces + panels/paths.

### Web
- `me-navigation.ts`: `filterModulesByNavigation` prefiere `webModuleIds` + paths.
- `AppShell` filtra sidebar con esa función (ya no clip por claves Android).

### Android
- Sesión persiste `navModuleKeys` + `navPanels` + `navPaths`.
- `refreshNavigation` en resume (`maybeExtendSession` / hub).
- `ConsoleAccessRules`: soft-allow por key/path; fallback legacy (no clip duro).
- `PanelAccessResolver`: paneles desde `navPanels` cuando vienen del API.
- Hub INTEGRA: cards ∩ `integraKeysFor` ∩ nav.
- Deep links INTEGRA: aliases solo bajo panel INTEGRA (no pisan ERP attendance).

### Verificación
- `:app:compileDebugKotlin` OK.
- `AppUrlsParityTest` OK (casos INTEGRA añadidos).
- `navigation-module-map.spec.ts` OK.
- `python scripts/check-app-web-parity.py` OK.

## A medias / Adam

1. **Desplegar** Traefik/API P0 → `/go2rtc/api/streams` 404; rotar passwords.
2. AAB Play VERSION_CODE 7+.
3. INTEGRA video/ANPR/mapa/detección = Bloque 2.
4. Portal sucursal: comentarios OT aún no (solo client-portal).
5. Cascarones restantes: vehicles admin, employee-payments, work-projects, dispatch polish, newsletter admin.
6. (hecho) CommandPalette web también filtra con `/me/navigation`.

## No tocar

Puente NAS. Credenciales en repo. No inventar ANPR/ISAPI. No hls.js CDN.
