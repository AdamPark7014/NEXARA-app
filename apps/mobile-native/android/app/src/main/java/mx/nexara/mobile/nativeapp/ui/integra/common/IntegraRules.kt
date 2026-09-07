package mx.nexara.mobile.nativeapp.ui.integra.common

import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * Reglas de negocio de INTEGRA en el móvil.
 *
 * Todo lo que hay aquí es una función pura sobre lo que **ya devuelve la API**.
 * En particular:
 *
 *  - **No se clasifican códigos ACS aquí.** La tabla `major`/`minor` vive en un
 *    solo sitio (`apps/api/src/hikvision-isapi/acs-codes.ts`); hubo cinco copias
 *    y las cinco fallaban igual. El servidor ya manda `label` y `outcome` en
 *    `integra/push/events`, y `eventType` traducido en `integra/events`. Esto
 *    solo pinta lo que llega.
 *  - **No se inventan salidas ni cierres de jornada.** Este hardware no emite
 *    señal de salida por control de acceso. Cuando la API manda `minutes = null`
 *    (un solo paso en el día) se dice «Entrada sin salida registrada», no una
 *    jornada de cero.
 *  - **`eventState` se usa, no se adivina.** Llega en cada evento push; los
 *    temporizadores que lo suplían fabricaban alarmas fantasma.
 */

// ── Puertas ───────────────────────────────────────────────────────────────────

/**
 * Las cuatro órdenes de `POST integra/doors/:id/control`.
 *
 * `controlType` viaja y vuelve como **cadena**, no como número. Las dos que
 * franquean el paso van marcadas: son las que dejan entrar a alguien y en la web
 * se pintan en ámbar por eso mismo.
 */
enum class DoorControl(
    val controlType: String,
    val label: String,
    /** ¿Deja pasar a una persona? Entonces exige más ceremonia. */
    val franqueaPaso: Boolean,
) {
    Abrir("2", "Abrir (momentáneo)", true),
    Cerrar("1", "Cerrar", false),
    QuedarAbierta("0", "Quedar abierta", true),
    QuedarCerrada("3", "Quedar cerrada", false),
    ;

    companion object {
        /** Mismo orden que `DOOR_CONTROL_OPTIONS` en la web. */
        val ordenUi: List<DoorControl> = listOf(Abrir, Cerrar, QuedarAbierta, QuedarCerrada)

        fun porControlType(raw: String?): DoorControl? =
            entries.firstOrNull { it.controlType == raw?.trim() }
    }
}

/** Motivo mínimo aceptado por el servidor: `BadRequestException` por debajo de 3. */
const val MOTIVO_MINIMO = 3

fun motivoValido(reason: String): Boolean = reason.trim().length >= MOTIVO_MINIMO

/**
 * Estado de la puerta tal como lo pinta la web.
 *
 * El equipo caído gana **siempre** sobre el `status` del espejo: un estado
 * «cerrada» de hace tres horas en un terminal desconectado es peor que decir la
 * verdad. `status` sale de `ARTEMIS_DOOR_STATE` en el servidor y solo puede ser
 * una de estas seis claves.
 */
fun doorState(online: Boolean?, status: String?): String {
    if (online == false) return "offline"
    val s = status?.trim().orEmpty()
    return if (s in DOOR_STATES) s else "unknown"
}

private val DOOR_STATES = setOf("remain_open", "closed", "open", "remain_closed", "offline", "unknown")

/** Claves de filtro por estado, en el mismo orden que el select de la web. */
val DOOR_STATE_FILTERS: List<String> =
    listOf("offline", "remain_open", "open", "closed", "remain_closed", "unknown")

fun doorStateLabel(state: String): String = when (state) {
    "open" -> "Abierta"
    "closed" -> "Cerrada"
    "remain_open" -> "Mantenida abierta"
    "remain_closed" -> "Mantenida cerrada"
    "offline" -> "Equipo caído"
    else -> "Sin dato"
}

fun doorStateTone(state: String): NxTone = when (state) {
    "open" -> NxTone.Success
    "closed" -> NxTone.Neutral
    "remain_open" -> NxTone.Warning
    "remain_closed" -> NxTone.Info
    "offline" -> NxTone.Danger
    else -> NxTone.Neutral
}

// ── Eventos ACS ───────────────────────────────────────────────────────────────

/**
 * Tono del resultado de un evento.
 *
 * `outcome` lo calcula el servidor con la tabla única; el `label` solo se mira
 * como respaldo textual cuando `outcome` no vino (eventos que no son de
 * autenticación). Aquí no se decide nada a partir de `minor`.
 */
fun outcomeTone(outcome: String?, label: String?): NxTone {
    val o = outcome?.trim()?.lowercase()
    if (o == "granted") return NxTone.Success
    if (o == "denied") return NxTone.Danger
    val l = normalizeForSearch(label.orEmpty())
    return when {
        l.contains("concedido") || l.contains("autorizad") -> NxTone.Success
        l.contains("denegad") || l.contains("rechaz") -> NxTone.Danger
        else -> NxTone.Neutral
    }
}

fun outcomeLabel(outcome: String?, label: String?, eventType: String?): String =
    label?.trim()?.takeIf { it.isNotEmpty() }
        ?: when (outcome?.trim()?.lowercase()) {
            "granted" -> "Acceso concedido"
            "denied" -> "Acceso denegado"
            else -> eventType?.trim()?.takeIf { it.isNotEmpty() } ?: "Evento"
        }

/**
 * ¿El evento sigue activo?
 *
 * `eventState` llega en cada evento push y antes se ignoraba: el estado se
 * adivinaba con temporizadores y de ahí salían alarmas fantasma. `null` es un
 * dato válido — significa «este tipo de evento no tiene duración», y no debe
 * pintarse ni como activo ni como cerrado.
 */
fun eventActivo(eventState: String?): Boolean? = when (eventState?.trim()?.lowercase()) {
    "active" -> true
    "inactive" -> false
    else -> null
}

/** Vistas rápidas de la bitácora, con los parámetros de servidor de cada una. */
enum class EventQuickView(
    val label: String,
    val scope: String,
    val outcome: String?,
    val horasAtras: Long,
) {
    Hoy("Hoy", "acs", null, 0),
    Denegados("Denegados", "acs", "denied", 0),
    SieteDias("7 días", "acs", null, 24 * 7),
    Ruido("Ruido", "noise", null, 6),
    ;

    /** `Hoy` y `Denegados` arrancan a las 00:00 locales; el resto, N horas atrás. */
    val desdeMedianoche: Boolean get() = horasAtras == 0L
}

// ── Asistencia ────────────────────────────────────────────────────────────────

/**
 * Qué decir de una jornada.
 *
 * `minutes` viene `null` del servidor cuando la persona solo pasó una vez ese
 * día: **un pase no es una jornada, es una entrada sin salida**. Este hardware
 * no emite señal de salida por control de acceso y nunca la emitió — se prefiere
 * no cerrar la jornada a cerrarla con un dato inventado.
 */
fun jornadaLabel(minutes: Int?, passes: Int): String = when {
    minutes != null -> "Jornada ${IntegraFormat.duration(minutes)}"
    passes <= 1 -> "Entrada sin salida registrada"
    else -> "Sin duración calculable"
}

fun jornadaTone(minutes: Int?, passes: Int): NxTone = when {
    minutes != null -> NxTone.Success
    passes <= 1 -> NxTone.Warning
    else -> NxTone.Neutral
}

/** Aviso que acompaña siempre a asistencia y ocupación. No es opcional. */
const val AVISO_SIN_SALIDA =
    "Deducido de accesos concedidos. Este control de acceso no emite señal de " +
        "salida, así que la jornada no se cierra sola."

// ── Alarmas SOC ───────────────────────────────────────────────────────────────

fun alarmStatusLabel(status: String?): String = when (status?.trim()?.uppercase()) {
    "OPEN" -> "Nueva"
    "ACK" -> "Atendida"
    "CLEARED" -> "Cerrada"
    "TICKETED" -> "Escalada a ticket"
    null, "" -> "Sin estado"
    else -> status.trim()
}

/** Filtros de estado de la cola, en el orden del select de la web. */
enum class AlarmStatusFilter(val label: String) {
    Pendientes("Pendientes"),
    Nuevas("Nuevas"),
    Escaladas("Escaladas"),
    Atendidas("Atendidas"),
    Cerradas("Cerradas"),
    Todas("Todas"),
}

fun alarmPasaFiltro(status: String?, filtro: AlarmStatusFilter): Boolean {
    val s = status?.trim()?.uppercase()
    return when (filtro) {
        AlarmStatusFilter.Todas -> true
        AlarmStatusFilter.Pendientes -> isAlarmPending(status)
        AlarmStatusFilter.Nuevas -> s == "OPEN"
        AlarmStatusFilter.Escaladas -> s == "TICKETED"
        AlarmStatusFilter.Atendidas -> s == "ACK"
        AlarmStatusFilter.Cerradas -> s == "CLEARED"
    }
}

fun alarmStatusTone(status: String?): NxTone = when (status?.trim()?.uppercase()) {
    "OPEN" -> NxTone.Danger
    "TICKETED" -> NxTone.Warning
    "ACK" -> NxTone.Info
    "CLEARED" -> NxTone.Neutral
    else -> NxTone.Neutral
}

/**
 * Severidad normalizada. Sólo existen cuatro cajas: no hay «crítica» ni
 * «informativa» en esta plataforma, y un valor que no encaje se dice
 * «Sin clasificar» en vez de inventarle un color.
 */
enum class AlarmSeverity(val clave: String, val label: String, val rango: Int, val tone: NxTone) {
    Alta("alta", "Alta", 3, NxTone.Danger),
    Media("media", "Media", 2, NxTone.Warning),
    Baja("baja", "Baja", 1, NxTone.Info),
    Desconocida("desconocida", "Sin clasificar", 0, NxTone.Neutral),
}

fun alarmSeverity(raw: String?): AlarmSeverity = when (raw?.trim()?.lowercase()) {
    "alta", "high" -> AlarmSeverity.Alta
    "media", "medium" -> AlarmSeverity.Media
    "baja", "low" -> AlarmSeverity.Baja
    else -> AlarmSeverity.Desconocida
}

fun alarmSeverityLabel(severity: String?): String = alarmSeverity(severity).label

fun alarmSeverityTone(severity: String?): NxTone = alarmSeverity(severity).tone

/** El filtro de severidad es un mínimo, no una igualdad: «media o más». */
val SEVERITY_MIN_FILTERS: List<AlarmSeverity> =
    listOf(AlarmSeverity.Alta, AlarmSeverity.Media, AlarmSeverity.Baja)

fun alarmAlcanzaSeveridad(severity: String?, minimo: AlarmSeverity?): Boolean =
    minimo == null || alarmSeverity(severity).rango >= minimo.rango

/** Pendiente = todavía pide una decisión de alguien. */
fun isAlarmPending(status: String?): Boolean {
    val s = status?.trim()?.uppercase()
    return s == "OPEN" || s == "TICKETED"
}

/**
 * `kind` de la alarma SOC. Las filas anteriores a las alarmas de puerta/cámara
 * solo traen `DENIED` o `AFTER_HOURS`; una fila con un `kind` nuevo NO debe
 * pintarse como «acceso denegado».
 */
private val ALARM_KIND_LABELS: Map<String, String> = mapOf(
    "DENIED" to "Acceso denegado",
    "AFTER_HOURS" to "Entrada fuera de horario",
    "DOOR_FORCED" to "Puerta forzada",
    "DOOR_HELD_OPEN" to "Puerta mantenida abierta",
    "ANTIPASSBACK" to "Antipassback",
    "CREDENTIAL_EXPIRED" to "Credencial caducada",
    "BLOCKLIST" to "Persona en lista negra",
    "AUTH_FAILURE_BURST" to "Ráfaga de fallos de reconocimiento",
    "CAMERA_TAMPER" to "Sabotaje de cámara",
)

fun esKindConocido(kind: String?): Boolean =
    ALARM_KIND_LABELS.containsKey(kind?.trim()?.uppercase())

/**
 * Tipo de alarma en palabras.
 *
 * Si no se conoce el `kind` se prueba con la cola del `eventType`
 * (`acs.after_hours` → `AFTER_HOURS`) y, si tampoco, se humaniza el propio
 * enum. Lo que nunca se hace es pintar `DOOR_HELD_OPEN` en crudo ni, peor,
 * meter un tipo nuevo en el cajón de «acceso denegado».
 */
fun alarmKindLabel(kind: String?, eventType: String? = null): String {
    val k = kind?.trim()?.uppercase().orEmpty()
    ALARM_KIND_LABELS[k]?.let { return it }
    val cola = eventType?.trim()?.substringAfterLast('.')?.uppercase().orEmpty()
    ALARM_KIND_LABELS[cola]?.let { return it }
    val bruto = k.ifEmpty { cola }
    if (bruto.isEmpty()) return ""
    return bruto.split('_', ' ')
        .filter { it.isNotBlank() }
        .joinToString(" ") { it.lowercase() }
        .replaceFirstChar { it.uppercase() }
}

/** Ventanas de la cola SOC. El servidor topa en 168 h (7 días). */
val ALARM_HOUR_WINDOWS: List<Int> = listOf(8, 24, 72, 168)

fun alarmWindowLabel(hours: Int): String = when {
    hours < 24 -> "$hours h"
    hours % 24 == 0 -> "${hours / 24} d"
    else -> "$hours h"
}

// ── Personas ──────────────────────────────────────────────────────────────────

/** Los `userType` que acepta el ACS, con su etiqueta en español. */
val USER_TYPES: List<Pair<String, String>> = listOf(
    "normal" to "Empleado",
    "visitor" to "Visitante",
    "blackList" to "Lista negra",
    "patrol" to "Rondín",
)

fun userTypeLabel(raw: String?): String {
    val k = raw?.trim().orEmpty()
    if (k.isEmpty()) return IntegraFormat.EMPTY
    return USER_TYPES.firstOrNull { it.first.equals(k, ignoreCase = true) }?.second ?: k
}

val GENDERS: List<Pair<String, String>> = listOf(
    "male" to "Hombre",
    "female" to "Mujer",
    "unknown" to "Sin especificar",
)

fun genderLabel(raw: String?): String {
    val k = raw?.trim().orEmpty()
    if (k.isEmpty()) return IntegraFormat.EMPTY
    return GENDERS.firstOrNull { it.first.equals(k, ignoreCase = true) }?.second ?: k
}

fun vigenciaLabel(validEnable: Boolean?): String = when (validEnable) {
    true -> "Vigencia activa"
    false -> "Vigencia deshabilitada"
    null -> IntegraFormat.EMPTY
}

fun vigenciaTone(validEnable: Boolean?): NxTone = when (validEnable) {
    true -> NxTone.Success
    false -> NxTone.Danger
    null -> NxTone.Neutral
}

/** Clasificación de vigencia de una persona ACS, en el mismo orden que la web. */
enum class ValidityState { Suspendida, Caducada, VencePronto, Vigente, Desconocida }

data class Validity(
    val state: ValidityState,
    val label: String,
    val tone: NxTone,
    /** Días que faltan; `null` cuando no se pudo calcular. */
    val daysLeft: Long? = null,
)

/** A partir de este umbral se avisa de que la vigencia se acaba. */
const val VIGENCIA_AVISO_DIAS = 30L

/**
 * Una vigencia que termina en 2036 o más tarde es «indefinida»: es lo que el
 * terminal escribe cuando no se le pone fecha (`2037-12-31T23:59:59`). Pintarla
 * como «vence en 4.000 días» no ayuda a nadie.
 */
private val INDEFINIDA = Regex("^20(3[6-9]|[4-9]\\d)-")

/**
 * Orden deliberado: la suspensión gana sobre la fecha. Alguien dado de baja no
 * es «vigente» aunque su `validTo` esté en 2037.
 */
fun describeValidity(
    validEnable: Boolean?,
    validTo: String?,
    nowEpochDay: Long,
    validToEpochDay: Long?,
): Validity {
    if (validEnable == false) {
        return Validity(ValidityState.Suspendida, "Suspendida", NxTone.Danger)
    }
    val raw = validTo?.trim().orEmpty()
    if (raw.isEmpty()) {
        return Validity(ValidityState.Desconocida, "Sin vigencia", NxTone.Neutral)
    }
    if (validToEpochDay == null) {
        return Validity(ValidityState.Desconocida, "Vigencia ilegible", NxTone.Neutral)
    }
    val daysLeft = validToEpochDay - nowEpochDay
    if (daysLeft < 0) {
        return Validity(ValidityState.Caducada, "Caducada", NxTone.Danger, daysLeft)
    }
    if (INDEFINIDA.containsMatchIn(raw)) {
        return Validity(ValidityState.Vigente, "Indefinida", NxTone.Success, daysLeft)
    }
    if (daysLeft < VIGENCIA_AVISO_DIAS) {
        val texto = if (daysLeft == 0L) "Vence hoy" else "Vence en $daysLeft día(s)"
        return Validity(ValidityState.VencePronto, texto, NxTone.Warning, daysLeft)
    }
    return Validity(ValidityState.Vigente, "Vigente", NxTone.Success, daysLeft)
}

// ── Visitas recurrentes ───────────────────────────────────────────────────────

/**
 * Días que acepta `RecurringVisitorCreateDto.weekdays`.
 *
 * En inglés y capitalizado, exactamente como los manda la web. El normalizador
 * del servidor admite más formas, pero no hay razón para mandar una distinta.
 */
val WEEKDAYS: List<Pair<String, String>> = listOf(
    "Monday" to "Lun",
    "Tuesday" to "Mar",
    "Wednesday" to "Mié",
    "Thursday" to "Jue",
    "Friday" to "Vie",
    "Saturday" to "Sáb",
    "Sunday" to "Dom",
)

/** Lunes a viernes, que es el atajo que se usa el 90 % de las veces. */
val WEEKDAYS_LABORALES: List<String> = WEEKDAYS.take(5).map { it.first }

fun weekdayLabel(raw: String): String =
    WEEKDAYS.firstOrNull { it.first.equals(raw.trim(), ignoreCase = true) }?.second ?: raw.trim()

/**
 * Ritmo semanal en una línea, con los dos atajos que usa la web: «Lun–Vie» y
 * «Todos los días». Enumerar los cinco días laborables uno a uno no dice nada
 * que «Lun–Vie» no diga mejor.
 */
fun weekdaysLabel(raw: List<String>): String {
    val dias = raw.map { it.trim() }.filter { it.isNotEmpty() }
    if (dias.isEmpty()) return IntegraFormat.EMPTY
    val normalizados = dias.mapNotNull { d ->
        WEEKDAYS.firstOrNull { it.first.equals(d, ignoreCase = true) }?.first
    }.distinct()
    if (normalizados.size == 7) return "Todos los días"
    if (normalizados.size == 5 && normalizados.toSet() == WEEKDAYS_LABORALES.toSet()) return "Lun–Vie"
    // Orden de la semana, no el que trajo el servidor.
    val orden = WEEKDAYS.map { it.first }
    val ordenados = normalizados.sortedBy { orden.indexOf(it) }
    if (ordenados.isEmpty()) return dias.joinToString(" · ") { weekdayLabel(it) }
    return ordenados.joinToString(" · ") { weekdayLabel(it) }
}

/** `HH:MM` (lo que pide el DTO) o `HH:MM:SS` (lo que devuelve). */
private val HORA_REGEX = Regex("^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$")

fun horaValida(raw: String): Boolean = HORA_REGEX.matches(raw.trim())

/** `YYYY-MM-DD`, que es lo que acepta `validFrom` / `validTo`. */
private val FECHA_REGEX = Regex("^\\d{4}-\\d{2}-\\d{2}$")

fun fechaValida(raw: String): Boolean = FECHA_REGEX.matches(raw.trim())

data class RecurringVisitorValidation(val ok: Boolean, val error: String? = null)

/**
 * Valida el alta de visita recurrente **antes** de gastar una llamada.
 *
 * El DTO del servidor exige `visitorName`, `weekdays` no vacío, `timeFrom`,
 * `timeTo`, `validFrom` y `validTo`; además `forbidNonWhitelisted` hace que
 * cualquier campo de más devuelva 400. Fallar aquí da un mensaje que se entiende;
 * fallar allí da «HTTP 400».
 */
fun validarVisitaRecurrente(
    visitorName: String,
    weekdays: List<String>,
    timeFrom: String,
    timeTo: String,
    validFrom: String,
    validTo: String,
): RecurringVisitorValidation {
    if (visitorName.trim().length < 3) {
        return RecurringVisitorValidation(false, "El nombre del visitante debe tener al menos 3 caracteres")
    }
    if (weekdays.isEmpty()) {
        return RecurringVisitorValidation(false, "Elige al menos un día de la semana")
    }
    if (!horaValida(timeFrom) || !horaValida(timeTo)) {
        return RecurringVisitorValidation(false, "Las horas van en formato HH:MM (por ejemplo 09:00)")
    }
    if (timeFrom.trim() >= timeTo.trim()) {
        return RecurringVisitorValidation(false, "La hora de entrada debe ser anterior a la de salida")
    }
    if (!fechaValida(validFrom) || !fechaValida(validTo)) {
        return RecurringVisitorValidation(false, "Las fechas van en formato AAAA-MM-DD")
    }
    if (validFrom.trim() > validTo.trim()) {
        return RecurringVisitorValidation(false, "La fecha de inicio no puede ser posterior a la de fin")
    }
    return RecurringVisitorValidation(true)
}

fun syncStatusLabel(raw: String?): String = when (raw?.trim()?.uppercase()) {
    "SYNCED" -> "Sincronizada"
    "ERROR" -> "Error de sincronización"
    "CANCELLED" -> "Cancelada"
    "PENDING" -> "Pendiente"
    null, "" -> IntegraFormat.EMPTY
    else -> raw.trim()
}

fun syncStatusTone(raw: String?): NxTone = when (raw?.trim()?.uppercase()) {
    "SYNCED" -> NxTone.Success
    "ERROR" -> NxTone.Danger
    "CANCELLED" -> NxTone.Neutral
    "PENDING" -> NxTone.Warning
    else -> NxTone.Neutral
}

// ── Sitios y equipos ──────────────────────────────────────────────────────────

fun providerLabel(raw: String?): String = when (raw?.trim()?.uppercase()) {
    "ISAPI" -> "ISAPI (equipo en sitio)"
    "ARTEMIS" -> "HikCentral (Artemis)"
    "HCT" -> "Hik-Connect for Teams"
    null, "" -> IntegraFormat.EMPTY
    else -> raw.trim()
}

/**
 * Antigüedad del espejo.
 *
 * `null` significa **no se sabe** —falta la fecha, o no se pudo leer— y eso no
 * es lo mismo que «recién sincronizado»: una fecha corrupta pintada como fresca
 * es cómo se acaba operando sobre un inventario de hace tres días.
 *
 * Un reloj de servidor adelantado da una edad negativa; se dice «recién» en vez
 * de «hace -4 min».
 */
data class SyncAge(val label: String, val stale: Boolean)

/** A partir de una hora sin reconciliar, el espejo se marca como viejo. */
const val SYNC_STALE_MS: Long = 60 * 60 * 1000L

fun syncAge(lastSyncMs: Long?, nowMs: Long): SyncAge? {
    if (lastSyncMs == null) return null
    val edad = nowMs - lastSyncMs
    if (edad < 0) return SyncAge("recién", stale = false)
    val minutos = edad / 60_000
    val label = when {
        minutos < 1 -> "hace menos de 1 min"
        minutos < 60 -> "hace $minutos min"
        minutos < 60 * 24 -> "hace ${minutos / 60} h"
        else -> "hace ${minutos / (60 * 24)} d"
    }
    return SyncAge(label, stale = edad > SYNC_STALE_MS)
}

fun deviceKindLabel(raw: String?): String = when (raw?.trim()?.uppercase()) {
    "ACS" -> "Control de acceso"
    "ENCODE", "CAMERA" -> "Video"
    null, "" -> IntegraFormat.EMPTY
    else -> raw.trim()
}

/** Filtros de tipo de equipo, igual que el select de la web. */
val DEVICE_KIND_FILTERS: List<String> = listOf("ACS", "ENCODE")

// ── Rango de las vistas rápidas ───────────────────────────────────────────────

/**
 * Ventana `from`/`to` de una vista rápida de la bitácora.
 *
 * `Hoy` y `Denegados` arrancan en la **medianoche local del sitio**, no 24 horas
 * atrás: a las 09:00 «hoy» son nueve horas, no un día entero, y el servidor
 * cuenta sus KPI igual (`dayIn(tz)`). El resto retrocede N horas desde ahora.
 */
fun quickViewRange(view: EventQuickView, now: Instant, zone: ZoneId): Pair<Instant, Instant> {
    val from = if (view.desdeMedianoche) {
        now.atZone(zone).toLocalDate().atStartOfDay(zone).toInstant()
    } else {
        now.minus(view.horasAtras, ChronoUnit.HOURS)
    }
    return from to now
}

// ── Estado del evento ─────────────────────────────────────────────────────────

/**
 * `eventState` en palabras. `null` **no** es «cerrado»: es «este tipo de evento
 * no tiene duración», y decir «finalizado» de un pase de tarjeta sería mentir.
 */
fun eventStateLabel(eventState: String?): String = when (eventActivo(eventState)) {
    true -> "En curso"
    false -> "Finalizado"
    null -> ""
}

fun eventStateTone(eventState: String?): NxTone = when (eventActivo(eventState)) {
    true -> NxTone.Warning
    false -> NxTone.Neutral
    null -> NxTone.Neutral
}

/** Filtros de `eventState` que acepta el servidor. `null` = sin filtrar. */
val EVENT_STATE_FILTERS: List<Pair<String, String>> =
    listOf("active" to "En curso", "inactive" to "Finalizados")

/**
 * De dónde vino el evento.
 *
 * El servidor deja `deviceName` en `null` cuando el terminal no se ha
 * sincronizado; entonces la IP es lo único que identifica al equipo, y `doorNo`
 * el punto de paso. Se pinta lo que haya, en ese orden.
 */
fun deviceLabel(deviceName: String?, doorNo: Int?, deviceIp: String?): String {
    val name = deviceName?.trim().orEmpty()
    val puerta = doorNo?.let { "Puerta $it" }.orEmpty()
    val ip = deviceIp?.trim().orEmpty()
    val partes = listOf(name.ifBlank { ip }, puerta).filter { it.isNotBlank() }
    return partes.joinToString(" · ").ifBlank { IntegraFormat.EMPTY }
}

/**
 * Modo de verificación tal cual lo manda el terminal.
 *
 * Se traducen sólo los valores que este parque emite de verdad; cualquier otro
 * se enseña crudo. Inventar una traducción para un modo que no se ha visto es
 * como las cinco tablas de códigos ACS que fallaban todas igual.
 */
fun verifyModeLabel(raw: String?): String {
    val v = raw?.trim().orEmpty()
    if (v.isEmpty()) return ""
    return when (v.lowercase()) {
        "face" -> "Rostro"
        "card" -> "Tarjeta"
        "fp", "fingerprint" -> "Huella"
        "cardorface" -> "Tarjeta o rostro"
        "faceorfp" -> "Rostro o huella"
        "cardandpw" -> "Tarjeta y PIN"
        else -> v
    }
}

/** Campos por los que se busca en la bitácora. */
fun eventMatches(ev: Map<String, Any?>, query: String): Boolean = matchesQuery(
    ev,
    query,
    "personName",
    "personId",
    "deviceName",
    "deviceIp",
    "label",
    "eventType",
)

// ── Asistencia ────────────────────────────────────────────────────────────────

/** Rangos ofrecidos en asistencia. Cada cambio es una petición nueva al servidor. */
val ATTENDANCE_DAY_RANGES: List<Int> = listOf(1, 7, 14, 30)

fun attendanceRangeLabel(days: Int): String = when (days) {
    1 -> "Hoy"
    else -> "$days días"
}

/**
 * Agrupa las jornadas por día conservando el orden que ya trae el servidor
 * (día descendente, y dentro del día por hora de entrada ascendente).
 *
 * Se agrupa en el cliente porque el endpoint devuelve una fila por
 * `día × persona`; sin agrupar, una semana de 40 personas son 280 tarjetas
 * planas y no se ve dónde empieza cada día.
 */
fun agruparPorDia(items: List<Map<String, Any?>>): List<Pair<String, List<Map<String, Any?>>>> {
    val orden = LinkedHashMap<String, MutableList<Map<String, Any?>>>()
    for (row in items) {
        val day = str(row, "day")
        orden.getOrPut(day) { mutableListOf() }.add(row)
    }
    return orden.map { (day, filas) -> day to filas.toList() }
}

/** Suma de pases y denegados de un día, para el encabezado del grupo. */
fun resumenDelDia(filas: List<Map<String, Any?>>): String {
    val personas = filas.mapNotNull { strOrNull(it, "personId") }.distinct().size
    val pases = filas.sumOf { int(it, "passes") ?: 0 }
    val denegados = filas.sumOf { int(it, "denied") ?: 0 }
    return buildString {
        append("$personas persona(s) · $pases acceso(s)")
        if (denegados > 0) append(" · $denegados denegado(s)")
    }
}

/** ¿Esta jornada quedó sin cerrar? Es lo que se filtra con «sin salida». */
fun jornadaSinCerrar(row: Map<String, Any?>): Boolean =
    int(row, "minutes") == null && (int(row, "passes") ?: 0) <= 1

fun attendanceMatches(row: Map<String, Any?>, query: String): Boolean =
    matchesQuery(row, query, "personName", "personId")

// ── Ocupación ─────────────────────────────────────────────────────────────────

fun occupancyMatches(row: Map<String, Any?>, query: String): Boolean =
    matchesQuery(row, query, "personName", "personId", "lastDoor")

/**
 * `verifyMode` del último pase — es lo que responde «¿cómo entró?» cuando
 * alguien pregunta por qué esa persona figura dentro.
 */
fun occupancySubtitle(lastDoor: String?, verifyMode: String?): String = listOf(
    lastDoor?.trim().orEmpty(),
    verifyModeLabel(verifyMode),
).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { IntegraFormat.EMPTY }

// ── Personas ──────────────────────────────────────────────────────────────────

/** Credenciales que tiene dadas de alta una persona, en una línea. */
fun credencialesLabel(
    numOfFace: Int?,
    numOfCard: Int?,
    numOfFP: Int?,
    hasLocalFace: Boolean?,
): String {
    val partes = buildList {
        val caras = (numOfFace ?: 0) + if (hasLocalFace == true && (numOfFace ?: 0) == 0) 1 else 0
        if (caras > 0) add("$caras rostro(s)")
        if ((numOfCard ?: 0) > 0) add("${numOfCard} tarjeta(s)")
        if ((numOfFP ?: 0) > 0) add("${numOfFP} huella(s)")
    }
    return if (partes.isEmpty()) "Sin credenciales" else partes.joinToString(" · ")
}

fun personMatches(person: Map<String, Any?>, query: String): Boolean = matchesQuery(
    person,
    query,
    "name",
    "personName",
    "id",
    "personId",
    "code",
    "personCode",
    "orgName",
    "sourceName",
)

/**
 * ¿Tiene rostro utilizable?
 *
 * Tres campos dicen cosas distintas: `numOfFace` es lo que cuenta el terminal,
 * `hasFace` lo que decidió el servidor, y `hasLocalFace` si además hay un JPEG
 * guardado en NEXARA. Para «¿puede abrir mirando al lector?» basta cualquiera.
 */
fun faceOn(numOfFace: Int?, hasFace: Boolean?, hasLocalFace: Boolean?): Boolean =
    (numOfFace ?: 0) > 0 || hasFace == true || hasLocalFace == true

/** Cuántos de los tres tipos de credencial tiene. 0 = no puede abrir nada. */
fun credentialScore(
    numOfFace: Int?,
    numOfCard: Int?,
    numOfFP: Int?,
    hasFace: Boolean?,
    hasLocalFace: Boolean?,
    localFpCount: Int,
): Int {
    var score = 0
    if (faceOn(numOfFace, hasFace, hasLocalFace)) score++
    if ((numOfCard ?: 0) > 0) score++
    if ((numOfFP ?: 0) > 0 || localFpCount > 0) score++
    return score
}

/**
 * Urgencia de la vigencia. **No** es el orden de declaración del enum: primero
 * va lo que impide entrar hoy (suspendida, caducada), después lo que va a
 * impedirlo pronto, y al final lo que está bien.
 */
fun validityRank(state: ValidityState): Int = when (state) {
    ValidityState.Suspendida -> 0
    ValidityState.Caducada -> 1
    ValidityState.VencePronto -> 2
    ValidityState.Desconocida -> 3
    ValidityState.Vigente -> 4
}

enum class PeopleSort(val label: String) {
    Nombre("Nombre"),
    Vigencia("Vigencia urgente"),
    Credenciales("Credenciales incompletas"),
}

/**
 * Ordena el directorio. Las dos ordenaciones que no son alfabéticas ponen
 * delante lo que hay que arreglar: quien no puede entrar, y quien no tiene con
 * qué identificarse.
 */
fun ordenarPersonas(
    items: List<Map<String, Any?>>,
    sort: PeopleSort,
    validityOf: (Map<String, Any?>) -> Validity,
    scoreOf: (Map<String, Any?>) -> Int,
): List<Map<String, Any?>> {
    val porNombre = compareBy<Map<String, Any?>> { normalizeForSearch(str(it, "name", "personName")) }
    return when (sort) {
        PeopleSort.Nombre -> items.sortedWith(porNombre)
        PeopleSort.Credenciales -> items.sortedWith(compareBy<Map<String, Any?>> { scoreOf(it) }.then(porNombre))
        PeopleSort.Vigencia -> items.sortedWith(
            compareBy<Map<String, Any?>> { validityRank(validityOf(it).state) }
                .thenBy { validityOf(it).daysLeft ?: Long.MAX_VALUE }
                .then(porNombre),
        )
    }
}

/** Filtros de vigencia del directorio, en el orden del select de la web. */
val VALIDITY_FILTERS: List<Pair<ValidityState, String>> = listOf(
    ValidityState.Vigente to "Vigentes",
    ValidityState.VencePronto to "Vencen pronto",
    ValidityState.Caducada to "Caducadas",
    ValidityState.Suspendida to "Suspendidas",
    ValidityState.Desconocida to "Sin vigencia",
)

// ── Alarmas ───────────────────────────────────────────────────────────────────

fun alarmMatches(alarm: Map<String, Any?>, query: String): Boolean = matchesQuery(
    alarm,
    query,
    "title",
    "personName",
    "doorName",
    "deviceName",
    "srcName",
    "deviceIp",
)

/**
 * De dónde viene la alarma, con la precedencia de la web: el nombre de la
 * puerta gana al del equipo, y la IP es el último recurso.
 */
fun alarmSourceLabel(alarm: Map<String, Any?>): String =
    strOrNull(alarm, "doorName")
        ?: strOrNull(alarm, "srcName")
        ?: strOrNull(alarm, "deviceName")
        ?: int(alarm, "doorNo")?.let { "Puerta $it" }
        ?: strOrNull(alarm, "deviceIp")
        ?: strOrNull(alarm, "doorIndexCode")
        ?: IntegraFormat.EMPTY

/**
 * Lo que se puede hacer con una alarma según su estado.
 *
 * Atender una ya atendida o cerrar una cerrada devuelve error del servidor: se
 * decide aquí y el botón ni aparece. Escalar dos veces crearía dos tickets OPS
 * para el mismo incidente, así que `ticketRequestId` cierra esa puerta.
 */
data class AlarmActions(
    val puedeAtender: Boolean,
    val puedeCerrar: Boolean,
    val puedeEscalar: Boolean,
)

fun alarmActions(status: String?, ticketRequestId: Int?): AlarmActions {
    val s = status?.trim()?.uppercase()
    return AlarmActions(
        puedeAtender = s == "OPEN",
        puedeCerrar = s != null && s != "CLEARED",
        puedeEscalar = ticketRequestId == null && s != "CLEARED",
    )
}

/** Título mínimo del ticket OPS: el servidor rechaza los vacíos. */
fun tituloTicketValido(titulo: String): Boolean = titulo.trim().length >= 5

/**
 * Agrupa alarmas duplicadas dentro de una ventana de cinco minutos.
 *
 * Una puerta forzada que repica quince veces son quince filas idénticas que
 * tapan las otras tres alarmas del turno. Se fusionan sólo las que comparten
 * **estado**, tipo, persona y puerta: dos filas con estados distintos son dos
 * decisiones distintas y no deben colapsarse.
 */
const val ALARM_GROUP_WINDOW_MS: Long = 5 * 60_000L

fun huellaAlarma(alarm: Map<String, Any?>): String = listOf(
    str(alarm, "status").uppercase(),
    strOrNull(alarm, "kind") ?: strOrNull(alarm, "eventType") ?: str(alarm, "title"),
    strOrNull(alarm, "personId") ?: strOrNull(alarm, "personName") ?: "anon",
    int(alarm, "doorNo")?.toString() ?: strOrNull(alarm, "doorIndexCode") ?: alarmSourceLabel(alarm),
).joinToString("|") { normalizeForSearch(it) }

data class AlarmGroup(
    /** La más reciente: es la que se pinta y sobre la que se decide. */
    val representante: Map<String, Any?>,
    val miembros: List<Map<String, Any?>>,
    val totalOcurrencias: Int,
)

/**
 * @param instanteDe milisegundos de la marca de tiempo, o `null` si no se pudo
 *   leer. Una fila sin hora no se agrupa con nadie: sin saber cuándo pasó no se
 *   puede afirmar que sea el mismo incidente.
 */
fun agruparAlarmas(
    items: List<Map<String, Any?>>,
    instanteDe: (Map<String, Any?>) -> Long?,
): List<AlarmGroup> {
    // Un grupo por huella está «abierto» mientras la siguiente alarma llegue
    // dentro de la ventana. Al romperse, ese grupo se cierra y se guarda —no se
    // pisa— y empieza otro: dos rachas separadas son dos incidentes.
    val abiertos = LinkedHashMap<String, MutableList<Map<String, Any?>>>()
    val cerrados = mutableListOf<List<Map<String, Any?>>>()
    val sueltas = mutableListOf<Map<String, Any?>>()

    for (a in items) {
        val t = instanteDe(a)
        if (t == null) {
            // Sin hora no se puede afirmar que sea el mismo incidente.
            sueltas.add(a)
            continue
        }
        val huella = huellaAlarma(a)
        val abierto = abiertos[huella]
        val ultimo = abierto?.lastOrNull()?.let(instanteDe)
        if (abierto != null && ultimo != null && kotlin.math.abs(ultimo - t) <= ALARM_GROUP_WINDOW_MS) {
            abierto.add(a)
        } else {
            if (abierto != null) cerrados.add(abierto.toList())
            abiertos[huella] = mutableListOf(a)
        }
    }
    val todos = cerrados + abiertos.values.map { it.toList() }

    fun grupo(miembros: List<Map<String, Any?>>): AlarmGroup {
        val repre = miembros.maxByOrNull { instanteDe(it) ?: Long.MIN_VALUE } ?: miembros.first()
        return AlarmGroup(
            representante = repre,
            miembros = miembros,
            totalOcurrencias = miembros.sumOf { (int(it, "occurrenceCount") ?: 1).coerceAtLeast(1) },
        )
    }

    return todos.map(::grupo) + sueltas.map { grupo(listOf(it)) }
}

// ── Equipos ───────────────────────────────────────────────────────────────────

fun deviceMatches(device: Map<String, Any?>, query: String): Boolean =
    matchesQuery(device, query, "name", "ip", "kind", "deviceType", "id")

/**
 * El inventario existe para encontrar lo que está caído. Los equipos sin
 * conexión van primero; dentro de cada grupo, por nombre.
 */
fun ordenarEquipos(items: List<Map<String, Any?>>): List<Map<String, Any?>> =
    items.sortedWith(
        compareBy<Map<String, Any?>> { bool(it, "online") != false }
            .thenBy { normalizeForSearch(str(it, "name")) },
    )

// ── Visitantes ────────────────────────────────────────────────────────────────

/**
 * Estado de una visita recurrente, con las mismas cuatro cajas que la web.
 *
 * El enum de Prisma es `ACTIVE|PENDING|SYNCED|EXPIRED|CANCELLED|ERROR`, pero
 * llega escrito de varias formas según por qué ruta se creó la fila. Dos
 * decisiones que no son evidentes:
 *
 *  - **`CANCELLED` gana sobre la fecha.** Una visita anulada no está «vigente»
 *    aunque su `validTo` sea de la semana que viene.
 *  - **Una fila `PENDING` con la vigencia ya pasada es `EXPIRED`.** Se quedó
 *    sin sincronizar y ya no va a servir: decir «pendiente» invitaría a
 *    esperarla.
 */
enum class VisitorStatus(val label: String, val tone: NxTone) {
    EnTerminales("En terminales", NxTone.Success),
    Pendiente("Pendiente", NxTone.Warning),
    Vencida("Vencida", NxTone.Danger),
    Cancelada("Cancelada", NxTone.Neutral),
}

fun visitorStatus(raw: String?, validToEpochDay: Long?, nowEpochDay: Long): VisitorStatus {
    val s = raw?.trim()?.lowercase().orEmpty()
    val caducada = validToEpochDay != null && validToEpochDay < nowEpochDay
    return when {
        s.contains("cancel") || s.contains("revok") -> VisitorStatus.Cancelada
        s.contains("expir") || s.contains("vencid") || s.contains("ended") -> VisitorStatus.Vencida
        s == "synced" || s == "active" || s.contains("enrol") || s.contains("terminal") ->
            if (caducada) VisitorStatus.Vencida else VisitorStatus.EnTerminales
        caducada -> VisitorStatus.Vencida
        s.isEmpty() || s.contains("pend") || s.contains("draft") || s.contains("queue") ||
            s.contains("sync") || s.contains("error") -> VisitorStatus.Pendiente
        else -> VisitorStatus.Pendiente
    }
}

/** Sólo se cancela lo que todavía puede dejar pasar a alguien. */
fun puedeCancelarVisita(status: VisitorStatus): Boolean =
    status == VisitorStatus.EnTerminales || status == VisitorStatus.Pendiente

/** Orden de la tabla: primero lo que está vivo, luego lo que ya no importa. */
fun ordenarVisitas(
    items: List<Map<String, Any?>>,
    estadoDe: (Map<String, Any?>) -> VisitorStatus,
): List<Map<String, Any?>> {
    val rango = mapOf(
        VisitorStatus.EnTerminales to 0,
        VisitorStatus.Pendiente to 1,
        VisitorStatus.Vencida to 2,
        VisitorStatus.Cancelada to 3,
    )
    return items.sortedWith(
        compareBy<Map<String, Any?>> { rango[estadoDe(it)] ?: 9 }
            .thenBy { str(it, "validTo") },
    )
}

fun visitorMatches(v: Map<String, Any?>, query: String): Boolean =
    matchesQuery(v, query, "visitorName", "name", "hostName", "phone", "notes")
