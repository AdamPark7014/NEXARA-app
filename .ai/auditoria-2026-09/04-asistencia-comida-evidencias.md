# Auditoría 04 — Asistencia, hora de comida y evidencias: móvil vs web

**Fecha:** 2026-09-06 · **Alcance:** READ-ONLY · **Rama:** limpia al iniciar (sin cambios sin commitear)

**Síntoma reportado:**
> "entré a asistencia y le da click y ya está en asistencia, cuando el proceso de asistencia es
> súper complejo, debe tomarse una foto etc. Lo mismo con hora de comida, evidencia de
> actividades etc. Se mega puso verde toda la app móvil, no concatena con la cantidad
> exhaustiva de procesos que tiene la web"

---

## 0. Veredicto en una página

El diagnóstico de Adam es **correcto para asistencia y equivocado para el resto** — y esa
asimetría es la parte importante, porque cambia por completo el tamaño del arreglo.

| Proceso | ¿La app móvil pide foto? | ¿Manda GPS? | Estado real |
|---|---|---|---|
| **Asistencia (entrada/salida)** | **NO — imposible** | Sí (best-effort) | ❌ **Roto. Un solo tap.** |
| Hora de comida | Sí (cámara obligatoria) | No (se lee y se tira) | ⚠️ Parcial |
| Evidencias de actividad | Sí (5 pasos, cámara) | Sí (pero 0,0 si se niega) | ⚠️ Parcial |

**La causa raíz de asistencia no es la app: es el contrato de la API.**

`CreateAttendanceDto` marca `photoBase64`, `latitude` y `longitude` como `@IsOptional()`.
El único campo obligatorio es `type`. La web se autoimpone la foto en la UI —no hay ningún
botón que registre sin pasar por la cámara—, pero **el servidor nunca la exigió**. La app
nativa simplemente ejerció el permiso que la API siempre concedió.

La prueba más limpia: `photoBase64` aparece exactamente en 2 lugares del monorepo —el DTO/servicio
de la API y `AttendanceForm.tsx` de la web—. **Cero ocurrencias en todo el árbol Android.**
El `data class AttendanceRegisterRequest` (`ConsoleApi.kt:263`) ni siquiera tiene un campo donde
poner una foto.

Y el arreglo es más barato de lo que parece: **la fontanería de cámara ya existe y ya funciona**.
`MediaPickerBar.kt` es un componente compartido que ya usan comida, evidencias, viáticos, CRM y
ventas. Asistencia es el único módulo de captura que nunca se conectó a él.

**Lo verde:** `ModuleCatalog.kt` lleva un booleano `nativeImplemented` puesto a mano, cuyo único
significado documentado es *"no usa PlaceholderScreen"* (`ModuleCatalog.kt:19-20`). No mide
paridad de proceso. `GovernanceScreens.kt:377-378` lo pinta como `"✓"` con color de acento
(teal `0xFF0D9488`) frente a `"—"` gris. Asistencia está marcado `nativeImplemented = true`
(`ModuleCatalog.kt:42`). De ahí sale, literalmente, el "se mega puso verde".

---

## 1. El proceso canónico

### 1.A Asistencia — entrada y salida

**Referencia web:** `apps/web/components/AttendanceForm.tsx` (739 líneas), montado en
`apps/web/app/(panels)/erp/hr/attendance/page.tsx:657`.

| # | Paso | Dónde | Detalle |
|---|---|---|---|
| 1 | Pulsar "Registrar Entrada/Salida del Día" | `AttendanceForm.tsx:632,640` | `onClick={() => openCamera('entrada')}`. **No existe ninguna otra ruta de registro.** |
| 2 | Abrir cámara | `:154-180` | `getUserMedia({video:{facingMode:'environment', width:1280, height:720}})`. Botón para voltear cámara (`:182`). |
| 3 | Capturar | `:194-234` | Dibuja a canvas, reescala a máx. 640×480, `toDataURL('image/jpeg', 0.4)`. |
| 4 | Geolocalizar | `:456-470` | `getCurrentPosition({enableHighAccuracy:true, timeout:5000})`. **Si falla, continúa sin GPS** (solo `console.warn`, `:468`). |
| 5 | POST | `:472-485` | `POST /attendance` `{type, timestamp, photoBase64, latitude, longitude}` |
| 6 | Consentimiento GPS | `:496` | `PATCH /gps/consent {enabled:true}` |
| 7 | Tracking continuo | `:276-300` | `watchPosition` → `POST /gps` con throttle de 4 s (`:239`). Activo toda la jornada. |
| 8 | Salida | `:505-513` | `stopGpsTracking()` + `PATCH /gps/consent {enabled:false}` |

Historial: la foto se muestra como miniatura **solo si existe** (`:688-690`,
`{item.photoUrl && (<img .../>)}`). Un registro sin foto no muestra nada — sin aviso, sin badge.

**Contrato API:** `POST /attendance` → `AttendanceController.register`
(`apps/api/src/attendance/attendance.controller.ts:22-30`) →
`AttendanceService.register` (`attendance.service.ts:449`).

- Guard: `ATTENDANCE_VIEW | CONSOLE_ACCESS | CONSOLE_ADMIN`.
- Entrada (`:459-508`): rechaza entrada duplicada en el mismo `workDate`; rechaza si hay
  `attendanceDay.isOpen`. Crea el registro y **marca `user.locationConsent = true` de forma
  incondicional** (`:505-508`), haya o no coordenadas. `LocationTracking` solo se crea si ambas
  coordenadas son números (`:510`).
- Salida (`:562-611`): exige jornada abierta; borra salida huérfana previa; acumula minutos;
  `locationConsent = false`.
- Integridad en base: `@@unique([companyId, userId, workDate, type])` (`schema.prisma:1411`).
- **No hay validación de horario ni de retardo en el registro.** El retardo solo se calcula en la
  vista de contraste ACS (`attendance-hybrid.match.ts:103`, oficina 09:00 MX + 15 min de gracia)
  y esa vista no escribe fichajes.

**Lo que hace Android hoy:** `ui/console/screens/ConsoleAttendanceScreen.kt` (633 líneas).

1. `ui/console/ConsoleNavHost.kt:492` → `"attendance" -> ConsoleAttendanceScreen()`.
2. Banner de permiso de ubicación (`:312-315`), `requestOnAppear = true` — **esto sí está bien**.
3. Botones (`:379`, `:392`) → `vm.checkIn("entrada"|"salida")`. **Un tap. Sin confirmación.**
4. `checkIn` (`:153-183`): `DeviceLocation.current()` best-effort → `repo.attendanceCheckIn(type, lat, lng)`.
5. Si `coords == null` **igual publica** y añade `" (sin GPS — activa ubicación)"` al mensaje de
   éxito (`:165`). El registro se crea.
6. `ConsoleRepository.kt:233-241` → `AttendanceRegisterRequest(type, timestamp, latitude, longitude)`.
   **No hay campo de foto** (`ConsoleApi.kt:263-268`).
7. No llama a `/gps/consent`. No hay tracking continuo.

### 1.B Hora de comida

**Referencia web:** `apps/web/components/LunchBreakForm.tsx` (308 líneas), montado en
`app/(panels)/erp/hr/lunch-breaks/page.tsx:730`. La página en sí es un tablero de lectura;
el formulario es el que registra.

1. Cámara `getUserMedia` (`:46`) → capturar a canvas 640×480 → `toBlob` (`:77-90`).
2. **Foto obligatoria en cliente:** `if (!photo || !user) return` (`:96`).
3. `FileReader.readAsDataURL` → base64 (`:105-113`).
4. `POST lunch-breaks/checkin {checkinTime, checkinPhotoUrl}` /
   `PUT lunch-breaks/checkout {checkoutTime, checkoutPhotoUrl}` (`:116-128`).

**Contrato API:** `attendance/lunch/lunch-breaks.controller.ts`, servicio en `lunch-breaks.service.ts`.

- `CreateLunchBreakDto` (`dto/lunch-break.dto.ts:3-9`): `checkinTime` **y `checkinPhotoUrl` son
  obligatorios** (`@IsString()` sin `@IsOptional()`). Aquí la API **sí** exige la foto.
- Ventana: check-in 15:00–16:00 (`service:33-38`), check-out esperado ≤16:05 (`:112`).
  Fuera de rango marca `isCheckinLate`/`isCheckoutLate` y escribe una nota, pero **no bloquea**.
- Un registro por usuario y día: `@@unique([companyId, userId, date])` (`schema.prisma:1465`).
- El modelo `LunchBreak` **no tiene columnas de latitud/longitud**. La comida nunca guardó GPS.
- Cron de aviso a las 14:50 L-V (`lunch-breaks.cron.service.ts:13`).

**Lo que hace Android hoy:** `ui/modules/ExtraModuleScreens.kt` → `MyLunchBreaksModuleScreen` (`:710`).

- **Sí usa cámara**: `MediaPickerBar` (`:788`) → `CapturedMedia` → `mediaToDataUrl` (`:700-707`).
- `MyLunchBreaksViewModel.checkin(photoDataUrl: String, ...)` (`:653`) — parámetro **no nulable**.
- Lee GPS (`:658`) **y lo tira**: solo lo usa para componer el texto del mensaje (`:660-664`).
  Nunca viaja en el body. (Coherente: el modelo no tiene dónde guardarlo.)
- Paridad de foto: ✅.

### 1.C Evidencias de actividad — el flujo de 5 pasos

**Referencia web:** `apps/web/components/ActivityEvidenceFlow.tsx` (1610 líneas).
Máquina de estados en `ActivityEvidence.status` (`schema.prisma:1167-1200`).

| Paso | Estado | Exige | Validación servidor |
|---|---|---|---|
| 1 | `ENTRY_PHOTO` | Foto + lat/lng | `activity-evidence.service.ts:319-342` — **solo comprueba el paso, NO valida GPS ni foto** |
| 2 | `EVIDENCE_PHOTOS` | 4–8 fotos (1 si `workType = PREVENTIVE_INVENTORY`) | `:347-380` — sí valida cantidad |
| 3 | `SERVICE_SHEET_PDF` | PDF de hoja de servicio | `:383-400` — solo comprueba el paso |
| 4 | `SERVICE_SHEET_DATA` | Plantilla interna rellenada | `:403-420` — solo comprueba el paso |
| 5 | `EXIT_PHOTO` | Foto + lat/lng | `:423-450` — **sí exige GPS** (`Number.isFinite`) |
| — | `COMPLETED` | — | Marca la actividad `estatus: 'Pendiente'` para revisión (`:453-458`) |

Web adjunta geolocalización en los pasos 1 y 5 (`ActivityEvidenceFlow.tsx:467`, `:763`).

**Lo que hace Android hoy:** `ui/console/screens/ConsoleEvidencesScreen.kt` (1279 líneas).
Implementa **los 5 pasos**, secuenciales y bloqueados por
`enabled = state.uploadingStep == null && currentStep == "<STEP>"`. Aprobación/rechazo de admin
incluidos. Es, con diferencia, el módulo más completo de los tres — pero con cuatro defectos
serios (§3, D-09 a D-12) y un enlace de escape a la web en `:786`.

---

## 2. Tabla de brecha — Web exige / API exige / Android hace

### Asistencia

| # | Paso del proceso | Web exige | API exige | Android hace | |
|---|---|---|---|---|---|
| 1 | Foto de rostro/entorno | **Sí — única ruta** (`AttendanceForm:632`) | **No** (`create-attendance.dto.ts:11-13` `@IsOptional`) | **Nada. No existe el campo** (`ConsoleApi.kt:263`) | ❌ |
| 2 | Cámara trasera 1280×720 | Sí (`:159-165`) | n/a | n/a | ❌ |
| 3 | Reescalado 640×480 q0.4 | Sí (`:205-225`) | No | n/a | ❌ |
| 4 | Geolocalización | Best-effort (`:456`) | No (`@IsOptional`) | Best-effort (`ConsoleAttendanceScreen:157`) | ⚠️ |
| 5 | Pedir permiso de ubicación | Navegador | n/a | Sí, banner (`:312`) | ✅ |
| 6 | Consentimiento GPS explícito | Sí, `PATCH /gps/consent` (`:496`) | Lo fuerza a `true` igual (`service:505`) | **No lo llama** | ❌ |
| 7 | Tracking continuo en jornada | Sí, `watchPosition` (`:276`) | n/a | **No** | ❌ |
| 8 | Timestamp | Cliente (`:474`) | Opcional, default `now()` | Cliente (`ConsoleRepository:237`) | ✅ |
| 9 | Entrada duplicada bloqueada | — | Sí (`service:460`, y `@@unique`) | Hereda del servidor | ✅ |
| 10 | Salida sin entrada bloqueada | — | Sí (`service:565`) | Hereda del servidor | ✅ |
| 11 | Confirmación antes de registrar | Implícita (capturar foto) | n/a | **Ninguna. Un tap** | ❌ |
| 12 | Validar horario / retardo | No | No (solo vista ACS) | No | ✅ (paridad en el vacío) |

**Resultado: 6 ❌ · 1 ⚠️ · 5 ✅.** Los cinco ✅ son controles que vive el servidor, no la app.

### Hora de comida

| # | Paso | Web exige | API exige | Android hace | |
|---|---|---|---|---|---|
| 1 | Foto de check-in | Sí (`LunchBreakForm:96`) | **Sí** (`dto:8` sin `@IsOptional`) | Sí (`ExtraModuleScreens:788`) | ✅ |
| 2 | Foto de check-out | Sí (mismo formulario) | **Sí de facto** — ver D-05 | Sí | ⚠️ |
| 3 | Ventana 15:00–16:00 | No valida | Marca tarde, no bloquea (`service:38`) | No valida | ✅ |
| 4 | Geolocalización | No | No (no hay columna) | Se lee y se tira (`:658-664`) | ✅ |
| 5 | Un registro por día | — | Sí (`@@unique`) | Hereda | ✅ |
| 6 | Reescalado de imagen | Sí, 640×480 (`:81`) | No | **No — foto completa** (D-12) | ❌ |

### Evidencias de actividad

| # | Paso | Web exige | API exige | Android hace | |
|---|---|---|---|---|---|
| 1 | Foto de entrada | Sí | No valida foto ni GPS (`service:319`) | Sí | ✅ |
| 2 | GPS en entrada | Sí (`:467`) | **No valida** | Sí, pero `0.0,0.0` si se niega (D-11) | ⚠️ |
| 3 | 4–8 fotos de evidencia | Sí | **Sí** (`service:357-367`) | **Manda 1 por llamada** (D-10) | ❌ |
| 4 | PDF hoja de servicio | Sí | Solo orden de paso | Sí, MIME comprobado | ✅ |
| 5 | Plantilla interna | Formulario real | Acepta cualquier `body` | **Stub fijo** (`ConsoleEvidencesScreen:277-281`) | ❌ |
| 6 | Foto de salida | Sí | Solo orden de paso | Sí | ✅ |
| 7 | GPS en salida | Sí (`:763`) | Sí, `Number.isFinite` (`service:436`) | Sí, pero `0.0,0.0` pasa el guard (D-11) | ⚠️ |
| 8 | Permiso de cámara en runtime | Navegador | n/a | **Nunca se pide** (D-09) | ❌ |
| 9 | Secuencialidad de pasos | Sí | Sí | Sí | ✅ |

---

## 3. Defectos

Severidad: **CRÍTICO** = datos de nómina/cumplimiento corruptos · **ALTO** = el proceso no se
puede completar o se completa mal · **MEDIO** = degradación · **BAJO** = higiene.

### D-01 · CRÍTICO · La API no exige foto en asistencia
`apps/api/src/attendance/dto/create-attendance.dto.ts:11-21`
```ts
@IsOptional()
@IsString({ message: 'photoBase64 debe ser un string' })
photoBase64?: string;
```
`photoBase64`, `latitude` y `longitude` son opcionales. El único campo obligatorio es `type`.
Cualquier cliente autenticado con `ATTENDANCE_VIEW` puede crear una asistencia válida con
`{"type":"entrada"}`. **Esta es la causa raíz del síntoma.** La web se disciplina sola en la UI;
la API nunca respaldó esa disciplina.

### D-02 · CRÍTICO · La app Android no puede mandar foto de asistencia
`apps/mobile-native/android/app/src/main/java/mx/nexara/mobile/nativeapp/data/api/ConsoleApi.kt:263-268`
```kotlin
data class AttendanceRegisterRequest(
    val type: String,
    val timestamp: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
)
```
No existe el campo. `ConsoleAttendanceScreen.kt:379` registra con **un solo tap**, sin cámara ni
confirmación. `MediaPickerBar` —ya usado por comida, evidencias y viáticos— nunca se importó aquí.

### D-03 · ALTO · `locationConsent` se marca `true` sin coordenadas
`apps/api/src/attendance/attendance.service.ts:505-508`
```ts
await this.prisma.user.update({
  where: { id: userId },
  data: { locationConsent: true },
});
```
Se ejecuta incondicionalmente en toda entrada, incluso cuando el body no traía `latitude` ni
`longitude`. La base afirma un consentimiento de geolocalización que el usuario nunca otorgó por
esa vía. Implicación legal, no solo de datos.

### D-04 · ALTO · Los fichajes de la app nativa se registran como "Escritorio · PC"
`apps/mobile-native/.../data/api/ApiClient.kt:21-49` no fija `User-Agent` ni cabeceras
`X-Device-*`. OkHttp manda `okhttp/4.12.0`. En
`apps/api/src/common/device-detector.ts:39-100`: `kind='Escritorio'` (la UA no contiene
`mobile|android`), `os=''`, `browser=''`, `model='PC'` → `summary = "Escritorio · PC"`.

Consecuencia doble: los fichajes móviles **se registran como PC de escritorio**, y no queda
ninguna marca fiable para auditar qué registros vinieron de la app. Ver §4.

### D-05 · ALTO · `checkoutPhotoUrl` es opcional en TypeScript y obligatorio en runtime
`apps/api/src/attendance/lunch/dto/lunch-break.dto.ts:11-17`
```ts
export class UpdateLunchBreakDto {
  @IsISO8601()
  checkoutTime!: string;

  @IsString()
  checkoutPhotoUrl?: string;   // ← '?' dice opcional; @IsString() sin @IsOptional() lo exige
}
```
El `?` de TypeScript no le dice nada a `class-validator`. Con el `ValidationPipe` global
(`main.ts:311-321`), un check-out sin foto devuelve **400**. El tipo miente sobre el contrato;
el comentario del modelo Prisma (`schema.prisma:1454`, *"Foto opcional al volver"*) miente en
sentido contrario. Tres fuentes, tres respuestas.

### D-06 · ALTO · La ventana de comida se calcula en UTC, no en hora de México
`apps/api/src/attendance/lunch/lunch-breaks.service.ts:16-17,33-36`
```ts
const today = new Date();
today.setHours(0, 0, 0, 0);          // ← hora local del contenedor = UTC
...
lunchStartHour.setHours(15, 0, 0, 0);
lunchEndHour.setHours(16, 0, 0, 0);
```
Este es exactamente el bug que ya se corrigió en asistencia y quedó documentado en
`apps/api/src/common/time/workday.ts:1-18` (*"10 de 15 registros caían en un día distinto"*).
**`lunch-breaks.service.ts` no importa `workday.js`.** Con el contenedor en UTC, la "ventana de
15:00 a 16:00" es en realidad **09:00–10:00 hora de México**, así que prácticamente todos los
check-ins reales se marcan `isCheckinLate = true`. El `date` del `@@unique` también se resuelve
en UTC, desalineado con el `workDate` de asistencia.

### D-07 · ALTO · Los endpoints del flujo de evidencias no validan nada
`apps/api/src/activities/evidence/activity-evidence.controller.ts:75-162`
```ts
@Post(':activityId/entry-photo')
async saveEntryPhoto(
  @Param('activityId') activityId: string,
  @Body() body: { photoUrl: string; latitude: number; longitude: number },
```
Un *type literal* de TypeScript no deja metadatos en runtime: el `metatype` que ve el
`ValidationPipe` es `Object`, y NestJS **salta la validación por completo**. Afecta a
`entry-photo`, `evidence-photos`, `service-sheet-pdf`, `service-sheet-data`, `exit-photo`,
`evidence-photo/:index`, `approve`, `reject` y `resubmit`. Un `POST {}` a `entry-photo` guarda
`entryPhotoUrl = undefined` sin protestar, porque `saveEntryPhoto` (`service:319-342`) tampoco
comprueba la foto.

### D-08 · ALTO · El guard de GPS de la foto de salida no detecta la Isla Nula
`apps/api/src/activities/evidence/activity-evidence.service.ts:436-438`
```ts
if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
  throw new BadRequestException('La ubicación GPS es obligatoria para la foto de salida');
}
```
`Number.isFinite(0)` es `true`. El guard comprueba *finitud*, no *validez*. Combinado con D-11
—la app manda `0.0, 0.0` cuando se niega el permiso— el único control de geolocalización de todo
el flujo de evidencias deja pasar precisamente el caso que debía atrapar. Además, la foto de
entrada no tiene ningún guard equivalente (`service:319-342`).

### D-09 · ALTO · Nunca se pide el permiso de cámara en el camino de evidencias
`apps/mobile-native/.../ui/common/MediaPickerBar.kt:57-62,86-95` lanza
`ActivityResultContracts.TakePicture()` sin comprobar ni solicitar
`Manifest.permission.CAMERA`. El manifiesto **sí lo declara** (`AndroidManifest.xml:8`), y cuando
una app declara `CAMERA`, Android exige que esté *concedido* para honrar `ACTION_IMAGE_CAPTURE`.
El único sitio que lo solicita es `BarcodeScannerScreen.kt:59,68,84`. Un usuario que nunca haya
abierto el escáner de códigos se topa con un fallo silencioso: `TakePicture` devuelve
`success = false`, `MediaPickerBar.kt:61` lo descarta y **no se muestra ningún error**.

### D-10 · ALTO · El paso 2 no puede cumplir el mínimo de 4 fotos
`ConsoleEvidencesScreen.kt:702-714`. El botón dice *"2) Subir fotos de evidencia (4+)"* pero se
configura `allowCamera = true, allowGallery = false, allowDocuments = false`. `TakePicture`
devuelve exactamente un URI (`MediaPickerBar.kt:61`) y el handler cierra el picker tras enviar
(`:710`). Cada envío manda un `photoUrls` de **un elemento**, y la API exige ≥4 por llamada
(`activity-evidence.service.ts:361-363`). El paso 2 es inalcanzable desde Android.

### D-11 · ALTO · Sin permiso de GPS la app publica coordenadas 0,0
`ConsoleEvidencesScreen.kt:202-223` (y `:294-323` para la salida)
```kotlin
fun submitEntryPhoto(activityId: Long, photoDataUrl: String, lat: Double = 0.0, lng: Double = 0.0) {
    ...
    val useLat = coords?.lat ?: lat      // coords == null si se negó el permiso → useLat = 0.0
```
`ActivityEvidencePhotoStepRequest.latitude/longitude` son `Double` **no nulables**
(`ConsoleApi.kt:973-977`): no hay forma de expresar "sin GPS". El resultado es que una evidencia
sin ubicación se guarda como una lectura legítima en el golfo de Guinea. **Peor que un hueco:
es un dato falso**, y con D-08 pasa el único control que existía.

### D-12 · MEDIO · Fotos en base64 dentro del JSON, sin comprimir
`ConsoleEvidencesScreen.kt:511-517`, `ExtraModuleScreens.kt:700-707`,
`ActivityDetailTabs.kt:292-297`, `ConsoleViaticsScreen.kt:268-272`: leen el archivo entero y lo
codifican con `Base64.encodeToString(bytes, NO_WRAP)`. Sin reescalado, sin compresión, sin tope de
tamaño. Un JPEG de 4 MB se convierte en ~5.5 MB de string en un solo POST, desde campo y por datos
móviles. La web reescala a 640×480 con calidad 0.4 antes de mandar. Y el propio monorepo ya tiene
endpoints `@Multipart` funcionando (`ChatApi.kt:169`, `BranchPortalApi.kt:37`, `TicketsApi.kt:337`).

### D-13 · MEDIO · Las fotos de asistencia y comida se guardan como base64 en la columna
`attendance.service.ts:481` y `:589` → `photoUrl: dto.photoBase64 || null`.
`lunch-breaks.service.ts:54,69` → `checkinPhotoUrl: data.checkinPhotoUrl`.
El data-URL entero va a una columna `String` de Postgres. El helper que resuelve esto,
`saveBase64Photo` (`common/file-upload.util.ts:9`), **existe y solo lo usa activity-evidence**
(`activity-evidence.controller.ts:85,106,152,175`). Dos fichajes al día por empleado, a ~40–80 KB
de base64 cada uno, crecen sin techo en una tabla de la que sale la nómina.

### D-14 · MEDIO · El gate de cierre de actividad mira la tabla equivocada
`apps/api/src/activities/activities.service.ts:779-800` consulta `prisma['evidence']` —el modelo
**legacy** `Evidence`, por `tipoEvidencia`— para decidir si una actividad puede pasar a
*Finalizada*. Pero el flujo de 5 pasos escribe en `ActivityEvidence`, un modelo distinto, y al
completarse actualiza la actividad con un `prisma.activity.update` directo
(`activity-evidence.service.ts:453-458`) que **no pasa por ese gate**. Dos sistemas de evidencia
en paralelo y un control que solo cubre el que ya no se usa.
Además, `evidence-close-gate.armor.spec.ts:2-11` **reimplementa la lógica dentro del propio test**
en vez de importar la de producción: el test pasa aunque el gate se rompa.

### D-15 · MEDIO · `PATCH /evidences/:id` rechaza cualquier body
`apps/api/src/evidences/dto/update-evidence.dto.ts` y `create-evidence.dto.ts` son clases planas,
**sin un solo decorador de `class-validator`**. El pipe global corre con
`whitelist: true, forbidNonWhitelisted: true` (`main.ts:313-314`): sin decoradores, ninguna
propiedad está en la lista blanca, así que toda propiedad enviada dispara
*"property X should not exist"* → 400. Afecta a `evidences.controller.ts:142`
(`@Body() updateEvidenceDto: UpdateEvidenceDto`). Latente: el panel `ops/evidences` es hoy una
redirección de 22 líneas, así que probablemente nadie lo esté pegando — pero el endpoint está roto.

### D-16 · BAJO · `nativeImplemented` promete paridad que no mide
`ModuleCatalog.kt:19-20` documenta el flag como *"Marcador informativo: ya implementado nativo
(no usa placeholder)"*. `GovernanceScreens.kt:377-378` lo pinta como `"✓"` con color de acento vs
`"—"` gris, y `:371` cuenta "N módulos nativos". Asistencia figura como
`nativeImplemented = true` (`ModuleCatalog.kt:42`) teniendo 6 de 12 pasos ausentes. El flag es un
booleano a mano sin relación con el proceso real. **Es el origen directo del "se mega puso verde".**

### D-17 · BAJO · La comida lee el GPS y lo descarta
`ExtraModuleScreens.kt:658,678`: llama a `DeviceLocation.current()` y solo usa el resultado para
componer el sufijo del mensaje de éxito (`:660-664`). Nunca viaja en el body — coherente con que
`LunchBreak` no tenga columnas de coordenadas, pero el usuario lee *"· GPS ±12m"* y concluye
razonablemente que su ubicación quedó registrada. No quedó.

### D-18 · BAJO · Duplicados en `build.gradle.kts`
`apps/mobile-native/android/app/build.gradle.kts`: `activity-compose` declarado en L117 y L168;
`datastore-preferences` en dos versiones, `1.1.1` (L144) y `1.1.7` (L146).

---

## 4. Integridad de datos

**¿Quedan registros incompletos?** Sí, necesariamente. Todo fichaje hecho desde la app nativa
tiene `photoUrl = NULL` (D-01 + D-02), porque no hay ninguna ruta por la que pudiera traer foto.

**¿Se distinguen del resto?** **No de forma fiable, y ahí está el problema.** `deviceInfo` —el
campo natural para separarlos— resuelve a `"Escritorio · PC"` para la app nativa (D-04), que es
indistinguible de un navegador de escritorio sin User-Agent reconocible. El mejor discriminante
disponible es indirecto: `photoUrl IS NULL`, que también captura fichajes web anteriores a la
introducción de la cámara y las entradas sugeridas desde ACS
(`attendance.service.ts:344-447`, que sí se marcan con `deviceInfo = "ACS Integra (sugerido RH #N)"`).

**Cómo auditarlo.** Consultas de solo lectura para dimensionar el daño antes de decidir nada:

```sql
-- 1. Cuántos fichajes no tienen foto, por mes y por deviceInfo
SELECT date_trunc('month', "timestamp") AS mes,
       "deviceInfo",
       count(*) FILTER (WHERE "photoUrl" IS NULL) AS sin_foto,
       count(*) AS total
FROM "Attendance"
GROUP BY 1, 2 ORDER BY 1 DESC, 4 DESC;

-- 2. Sospechosos de app nativa: sin foto Y sin geo, con deviceInfo de escritorio
SELECT date_trunc('day', "timestamp") AS dia, count(*)
FROM "Attendance"
WHERE "photoUrl" IS NULL
  AND "entryLatitude" IS NULL AND "exitLatitude" IS NULL
  AND "deviceInfo" = 'Escritorio · PC'
GROUP BY 1 ORDER BY 1 DESC;

-- 3. Consentimiento de ubicación afirmado sin una sola coordenada (D-03)
SELECT u.id, u.email, u."locationConsent"
FROM "User" u
WHERE u."locationConsent" = true
  AND NOT EXISTS (SELECT 1 FROM "LocationTracking" lt WHERE lt."usuarioId" = u.id);

-- 4. Evidencias en la Isla Nula (D-11 + D-08)
SELECT id, "activityId", "entryLatitude", "exitLatitude", "createdAt"
FROM "ActivityEvidence"
WHERE ("entryLatitude" = 0 AND "entryLongitude" = 0)
   OR ("exitLatitude"  = 0 AND "exitLongitude"  = 0);

-- 5. Comidas marcadas tarde — con D-06 se espera un porcentaje absurdo
SELECT count(*) FILTER (WHERE "isCheckinLate") AS tarde, count(*) AS total
FROM lunch_breaks;
```

Si la consulta 5 devuelve casi todo marcado como tarde, es el bug de zona horaria (D-06), no la
gente llegando tarde — y conviene revisar si esas notas alimentaron sanciones o descuentos.

**Recomendación de trazabilidad:** añadir una columna `source` a `Attendance`
(`web` | `mobile-native` | `acs-suggested` | `manual`) escrita en el servidor a partir de una
cabecera `X-Client-Platform` que fije el `ApiClient` de Android. Sin eso, cualquier limpieza
retroactiva es adivinanza. Es también la única forma de medir si el arreglo funcionó.

---

## 5. Especificación del flujo móvil correcto — asistencia

Suficiente detalle para implementar sin volver a investigar. Se apoya en componentes que **ya
existen y ya funcionan en este repo**.

### 5.1 Cambios en la API (hacerlos primero — sin esto, la app puede volver a saltárselo)

**a) Endurecer el DTO** — `apps/api/src/attendance/dto/create-attendance.dto.ts`
```ts
@IsString({ message: 'La foto es obligatoria para registrar asistencia' })
@Matches(/^data:image\/(jpeg|png|webp);base64,/, { message: 'photoBase64 debe ser un data URL de imagen' })
photoBase64!: string;                    // quitar @IsOptional

@IsNumber() @Min(-90)  @Max(90)  latitude!: number;    // quitar @IsOptional
@IsNumber() @Min(-180) @Max(180) longitude!: number;   // quitar @IsOptional
```
Rechazar además `latitude === 0 && longitude === 0` en el servicio (la lección de D-08/D-11:
*finito no es válido*).

> **Migración obligatoria:** endurecer el DTO **rompe la app instalada en los teléfonos**, que
> nunca manda foto. Publicar el cambio de app **antes** que el de API, o proteger el endurecimiento
> con un flag por empresa hasta confirmar que no quedan clientes viejos fichando.

**b)** Guardar la foto en disco con `saveBase64Photo` (`common/file-upload.util.ts:9`), como ya
hace activity-evidence, en vez de meter el base64 en la columna (D-13).

**c)** Mover `locationConsent = true` dentro del bloque que ya comprueba las coordenadas
(`attendance.service.ts:510`), no antes (D-03).

**d)** Añadir `source` a `Attendance` + leer `X-Client-Platform` en el controlador (§4).

### 5.2 Cambios en Android

**Contrato** — `data/api/ConsoleApi.kt:263`
```kotlin
data class AttendanceRegisterRequest(
    val type: String,
    val timestamp: String? = null,
    val photoBase64: String,        // ← NUEVO, no nulable
    val latitude: Double,           // ← ahora no nulable
    val longitude: Double,
)
```
No nulables a propósito: hacen imposible construir la petición sin foto ni coordenadas. El
compilador pasa a sostener la regla de negocio.

**Repositorio** — `data/console/ConsoleRepository.kt:233`
```kotlin
suspend fun attendanceCheckIn(type: String, photoBase64: String, lat: Double, lng: Double) =
    api.postAttendance(AttendanceRegisterRequest(
        type = type,
        timestamp = java.time.Instant.now().toString(),
        photoBase64 = photoBase64,
        latitude = lat,
        longitude = lng,
    ))
```

**Pantallas.** Sustituir el botón de un tap (`ConsoleAttendanceScreen.kt:379,392`) por una
secuencia de tres pantallas:

**Pantalla 1 — Preparación** *(reemplaza el botón actual)*
- Muestra: estado de la jornada (`state.current.isOpen`), hora actual, y **dos semáforos previos**:
  permiso de cámara y precisión de GPS actual.
- `LocationPermissionBanner` ya está puesto (`:312`) — **conservarlo**.
- **Añadir un gate de permiso de cámara** (no existe hoy, D-09): reutilizar el patrón de
  `BarcodeScannerScreen.kt:59-84` con `ActivityResultContracts.RequestPermission()`.
- Botón "Registrar entrada" habilitado **solo** con cámara concedida y ubicación concedida.
  Si falta alguno, el botón explica cuál y ofrece pedirlo. **Nunca degradar en silencio.**

**Pantalla 2 — Captura**
- `MediaPickerBar(allowCamera = true, allowGallery = false, allowDocuments = false)`.
  Galería deshabilitada a propósito: una foto de asistencia elegida del carrete no es evidencia.
- **Manejar `success = false`** (hoy se descarta sin avisar, `MediaPickerBar.kt:61`): mostrar
  "No se pudo tomar la foto" y volver a la pantalla 1.
- **Reescalar antes de codificar** — paridad con la web (640×480, JPEG calidad 0.4) y arreglo de
  D-12. `mediaToDataUrl` (`ExtraModuleScreens.kt:700`) necesita un paso de `BitmapFactory` con
  `inSampleSize` + `compress(JPEG, 40, ...)` antes del Base64. Conviene extraerlo a un helper
  compartido: hoy está copiado en cuatro archivos.
- Vista previa con "Repetir" / "Usar esta foto".

**Pantalla 3 — Confirmación**
- Muestra miniatura, hora exacta, coordenadas con su precisión (`DeviceCoords.accuracyM`) y el
  tipo de movimiento.
- **Obtener el GPS aquí, no antes**, y **bloquear si `DeviceLocation.current()` devuelve `null`**.
  Mensaje: "No se pudo obtener tu ubicación. Actívala e inténtalo otra vez." Sin ruta de escape:
  es lo contrario de lo que hace hoy `ConsoleAttendanceScreen.kt:165`.
- Si `accuracyM > 100`, avisar y ofrecer reintentar antes de enviar.
- Botón "Confirmar entrada" → POST. Deshabilitado mientras `checkInLoading`.

**Paridad de consentimiento GPS** *(pasos 6-7 de la tabla)*: tras una entrada correcta, llamar a
`PATCH /gps/consent {enabled:true}`; tras una salida, a `{enabled:false}`. El tracking continuo
en segundo plano es una decisión de producto aparte —requiere `FOREGROUND_SERVICE_LOCATION` y
justificación ante Play— y **debería consultarse con Adam antes de implementarlo**; el resto de
esta especificación no depende de ello.

### 5.3 Comida y evidencias — arreglos acotados

- **Comida:** reescalar la foto antes del base64 (D-12). Decidir si `checkoutPhotoUrl` es
  obligatoria y hacer que DTO, tipo TS y comentario de Prisma digan **lo mismo** (D-05).
  Corregir la zona horaria importando `workday.js` (D-06) — es el arreglo de mayor impacto por
  línea de código de todo el informe.
- **Evidencias:** permitir multi-captura en el paso 2 (D-10); pedir permiso de cámara (D-09);
  hacer que las coordenadas sean nulables y bloquear el envío sin GPS en lugar de mandar `0,0`
  (D-11); implementar el formulario real del paso 4 en vez del stub.

### 5.4 Higiene del catálogo

Sustituir el booleano `nativeImplemented` por algo que no pueda mentir — p. ej.
`parity: FULL | PARTIAL | READ_ONLY | PLACEHOLDER` — y marcar asistencia como `PARTIAL` hasta que
lo anterior esté hecho. Mientras el flag siga siendo binario y a mano, el panel de gobernanza
volverá a ponerse verde solo (D-16).

---

## 6. Orden sugerido

1. **Medir antes de tocar** — correr las consultas de §4. Cuántos fichajes sin foto hay, desde
   cuándo, y si las notas de comida tardía alimentaron sanciones.
2. **D-06** (zona horaria de comida) — una línea de import, arregla datos que ya están mal.
3. **D-03** (consentimiento falso) — mover tres líneas dentro de un `if`.
4. **D-02 + 5.2** (foto en asistencia móvil) — el síntoma que reportó Adam.
5. **D-01 + 5.1** (endurecer la API) — **después** de publicar la app, o tras un flag.
6. **D-09/D-10/D-11** (evidencias) — el módulo más completo, con los fallos más silenciosos.
7. **D-04 + `source`** — trazabilidad, para poder demostrar que 4 y 5 funcionaron.

**Dos decisiones que necesitan a Adam, no a un agente:**
- Qué hacer con los fichajes históricos sin foto: ¿se anulan, se marcan, se dejan?
  Sale nómina de esa tabla.
- Si el tracking continuo de ubicación debe existir en la app nativa (implicaciones de Play Store
  y de privacidad laboral que exceden la paridad técnica).

---

*Auditoría de solo lectura. No se modificó ningún archivo fuente.*
