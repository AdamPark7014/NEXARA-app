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
