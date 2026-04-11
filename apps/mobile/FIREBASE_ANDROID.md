# Firebase / FCM en la APK Android (Nexara)

Sin **`google-services.json`** real, **no hay FCM** cuando la app está cerrada: es una limitación de Google, no se soluciona solo con código.

## Qué sí tienes sin Firebase

- Permiso **POST_NOTIFICATIONS** (Android 13+)
- Canal de notificaciones locales
- Alertas en **primer plano** y reflejo local de push si el servidor entrega algo al dispositivo con FCM (cuando lo configures)

## Cómo obtener `google-services.json`

1. Entra a [Firebase Console](https://console.firebase.google.com/) con la cuenta de Google del proyecto.
2. **Crear proyecto** o elegir uno existente.
3. Añade una app **Android** con el **package name** exacto: `mx.nexara.mobile` (debe coincidir con `appId` en `capacitor.config.ts` y `applicationId` en Gradle).
4. Descarga **`google-services.json`**.
5. Copia el archivo a:

   `apps/mobile/android/app/google-services.json`

   (no subas este archivo a git si contiene claves; en el repo hay `google-services.json.example` como plantilla.)

6. En la carpeta `apps/mobile`:

   ```bash
   npm install
   npx cap sync android
   ```

7. Vuelve a compilar la APK (release o debug).

## Verificación

- En Android Studio: **Build** → el plugin `com.google.gms.google-services` se aplica solo si el JSON existe (ya está preparado en `android/app/build.gradle`).
- Tras instalar la APK, inicia sesión: el token debería registrarse en tu API (`POST /devices/push-token`) si el flujo de push está activo.

## Plantilla local

Puedes copiar `android/app/google-services.json.example` a `google-services.json` y reemplazar los campos `REEMPLAZA_*` con los valores que muestra Firebase (Project number, App ID, API key, etc.). Sin valores reales de la consola, FCM no funcionará.
