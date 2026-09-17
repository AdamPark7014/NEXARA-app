# Contrato de la entrega del viernes 18-09 (asistencia, actividades, pizarra, cotizaciones)

Pedido de Adam (17-09): todo hoy. API y web por un lado; Android e iOS implementan este mismo contrato en paralelo.
**Nadie cambia estos nombres sin avisar**: los clientes se escriben contra ellos antes de que la API exista.

Compatibilidad obligatoria: la app 1.0.2 (en revisión en Google Play) NO tiene estas pantallas. Todo lo nuevo es
opcional para clientes viejos: nunca bloquear un flujo que hoy funciona solo porque falte un campo nuevo.

Reglas de la casa: textos en español de México; migraciones a mano con el timestamp asignado; commit con trailer
`Agente: claude-code` + `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`; sin deploy, sin push, sin tocar
`.ai/RELEVO.md`; no leer secretos (`.env`, `local.properties`).

Cuentas de dirección: `CEO_EQUIVALENT_EMAILS` (Christian `gerencia@`, Claudia `claudia.bernal@`, que prueba los
permisos de Christian). Helper API: `isCeoEquivalentEmail` en `apps/api/src/common/platform-accounts.ts`.

---

## A. Asistencia no manipulable (migración `20260917210000_asistencia_confiable`)

### `POST /attendance` (campos nuevos, todos opcionales)
| Campo | Tipo | Significado |
|---|---|---|
| `accuracyM` | number | Precisión del GPS en metros |
| `mockLocation` | boolean | El teléfono detectó ubicación simulada (Android `Location.isMock`/`isFromMockProvider`; iOS `CLLocation.sourceInformation?.isSimulatedBySoftware`) |
| `offline` | boolean | Se capturó sin conexión y se manda después |
| `capturedAt` | ISO 8601 | Hora del teléfono al capturar (informativa) |

`timestamp` (campo viejo) se acepta como `capturedAt`.

### Reglas del servidor
1. **La hora es la del servidor.** Si `offline === true` y `capturedAt` está entre ahora−12 h y ahora+2 min, se usa
   `capturedAt` y el registro queda `validacion = 'PENDIENTE'` («Registrada sin conexión»). Sin `offline`, si
   `capturedAt` difiere más de 5 min de la hora del servidor se usa la del servidor y queda `REVISAR`
   («La hora del teléfono no coincidía»).
2. `mockLocation === true` → **422** `{ message: 'Detectamos una ubicación simulada. Desactiva cualquier app de GPS falso para checar.' }`
   y aviso a sus jefes por organigrama + dirección («Intento de checada con ubicación simulada»).
3. Sin coordenadas o `accuracyM > 200` → se acepta con `REVISAR` («Ubicación imprecisa» / «Sin ubicación»).
4. **Sitios permitidos** (radio 300 m): la oficina (19.0740, -98.2780; configurable) y las sucursales/clientes con
   coordenadas de las actividades asignadas a esa persona ese día. Fuera de todos → se acepta con
   `fueraDeSitio = true`, `distanciaSitioM` al más cercano y aviso a sus jefes.
5. Tipo de aviso nuevo `ATTENDANCE_FLAGGED` (ícono push `asistencia_alerta`).

### Columnas nuevas en `Attendance`
`clientCapturedAt DateTime?`, `accuracyM Float?`, `mockDetected Boolean @default(false)`, `offline Boolean @default(false)`,
`validacion String @default("OK")` (OK | PENDIENTE | REVISAR), `motivoValidacion String?`, `fueraDeSitio Boolean @default(false)`,
`distanciaSitioM Int?`, `sitioNombre String?`, `cierreAutomatico Boolean @default(false)`.

### Olvidó checar salida
Tarea 23:30 (hora MX): cada jornada abierta del día recibe salida a `min(entrada + 9 h, 23:30)` con
`cierreAutomatico = true`, `validacion = 'REVISAR'` («Sin salida registrada: cierre automático») y aviso a la persona y a
sus jefes. Una jornada abierta de un día anterior ya no bloquea la entrada de hoy.

### Corrección de checadas
`PATCH /attendance/:id/correccion { timestamp: ISO, motivo: string ≥10 }` — solo dirección (CEO-equivalentes) y rol
`rh`. Tabla `attendance_corrections` (attendanceId, antes, despues, motivo, porId, createdAt). Deja `validacion = 'OK'`.

### Lecturas
Cada registro en `attendance/range`, `attendance/hierarchy/range` y el día de la persona incluye:
`validacion, motivoValidacion, fueraDeSitio, distanciaSitioM, sitioNombre, offline, cierreAutomatico, accuracyM,
correcciones: [{ antes, despues, motivo, por: { id, nombre }, at }]`.

### GPS solo dirección
Mapa del equipo, trayectorias (`gps/*` de lectura) y el recorrido de la geocerca (`puntos` en
`activity-evidence/:id/geocerca`) solo para CEO-equivalentes. A los demás: 403 en gps y `puntos: []` en geocerca (las
alertas de zona y su justificación siguen visibles para sus jefes). Mandar ubicación (`POST gps`) no cambia.

---

## B. Actividades (migración `20260917211000_actividades_aceptacion_tiempos`)

### Columnas nuevas en `ActivityAssignee`
`aceptadaAt DateTime?`, `rechazadaAt DateTime?`, `motivoRechazo String?`, `inicioRealAt DateTime?`, `finRealAt DateTime?`,
`distanciaSitioInicioM Int?`, `saltoPrioridad Boolean @default(false)`, `justificacionOrden String?`, `alertaExcesoAt DateTime?`.
`horasPlan` ya existe: es el tiempo planeado.

### Endpoints
- `POST me/activities/:id/aceptar` → `aceptadaAt = now`; aviso a quien asignó.
- `POST me/activities/:id/rechazar { motivo ≥10 }` → `rechazadaAt`, `motivoRechazo`; aviso a quien asignó, responsable y
  jefes («X rechazó <actividad>: motivo»). Sigue asignada hasta que un superior la pase o cancele.
- La foto de entrada **acepta sola** si no estaba aceptada (apps viejas), fija `inicioRealAt`, pone la actividad
  «En Proceso» si estaba «Pendiente» y mide `distanciaSitioInicioM` contra la sucursal/cliente (si hay coordenadas;
  > 300 m → aviso a superiores, no bloquea). La foto de salida fija `finRealAt`.
- Iniciar (foto de entrada) habiendo otra actividad del mismo día con más prioridad sin terminar → **no se bloquea**:
  `saltoPrioridad = true`, se guarda `justificacionOrden` si viene en el cuerpo de la foto de entrada y se avisa a jefes.
- Tarea cada 15 min: en curso con `horasPlan` y tiempo transcurrido > plan → aviso una vez (`alertaExcesoAt`) a la persona
  y superiores («<actividad> excedió su tiempo estimado»).
- `POST activities/:id/team` y el reparto de despacho aceptan `horasPlan` (la web de asignar lo pide).

### Prioridad
`Activity.prioridad` se normaliza a `ALTA | MEDIA | BAJA` (acepta los textos viejos: «Alta», «urgente»→ALTA, etc.).

### Campos nuevos en cada actividad de `me/activities` (y en el detalle)
`aceptacion: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA'`, `motivoRechazo`, `prioridad`, `semaforo: 'rojo' | 'amarillo' | 'verde'`,
`minutosPlan` (horasPlan×60 o null), `minutosReales` (inicioReal→finReal, o →ahora si sigue), `excedida: boolean`,
`inicioRealAt`, `finRealAt`, `asignadoPor: { id, nombre } | null`, `saltoPrioridad`.

**Semáforo:** rojo = vencida (pasó `fechaMaxima`) o excedida o prioridad ALTA sin iniciar; amarillo = prioridad MEDIA
sin iniciar, o en curso con más del 80 % del plan consumido; verde = lo demás.

---

## C. Pizarra con semáforo y KPI (sin migración)

- `GET me/board?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` (por omisión: hoy). Cada persona trae además:
  `kpis: { asignadas, cerradas, aTiempo, aTiempoPct, minutosPlan, minutosReales, eficienciaPct, minutosAsistidos, minutosEnActividad, productividadPct, rechazadas }`
  y cada actividad de su tarjeta: `prioridad, semaforo, asignadoPor, minutosPlan, minutosReales, excedida`.
- `eficienciaPct = plan/real×100` (solo actividades con plan y terminadas); `productividadPct = minutosEnActividad/minutosAsistidos×100`
  (asistidos = entrada→salida real, descontando comida).
- Corregir: horas trabajadas usan la salida si existe; «inicio» es `inicioRealAt`; el historial incluye actividades de las
  que la persona fue retirada (marcadas `retirado: true`).
- `GET me/board/asignadas-por-mi?desde&hasta` → actividades que asignó quien consulta, con persona, estado y semáforo.

---

## D. Cotizaciones en Core (migración `20260917212000_cotizaciones_core`)

- **Segmento** `COMERCIAL | OBRA | LICITACION | SERVICIO` (obligatorio al crear).
- **Folio del servidor, basado en la nomenclatura de quien la hace** (decisión de Adam 17-09: todos los encargados de
  área cotizan, así que el folio dice de quién es y cuántas lleva):

  `NEX-{NOMENCLATURA}-{contador 4 díg. de esa persona}` → `NEX-LJ75100126-0007` (séptima cotización de Luis).

  - La nomenclatura es `User.employeeNumber` cuando cumple `^[A-Z]{2}\d{8}$`.
  - **Cuando no está completa se rellena igual que la nomenclatura**: 2 iniciales del nombre (nombre(s) primero, sin
    acentos) + los 8 dígitos que se puedan calcular (año y mes de nacimiento desde la CURP o el perfil; año y mes de
    ingreso) y **ceros donde falte el dato**: Christian → `CE00000000`. Nunca se inventan datos.
  - El contador es **por persona** (`cotizacion_contadores`: userId + ultimo), con transacción para que dos al mismo
    tiempo no repitan. Si la persona cambia de nomenclatura después, los folios ya emitidos no se tocan.
  - El **segmento** no va en el folio; es un campo y un filtro.
  - Al **enviar** se agregan las siglas de quienes intervinieron además de quien la hizo, en orden:
    `NEX-LJ75100126-0007-JA.CE`; cada versión enviada después agrega `-R2`, `-R3`. Las siglas son las 2 primeras
    letras de la nomenclatura de cada quien.
- **Participantes:** tabla `cotizacion_participantes` (cotizacionId, userId, clave (employeeNumber al momento), siglas,
  rol ELABORO | LEVANTAMIENTO | REVISO | APROBO | ENVIO, at). Se registran solos al crear/revisar/aprobar/enviar.
- **Estados:** BORRADOR | ENVIADA | APROBADA | RECHAZADA | VENCIDA (tarea diaria marca vencidas). Enviada = bloqueada:
  editar crea versión nueva. No se firma vencida ni rechazada. El cliente puede rechazar con motivo desde el enlace.
- **Formato PDF «Propuesta técnica»** (como `Primera cotizacion .pdf`): portada con versión; 01 Objetivo (plantilla por
  segmento con cifras); 02 Alcance con bloques reutilizables (modernización de grabación, mantenimiento, diagnóstico,
  reubicación, ampliación, poste, analíticos, puesta en marcha, almacenamiento, consideraciones, exclusiones, entrega),
  cada uno con parámetros; 03 Planos (imágenes/PDF adjuntos); 04 Cotización con partidas agrupadas Equipos / Materiales /
  Mano de obra, subtotal, IVA 16 %, total; términos según segmento (solo suministro vs suministro e instalación vs licitación).
- **Paquetes** («Cámara bala instalada» = cámara + balún + adaptador + caja + instalación): al agregar N paquetes se
  generan las partidas y el alcance cuadra.
- Core web: `/erp/cotizaciones` (lista, crear, editar, PDF, enviar por correo, historial de participantes y versiones),
  en el menú para dirección, administración y coordinadores.

- **La cotización puede ser una actividad de tipo comercial** (pedido de Adam):
  - `Activity.coreKind = 'comercial'` con `cotizacionId Int?` (columna nueva en `Activity`, en la misma migración).
  - Desde la actividad: «Hacer cotización» crea la cotización con ese cliente y deja las dos ligadas; «Ligar cotización»
    conecta una existente. Desde la cotización se ve y se abre su actividad.
  - **La evidencia de la actividad es la evidencia de la cotización**: las fotos del levantamiento y los planos que subió
    quien la atendió aparecen como anexos de la cotización (03 Planos) sin volver a subirlos.
  - Flujo de evidencia de una actividad comercial: foto de entrada → fotos del levantamiento → **cotización** (en lugar
    de la hoja de servicio; el paso se da por hecho cuando la cotización queda ENVIADA) → foto de salida.
  - El avance de la actividad sigue el estado de la cotización: ENVIADA → «Por validar»; APROBADA → «Finalizada»;
    RECHAZADA o VENCIDA → queda para que un superior la cierre o la reprograme.
  - Los avisos push de la cotización (enviada, aprobada, rechazada) van a quien la hizo, sus jefes y dirección.
