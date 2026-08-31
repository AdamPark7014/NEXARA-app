# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-08-31
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### 1. Rechazo de Google Play — icono de launcher roto (commit `1a8f805`)

Play rechazó por **dos políticas**. La evidencia de Google mostraba, como icono
instalado, **un círculo negro liso con "NEXARA" debajo**.

Causa: `mipmap/ic_launcher.xml` y `drawable/ic_launcher_foreground.xml` eran
`layer-list` con `<bitmap android:gravity="center">`. Ese gravity **no escala**:
dibuja el bitmap a tamaño intrínseco y recorta. `logo_nexara.png` mide 3544×3544 en
`drawable/` sin cualificador (= 3544 dp), así que en una caja de 56 dp solo se veía
el centro oscuro del hexágono.

- PNG reales en las cinco densidades vía `scripts/gen-native-app-icons.py`
  (`npm run mobile:android:icons`). Los XML rotos, borrados.
- El icono de la ficha sale del **mismo** script: si divergen, Play rechaza.
- Fondo blanco + wordmark en `#15191E` (el del original es blanco e invisible).
- `splash_icon.xml` tenía el mismo bug; ahora reusa el foreground.
- `VERSION_CODE` 4 → 5.

El rechazo por `READ_MEDIA_*` no necesitaba código: el manifiesto ya usa Photo
Picker. Afectaba solo al **bundle 3, en Producción**, que este bundle sustituye.

### 2. Paridad app ↔ web (este commit)

Cursor movió mucha ruta en la web. Contrastado con pruebas, no a ojo.

**a) Deep links de notificaciones.** `apps/api/src/common/app-urls.ts` es la fuente
de los `relatedUrl`; el nativo los resuelve con `DeepLinkParser`. El nuevo
`AppUrlsParityTest` recorre las **35** URLs que el API sabe emitir. Antes fallaban
11 y 6 apuntaban a módulos inexistentes:

- `/crm/clients|projects|tenders` daban `clients`/`projects`/`tenders`, pero el
  catálogo de ventas usa `clientes`/`proyectos`/`licitaciones` → alias por panel.
- `/ops/activities/{id}/evidences`: el sufijo inglés no estaba en la lista de
  pestañas, así que **se perdía el id de la actividad**. Ahora `ACTIVITY_DETAIL_TABS`
  traduce inglés→español (el detalle nativo indexa en español).
- `/ops/maintenance/contracts` → `contracts` (no existe) → `maintenance-contracts`.
- `/ops/support/new` → módulo `new` (no existe). Ahora los sufijos de alta se
  reconocen y pasan como `mode=new`.
- `/ops/support/{id}` caía en `client-tickets`, que en OPS es otro módulo distinto.
- `woId`, `productId`, `poId` se ignoraban: mantenimiento, almacén y compras
  abrían sin entidad.
- `/erp/finance/viatics` no estaba en `ERP_KEYS` aunque la web sí lo tiene.

**b) "Abrir en la web".** `PlaceholderScreen` mandaba **todo** a
`consola.nexara.com.mx` (alias legacy del ERP) con rutas de `apps/mobile`, que ya
no existe. **31 de 111 módulos daban 404.** El nuevo `WebPanelUrl` replica
`legacy-path-remap.ts` + `middleware.ts`: slugs es→en, prefijo legacy → panel, y
subdominio canónico por panel (`/erp`→core, `/crm`→sales, `/ops`→ops…). Ahora 100
enlazan a ruta real y 11 se declaran **sin equivalente web** → no se ofrece el
botón, en vez de mandar a un 404.

> `ModuleEntry.webPath` **no se puede tocar**: `ConsoleAccessRules` lo usa para
> permisos por rol (`startsWith("/operacion")` etc.). Por eso la corrección vive en
> `WebPanelUrl`, que solo construye la URL del navegador.

`scripts/check-app-web-parity.py` (`npm run mobile:parity`) cruza el catálogo
nativo con el árbol real de `apps/web` y sale 1 si algo diverge.

### Verificado

- **51 tests JVM, 0 fallos** (los 28 preexistentes de deep links siguen verdes).
- `npm run mobile:parity` → OK.
- `bundleRelease` OK. AAB en `app/build/outputs/bundle/release/app-release.aab`.
- Manifiesto del AAB: **sin `READ_MEDIA_*`**, 15 permisos.
- 17 iconos empaquetados, **0 layer-list XML**.
- R8 ofusca, pero `mapping.txt` confirma `WebPanelUrl` y `DeepLinkParser` dentro.

### Play Console (hecho desde el navegador)

- Nombre de la ficha `Nexara` → **`NEXARA`**, guardado. La ficha pasó de
  "Rechazado" a "Lista para enviar a revisión".
- Declaración **"Aplicaciones gubernamentales"** → No, guardada. Bloqueaba publicar
  actualizaciones. Las declaraciones pendientes bajaron de 2 a 1.
- La declaración de permisos de fotos **argumenta ante Google que la app necesita
  `READ_MEDIA_IMAGES/VIDEO`** — contradice el código. No se tocó: el formulario solo
  tiene los dos campos de justificación, y esa sección existe porque el bundle 3 los
  declara. Debe desaparecer sola al sustituirlo. **Verificar tras subir el AAB.**

## A medias

- **Icono 512 sin subir a la ficha.** El botón "Subir" de Play abre el diálogo
  nativo de Windows; el agente no puede manejarlo. Lo sube Adam desde
  `apps/mobile-native/play-assets/icon-512.png`.
- **Categoría**: la consola tiene *Productividad*, `PLAY-STORE-LISTING.md` dice
  *Empresa (Business)*. Quedó sin cambiar — la extensión de Chrome se desconectó.
- **Cuenta demo del revisor** (`play.review@nexara.com.mx`, tenant `nexara-demo`):
  sin comprobar que entra en producción. El agente no puede teclear contraseñas.
  Si falla, es rechazo seguro. `npm run seed:play-reviewer` es idempotente e imprime
  la contraseña.

## No tocar

- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS, PortalShell rewrite, Meta/ESP, OFX, ISAPI invent
- `key.properties` y el keystore — credenciales
- `ModuleEntry.webPath` — alimenta RBAC, ver arriba
- `scripts/generate-mobile-icons.js` — código muerto, apunta a `apps/mobile`
  (borrada). Usar `gen-native-app-icons.py`.

## Siguiente paso

1. Play Console → Ficha: subir `play-assets/icon-512.png`, quitar el anterior,
   guardar.
2. Producción → Crear versión → subir el AAB (**5 (1.0.0)**), quitar el bundle 3.
3. Comprobar que la declaración de permisos de fotos ya no aparece en Contenido de
   la aplicación.
4. Resumen de publicación → Enviar a revisión (van ~11 cambios).
5. Antes de enviar: instalar en un teléfono real y mirar el icono. Es literalmente
   lo que revisa Google.

## Estado

- Web en prod sin cambios este turno (`aa8503f` de cursor es lo último desplegado).
- Este turno toca `apps/mobile-native`, `scripts/` y `package.json`.
