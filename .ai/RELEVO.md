# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-06
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Auditoría de 12 áreas y remediación de lo que quedó vivo

Adam reportó cuatro cosas: (1) en la web, loguearte en un subdominio no te
deja ahí; (2) todos los roles salvo el más alto ven muy pocos módulos; (3) en
la app móvil un usuario veía «error 502» y ni cargaba su dashboard; (4) la
asistencia en el móvil es un clic cuando en la web es un proceso con foto.

Se barrieron 12 áreas con agentes en paralelo. **Los 12 informes están en
`.ai/auditoria-2026-09/`** y son la referencia detallada de todo lo de abajo.

**Aviso metodológico para quien entre:** los informes 01-13 se escribieron
ANTES del turno de remediación de cursor (`181cc218` y anteriores). Varias
de sus conclusiones ya no se sostienen. La sección «Remediación 2026-09-06
(post-Cursor)» al final de los informes 02 y 06, y los informes 10 y 14
completos, sí reflejan el estado actual.

### Lo que se cerró (5 commits)

1. **`e2f0e9f8` — El árbol no compilaba, y el login te expulsaba.**
   `activity-evidence.service.ts` pedía `isSuperAdmin` en un `select` de
   Prisma; ese campo no es columna de `User`, se calcula en el JWT. El otro
   error del typecheck (`notes` en `ClientTicketRequest`) era un cliente de
   Prisma rancio, no un bug: el campo existe y tiene migración.
   `PanelLogin` sólo respetaba el subdominio si era `integra` o `lab`,
   cableado en cuatro sitios; ahora usa `detectCurrentPanelId()`, que ya
   mapeaba los 15.

2. **`ea4b64c7` — Android dejaba de adivinar el rol por su nombre.**
   `PanelAccessResolver` decidía con `contains("rh")`, `contains("ingenier")`
   sobre el nombre VISIBLE del rol. Nuevo `access/RolePanelMatrix.kt` por
   igualdad exacta. `accessiblePanels()` es una cadena explícita que nunca
   devuelve cero paneles. Y el bug que tapaba los módulos ya recuperados:
   `normalizedConsolePath` sólo pelaba `/console` y `/operacion`, así que
   `chat` (`/erp/chat`) y `dispatch` (`/ops/dispatch`) eran invisibles pese a
   estar en el menú y en el mapa.

3. **`9777594d` — El AAB llevaba 6 días caducado.** Bundle del 31-08 contra
   fuente del 06-09, con `versionCode 5` y sin ninguna ola de paridad. El
   smoke lo aprobaba porque sólo miraba que el fichero existiera. Reglas de
   ProGuard por forma de nombre (antes funcionaban por casualidad),
   preflight que aborta `bundleRelease` si falta firma/VERSION_CODE/clave de
   Maps, y `data_extraction_rules.xml` — `allowBackup=false` no corta la
   transferencia D2D en Android 12+.

4. **`a8ccc72a` — La comida estaba 6 h corrida y el retraso inflado en 1 h.**
   `setHours` en contenedor UTC, en tres sitios (servicio, cron, y los dos
   `@Cron` sin `timeZone`). El retraso se medía contra las 15:00 cuando la
   condición es rebasar las 16:00. Además: coordenadas `0,0` que se
   guardaban pese al guard, `locationConsent = true` incondicional desde dos
   fuentes, fichajes del móvil registrados como «Escritorio · PC», y
   `gps.service.ts::getTodayDateOnly` comparando 06:00 UTC contra una
   columna `@db.Date` — igualdad SIEMPRE falsa, `GET /gps/team` llevaba
   devolviendo lista vacía en silencio.

5. **`049c868d` — El super admin veía 1 módulo de 103.** Mediana por rol
   19 → 29. La causa no era `user-access.ts:111` (ese amplía, no reduce):
   eran tres capas que se intersectan y la tercera (`url-matrix` vía
   `/me/navigation`) era más estrecha que `PAGE_MATRIX` en 9 de 17 roles.
   `denyL3 = 0` en los 17. Los globs rotos no eran `/crm/quotes/**` sino los
   paths desnudos, que abrían el listado y bloqueaban la ficha.

**Estado verificado:** typecheck web+api limpio · **911 pruebas de API** ·
**608 de web** · `:app:compileDebugKotlin` OK · 93 pruebas de Android ·
`check-app-web-parity.py` OK. Redes nuevas donde no había ninguna: 49
pruebas en `role-modules.spec.ts` (importa `URL_MATRIX` de verdad desde
`apps/api`), 39 sobre `PanelAccessResolver`/`ConsoleAccessRules`, 13 sobre la
ventana de comida con guarda de regresión que falla si reaparece `setHours`.

## A medias / decisiones de Adam

1. **P0 SIN DESPLEGAR — lo primero.** `https://integra.nexara.com.mx/go2rtc/api/streams`
   responde **200 desde fuera**, con las credenciales RTSP de las cámaras en
   claro. El parche está en la rama (`deploy/traefik/nexara.yml`), Traefik de
   producción no lo ha cargado. Orden obligatorio: desplegar → confirmar 404
   → **entonces** rotar contraseñas. Checklist en
   `.ai/auditoria-2026-09/13-w0-verificacion-prod.md`.
2. **Recompilar el AAB.** Y confirmar en Play Console el `versionCode` real:
   el 7 del repo es una suposición y Play no reutiliza un código ya subido.
3. **Data Safety desactualizado.** Analytics salió, Crashlytics entró:
   «Interacciones en la app» → No, añadir «Registros de fallos» y
   «Diagnósticos», «ID de publicidad» → No. Borrador en
   `docs/PLAY-STORE-CHECKLIST.md`.
4. **Datos históricos falsos — sólo Adam decide.** Las notas de retraso de
   comida se escribieron infladas en 60 min y con la ventana 6 h corrida;
   hay coordenadas `0,0` y consentimientos que nadie otorgó. Consultas SQL
   de SOLO LECTURA para dimensionarlo en
   `.ai/auditoria-2026-09/14-integridad-datos-remediacion.md`. Límite
   honesto: los consentimientos falsos **no se pueden distinguir con
   certeza** de los reales porque nunca hubo bitácora de ese cambio.
5. **Ampliaciones de acceso propuestas y NO aplicadas** porque tocan
   facturación fiscal, contabilidad, nómina o alta de usuarios. Lista
   completa en `.ai/auditoria-2026-09/02-rbac-web-modulos-por-rol.md`.
6. **Efecto visible al desplegar:** quien nunca haya tocado el interruptor de
   GPS dejará de aparecer en el mapa del equipo. Es correcto; conviene
   avisarlo antes.

## Abierto, con dueño claro para el siguiente turno

- **INTEGRA en el móvil = 0 %.** 18 módulos en web, cero pantallas en
  Android; la palabra «integra» aparece una vez en los 202 ficheros Kotlin.
  Es el hueco más grande de la v2. Ahí dentro está la asistencia por control
  de acceso, que es nómina. Ver informe 05.
- **`DELETE devices/push-token`** declarado en Android y ausente en la API.
- **Android no manda `X-Company-Id`** — multi-empresa frágil.
- **MFA rompe el login**: la API responde `401 MFA_REQUIRED` y Android lo
  traduce a «Correo o contraseña incorrectos»; no hay pantalla de código.
- **Sin refresh de sesión**: existe `POST auth/session/extend` en la API y
  cero llamadas desde Kotlin. A las 4 h se pierde el trabajo en curso.
- **`?_nxt=` es un portón abierto.** `middleware.ts:294` deja pasar sin
  sesión con que el parámetro EXISTA, y `UserContext.tsx:404` confía en un
  base64 SIN FIRMA para fijar la identidad. Los datos siguen protegidos por
  la cookie HttpOnly, así que no es robo de cuenta, pero hay que firmarlo o
  cambiarlo por un intercambio contra la API.
- **`ing_soporte`, `arquitecto` y 4 hallazgos de Kotlin de Play** (insets
  edge-to-edge con `targetSdk 36`, cámara en API 24-28, fallback sin cifrar
  de `SessionStore`, `android/base/manifest/` versionado como basura de
  build). Detalle en el informe 10.
- **Tres «fuentes únicas de verdad»** (`access-matrix`, `page-matrix`,
  `url-matrix`) que no se importan entre sí. `role-modules.spec.ts` ya las
  ata con pruebas, pero la unificación real sigue pendiente.

## Corregido de la auditoría (no perseguir fantasmas)

- `me.service.ts` **NO** lee el rol crudo: `mapSessionUser:692` resuelve con
  `resolveEffectiveRoleKey`. `/me/navigation` sí gobierna para usuarios
  antiguos.
- `chat`, `dispatch` y `recruiting` **ya no son huérfanos** — cursor los
  recuperó; lo que faltaba era el filtro de path que los tapaba.
- **No hay ni un WebView** en la app Android. El problema de sesión web no
  contamina al móvil: son dos problemas separados.
- Crashlytics **ya está integrado**. La v2 no sale a ciegas.
- `docs/native-parity-matrix.md` **miente**: 68 ✅ sin advertencias, 13 de
  ellos son módulos de sólo lectura y 3 inalcanzables; no tiene sección de
  INTEGRA y compara contra `apps/mobile`, una app ya borrada del repo.
- `apps/api/tsconfig.json:17` tiene `incremental: true` sin
  `tsBuildInfoFile`: **el typecheck local puede dar errores fantasma** en
  líneas que no existen. Borra el `.tsbuildinfo` antes de creerte nada.

## No tocar

Puente NAS. Traefik y credenciales sin permiso de Adam. Face ID óptico
inventado. Provider ISAPI. No inventar ANPR/FieldDetection en la PTZ .179.
No hls.js por CDN — la CSP no lo lleva y ya está en `package.json`.
iOS está fuera del alcance de la v2: 131 ficheros Swift reales, pero sin
`.xcodeproj` (XcodeGen, requiere Mac), nunca compilado ni firmado.
