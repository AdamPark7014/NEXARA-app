# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-07
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — iOS pasa a ser publicable sin Mac

`MAC_BUILD_PLAYBOOK.md` daba por hecho una Mac física y una sesión de clics en
Xcode. Este turno lo sustituye por un flujo de GitHub Actions que compila, firma
y sube a TestFlight sin que nadie se siente delante de una Mac. **Coste real: los
99 USD/año del Apple Developer Program y nada más** — el runner `macos-15` no
consume cuota en repositorios públicos, y este lo es.

Runbook completo en `apps/mobile-native/ios/PUBLICAR-SIN-MAC.md`.

### Dos defectos latentes corregidos de paso

Ninguno se había disparado nunca porque **XcodeGen jamás llegó a ejecutarse**:

- **`project.yml` se habría comido `Info.plist`.** El bloque `info:` no añade
  claves: *regenera* la plist con las que se listen y borra el resto. Se habría
  llevado las siete cadenas de permisos —ubicación, cámara, fotos, micrófono,
  seguimiento— y Apple rechaza cualquier binario que use esas API sin su
  descripción. Ahora es `INFOPLIST_FILE` apuntando a la plist escrita a mano.
- **Un solo fichero de entitlements con `aps-environment: development`.** APNs
  distingue los dos entornos y el token de uno no vale en el otro: TestFlight
  habría dado notificaciones mudas. Ahora hay dos ficheros, uno por
  configuración, y Release usa `production`.

Además: XcodeGen no crea esquemas compartidos por su cuenta y `xcodebuild
-scheme` solo ve los compartidos — sin el bloque `schemes:` la construcción
fallaba con "scheme not found" aun con el proyecto bien generado.

### Firebase fuera, y con motivo

El playbook mandaba añadir `firebase-ios-sdk` a mano. **No hay ni un `import
Firebase` en los 134 ficheros Swift**: `PushManager` manda el token APNs crudo a
`POST devices/push-token` con `platform: "ios"`. Añadirlo costaba varios minutos
de compilación por construcción sin cambiar nada.

### El disparador es manual a propósito — no añadir `push:`

El repositorio es **público**. Un disparador `pull_request` dejaría que
cualquiera abriese un PR desde una bifurcación con un paso que imprime el
certificado de distribución. `ios-testflight.yml` solo se lanza a mano, y así
debe quedarse.

### Verificado desde Windows

Los tres YAML analizan. El `ExportOptions.plist` que genera el heredoc es un
plist válido. El camino de OpenSSL está probado de punta a punta simulando a
Apple con un certificado autofirmado: CSR, DER→PEM, `.p12` y las verificaciones
de contraseña correcta e incorrecta.

**Lo que NO está verificado: que los 134 ficheros Swift compilen.** Nunca ha
pasado un `xcodebuild` por encima. Es probable que la primera construcción falle
con errores de compilación; para eso está `subir=false`.

### Sobre el `.p12`: ni AES-256 ni `-legacy`

Por omisión OpenSSL 3 cifra con AES-256 y `security import` de macOS ha fallado
con eso. `-legacy` produce RC2 de 40 bits: débil, y releerlo exige cargar otra
vez el proveedor legacy. Se usa `PBE-SHA1-3DES`, medido y probado.

## Turno anterior — INTEGRA homologado y paridad cerrada

Cursor rescató en dos commits WIP el trabajo de los siete agentes que
murieron a media escritura y dejó los contratos de cableado listos. Este
turno los conecta y cierra la paridad. **Cinco commits, uno por área.**

### `df749076` — 13 438 líneas escritas y sin cablear

Cinco paquetes completos (video, vehículos/ANPR, horarios/espacios,
detección/ajustes, gobierno) con pantallas, ViewModels, repositorios y 125
pruebas, y **ninguno alcanzable**: el NavHost tenía 11 rutas y ninguna suya.
Mismo patrón por el que `chat` (2 919 líneas) y `dispatch` estuvieron meses
invisibles.

El resolutor de clave ahora **delega en los cinco paquetes antes** de su
tabla local, así que añadir un módulo ya no obliga a editar ese `when`. El
hub pasó de un parámetro de callback por módulo —inmanejable con 18— a
`onOpenKey: (String) -> Unit`.

### `27f8a87b` — profundidad de los 10 módulos que ya existían

`NATIVO` significaba «no usa pantalla de relleno», no paridad de proceso.
Eventos con cursor real y `eventState` (antes se adivinaba con
temporizadores: de ahí las alarmas fantasma), personas con vigencia y
credenciales, asistencia agrupada con «entrada sin salida», alarmas con
duplicados agrupados y confirmación, «en sitio» con ficha `presence/:id`,
equipos donde `null` deja de contarse como caído.

**Defecto con daño real corregido:** la baja de una persona mandaba
`force = true` **sin decirlo**, saltándose el mecanismo que evita borrarla
en NEXARA dejándola viva en un terminal caído. Ahora es una casilla.

`IntegraScreens.kt` (1 608 líneas) repartido en nueve ficheros por módulo:
mismo paquete, mismos nombres, mismas firmas — el cableado no cambió.

### `0233d38e` — plano y panorama, los dos en solo lectura a propósito

`IntegraMapRepository` no declara **ni una** llamada de escritura. Situar un
pin con el dedo sobre una planta al 40 % sale mal, y el servidor hace
`upsert` por equipo: **un pin mal puesto pisa el bueno**. Con el precedente
de la web —tocar un pin lo borraba sin preguntar— aquí no hay gesto que
borre porque no hay nada que borrar.

Por no intentar ser editor, es buen visor: enseña **la cobertura** («faltan
N puertas por situar») y **los pines huérfanos** que apuntan a equipos dados
de baja. Dos cosas que la consola web no dice.

### `36eddd28` — paridad fuera de INTEGRA

El catálogo **se atribuía 76 nativos y tenía 74**. Y dos claves abrían la
pantalla equivocada: `viaticos` de contabilidad abría «Mis viáticos»
filtrado por el propio usuario —el contador veía una pantalla vacía— y
`horas` abría literalmente Comidas.

**Reuniones**: `MeetingsApi.kt` llevaba escrito sin que lo referenciara
nadie, ni el cliente HTTP (tercer módulo huérfano de esta revisión). Módulo
completo montado encima, sin aplanar: pasar lista **manda la lista completa
de asistentes**, porque el servidor reemplaza el acta y mandar solo los
presentes **borraba a los ausentes**.

**243 mensajes de error crudos en 52 archivos → `toUserMessage()`.** Se
acabó el «HTTP 502 Bad Gateway» como mensaje al usuario. Cascarones: 2 → 0.

### `f441d53f` — cableado final y el catálogo deja de mentir

Plano y panorama enganchados, `IntegraHomeSummary()` dentro del hub, y diez
estados de catálogo corregidos con evidencia (`service-sheets`, `exports` y
`assets` bajan a SOLO_LECTURA; `news` y `architecture` suben de CASCARON;
`viaticos` y `pagos` suben a NATIVO; alta de `reuniones`).

**INTEGRA: 21 módulos.** La web tiene 19 rutas.

### Estado verificado

`compileDebugKotlin` OK · `testDebugUnitTest` **401 pruebas, 0 fallos** ·
`check-app-web-parity.py` **OK** · typecheck de api y web limpios.

`IntegraWiringTest` (6 pruebas) ata las tres listas que deben coincidir:
ninguna clave cae al hub, dos claves no comparten ruta, y **nada marcado
NATIVO puede ser inalcanzable**. Es la red contra el «todo verde».

## Recortes DICHOS, no disimulados

Si alguien los ve y piensa que falta trabajo, es deliberado:

- **Cámaras no es transmisión en vivo.** Rejilla con vista previa
  autorregulada, PTZ con presets y captura. El muro MSE/WebSocket se queda
  en la consola web. La pantalla **no pone «EN VIVO»**: ponerlo sobre una
  imagen que refresca cada segundo fue la queja original de «se traba».
- **Los polígonos de detección se ven y no se editan.** El resto del perfil
  —sensibilidad, confianza, objetivo, horario— sí escribe contra el equipo.
- **Los pines del plano se ven y no se mueven.** Ver `0233d38e`.
- **Alarmas diverge de la web a propósito**: allí un clic atiende o cierra
  sin preguntar; en un teléfono eso es una alarma cerrada con el pulgar.

## A medias / decisiones de Adam

0. **iOS: cinco trámites que solo puede hacer Adam.** Alta en el Apple
   Developer Program (99 USD/año), clave de la API de App Store Connect,
   certificado de distribución (guion de Windows, no hace falta Mac), alta de la
   app en App Store Connect y carga de los seis secretos. Paso a paso en
   `apps/mobile-native/ios/PUBLICAR-SIN-MAC.md`. Hasta que eso exista, el flujo
   falla en el primer paso y lo dice claro.

1. **P0 SIN DESPLEGAR — sigue siendo lo primero.**
   `https://integra.nexara.com.mx/go2rtc/api/streams` responde **200 desde
   fuera** con las credenciales RTSP de las cámaras en claro. El parche está
   en la rama; Traefik de producción no lo ha cargado. Orden obligatorio:
   desplegar → confirmar 404 → **entonces** rotar contraseñas. Checklist en
   `.ai/auditoria-2026-09/13-w0-verificacion-prod.md`.
2. **Recompilar el AAB.** El de disco es del 31-08 con `versionCode 5` y no
   lleva nada de estos dos días. Confirmar en Play Console el `versionCode`
   real: el 7 del repo es una suposición.
3. **Data Safety desactualizado** (Analytics salió, Crashlytics entró).
   Borrador en `docs/PLAY-STORE-CHECKLIST.md`.
4. **Datos históricos falsos**: comida corrida 6 h con retrasos inflados en
   60 min, coordenadas `0,0`, consentimientos que nadie otorgó. Consultas de
   SOLO LECTURA en
   `.ai/auditoria-2026-09/14-integridad-datos-remediacion.md`. Límite
   honesto: los consentimientos falsos **no se distinguen con certeza** de
   los reales, nunca hubo bitácora de ese cambio.
5. **Ampliaciones de acceso propuestas y NO aplicadas** porque tocan
   facturación fiscal, contabilidad, nómina o alta de usuarios. Lista en
   `.ai/auditoria-2026-09/02-rbac-web-modulos-por-rol.md`.
6. **Al desplegar**: quien nunca haya tocado el interruptor de GPS dejará de
   aparecer en el mapa del equipo. Es correcto; conviene avisarlo antes.

## Aviso de concurrencia — 2026-09-07 12:48

Al arrancar este turno, `relevo estado` daba la punta en `fbb17971`; minutos
después habían entrado cinco commits más, el último a las 12:38. **Había otro
agente trabajando esta misma rama en paralelo**, contra la regla de un agente a
la vez. Este turno se limitó a `apps/mobile-native/ios/`, `.github/workflows/` y
`.gitignore` para no cruzarse; no se tocó Android, deploy ni web.

Además, `RELEVO.md` pedía «recompilar el AAB, el de disco es versionCode 5»
cuando `fbb17971` ya decía haberlo compilado con versionCode 7: el disco
contradecía al relevo. **Sin resolver — lo decide Adam.**

## Abierto, con dueño claro

- **`?_nxt=` es un portón abierto.** `middleware.ts:294` deja pasar sin
  sesión con que el parámetro EXISTA, y `UserContext.tsx:404` confía en un
  base64 **sin firma** para fijar la identidad. Los datos siguen protegidos
  por la cookie HttpOnly —no es robo de cuenta— pero hay que firmarlo o
  cambiarlo por un intercambio contra la API.
- **`DELETE devices/push-token`** declarado en Android, ausente en la API.
- **Android no manda `X-Company-Id`** — multi-empresa frágil.
- **MFA rompe el login**: la API responde `401 MFA_REQUIRED` y Android lo
  traduce a «Correo o contraseña incorrectos»; no hay pantalla de código.
- **Sin refresh de sesión**: existe `POST auth/session/extend` y cero
  llamadas desde Kotlin. A las 4 h se pierde el trabajo en curso.
- **`facilities-access`** móvil (necesita `data/integra/**`).
- **Falta el endpoint de escritura de hojas de servicio** en `apps/api`; por
  eso ese módulo está en SOLO_LECTURA, y no por dejadez del cliente.
- **Cuatro hallazgos de Kotlin para Play**: insets edge-to-edge con
  `targetSdk 36`, cámara en API 24-28, fallback sin cifrar de
  `SessionStore`, y `android/base/manifest/` versionado como basura de
  build. Detalle en el informe 10.
- **Tres «fuentes únicas de verdad»** (`access-matrix`, `page-matrix`,
  `url-matrix`) que no se importan entre sí. `role-modules.spec.ts` las ata
  con pruebas, pero la unificación real sigue pendiente.
- Cerca de 100 `!!` preexistentes en Android, todos null-guardados.
  Reescribirlos en 40 archivos ya verificados metía más riesgo del que
  quitaba.

## Corregido de la auditoría (no perseguir fantasmas)

- `me.service.ts` **NO** lee el rol crudo: `mapSessionUser:692` resuelve con
  `resolveEffectiveRoleKey`. `/me/navigation` sí gobierna para los usuarios
  antiguos.
- **No hay ni un WebView** en Android. El problema de sesión de la web no
  contamina al móvil: son dos problemas separados.
- Crashlytics **ya está integrado**. La v2 no sale a ciegas.
- `chat`, `dispatch` y `recruiting` **ya no son huérfanos**.
- `apps/api/tsconfig.json:17` tiene `incremental: true` sin
  `tsBuildInfoFile`: **el typecheck local puede dar errores fantasma** en
  líneas que no existen. Borra el `.tsbuildinfo` antes de creerte nada.
- `check-app-web-parity.py` **ya compara en los dos sentidos**. Antes daba
  OK porque solo miraba catálogo → web; el recorrido inverso destapaba 88
  rutas huérfanas.

## No tocar

Puente NAS. Traefik y credenciales sin permiso de Adam. Face ID óptico
inventado. Provider ISAPI. No inventar ANPR/FieldDetection en la PTZ .179.
No hls.js por CDN. **No fingir «EN VIVO» sobre una vista previa.**
iOS fuera del alcance de la v2: 131 ficheros Swift reales, pero sin
`.xcodeproj` (XcodeGen, requiere Mac), nunca compilado ni firmado.
