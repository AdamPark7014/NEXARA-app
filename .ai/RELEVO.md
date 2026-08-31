# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-08-31
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Rechazo de Google Play (31-08-2026): icono de launcher roto

Play rechazó la app por **dos políticas**. La segunda era la interesante.

**1. Permisos de fotos y vídeos — ya estaba resuelto en código.**
El manifiesto no pide `READ_MEDIA_IMAGES` ni `READ_MEDIA_VIDEO` (solo
`READ_EXTERNAL_STORAGE` con `maxSdkVersion=32`, que sí está permitido) y la app usa
`PickVisualMedia` / `GetContent`. En el centro de políticas, «Ver app bundles» confirma que
**el único bundle afectado es el 3 (1.0.0), en Producción**. No hay nada que arreglar en el
repo: se cierra subiendo un bundle nuevo que lo sustituya.

**2. Afirmaciones engañosas: «la ficha no coincide con la aplicación» — bug real.**
La evidencia de Google mostraba, como icono instalado, **un círculo negro liso con el texto
«NEXARA» debajo**. Causa:

- `mipmap/ic_launcher.xml` y `drawable/ic_launcher_foreground.xml` eran `layer-list` con
  `<bitmap android:gravity="center">` sobre `@drawable/logo_nexara`.
- `gravity="center"` **no escala**: dibuja el bitmap a su tamaño intrínseco y recorta. Como
  `logo_nexara.png` mide 3544×3544 en `drawable/` sin cualificador (= mdpi → 3544 dp), en una
  caja de 56 dp solo se veía el centro oscuro del hexágono. De ahí el círculo negro.
- Encima el `foreground` llevaba un inset de 26 dp por lado y el PNG ya traía ~25 % de margen
  transparente, así que la marca quedaba al ~40 % del tamaño previsto.

Arreglo: se sustituyen los XML por **PNG reales en las cinco densidades**, generados desde el
logo maestro con un script, y el icono de la ficha sale del mismo script para que no puedan
divergir.

**3. Nombre.** La ficha decía `Nexara` y el `app_name` del APK `NEXARA`. Google citó «el icono
**o el nombre**», así que se igualan a `NEXARA` (que es lo que dice `PLAY-STORE-LISTING.md`).

### Archivos

- **Nuevo** `scripts/gen-native-app-icons.py` — genera `mipmap-*/ic_launcher{,_round}.png`,
  `drawable-*/ic_launcher_foreground.png` y `play-assets/icon-512.png` desde
  `drawable/logo_nexara.png`. Recolorea el wordmark (que es blanco en el original) al
  azul-noche `#15191E` para que se lea sobre fondo claro. `npm run mobile:android:icons`.
- **Borrados** `drawable/ic_launcher_foreground.xml`, `mipmap/ic_launcher.xml`,
  `mipmap/ic_launcher_round.xml` — eran la causa del bug.
- `values/colors.xml` — `ic_launcher_background` negro → blanco (la ficha ya tenía el icono
  sobre blanco; se alinea el launcher con lo publicado).
- `drawable/splash_icon.xml` — ahora reusa `@drawable/ic_launcher_foreground`; antes tenía el
  mismo bug de `gravity="center"` y la splash mostraba el mismo recorte negro.
- `values/themes.xml` — `windowSplashScreenIconBackgroundColor` teal → blanco, para que la
  splash y el icono se lean igual.
- `gradle.properties` — `VERSION_CODE` 4 → **5** (el 4 ya se había subido).
- `play-assets/ASSETS-README.md` — regla de paridad ficha↔launcher y cómo regenerar.
- `docs/PLAY-STORE-CHECKLIST.md` — versionCode al día y ruta correcta (`gradle.properties`,
  no `build.gradle.kts`).
- `package.json` — script `mobile:android:icons`.

### Verificado

- `bundleRelease` OK (exit 0). AAB en
  `apps/mobile-native/android/app/build/outputs/bundle/release/app-release.aab` (25 MB).
- Manifiesto del AAB: **sin `READ_MEDIA_*`**.
- El AAB empaqueta `ic_launcher.png` + `ic_launcher_round.png` en mdpi→xxxhdpi y
  `ic_launcher_foreground.png` en las cinco densidades. Ya no hay XML de layer-list.
- Icono de ficha y de launcher renderizados lado a lado: misma imagen.

## A medias

**Play Console — ficha principal, cambios SIN GUARDAR en el navegador.**
Se dejó el campo «Nombre de la aplicación» en `NEXARA` y el panel de recursos abierto, pero
**no se pulsó Guardar**. Si se recargó la página, ese cambio se perdió y hay que repetirlo.
El icono de 512 **no se pudo subir desde el agente**: el botón «Subir» abre el diálogo nativo
de Windows, que no es manejable. Lo sube Adam a mano.

## No tocar

- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS, PortalShell rewrite, Meta/ESP, OFX, ISAPI invent
- `key.properties` y el keystore de firma — credenciales, no se tocan
- `scripts/generate-mobile-icons.js` — apunta a `apps/mobile/`, que ya no existe. Es código
  muerto; no usarlo para este proyecto (usar `gen-native-app-icons.py`). Pendiente decidir si
  se borra.

## Siguiente paso

1. Play Console → Ficha de Play Store predeterminada:
   - Nombre de la aplicación → `NEXARA`.
   - Icono → subir `apps/mobile-native/play-assets/icon-512.png` (el nuevo, con wordmark
     oscuro sobre blanco) y quitar el anterior.
   - **Guardar**.
2. Probar y publicar → Producción → Crear versión → subir el AAB (aparecerá como **5 (1.0.0)**)
   y quitar el bundle 3 de la versión.
3. Resumen de publicación → Enviar cambios a revisión. Debe cerrar los **dos** problemas de
   política a la vez.
4. Antes de enviar, comprobar en un teléfono real que el icono instalado es el hexágono con
   «NEXARA» sobre blanco, no un círculo liso. Es literalmente lo que revisa Google.

## Estado

- **Desplegado en prod** @ `2ba0cf8` (2026-08-30) — sin cambios en web/API este turno.
- Este turno toca solo `apps/mobile-native`, `scripts/`, `docs/` y `package.json`.
