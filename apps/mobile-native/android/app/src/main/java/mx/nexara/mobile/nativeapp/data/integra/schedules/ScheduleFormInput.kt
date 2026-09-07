package mx.nexara.mobile.nativeapp.data.integra.schedules

/**
 * Entrada de fecha y hora de los formularios de HORARIOS y ESPACIOS.
 *
 * ## Por qué campos de texto y no un `DatePickerDialog`
 *
 * El `DatePickerDialog` de Material 3 devuelve `selectedDateMillis` como
 * **medianoche UTC** del día elegido. Combinarlo con la zona del dispositivo
 * para reconstruir una fecha es justo la operación que en este proyecto ya
 * produjo horas corridas seis horas. Aquí la fecha y la hora se capturan como
 * texto plano y se interpretan de forma explícita:
 *
 * - En **vigencias del ACS** (`Valid.beginTime` / `endTime`) el texto ES el
 *   valor: reloj de pared del terminal, sin zona, se envía tal cual.
 * - En **reservas de espacios** el texto es reloj de pared de México y se
 *   convierte a un instante UTC con [AcsTime.mexicoLocalToInstantMillis] antes
 *   de mandarlo.
 *
 * Las dos rutas están cubiertas por pruebas.
 */
object ScheduleFormInput {

    private val DATE = Regex("^(\\d{4})-(\\d{1,2})-(\\d{1,2})$")
    private val TIME = Regex("^(\\d{1,2}):(\\d{2})$")

    private val DAYS_IN_MONTH = intArrayOf(31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)

    private fun isLeap(year: Int): Boolean =
        (year % 4 == 0 && year % 100 != 0) || year % 400 == 0

    private fun daysInMonth(year: Int, month: Int): Int = when {
        month < 1 || month > 12 -> 0
        month == 2 && isLeap(year) -> 29
        else -> DAYS_IN_MONTH[month - 1]
    }

    /** `"2026-09-06"` + `"08:30"` → reloj de pared. `null` si algo no cuadra. */
    fun parse(dateText: String, timeText: String, seconds: Int = 0): AcsTime.WallClock? {
        val d = DATE.matchEntire(dateText.trim()) ?: return null
        val t = TIME.matchEntire(timeText.trim()) ?: return null
        val year = d.groupValues[1].toIntOrNull() ?: return null
        val month = d.groupValues[2].toIntOrNull() ?: return null
        val day = d.groupValues[3].toIntOrNull() ?: return null
        val hour = t.groupValues[1].toIntOrNull() ?: return null
        val minute = t.groupValues[2].toIntOrNull() ?: return null
        if (year < 1970 || year > 9999) return null
        if (day < 1 || day > daysInMonth(year, month)) return null
        if (hour !in 0..23 || minute !in 0..59) return null
        return AcsTime.WallClock(year, month, day, hour, minute, seconds)
    }

    /** Reloj de pared → `"2026-09-06T08:30:00"`, el formato que guarda ISAPI. */
    fun toAcsWallClock(wc: AcsTime.WallClock): String =
        "${pad4(wc.year)}-${pad2(wc.month)}-${pad2(wc.day)}" +
            "T${pad2(wc.hour)}:${pad2(wc.minute)}:${pad2(wc.second)}"

    /** Parte fecha de un `"2026-09-06T08:30:00"` para rellenar el campo. */
    fun dateFieldOf(acs: String?): String {
        val value = acs?.trim().orEmpty()
        if (value.length < 10) return ""
        val candidate = value.take(10)
        return if (DATE.matches(candidate)) candidate else ""
    }

    /** Parte hora (`"08:30"`) de un `"2026-09-06T08:30:00"`. */
    fun timeFieldOf(acs: String?, fallback: String = "00:00"): String {
        val value = acs?.trim().orEmpty()
        if (value.length < 16) return fallback
        val candidate = value.substring(11, 16)
        return if (TIME.matches(candidate)) candidate else fallback
    }

    /** Campos prellenados con la hora de México, no la del dispositivo. */
    fun nowFieldsMexico(
        nowMillis: Long = System.currentTimeMillis(),
        plusMinutes: Int = 0,
    ): Pair<String, String> {
        val wc = AcsTime.mexicoPartsOf(nowMillis + plusMinutes * 60_000L)
        return "${pad4(wc.year)}-${pad2(wc.month)}-${pad2(wc.day)}" to
            "${pad2(wc.hour)}:${pad2(wc.minute)}"
    }

    /**
     * Reserva: fecha+hora de pared de México → instante ISO-8601 en UTC, listo
     * para `POST integra/spaces-bookings`.
     */
    fun bookingInstantUtc(dateText: String, timeText: String): String? {
        val wc = parse(dateText, timeText) ?: return null
        return AcsTime.toIsoUtc(AcsTime.mexicoLocalToInstantMillis(wc))
    }

    /** Valida un intervalo de reserva y explica en español qué falta. */
    fun validateBooking(
        title: String,
        startDate: String,
        startTime: String,
        endDate: String,
        endTime: String,
    ): String? {
        if (title.isBlank()) return "Escribe el motivo de la reserva"
        val start = parse(startDate, startTime)
            ?: return "Inicio no válido. Usa AAAA-MM-DD y HH:MM"
        val end = parse(endDate, endTime)
            ?: return "Fin no válido. Usa AAAA-MM-DD y HH:MM"
        val startMs = AcsTime.mexicoLocalToInstantMillis(start)
        val endMs = AcsTime.mexicoLocalToInstantMillis(end)
        if (endMs <= startMs) return "La hora de fin debe ser posterior al inicio"
        return null
    }

    private fun pad2(n: Int): String = if (n in 0..9) "0$n" else n.toString()

    private fun pad4(n: Int): String {
        val s = n.toString()
        return if (s.length >= 4) s else "0".repeat(4 - s.length) + s
    }
}
