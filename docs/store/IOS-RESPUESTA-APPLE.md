# App Store · respuesta al rechazo del 25-09-2026 (NEXARA 1.0 iOS)

Envío `2b6fc440-20ee-47c0-95d4-0080db224503`. Apple citó tres guidelines. Este documento reúne el diagnóstico,
lo que se cambió y los textos que van a App Store Connect. **No lleva contraseñas**: el repositorio es público.

## Qué pasó de verdad

| Guideline | Lo que dijo Apple | Causa real | Arreglo |
|---|---|---|---|
| **3.2 Business** | La app parece para «una empresa u organización» | Nuestra propia ficha y notas: «no hay registro abierto», «not for the general public», «authorized employees» | Ficha y notas reescritas como plataforma **multiempresa**, con vía pública para contratarla (`/contacto`) y modo demo |
| **2.3.10 Accurate Metadata** | Capturas con barra de estado que no es de iOS | Las 8 capturas y el video eran de un emulador **Android** | Capturas nuevas del simulador de iOS (barra 9:41) generadas en GitHub Actions; se quitó el video Android |
| **2.1 Information Needed** | No pudieron entrar con la cuenta demo | En el servidor **sí entró**: `lastLoginAt` 25-09 15:34 UTC desde Dublín (Vodafone Ireland), 4 min antes del mensaje. El fallo fue posterior o de la app iOS | Modo demo sin credenciales; login iOS robusto (recorte de espacios, la red ya no se disfraza de «sesión expirada», mensajes claros) |

Estado de la cuenta demo en el servidor (28-09): activa, sin MFA, sin candado, 0 intentos fallidos, única membresía `nexara-demo`.

Otros hallazgos corregidos de paso: sin borrado de cuenta en la app (5.1.1(v)) → fila «Eliminar mi cuenta» hacia
`https://nexara.com.mx/legal/eliminar-cuenta`; sin `PrivacyInfo.xcprivacy`; `NSUserTrackingUsageDescription` sin uso real;
falta `NSFaceIDUsageDescription`; `UIBackgroundModes: fetch` sin handler; el workflow de TestFlight borraba los manifiestos de
privacidad de los SDK; la app pasa a **solo iPhone** (Apple revisó en iPad Air y la interfaz no estaba pensada para iPad).

## Respuesta al equipo de revisión (Resolution Center) — enviar solo tras confirmar

```
Hello App Review Team,

Thank you for the detailed feedback. We addressed each point in a new build (1.0.0). Summary:

Guideline 3.2 - Business
NEXARA is a multi-company workspace platform for field-operations teams, not an app for a single organization. Every
customer company gets its own isolated workspace (separate data, users, roles and settings), and the people who work at
those companies sign in with the accounts their company administrator creates, the same way people use other workspace
and ERP apps distributed publicly on the App Store. Any company can contract NEXARA at https://nexara.com.mx/contacto,
and anyone can explore every feature without an account through the new Demo mode (button on the sign-in screen).
Because the audience is any customer company, and not the employees of one specific organization, we kept public
distribution. We rewrote the description and notes so this is clear.

Guideline 2.3.10 - Accurate Metadata
You were right: our previous screenshots and screen recording came from a different platform. We replaced ALL screenshots
with captures taken on the iOS Simulator (iPhone 6.9"), with the iOS status bar, showing the app in use. We also removed the
old screen recording. No references to other platforms remain in the app or in the metadata.

Guideline 2.1 - Information Needed
We added a Demo mode so reviewers do not depend on credentials: on the sign-in screen tap "Explorar NEXARA con datos de
muestra". It needs no account and no network, and it opens the full app (activities, attendance check-in, team chat, expenses,
org chart, team KPIs, notifications) with fictional sample data. The demo account in the Sign-in information section (isolated
tenant "nexara-demo") also works with the real backend; we verified it and improved the sign-in flow (input trimming, clear
error messages, network errors no longer reported as an expired session).

Additional changes in this build: in-app account deletion entry (Profile > "Eliminar mi cuenta"), privacy manifest, Face ID
usage description, iPhone-only support.

Thank you,
NEXARA team
```

## Rechazo del 07-10-2026 · build 1.0.0 (9) · guía 2.5.4 (ubicación en segundo plano)

Apple (revisado en iPad Air 11" M3): la app declara `location` en `UIBackgroundModes` y la única función que lo usa es
seguir a empleados, lo cual no acepta. Opciones que da: grabar otra función que necesite ubicación persistente (no la
hay), o distribuir por otra vía (Custom App por Apple Business Manager) si seguir a empleados es el único uso.

**Hecho (para el build 10):** `Info.plist` sin `location` en `UIBackgroundModes` y sin
`NSLocationAlwaysAndWhenInUseUsageDescription`; `ShiftGpsTracker.swift` solo pide «Mientras se usa la app», sin
`allowsBackgroundLocationUpdates` ni cambios significativos, y re-arma al volver a primer plano. En iOS el recorrido de
jornada solo se registra con la app abierta (como la web); Android no cambia.

Respuesta en App Store Connect (enviar solo cuando el build 10 esté elegido y Adam lo apruebe):

```
Hello,

Thank you for the review. We agree that employee tracking is not an appropriate use of the location background mode, and we have removed it in build 1.0.0 (10):

- "location" has been removed from UIBackgroundModes (only "remote-notification" remains, for push notifications).
- The app no longer requests "Always" location permission; NSLocationAlwaysAndWhenInUseUsageDescription has been removed. It only requests "While Using the App".
- The app no longer uses background location updates or significant-location-change monitoring.

Location is now used only while the app is open on screen: to stamp the clock-in/clock-out photo and job evidence, and, while the user's workday is open and the app is in use, to record the workday route. When the app goes to the background, location collection stops. The user sees a "Compartiendo ubicación de jornada" (Sharing workday location) notice with a "Dejar de compartir" (Stop sharing) button, and sharing ends automatically at clock-out.

The app can still be reviewed without an account: on the sign-in screen tap "Explorar NEXARA con datos de muestra" (demo mode, no real location is collected).

Best regards
```

## Campos de App Store Connect (versión 1.0)

**Texto promocional** (≤170):
`Actividades, asistencia con foto y GPS, chat y viáticos para empresas que operan en campo. Pruébala sin cuenta con el modo demo.`

**Descripción**
```
NEXARA es la plataforma de operación en campo para empresas: cada organización tiene su propio espacio de trabajo aislado y su equipo lo usa desde el celular.

Con NEXARA tu equipo puede:

• Ver quién está en campo, qué actividades lleva y cuáles van atrasadas.
• Registrar entradas y salidas con foto y ubicación.
• Coordinar el trabajo por chat, en canales y mensajes directos.
• Solicitar y dar seguimiento a viáticos.
• Consultar organigrama, indicadores del equipo, proyectos, almacén y vehículos.
• Recibir avisos en tiempo real.

¿Tu empresa aún no usa NEXARA? Solicita tu espacio de trabajo en nexara.com.mx/contacto. ¿Quieres verla antes? Abre la app y toca «Explorar NEXARA con datos de muestra»: recorres todas las funciones sin cuenta.

Cada empresa da de alta a las personas de su equipo y decide qué ve cada una. La ubicación solo se usa con la app abierta y deja de compartirse al marcar tu salida.

Aviso de privacidad: https://nexara.com.mx/legal/privacidad
```

**Palabras clave** (≤100): `operación en campo,asistencia,GPS,actividades,chat,viáticos,equipo,ERP,cuadrillas,técnicos,checador`
**URL de soporte**: `https://nexara.com.mx/contacto` · **URL de marketing**: `https://nexara.com.mx`
**Archivo adjunto de revisión**: quitar `nexara_review_demo2.mp4` (es de Android).

**Notas para el equipo de revisión** (inglés, ≤4000):
```
NEXARA is a multi-company workspace platform for field-operations teams (activities, attendance with photo + GPS, team chat,
expenses, org chart, KPIs). Each customer company gets an isolated workspace; its administrator creates the accounts for its team.
Companies can contract NEXARA at https://nexara.com.mx/contacto.

HOW TO REVIEW WITHOUT AN ACCOUNT
On the sign-in screen tap "Explorar NEXARA con datos de muestra" (Explore NEXARA with sample data). Demo mode needs no account and
no network; all data is fictional and local. A "Modo demostración" banner is shown at the top; its "Salir" button (or Profile > "Cerrar sesión") exits.

HOW TO REVIEW WITH THE REAL BACKEND (optional)
The Sign-in information fields contain a demo account that belongs to the isolated tenant "nexara-demo" (sample data only, no real
customer data). Keep the "Usuario" option selected on the sign-in screen (the other two, "Cliente" and "Sucursal", are for customer
portal accounts).

PURPOSE AND AUDIENCE
Operations teams of companies that run work in the field (installation, maintenance, services). It removes paper and chat groups:
assigned activities, evidence, attendance and team communication in one app.

EXTERNAL SERVICES
NEXARA API (https://api.nexara.com.mx), Firebase Cloud Messaging and Apple Push Notification service for notifications, Apple MapKit.
No advertising, no third-party analytics, no tracking, no in-app purchases.

LOCATION
Location is used only while the app is in use ("While Using the App" permission). It stamps clock-in/clock-out photos and job
evidence, and while the user's workday is open and the app is on screen it records the workday route shared with their supervisor.
The app does not declare the location background mode, does not request "Always" permission and does not collect location in the
background. Sharing stops at clock-out or with "Dejar de compartir".

ACCOUNT DELETION
Profile > "Eliminar mi cuenta" (opens https://nexara.com.mx/legal/eliminar-cuenta). Accounts are created by the customer company.

REGIONS
The app behaves the same in every region. The interface is in Spanish (Mexico); customers are mostly in Mexico.
```

## Reenvío (orden)

1. Workflow **iOS TestFlight** con `version=1.0.0`, `build=` **mayor que 1** (el rechazado es el 1) y `upload=true`.
2. Workflow **iOS screenshots** → PNG en `docs/store/ios-screenshots/`.
3. En App Store Connect: capturas 6.9" nuevas (quitar las 8 de Android y cualquier de iPad), campos de arriba, nuevo build, quitar el .mp4.
4. Confirmar la contraseña demo: `apps/mobile-native/ios/scripts/verificar-cuenta-revision.ps1` (y `resembrar-cuenta-revision.ps1` si da 401).
5. Responder en Resolution Center con el texto de arriba y «Volver a enviar a revisión de apps».

## Rechazo del 12-10-2026 · build 1.0.0 (10) · guía 2.3.10 (otra vez «barra de estado que no es de iOS»)

Envío `a7982a31-fb80-4b33-8b19-520ce4bcfae6`, revisado en iPad Air 11" (M3). Apple adjuntó
`270b278403d6ff84aa936f8ee10a12d47dfb76fa.png`: es la imagen de marketing **de Android** («Tu equipo en tiempo
real», teléfono con barra de estado y gestos de Android, tema azul) que se subió con el primer envío de septiembre.

**Causa real (verificada el 19-10 por la API interna de App Store Connect):** la versión 1.0 tenía DOS juegos de
capturas en es-MX:

| Juego (`screenshotDisplayType`) | Capturas | Origen |
|---|---|---|
| `APP_IPHONE_67` (iPhone con Dynamic Island, pantalla grande) | 10 (`01-inicio.png` … `10-mi-perfil.png`, 1320×2868) | Simulador iOS, flujo `ios-screenshots.yml` del 05-10 |
| `APP_IPAD_PRO_3GEN_129` (iPad 12,9"/13") | **1: `imgonline-com-ua-resize-L2apCDrgZOu.png`, 2048×2732** | **Imagen Android de septiembre, redimensionada** |

La app es solo iPhone, así que la pestaña «iPhone» de ASC no enseña el juego de iPad y los tres reenvíos (28-09,
04-10, 05-10) lo dieron por vacío. Apple lo ve: el aviso del rechazo lo dice literalmente («some screenshots may
only be viewed and updated by selecting *View All Sizes in Media Manager*»). Los rechazos 2.3.10 del 04-10 y del
12-10 se explican con esa sola imagen; el arreglo del `DemoBanner` del 04-10 fue de paso.

**Arreglo:** Gestor de recursos multimedia → pestaña **iPad** → «iPad pantalla de 13"» → **Eliminar todo** →
Guardar. Verificar después que la versión solo tenga el juego `APP_IPHONE_67` (en la pestaña iPad debe decir
«0 de 10 capturas»). No hace falta build nuevo: el 10 sigue elegido.

**Regla nueva (va en la lista de verificación de abajo):** antes de cada envío revisar en el Gestor de recursos
multimedia las CUATRO pestañas (iPhone, iPad, Apple Watch, App para iMessage) y todos los tamaños de cada una, no
solo el que enseña la ficha.

Respuesta en el Resolution Center (enviar después de borrar la captura de iPad y de pulsar «Actualizar revisión»):

```
Hello,

Thank you for the attached image: it helped us find the problem. That screenshot was not in the iPhone
screenshot set we replaced in our previous resubmissions. It was an old 12.9-inch iPad screenshot, uploaded with
our very first submission in September from the Android version of the app. Because the app is iPhone-only, the
iPad set was hidden in the default App Store Connect view, and we did not see it when we replaced the iPhone
screenshots.

We have now removed that iPad screenshot entirely (the iPad set is empty). The version now contains only the 10
iPhone 6.9-inch screenshots captured on the iOS Simulator (iPhone 17 Pro Max, iOS 26.2), which show the iOS status
bar and the app in use. There are no app previews and no other attachments. No references to other platforms
remain in the binary, the screenshots or the metadata.

Build 1.0.0 (10) is unchanged. It can still be reviewed without an account: on the sign-in screen tap
"Explorar NEXARA con datos de muestra" (demo mode).

Best regards,
NEXARA team
```

## Lista de verificación antes de CADA envío a App Review (NEXARA y ARTA)

Hecha con los cuatro rechazos de NEXARA (25-09, 04-10, 07-10, 12-10) y los dos de ARTA (06-10, 12-10). Marcar
todo antes de pulsar «Volver a enviar a revisión de apps».

**Capturas y multimedia (2.3.10 / 2.3.3)**
- [ ] Gestor de recursos multimedia → **iPhone, iPad, Apple Watch y App para iMessage**: en cada pestaña, cada
      tamaño con «0 de N» salvo el iPhone 6,9". Ningún juego de iPad en apps solo iPhone.
- [ ] Las capturas vienen del simulador de iOS (flujo `ios-screenshots.yml`): barra de estado 9:41 con señal,
      WiFi y batería de iOS, sin marcos de teléfono Android, sin titulares de marketing.
- [ ] Ninguna captura con franja de color sólido detrás de la barra de estado con la hora en negro (se lee como
      barra de Android). Si la cabecera es de color, la hora va en blanco (`NxStatusBar`), o la cabecera es clara.
- [ ] 0 vistas previas (videos) a menos que sean grabación del simulador de iOS; ningún `.mp4` de Android.
- [ ] «Archivo adjunto» de Información de revisión: vacío o solo el video del simulador de iOS que piden en 2.1.

**Ficha (3.2 / 2.3)**
- [ ] Descripción, texto promocional, palabras clave, novedades y notas sin las palabras *Android*, *Google Play*,
      *emulador*, *solo empleados*, *not for the general public*, *authorized employees*.
- [ ] Descripción como plataforma multiempresa con vía pública de contratación (`/contacto`) y modo demo.
- [ ] Subtítulo ≤ 30 caracteres; URL de soporte y de privacidad abren (200) sin login.

**Binario**
- [ ] `UIBackgroundModes` solo `remote-notification`; sin `NSLocationAlwaysAndWhenInUseUsageDescription`
      (2.5.4). `TARGETED_DEVICE_FAMILY = 1`. `PrivacyInfo.xcprivacy` en la raíz del `.app`.
- [ ] Todas las cadenas `NS*UsageDescription` explican el uso real (ubicación, cámara, fotos, micrófono, Face ID).
- [ ] «Eliminar mi cuenta» visible en Mi perfil / Más (5.1.1(v)); privacidad y términos alcanzables sin login.
- [ ] Nada que diga *Android* en pantalla (solo en comentarios del código).

**Revisión (2.1)**
- [ ] Modo demo abre sin cuenta y sin red, también en iPad (compatibilidad): es donde revisa Apple.
- [ ] Cuenta demo verificada ese día por Adam con `verificar-cuenta-revision.ps1` (activa, sin MFA, sin candado,
      contraseña sin espacios al pegarla).
- [ ] Notas en inglés con la ruta exacta para cada función que Apple pidió ver (eliminar cuenta, reportar,
      bloquear, ubicación).

**Flujo de reenvío en ASC**
- [ ] Guardar cambios de la versión → «Actualizar revisión» → esperar a «Listo para revisión» → responder en el
      Resolution Center → «Volver a enviar a revisión de apps» → no navegar hasta ver «Pendiente de revisión».
