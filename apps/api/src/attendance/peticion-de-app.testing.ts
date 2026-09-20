/**
 * La petición que manda la app al checar, para las pruebas.
 *
 * Desde que la web no puede checar, `register` mira los encabezados antes que nada: sin
 * ellos la petición es un navegador y se rechaza. Las pruebas que quieren ejercitar el
 * camino normal tienen que parecer lo que son —un teléfono con la app— y esto es lo que
 * las dos apps mandan de verdad (`ApiClient.kt`, `DeviceIdentity.swift`).
 *
 * No es código de producción: solo lo importan los `*.spec.ts` de este módulo.
 */

/** `User-Agent` que fija `ApiClient.kt` en Android. */
export const UA_APP_ANDROID = 'NexaraApp/1.4.0 (Android 14; samsung SM-A536B) OkHttp';

/** `User-Agent` que fija `DeviceIdentity.swift` en iOS. */
export const UA_APP_IOS = 'NexaraApp/1.4.0 (iOS 18.1; iPhone 16 Pro)';

/** Una petición con los encabezados que manda la app. */
export const peticionDeApp = (
  userAgent: string = UA_APP_ANDROID,
  headers: Record<string, string> = {},
) => ({
  headers: {
    'user-agent': userAgent,
    'x-device-browser': 'NEXARA App',
    ...headers,
  },
});

/** Atajo para el caso más común: Android con la app. */
export const PETICION_APP = peticionDeApp();
