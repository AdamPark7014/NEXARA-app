# Publicar NEXARA móvil (Google Play y App Store)

Lo que **no** puede hacer el repo ni un asistente por ti: abrir cuentas de pago, verificar identidad, subir builds firmados con **tu** Apple ID o aceptar contratos en Play Console / App Store Connect. Lo que sigue es el orden práctico.

---

## Google Play (Android)

### 1. Cuenta y cuota
- Registro: [Google Play Console](https://play.google.com/console/signup) (cuota única de registro de desarrollador).
- Completa el perfil de la cuenta y el formulario de verificación si Play lo pide.

### 2. Crear la aplicación
- En Play Console: **Crear app** → nombre, idioma predeterminado, tipo (app / juego), declaración de exportación.

### 3. Generar el AAB (formato que pide Play)
En tu PC (Windows), desde `apps/mobile`:

```bash
npm run android:bundle:release
```

Requisitos: `apps/mobile/android/key.properties` (copia de `key.properties.example`) y `android/app/nexara-release.jks` como ya configuraste.

**Salida típica del bundle:**

`apps/mobile/android/nexara-gradle-out/app/outputs/bundle/release/app-release.aab`

### 4. Subir en Play Console
- **Producción** o **Prueba interna/cerrada** → **Crear versión** → sube el `.aab`.
- Rellena: notas de la versión, **ficha de la tienda** (descripción, icono 512, capturas por tamaño), **clasificación de contenido**, **política de privacidad** (URL), **objetivo de API** (tu `targetSdk` debe cumplir la política vigente de Google).

---

## Apple App Store (iOS)

### 1. Cuenta de desarrollador
- [Apple Developer Program](https://developer.apple.com/programs/enroll/) (suscripción anual).

### 2. Mac con Xcode
- Instala **Xcode** desde la App Store de macOS.
- Acepta licencias: `sudo xcodebuild -license accept` si hace falta.

### 3. Sincronizar el proyecto iOS
En la Mac, en la raíz del monorepo o en `apps/mobile`:

```bash
cd apps/mobile
npm install
npx cap sync ios
```

Abre **`apps/mobile/ios/App/App.xcworkspace`** en Xcode (no el `.xcodeproj` suelto).

### 4. Firma y subida
- En Xcode: target **App** → **Signing & Capabilities** → equipo de desarrollo (tu Apple ID).
- Menú **Product → Archive** (elige dispositivo genérico “Any iOS Device”, no simulador).
- **Organizer → Distribute App → App Store Connect**.

### 5. App Store Connect
- [App Store Connect](https://appstoreconnect.apple.com/) → **Mis apps** → **+** → nueva app (Bundle ID debe coincidir con el de Xcode, p. ej. `mx.nexara.mobile` si es el que tienes en el proyecto).
- Completa **información de la app**, **privacidad** (etiquetas de privacidad de la app), **capturas** por tamaño de iPhone/iPad, **URL de política de privacidad**, revisión de **notificaciones** si usas push (APNs).

---

## Comprobaciones comunes (ambas tiendas)

| Tema | Android | iOS |
|------|---------|-----|
| Binario para tienda | `.aab` (`bundleRelease`) | `.ipa` (Archive en Xcode) |
| Identificador | `applicationId` en Gradle | Bundle Identifier en Xcode |
| Notificaciones push | FCM + `google-services.json` | APNs + capacidades en Xcode |
| App Capacitor con URL remota | `capacitor.config.ts` → `server.url` debe ser HTTPS en producción | Igual; ATS puede bloquear HTTP |

---

## Comandos útiles (resumen)

| Objetivo | Comando (desde `apps/mobile`) |
|----------|--------------------------------|
| Sync Android | `npm run android:sync` |
| APK release firmada | `npm run android:apk:release` |
| **AAB para Play Store** | `npm run android:bundle:release` |
| Sync iOS (en Mac) | `npx cap sync ios` |

Si el build Android falla por archivos bloqueados en OneDrive, el proyecto ya usa `nexara-gradle-out/` como `buildDir` del módulo app para mitigarlo.

---

## Sin Mac (solo Windows): opciones para iOS / App Store

Apple **exige** compilar y firmar iOS con **Xcode en macOS**. No hay un flujo oficial equivalente solo en Windows.

1. **Mac en la nube (CI)**  
   Servicios con runner **macOS** (p. ej. [GitHub Actions `macos-latest`](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners/about-github-hosted-runners), [Codemagic](https://codemagic.io/), [Bitrise](https://www.bitrise.io/)): subes el repo, configuras certificados de Apple y generas el **Archive / .ipa** o subes a TestFlight sin tener Mac físico.

2. **Mac prestada o alquiler por horas**  
   Cualquier Mac compatible con la última Xcode sirve para **Archive** una vez que tengas cuenta de desarrollador.

3. **Contratar a un desarrollador / agencia**  
   Les das acceso a App Store Connect (rol **App Manager** o **Developer**) y ellos suben builds desde su Mac.

4. **Solo Android por ahora**  
   Publicar en **Google Play** con el `.aab` no requiere Mac.

**Comando Prisma (corrección):** dos pasos, no uno: `cd apps/api` y luego `npx prisma migrate deploy` (o `cd apps/api; npx prisma migrate deploy` en PowerShell con punto y coma).
