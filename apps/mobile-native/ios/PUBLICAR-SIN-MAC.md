# Publicar NEXARA iOS desde Windows, sin Mac

Este documento sustituye a `MAC_BUILD_PLAYBOOK.md`, que asumía una Mac física y
clics en la interfaz de Xcode.

No se evita macOS: se evita **comprar** una Mac. Compilar y firmar un `.ipa` solo
lo hace la cadena de herramientas de Xcode. Lo que hacemos es alquilar esa
máquina por minutos — es el runner `macos-15` de GitHub Actions — y darle todo
masticado para que no haga falta que nadie se siente delante.

## Lo que cuesta de verdad

| Concepto | Coste |
|---|---|
| **Apple Developer Program** | **99 USD/año.** Inevitable. Sin esto no hay TestFlight ni App Store, punto. |
| Runner macOS de GitHub Actions | 0 — los runners estándar no consumen cuota en repositorios públicos, y este lo es. Conviene confirmarlo en la factura tras la primera construcción. |
| Certificados, perfiles, subida | 0 — OpenSSL y `altool`, ambos gratuitos. |
| Mac alquilada, Codemagic, fastlane, Expo | 0 — no se usa ninguno. |

**Total: 99 USD/año.** Ese es el suelo y no hay forma de bajarlo.

## Qué hace el reparto

- `project.yml` — la única definición del proyecto. `NexaraApp.xcodeproj` **no se
  versiona**: lo genera XcodeGen dentro del runner.
- `.github/workflows/ios-testflight.yml` — compila, firma, valida y sube.
- `scripts/crear-certificado.ps1` — crea la identidad de firma desde Windows.
- `scripts/subir-secretos.ps1` — carga los seis secretos en GitHub.

---

## Fase 1 — Lo que solo puede hacer Adam (una vez, ~40 min)

Son los pasos que exigen una tarjeta o una decisión humana. Ningún guion los
puede hacer por ti.

### 1. Alta en el Apple Developer Program — 99 USD/año

**Hecho el 2026-09-07, por la vía de organización.** Enrollment ID
`49J96Q3WQ3`, entidad «New Engineering Expertise And Resource Advancement»,
D-U-N-S 951814054. **En verificación.**

Ojo con el orden, porque no es el de la vía de persona física: Apple primero
verifica que el solicitante tiene autoridad para firmar contratos por la
entidad —correo, y a veces una llamada— y **solo después** manda el enlace para
completar el alta, que es donde se paga. Hasta ese correo no hay nada que hacer
en el portal, porque el portal aún no existe para esta cuenta.

Si pasan diez días hábiles sin noticias, reclamar en
<https://developer.apple.com/contact/> con el Enrollment ID.

Cuando esté activa, apunta el **Team ID**: 10 caracteres, esquina superior
derecha de <https://developer.apple.com/account>.

### 2. Clave de la API de App Store Connect

<https://appstoreconnect.apple.com/access/integrations/api>

- Genera una clave con rol **App Manager**.
- Descarga el `AuthKey_XXXXXXXXXX.p8`. **Solo se puede descargar una vez.**
- Guárdalo tal cual, sin renombrar, en `C:\dev\secrets\nexara-ios\`.
- Apunta el **Issuer ID**, el UUID que sale encima de la tabla.

Esta clave es la que sustituye a "iniciar sesión en Xcode": con ella el runner
registra el identificador, activa las capacidades y descarga el perfil solo.

### 3. Certificado de distribución — desde Windows

Aquí es donde casi todo el mundo se rinde y compra un Mac mini. No hace falta:
Keychain Access no hace magia, genera una petición de firma con OpenSSL por
debajo. Nosotros hacemos lo mismo.

```powershell
cd C:\dev\apps\NEXARA-app\apps\mobile-native\ios\scripts
.\crear-certificado.ps1 -Paso csr -Correo "TU_APPLE_ID@dominio.com" -Nombre "NEXARA"
```

Sube el `.csr` que te indica a
<https://developer.apple.com/account/resources/certificates/add>, eligiendo
**Apple Distribution** (no *Development*). Descarga el `.cer` y déjalo donde el
guion te diga. Luego:

```powershell
.\crear-certificado.ps1 -Paso p12 -ClaveP12 "una-clave-larga-que-guardes"
```

La clave privada se queda en `C:\dev\secrets\nexara-ios` y no entra nunca al
repositorio.

### 4. Registrar el identificador y dar de alta la app

Van en este orden: el formulario de app nueva solo ofrece identificadores que ya
existan, así que primero el identificador.

**a) El identificador** —
<https://developer.apple.com/account/resources/identifiers/add/bundleId>

- Tipo: **App IDs** → **App**
- Bundle ID: **Explicit**, `mx.nexara.mobile.NexaraApp`
- Capacidades: marcar **Push Notifications**. Sin esto la firma falla luego con
  «Provisioning profile doesn't include aps-environment».

**b) La app** — <https://appstoreconnect.apple.com/apps> → **+** → Nueva app.

- Plataforma: iOS
- Identificador de paquete: el que acabas de crear
- SKU: `nexara-mobile`

### 5. Cargar los secretos

```powershell
.\subir-secretos.ps1
```

Te pide el Team ID, el Issuer ID y la contraseña del `.p12`; el resto lo saca de
la carpeta de secretos.

---

## Fase 2 — Construir y subir

Desde la pestaña **Actions** del repositorio, flujo *iOS · TestFlight*, o bien:

```powershell
gh workflow run ios-testflight.yml --repo AdamPark7014/NEXARA-app -f version=1.0.0 -f subir=true
```

La primera vez conviene lanzarlo con `subir=false`: compila y firma pero no
gasta un número de construcción en App Store Connect, y el `.ipa` queda como
artefacto descargable. Si eso pasa, lo demás es trámite.

El flujo valida contra App Store Connect **antes** de subir, así que los
rechazos típicos (icono con canal alfa, permisos sin descripción, entitlements
que el perfil no cubre) salen en el registro y no consumen envío.

Tarda unos 15-25 minutos. El procesado posterior en App Store Connect, entre 5 y
30 más.

## Fase 3 — TestFlight

App Store Connect → TestFlight → añadir la construcción → invitar por correo.
Las pruebas internas (hasta 100 personas de tu equipo) **no pasan por revisión de
Apple**: la construcción está instalable en cuanto termina el procesado.

Para salir a App Store sí hay revisión, y hace falta rellenar ficha, capturas,
aviso de privacidad y el cuestionario de datos.

---

## Decisiones tomadas, para que nadie las deshaga sin saber

**Firebase fuera.** El playbook anterior mandaba añadir `firebase-ios-sdk` a
mano. No hay ni un `import Firebase` en los 134 ficheros Swift: `PushManager`
manda el token APNs crudo a `POST devices/push-token` con `platform: "ios"`.
Añadirlo costaría varios minutos de compilación por construcción sin cambiar
nada. Si algún día se cablea, se declara en `project.yml` como paquete.

**El flujo se dispara solo a mano.** El repositorio es público. Un disparador
`pull_request` dejaría que cualquiera abriese un PR desde una bifurcación con un
paso que imprime el certificado de distribución. Con `workflow_dispatch` solo lo
lanza quien tiene permiso de escritura. **No añadir `push:` ni `pull_request:` a
ese fichero.**

**`INFOPLIST_FILE` en vez del bloque `info:` de XcodeGen.** Con `info:`, XcodeGen
*regenera* `Resources/Info.plist` con las claves que se listen y borra el resto.
Se habría llevado las siete cadenas de permisos —ubicación, cámara, fotos,
micrófono, seguimiento— y Apple rechaza cualquier binario que use esas API sin su
descripción. Era un defecto latente que nunca se disparó porque XcodeGen nunca
llegó a ejecutarse.

**Dos ficheros de entitlements, uno por configuración.** APNs distingue entorno
de desarrollo y de producción, y un token de uno no vale en el otro. TestFlight y
App Store usan **siempre** `production`; antes había un único fichero con
`development`, que habría dado notificaciones mudas en TestFlight.

**El `.p12` va en 3DES/SHA1, no en el formato por omisión de OpenSSL 3.** Por
omisión cifra con AES-256 y `security import` de macOS ha fallado con eso. La
alternativa obvia, `-legacy`, produce RC2 de 40 bits: débil, y para releerlo hace
falta cargar otra vez el proveedor legacy. `PBE-SHA1-3DES` es el punto medio que
importa siempre.

---

## Lo que sigue sin resolverse

**No hay simulador.** Cada iteración es lanzar el flujo, esperar ~20 minutos e
instalar por TestFlight en un iPhone real. Para publicar está bien; para depurar
un fallo visual o un cierre inesperado, es doloroso. Ese es el coste real de no
tener Mac, no el de la subida.

**Los 134 ficheros Swift nunca se han compilado.** Están escritos contra la
paridad con Android, pero ni un `xcodebuild` ha pasado por encima. **Es muy
probable que la primera construcción falle con errores de compilación**, y eso no
es un fallo del reparto: es la primera vez que alguien mira ese código con un
compilador. Ir corrigiendo con `subir=false` hasta que compile.

**Icono.** Generado a 1024×1024 sin canal alfa a partir de `play-assets/icon-512.png`.
Es un reescalado 2×, sirve para pasar la validación; si hay un original vectorial
o a mayor resolución, conviene sustituirlo.

**APNs no está conectado a nada.** El certificado de distribución firma la app,
pero para que lleguen notificaciones falta dar de alta una clave APNs (`.p8`,
distinta de la de App Store Connect) y que el backend la use. Hoy
`push-dispatch.service.ts` rutea por FCM, que era el camino de Android.

---

## Cuando algo falla

| Síntoma en el registro | Qué pasa |
|---|---|
| `No signing certificate "iOS Distribution" found` | El `.p12` no entró en el llavero. Revisa que `IOS_DIST_CERT_PASSWORD` sea la del `.p12` y no otra. |
| El paso de firma se queda colgado hasta agotar el tiempo | Falta `set-key-partition-list`. Ya está en el flujo; si alguien lo quita, vuelve. |
| `scheme NexaraApp not found` | XcodeGen no generó el esquema compartido. El bloque `schemes:` de `project.yml` es lo que lo garantiza. |
| `Provisioning profile doesn't include aps-environment` | El identificador no tiene activada la capacidad de notificaciones en el portal. |
| `The bundle version must be higher than the previously uploaded version` | Se reusó un número de construcción. Lánzalo con `-f build=<numero mayor>`. |
| `Invalid App Store Icon. ... can't be transparent nor contain an alpha channel` | Alguien sustituyó el icono por uno con alfa. |
