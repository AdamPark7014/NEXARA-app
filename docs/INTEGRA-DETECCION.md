# INTEGRA · Qué detecta el hardware y qué usamos

Catálogo levantado el 2026-09-04 contra el doc set del fabricante
(`HIKVISION-apps/docs/API-DOCS/HIKVISION/HikGateway/docs/API_Developer
Guide_V1.8.0_20250109.PDF`) y contra las mediciones de `INTEGRA-LAN.md`.

## Cómo leer este documento

Tres niveles de evidencia, y **no conviene mezclarlos**:

| Nivel | Significa |
|---|---|
| **DOC-EVENTO** | El fabricante documenta el `eventType` y su payload (Apéndices A y B) |
| **DOC-ACS** | Tabla oficial `major`/`minor` de control de acceso (Apéndice C) |
| **MEDIDO** | Alguien lo probó contra los equipos reales de Oficinas |
| **NO VERIFICADO** | Nadie lo ha preguntado nunca al equipo. **No es lo mismo que «no soportado»** |

## El cuello de botella del sistema entero — RESUELTO 2026-09-05

Era esto, dentro de `ensureSmartEventTriggersCenter`:

```ts
['fielddetection', 'linedetection', 'facedetection', 'VMD', 'videoloss']
```

Cinco tipos. **Nada fuera de esa lista llegaba jamás**, aunque el equipo lo
soportase y estuviera encendido. Era el único punto del sistema donde se decidía
qué existe, y eran cinco cadenas sueltas escondidas dentro de una función.

Ahora es `SMART_EVENT_TYPES`, constante exportada en
`apps/api/src/hikvision-isapi/isapi.detection.ts`, con el catálogo completo del
Apéndice B (`APPENDIX_B_EVENT_TYPES`) al lado. Un perfil de cámara puede
ampliarla —`resolveTriggerEventTypes`—, pero **solo con valores del catálogo
documentado**: lo demás se descarta en silencio y el PATCH devuelve 400.

`GET /ISAPI/Smart/capabilities` ya se llama: `probeSmartCapabilities` +
`POST /integra/detection/capabilities/probe`, y el resultado se persiste en
`integra_camera_capabilities` **en columnas reales**, no en un `raw` opaco. Cada
flag es tri-estado: `true`/`false` = el equipo lo dijo; `NULL` = el equipo **no
lo dijo**, que sigue sin ser «no soportado». Loitering, regionEntrance,
regionExiting, unattendedBaggage, attendedBaggage, group, defocus,
scenechangedetection, audioexception y peopleCounting pasan de NO VERIFICADO a
«pendiente de sondear», y el sondeo ya es un botón.

## Dos campos del payload que se ignoraban — RESUELTO 2026-09-05

Ambos están **documentados** (Apéndice A.49, campos requeridos) y el parser los
tiraba. Ahora se parsean (`integra-push.parse.ts`), se persisten en
`integra_push_events` y salen en `listEvents` / SSE:

- **`eventState`** ∈ `active` | `inactive` — el equipo avisa cuándo el objetivo
  **se va**. `_DetectionOverlay.tsx` lo adivinaba con heurística de TTL
  (`BOX_TTL_OPTICAL_MS = 15_000`) y de ahí venían los fantasmas en las sillas.
  Con el campo en el DTO, el overlay puede borrar la caja cuando lo dice el
  equipo en vez de esperar quince segundos.
- **`activePostCount`** — cuántas veces se repitió la misma alarma. Sirve para
  agrupar duplicados sin inventar heurística.

`GET /integra/push/events?eventState=active` filtra por el campo.

## Por equipo

| Equipo | Soporta | Evidencia |
|---|---|---|
| 8 × DS-2CD2123G2 AcuSense `.171-.178` | FieldDetection, LineDetection, FaceDetect **MEDIDO OK**. `detectionTarget=human,vehicle`. Audio presente pero `enabled=false` de fábrica | `INTEGRA-LAN.md:230,262` |
| DS-2DF8C442 PTZ `.179` | **Solo** `motionDetection`. `Smart/FieldDetection\|LineDetection` → **403 notSupport**. Único con audio real (PCMU) | `INTEGRA-LAN.md:255-258` |
| DS-7616NXI NVR `.34` | FieldDetection OK en canales PoE **1, 2, 9, 10**. Canal 13 (PTZ) → 403. `httpHosts` solo HTTP:80 | `INTEGRA-LAN.md:259-261` |
| 4 × DS-K1T `.160-.163` | `AccessControllerEvent` completo. `.162/.163` con huella | `INTEGRA-LAN.md:250-253` |

Lo que **no existe** en el enum ISAPI y no se puede prometer: HeatMap,
QueueDetection, ANPR/LPR. Son capacidades de plataforma (HCT) o de cámara ITC.
Este sitio es ISAPI puro. El ANPR ya se descartó por medición: PTZ da 403 y las
AcuSense no llevan ITC.

Y `audioexception` **no es «grito» ni «cristal roto»**: su payload es
`alarmType` ∈ `audioLost` | `decrease` | `increase` más `audioDecibel`. Es un
umbral de decibelios. Conviene no venderlo como otra cosa.

## Dónde muere lo óptico

`integra-push.service.ts:1227`:

```ts
if (ev.eventType === 'AccessControllerEvent' && ev.major === 5)
```

**Ninguna detección de cámara alimenta jamás una regla de negocio.**
`integra-event-router.ts:136-144` lo remacha: cualquier `eventType` distinto
retorna `routes: []`, `reasons: ['not_acs']`. Y `SocAlarmKind` son dos:
`DENIED` y `AFTER_HOURS`, ambos de ACS. Cero alarmas de cámara.

La buena noticia: el parser (`integra-push.parse.ts:89-152`) **ya es genérico**.
`loitering`, `regionEntrance` y `regionExiting` traen el payload idéntico a
`fielddetection`, así que funcionarían sin tocar una línea del parseo. Lo único
que falta es la etiqueta y el trigger.

## Sospecha grave sobre los códigos ACS

La tabla oficial (Apéndice C) contradice a las constantes del código
(`integra-push.service.ts:45-47`, `integra-push.parse.ts:36-47`):

| minor | Tabla oficial | Lo que asume NEXARA |
|---|---|---|
| 1 | Valid Card Authentication | concedido ✅ |
| 75 | Face Authentication **Completed** | concedido ✅ |
| **76** | Face Authentication **FAILED** | **concedido (salida)** ❌ |
| 21 / 22 | Puerta desbloqueada / bloqueada | denegado ❌ |
| 23 / 24 | Botón de salida pulsado / soltado | denegado ❌ |
| **27** | **Puerta abierta anormalmente (forzada)** | denegado ❌ |
| **28** | **Puerta abierta demasiado tiempo** | denegado ❌ |

Y las denegaciones **reales** — `6` sin permiso, `7` fuera de horario,
`8` credencial caducada, `9` tarjeta inexistente, `10` antipassback, `80` fallo
de reconocimiento, `104` antifraude facial, `113` lista negra, `152` empleado
inexistente — caen hoy en `unknown_minor` y **se descartan enteras**
(`integra-event-router.ts:154-156`).

**Impacto si se confirma:** cada fallo de rostro se registra como salida
concedida, cierra la jornada en asistencia y limpia presencia. El KPI de
denegados y la cola SOC se disparan con pulsaciones del botón de salida. Y
antipassback, vigencia caducada y puerta forzada **ya están llegando hoy**,
mal etiquetados.

**Antes de cambiar nada, contrastar contra datos reales.** Los comentarios del
código dicen «verificado», y que `1` y `75` coincidan con la tabla es buena
señal de que la tabla es la buena — pero un `SELECT minor, count(*) FROM
integra_push_events WHERE major = 5 GROUP BY minor` zanja la discusión en cinco
minutos sin tocar hardware. **Si los datos contradicen a la documentación, gana
el dato.**

## Orden de trabajo por valor ÷ esfuerzo

| # | Apuesta | Días | Por qué |
|---|---|---|---|
| 1 | Auditar los `minor` contra datos reales | 0,5 | **PENDIENTE.** Prerrequisito. Ni toca hardware ni escribe código |
| 2 | Corregir el mapa de minors | 1,5 | **PENDIENTE.** Arregla asistencia, presencia, aforo, KPI y cola SOC de un golpe |
| 3 | Alarmas de puerta forzada / mantenida / antipassback / caducada / coacción | 1 | **PENDIENTE.** Los eventos ya están en la base: es etiquetar y encolar |
| 4 | Salud de cámara: `shelteralarm` + `defocus` + `scenechangedetection` | 1 | **YA SE PUEDE** sin tocar código: los tres están en el catálogo y se añaden por perfil |
| 5 | Leer y persistir `eventState` | 1 | ✅ **HECHO 2026-09-05** |
| 6 | Sondear `Smart/capabilities` y persistirlo en el espejo | 1,5 | ✅ **HECHO 2026-09-05** — falta ejecutarlo contra el parque |
| 7 | Merodeo y zona restringida fuera de horario | 2,5 | **Desbloqueado**: perfil + catálogo listos; falta sondear y encender |
| 8 | Tailgating por correlación ACS ↔ LineDetection | 3 | El de más valor comercial y el más caro: falta el vínculo puerta↔cámara |

### Lo que quedó parametrizado (2026-09-05)

`IntegraDetectionProfile` (`integra_detection_profiles`, único por
`[siteId, cameraId]`) y los endpoints
`GET/PATCH /integra/cameras/:id/detection` +
`POST /integra/cameras/:id/detection/apply`.

Antes, `enableFieldDetection` escribía siempre lo mismo: región = **fotograma
completo** y `sensitivityLevel` = **100, el techo del rango**, en las dieciséis
cámaras. Eso detecta la calle, el reflejo y el estacionamiento igual que la
puerta. Ahora la región sale del perfil (hasta 4 polígonos, que es lo que
admite el equipo) y la sensibilidad por defecto baja a **50** — el valor que el
propio fabricante lleva en su mensaje de ejemplo del Apéndice A.49.

`alarmConfidence` sí se escribía ya (contra lo que decía este documento), con
valor `low`. Sigue en `low` por defecto para no cambiar el comportamiento de
Oficinas de golpe, pero ahora es un campo del perfil. **Su enum es empírico —el
equipo lo devuelve con `opt=`, la documentación no lo menciona— así que la
dirección no está confirmada: subirlo se mide en UNA cámara antes de tocar las
dieciséis.**

Los cinco primeros —**5 días**— no tocan un solo equipo: son corrección de
clasificación sobre datos que ya entran.

## Nota legal

Rostro y huella son datos personales **sensibles** bajo la LFPDPPP reformada
(DOF 20-mar-2025): consentimiento expreso por escrito y multas duplicadas. Para
la correlación rostro ↔ acceso se recomienda la **versión visual** —enseñar las
dos fotos juntas para que decida una persona— y no el emparejamiento automático
de plantillas biométricas.
