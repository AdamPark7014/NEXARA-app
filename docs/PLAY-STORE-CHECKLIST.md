# Publicación en Google Play — NEXARA (`mx.nexara.mobile.nativeapp`)

Checklist operativo para la **primera** publicación. Todo lo que dice **[TÚ]** requiere que lo
hagas en el navegador (pago, verificación de identidad, subir archivos). Lo demás ya está resuelto
en el repo.

---

## 0. Datos que vas a necesitar a la mano

| Campo | Valor |
|---|---|
| D-U-N-S | **951814054** (emitido 22/07/2026, vence 08/02/2027) |
| Nombre legal | **New Engineering Expertise And Resource Advancement, S.A. de C.V.** |
| Domicilio | Ignacio Allende 512 local 2, Santiago Momoxpan, San Pedro Cholula, Puebla, C.P. 72775, México |
| Sitio web | https://nexara.com.mx |
| Aviso de privacidad | https://nexara.com.mx/legal/privacidad *(verificado: responde 200)* |
| Package (inmutable) | `mx.nexara.mobile.nativeapp` |
| Nombre de la app | NEXARA |

> **Crítico:** el nombre legal y el domicilio que captures en Play Console deben coincidir
> **carácter por carácter** con lo que D&B tiene registrado bajo ese DUNS. Si algo difiere
> (abreviaturas, "S.A. de C.V." vs "SA de CV", número interior), Google rechaza la verificación
> y hay que corregirlo primero en CIAL Dun & Bradstreet — no en Play.

---

## 1. Cuenta de desarrollador — organización **[TÚ]**

1. https://play.google.com/console/signup → tipo de cuenta **Organización**.
2. Cuota única de **25 USD** (tarjeta; no es suscripción).
3. Captura DUNS + nombre legal + domicilio de la tabla de arriba.
4. Verificación de identidad del titular (INE/pasaporte) y del teléfono de la organización.
5. Google valida contra D&B. Suele tardar de 1 a 3 días hábiles; puede llegar a 2 semanas.

**Ventaja de registrarte como organización:** quedas **exento** del requisito de prueba cerrada
con 12 testers durante 14 días continuos. Ese requisito aplica solo a cuentas personales creadas
después del 13-nov-2023. Con cuenta de organización puedes ir directo a producción.

---

## 2. Crear la app en Play Console **[TÚ]**

- Nombre: `NEXARA` · Idioma predeterminado: **Español (Latinoamérica)**
- Tipo: **App** · Gratuita (no se puede cambiar a de pago después)
- Declaras que cumples políticas y leyes de exportación de EE. UU.

---

## 3. Firma de la app

Ya está resuelto localmente:

- Upload keystore: `apps/mobile-native/android/nexara-upload.jks`
- Credenciales: `apps/mobile-native/android/key.properties` (fuera de git)

Play activará **Play App Signing**: Google guarda la llave de distribución y tu `.jks` queda como
llave de *subida*.

> **Respalda `nexara-upload.jks` + `key.properties` fuera de esta máquina.** Si los pierdes no
> puedes publicar actualizaciones sin pedirle a Google un reseteo de llave de subida.

---

## 4. Compilar y subir el AAB

```bash
npm run mobile:android:play-aab
```

Salida: `apps/mobile-native/android/app/build/outputs/bundle/release/app-release.aab`

**Build verificado (17/08/2026):** 28.77 MB, `jar verified`, firmado con la llave de subida
`CN=NEXARA, OU=Mobile, O=NEXARA, L=Puebla, ST=Puebla, C=MX`, vigente hasta 2053 (Play exige que el
certificado dure al menos hasta el 22/10/2033 — cumple).

Huellas del certificado de subida — las necesitas para restringir la API key de Google Maps y para
registrar la app en Firebase:

```
SHA-1   : A9:86:2A:BE:B4:56:1D:A2:52:B2:D8:32:41:5C:C2:ED:11:0B:54:94
SHA-256 : 28:34:99:79:FC:8F:82:33:78:72:22:C0:1F:F1:CB:43:FE:48:D9:66:29:E6:58:DE:3D:D1:2E:D5:A0:AF:13:66
```

> Ojo con Maps y FCM: una vez que Play App Signing esté activo, Google **refirma** el APK que
> reciben los usuarios con *otro* certificado. Tienes que agregar también el SHA-1 de la llave de
> distribución (Play Console → Configuración → Integridad de la app) a la restricción de la API key
> de Maps y a Firebase, o el mapa saldrá en blanco en la versión de Play aunque funcione en local.

Estado actual del build: `versionCode = 1`, `versionName = 0.1.0`, `targetSdk = 36`, `minSdk = 24`.
Cumple el requisito vigente de target API. En cada actualización futura hay que **subir el
`versionCode`** en `apps/mobile-native/android/app/build.gradle.kts` — Play rechaza un
`versionCode` repetido.

Ruta en consola: **Prueba interna** (recomendado primero) o **Producción** → Crear versión → subir
el `.aab`.

---

## 5. Ficha de Play Store

Assets ya generados en `apps/mobile-native/play-assets/`:

| Archivo | Uso |
|---|---|
| `icon-512.png` | Icono de la ficha (512×512, PNG opaco) |
| `feature-graphic-1024x500.png` | Gráfico destacado (obligatorio) |

**Capturas de pantalla:** ✅ generadas en `apps/mobile-native/play-assets/screenshots/phone/` (8 PNG, 1080×1920). Regenerar con `npm run mobile:android:screenshots`.

### Textos

**Nombre (≤30):**
```
NEXARA
```

**Descripción corta (≤80):**
```
ERP, CRM y operación en campo de NEXARA, en tu teléfono.
```

**Descripción completa (≤4000):**
```
NEXARA es la app móvil de la plataforma de gestión empresarial del mismo nombre. Da acceso
a los mismos paneles que la versión web, con la sesión y los permisos de tu organización.

Paneles disponibles según tu rol:

• ERP — finanzas, recursos humanos, almacén y control administrativo.
• CRM — seguimiento del pipeline comercial, cuentas y oportunidades.
• OPS — trabajo en campo: asignaciones, ubicación GPS, captura de evidencias fotográficas
  y lectura de códigos de barras.
• STUDIO — gestión de contenido y materiales de marca.
• LAB — herramientas internas de laboratorio y diagnóstico.
• Portal de clientes — consulta de servicios y documentos para clientes de la organización.

Características:

• Notificaciones push en tiempo real de asignaciones y cambios de estado.
• Inicio de sesión con biometría del dispositivo.
• Mapa integrado para operación en campo.
• Consulta de documentos PDF dentro de la app.
• Sesión cifrada y aislamiento de datos por organización.

NEXARA es una herramienta de uso profesional. Para entrar necesitas una cuenta creada por el
administrador de tu organización; la app no permite registro abierto.

Aviso de privacidad: https://nexara.com.mx/legal/privacidad
```

### Otros campos de la ficha

- Categoría: **Empresa** (Business). Etiquetas: ERP, CRM, productividad, trabajo en campo.
- Correo de contacto: el de soporte de la empresa (queda **público** en la ficha).
- Sitio web: https://nexara.com.mx
- Política de privacidad: https://nexara.com.mx/legal/privacidad

---

## 6. Sección "Contenido de la app" — declaraciones obligatorias

### 6.1 Acceso a la app ← *causa nº1 de rechazo*

Toda la funcionalidad está detrás de login y **no hay registro público**. Marca
**"Todas o algunas funciones están restringidas"** y entrega credenciales de una cuenta demo.

**Provisiona la cuenta así** (contra la base de datos de producción):

```bash
cd apps/api && npm run seed:play-reviewer
```

El script ([`apps/api/prisma/seed-play-reviewer.ts`](../apps/api/prisma/seed-play-reviewer.ts)) es
idempotente y hace lo siguiente:

- Crea un **tenant demo aparte** (`CompanyProfile` con slug `nexara-demo`), nunca el primario.
- Da de alta `play.review@nexara.com.mx` con contraseña aleatoria de 24 caracteres, que imprime
  **una sola vez** al terminar.
- Deja `mfaEnabled = false`, `isActive = true`, `failedLoginCount = 0` y `lockedUntil = null`.
- Borra cualquier membresía de esa cuenta a otra empresa, de modo que el revisor **no puede ver
  datos reales de clientes ni de empleados**.
- Asigna un rol amplio *dentro del tenant demo* — nunca `super_admin`, que cruza tenants.

Para fijar tú la contraseña en vez de generarla:

```bash
PLAY_REVIEWER_PASSWORD='...' npm run seed:play-reviewer
```

**Qué pegar en Play Console:**

| Campo | Valor |
|---|---|
| Nombre de las credenciales | `Cuenta de demostración NEXARA` |
| Nombre de usuario | `play.review@nexara.com.mx` |
| Contraseña | *(la que imprimió el script)* |

Y en el campo de instrucciones:

```
La app es una plataforma de gestión empresarial (ERP/CRM) de uso profesional. No tiene
registro público: las cuentas las crea el administrador de cada organización.

1. Abre la app e inicia sesión con el usuario y contraseña de arriba.
2. La cuenta pertenece a una organización de demostración con datos ficticios.
3. Tras iniciar sesión verás el selector de paneles según los permisos del rol.
4. Los permisos de ubicación y cámara se piden solo al entrar al panel OPS y son
   opcionales: la app funciona si se rechazan.

La misma cuenta funciona en la versión web: https://app.nexara.com.mx
```

> **Por qué un tenant aparte y no la cuenta de un empleado:** entregar credenciales reales
> pondría datos personales de clientes y colaboradores en manos de un tercero, lo que choca con
> el propio aviso de privacidad y con la LFPDPPP. El aislamiento del ADR-0014 hace el trabajo.

> **Ojo con el bloqueo por intentos fallidos:** `auth.service.ts` bloquea la cuenta 15 minutos
> tras 5 contraseñas incorrectas. Si el revisor se atora, vuelve a correr el seed (limpia
> `lockedUntil`) o usa `reset-user-password.sh`. Copia la contraseña con cuidado al pegarla.

> **El tenant demo nace vacío.** Pantallas sin datos son aceptables para Google, pero una que
> truene no lo es. Prueba la cuenta panel por panel en un teléfono real antes de enviar; si algún
> módulo falla o se ve demasiado hueco, carga un puñado de registros ficticios en ese tenant
> (un cliente, una oportunidad, una actividad) antes de la revisión.

### 6.2 Anuncios
**No**, la app no contiene anuncios.

### 6.3 Clasificación de contenido (IARC)
Categoría **Utilidad / Productividad / Comunicación**. Todas las preguntas de violencia, sexo,
drogas, apuestas y lenguaje: **No**. Resultado esperado: 3+ / Everyone.

### 6.4 Público objetivo
**18 y más**. Evita el programa Familias y sus requisitos extra.

### 6.5 Seguridad de los datos

Basado en lo que la app realmente hace (`AndroidManifest.xml` + dependencias):

| Tipo de dato | ¿Se recopila? | Por qué | Obligatorio |
|---|---|---|---|
| Nombre, correo, ID de usuario | Sí | Funcionalidad y gestión de la cuenta | Sí |
| Ubicación precisa y aproximada | Sí | Operación en campo / registro de asistencia | Opcional |
| Fotos y videos | Sí | Evidencias de trabajo en campo | Opcional |
| Archivos y documentos | Sí | Adjuntos y documentos de la organización | Opcional |
| ID del dispositivo | Sí | Notificaciones push (FCM) y analítica | Sí |
| Interacciones en la app | Sí | Analítica (Firebase Analytics) | Sí |

Respuestas transversales:

- **¿Se cifran los datos en tránsito?** Sí (HTTPS/TLS a `api.nexara.com.mx`).
- **¿Se comparten con terceros?** No se venden ni comparten con fines publicitarios. Google
  (Firebase) actúa como proveedor de procesamiento.
- **Ubicación en segundo plano:** **no** se usa — el manifiesto solo pide
  `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` en primer plano. No hay que llenar la
  declaración de ubicación en segundo plano.
- **Eliminación de datos:** ver punto 7.

### 6.6 Declaraciones que **no** aplican
- App gubernamental: No.
- Funciones financieras (préstamos, banca, cripto): **Ninguna**. El módulo de finanzas es
  contabilidad interna de la organización, no un servicio financiero al consumidor.
- Salud: No.
- Permisos sensibles: la app **no** usa `QUERY_ALL_PACKAGES`, `MANAGE_EXTERNAL_STORAGE`, SMS ni
  registro de llamadas → no hace falta el formulario de permisos restringidos.

---

## 7. URL de eliminación de cuenta

Google exige una URL **pública** (sin login) donde el usuario pueda pedir la eliminación de su
cuenta y sus datos. Ya está creada:

**https://nexara.com.mx/legal/eliminar-cuenta** →
[`apps/web/app/legal/eliminar-cuenta/page.tsx`](../apps/web/app/legal/eliminar-cuenta/page.tsx)

Cubre lo que Google revisa en esa página: nombre de la app y su package, las dos vías de
solicitud (administrador de la organización o correo directo), qué datos se eliminan, qué
información se conserva y por qué, y que desinstalar la app no borra la cuenta del servidor.

Queda enlazada desde el footer del sitio y agregada al `sitemap.ts`. **Falta desplegar web**
para que la URL responda — verifícalo antes de capturarla en Play Console:

```bash
curl -o /dev/null -w "%{http_code}\n" https://nexara.com.mx/legal/eliminar-cuenta
```

En el formulario de Seguridad de los datos marca **"Los usuarios pueden solicitar la eliminación
de sus datos"** y captura esa URL.

---

## 7.1 Cambio de código que hace posible la cuenta demo

La app móvil **no manda el header `X-Company-Id`**. `CompanyService.resolveForUser` resolvía
entonces siempre la empresa primaria y, peor, `ensureMembership` inscribía al usuario en ella —
así que una cuenta acotada a un tenant demo terminaba dentro del tenant real en su primer login.

Se ajustó [`apps/api/src/company/company.service.ts`](../apps/api/src/company/company.service.ts):
cuando no viene el header, se respeta la membresía `isDefault` del usuario si apunta a una
empresa distinta de la primaria.

- Para los usuarios existentes no cambia nada: su membresía default **es** la primaria.
- Con header explícito, la validación de membresía sigue igual.
- Un super-admin no queda fijado a ningún tenant.
- Cubierto por [`company-tenant-pin.spec.ts`](../apps/api/src/company/company-tenant-pin.spec.ts).
  Las 26 suites de `tenant|idor|auth` (68 tests) pasan.

De paso cierra una fuga real del ADR-0014: cualquier cliente que omitiera el header caía al
tenant primario y se auto-inscribía en él.

---

## 8. Alternativa: distribución privada

Si la app es solo para personal de organizaciones cliente y no quieres que sea pública, existe
**Managed Google Play** (app privada, distribuida a organizaciones específicas). Evita la revisión
de ficha pública y el escrutinio de "acceso a la app". Si el plan es que cualquier cliente nuevo
la descargue, quédate con la distribución pública.

---

## 9. Orden recomendado

1. Cuenta de organización verificada (esperar D&B) — arráncalo primero, es lo más lento.
2. **Desplegar API + web** con los cambios de este checklist: habilita
   `/legal/eliminar-cuenta` y el pinning de tenant que aísla la cuenta demo.
3. `cd apps/api && npm run seed:play-reviewer` → guardar la contraseña que imprime.
4. Probar el login del revisor en un teléfono real con el AAB de release **antes** de enviarlo, y
   confirmar que esa cuenta solo ve datos del tenant demo.
5. Crear app → completar **Contenido de la app** completo.
6. Subir AAB a **Prueba interna** → validar login, push, GPS y cámara.
7. Promover a **Producción** → países: México (y los que apliquen).
8. Revisión de Google: la primera puede tardar hasta 7 días.
