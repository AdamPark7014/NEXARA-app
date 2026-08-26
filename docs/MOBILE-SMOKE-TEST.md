# Android — smoke test manual y automatizado

Checklist de integración para validar la app nativa Android (`mx.nexara.mobile.nativeapp`) antes de subir un AAB a Play o promover una build interna.

Complementa [`PLAY-STORE-CHECKLIST.md`](./PLAY-STORE-CHECKLIST.md) (firma, ficha, credenciales demo) y [`native-parity-matrix.md`](./native-parity-matrix.md) (paridad funcional).

---

## 1. Verificación automatizada (local)

Desde la raíz del monorepo:

```bash
npm run mobile:smoke
```

El script [`scripts/mobile-smoke-checklist.ps1`](../scripts/mobile-smoke-checklist.ps1) ejecuta, en orden:

| Paso | Qué valida |
|---|---|
| 1 | Existe el AAB de release en `apps/mobile-native/android/app/build/outputs/bundle/release/app-release.aab` |
| 2 | Compilación debug (`assembleDebug`) termina sin errores |
| 3 | Unit tests JVM (`testDebugUnitTest`) pasan |

Si falta el AAB, genera uno firmado con:

```bash
npm run mobile:android:play-aab
```

> **Nota:** el smoke automatizado no sustituye las pruebas manuales de abajo. Solo confirma que el artefacto de Play existe y que el código compila y pasa tests unitarios.

---

## 2. Cuenta de prueba (revisor Play)

Usa la **cuenta demo aislada** documentada en [`PLAY-STORE-CHECKLIST.md` §6.1](./PLAY-STORE-CHECKLIST.md#61-acceso-a-la-app--causa-nº1-de-rechazo). **No guardes la contraseña en el repo.**

| Campo | Valor |
|---|---|
| Usuario | `play.review@nexara.com.mx` |
| Contraseña | *(generada al correr el seed; no versionar)* |
| Tenant | `nexara-demo` (datos ficticios, sin clientes reales) |

### Provisionar o resetear la cuenta

```bash
cd apps/api && npm run seed:play-reviewer
```

El script imprime la contraseña **una sola vez**. Para fijarla tú (por ejemplo en CI o antes de una revisión):

```bash
PLAY_REVIEWER_PASSWORD='...' npm run seed:play-reviewer
```

Si la cuenta queda bloqueada tras intentos fallidos, vuelve a correr el seed (limpia `lockedUntil`).

### Instalar la build a probar

- **Release (AAB):** sube a Prueba interna en Play Console, o instala vía `bundletool` / Internal App Sharing.
- **Debug (desarrollo):** `npm run apk:build-install` con un dispositivo USB conectado.

API de producción: `https://api.nexara.com.mx/api` (configurada en `build.gradle.kts`).

---

## 3. Checklist manual en dispositivo

Marca cada ítem en un teléfono o emulador real. Objetivo: confirmar que **no hay crash** y que cada flujo principal responde (pantallas vacías en el tenant demo son aceptables; errores de red o pantallas en blanco por excepción no lo son).

### 3.1 Login y hub de paneles

- [ ] La app abre sin crash (splash → login o sesión guardada).
- [ ] Login con `play.review@nexara.com.mx` y la contraseña del seed termina en el **selector de paneles**.
- [ ] La cuenta solo muestra datos del tenant demo (sin información de clientes reales).
- [ ] Cerrar sesión y volver a entrar funciona.

### 3.2 Cada panel (abrir y navegar el dashboard)

Abre cada panel desde el hub y confirma que carga su pantalla principal sin crash:

| Panel | Qué abrir | OK |
|---|---|---|
| **ERP** | Dashboard ERP (Inicio) | [ ] |
| **CRM** | Dashboard CRM / Ventas | [ ] |
| **OPS** | Dashboard OPS / operación en campo | [ ] |
| **STUDIO** | Dashboard Studio | [ ] |
| **LAB** | Dashboard Lab | [ ] |
| **Portal clientes** | Portal (tickets) | [ ] |

En cada panel, entra al menos a **una pantalla secundaria** (menú o tab inferior) y regresa al dashboard.

### 3.3 Smart Quote (CRM)

- [ ] En **CRM**, abre el flujo de **cotización inteligente** (Smart Quote / builder).
- [ ] La búsqueda de productos responde (aunque sea con pocos resultados en demo).
- [ ] Puedes agregar al menos un ítem a la cotización sin error.
- [ ] Guardar o salir del builder no deja la app colgada.

### 3.4 Chat — enviar mensaje

- [ ] Abre **Chat** desde el panel correspondiente (ERP u OPS según el rol demo).
- [ ] Lista de canales carga (puede estar vacía; si hay canal, entrar).
- [ ] Escribe y **envía un mensaje**; el mensaje aparece en el hilo (o feedback de error claro, no crash).
- [ ] Salir del chat y volver no duplica mensajes ni crashea.

Ver también [`CHAT-REALTIME-MOBILE.md`](./CHAT-REALTIME-MOBILE.md).

### 3.5 Vista de actividades (ERP / OPS)

- [ ] En **ERP** o **OPS**, abre **Actividades** (lista admin o “mis actividades”).
- [ ] La lista carga (vacía o con registros demo).
- [ ] Abrir detalle de una actividad (si existe) o crear/vista vacía no crashea.
- [ ] Pull-to-refresh o volver atrás funciona.

### 3.6 Lista de tickets (Portal clientes)

- [ ] Abre el panel **Portal clientes**.
- [ ] Pestaña o sección **Tickets** muestra la lista (vacía o con datos demo).
- [ ] Abrir un ticket del listado (si hay) carga el detalle.
- [ ] Navegación entre tabs del portal (Sucursales, Solicitudes, Inventarios, Perfil) sin crash.

---

## 4. Criterios de salida

**Pasa el smoke** si:

1. `npm run mobile:smoke` termina con código 0.
2. Todos los ítems manuales de §3 están marcados sin crashes bloqueantes.
3. La cuenta `play.review@nexara.com.mx` sigue desbloqueada y usable.

**No enviar a revisión de Play** si algún panel crashea al abrir, Smart Quote no compila la UI, el chat revienta al enviar, o login cae en tenant incorrecto.

---

## 5. Referencias

| Tema | Documento |
|---|---|
| Publicación Play, AAB, credenciales demo | [`PLAY-STORE-CHECKLIST.md`](./PLAY-STORE-CHECKLIST.md) |
| Capturas y ficha | [`PLAY-STORE-LISTING.md`](./PLAY-STORE-LISTING.md) |
| Paridad pantalla por pantalla | [`native-parity-matrix.md`](./native-parity-matrix.md) |
| Smart Quote (backend/UI web) | [`SMART-QUOTE-ENGINE.md`](./SMART-QUOTE-ENGINE.md) |
| Deep links | [`DEEP-LINKS-MOBILE.md`](./DEEP-LINKS-MOBILE.md) |
| Build AAB | `npm run mobile:android:play-aab` |
| Emulador + install debug | `npm run mobile:android:preview` |
