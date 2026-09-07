package mx.nexara.mobile.nativeapp.ui.integra.common

import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

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
    "OPEN" -> "Abierta"
    "ACK" -> "Atendida"
    "CLEARED" -> "Cerrada"
    "TICKETED" -> "Con ticket"
    null, "" -> IntegraFormat.EMPTY
    else -> status.trim()
}

fun alarmStatusTone(status: String?): NxTone = when (status?.trim()?.uppercase()) {
    "OPEN" -> NxTone.Danger
    "TICKETED" -> NxTone.Warning
    "ACK" -> NxTone.Info
    "CLEARED" -> NxTone.Neutral
    else -> NxTone.Neutral
}

fun alarmSeverityLabel(severity: String?): String = when (severity?.trim()?.lowercase()) {
    "alta", "high" -> "Alta"
    "media", "medium" -> "Media"
    "baja", "low" -> "Baja"
    null, "" -> IntegraFormat.EMPTY
    else -> severity.trim()
}

fun alarmSeverityTone(severity: String?): NxTone = when (severity?.trim()?.lowercase()) {
    "alta", "high" -> NxTone.Danger
    "media", "medium" -> NxTone.Warning
    "baja", "low" -> NxTone.Info
    else -> NxTone.Neutral
}

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
fun alarmKindLabel(kind: String?): String = when (kind?.trim()?.uppercase()) {
    "DENIED" -> "Acceso denegado"
    "AFTER_HOURS" -> "Fuera de horario"
    "DOOR_FORCED" -> "Puerta forzada"
    "DOOR_HELD" -> "Puerta abierta demasiado tiempo"
    "CAMERA_OFFLINE" -> "Cámara caída"
    "DEVICE_OFFLINE" -> "Equipo caído"
    null, "" -> ""
    else -> kind.trim()
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

fun weekdaysLabel(raw: List<String>): String =
    raw.takeIf { it.isNotEmpty() }?.joinToString(" · ") { weekdayLabel(it) } ?: IntegraFormat.EMPTY

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

fun deviceKindLabel(raw: String?): String = when (raw?.trim()?.uppercase()) {
    "ACS" -> "Control de acceso"
    "ENCODE", "CAMERA" -> "Video"
    null, "" -> IntegraFormat.EMPTY
    else -> raw.trim()
}

/** Filtros de tipo de equipo, igual que el select de la web. */
val DEVICE_KIND_FILTERS: List<String> = listOf("ACS", "ENCODE")
