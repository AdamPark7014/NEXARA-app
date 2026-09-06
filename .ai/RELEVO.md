# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-06
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Mega-plan paridad móvil W0–W7

### W0 — Verificación prod (doc)
- Sonda: `/go2rtc/api/streams` y `/config` aún **200** (filtro Traefik **no desplegado**).
- Informe: `.ai/auditoria-2026-09/13-w0-verificacion-prod.md`.
- Adam debe desplegar compose+Traefik y rotar passwords de cámaras.

### W1 — Pantallas desbloqueadas
- `dispatch` / `chat` / `recruiting` / `my-preferences` en ModulePanelMap + ConsoleAccessRules.

### W2 — Compliance campo
- Evidencias multi-foto (≥4) + form paso 4; CAMERA runtime; GPS 0,0 bloqueado en cliente.
- Offline: 401 ya no descarta cola.
- API `DELETE devices/push-token` + logout Android revoke FCM.
- Asistencia: `PATCH gps/consent` tras entrada; foto vía `saveBase64Photo`; consent GPS solo con coords válidas.

### W3 — RBAC una fuente
- API `GET /api/me/navigation` (`MeModule`) + `/api/me/**` en SHARED_SESSION.
- url-matrix ADMINISTRATIVO alineado a page-matrix (invoicing/procurement/warehouse/CRM APIs).
- Android: `roleKey`/`orgRoleKey`/`companyId`/`expiresAt`/`navModuleKeys` en SessionStore; `X-Company-Id`; `auth/session/extend`.
- ConsoleAccessRules: navModuleKeys del servidor; ingeniero por `roleKey`.
- Web: `access-matrix` ADMIN_STAFF + `lib/me-navigation.ts`.

### W4 — Cascarones → operar
- MyProfile PATCH; MyViatics create; users CRUD mínimo; HR leaves approve; documents upload; vehicles/fines según pantallas tocadas.

### W5 — INTEGRA MVP
- `PanelId.INTEGRA` + hub + IntegraNavHost (Access/Events/People/ACS/Visitors).
- IntegraApi/Repository contra `/api/integra/**` existentes.

### W6 — Play / push
- Crashlytics; VERSION_CODE=7; CI job Android assembleDebug+test; FCM deep-link extras.

### W7 — Verdad catálogo
- `parityStatus` en ModuleCatalog; matriz `docs/native-parity-matrix.md` honesta; script parity bidireccional.

## A medias / Adam

1. **Desplegar** Traefik/API P0 hasta que `/go2rtc/api/streams` → 404; rotar passwords cámaras.
2. Rebuild AAB firmado Play (VERSION_CODE 7+) y declaraciones Console.
3. Sidebar web aún no consume `/me/navigation` en runtime (helper listo; access-matrix ya alineado admin).
4. INTEGRA video wall / ANPR / mapa = Bloque 2.

## No tocar

Puente NAS. Credenciales en repo. No inventar ANPR/ISAPI. No hls.js CDN.
