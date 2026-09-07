package mx.nexara.mobile.nativeapp.data.integra.schedules

import java.util.Calendar
import java.util.GregorianCalendar
import java.util.TimeZone

/**
 * Política de tiempo de los módulos HORARIOS y ESPACIOS de INTEGRA.
 *
 * ## Por qué existe este archivo
 *
 * En este dominio conviven **dos clases de tiempo que no se pueden mezclar**, y
 * mezclarlas es exactamente el bug que este proyecto ya ha pagado más de una vez
 * (una hora de comida corrida seis horas, por ejemplo). Se documentan aquí para
 * que nadie tenga que deducirlas leyendo llamadas sueltas:
 *
 * 1. **Reloj de pared del ACS** — `UserInfo.Valid.beginTime` / `endTime` y las
 *    franjas de `WeekPlanCfg` (`"2037-12-31T23:59:59"`, `"08:00:00"`). ISAPI las
 *    emite **sin designador de zona**: son la hora que marca el terminal colgado
 *    en la pared, en Puebla. No representan un instante universal. Se muestran
 *    y se editan **tal cual**, como texto; convertirlas por cualquier zona las
 *    desplaza. Para eso están [acsWallClockLabel], [acsHhMm] y [minutesOfDay],
 *    que no tocan ningún calendario.
 *
 * 2. **Instantes del servidor** — `spaces-bookings.startsAt` / `endsAt`,
 *    `lastAccess.occurredAt`, `generatedAt`. Prisma los guarda como `DateTime` y
 *    NestJS los serializa con `toISOString()`, así que llegan en **UTC con `Z`**.
 *    Sí son instantes universales y hay que **presentarlos en la zona en la que
 *    opera la empresa**, no en la del dispositivo: un teléfono en roaming, una
 *    tablet con la zona mal puesta o un emulador en UTC enseñarían la reserva
 *    seis horas corrida, y el operador de la puerta no tiene forma de notarlo.
 *
 * ## La zona que se usa, y por qué
 *
 * [MEXICO_ZONE_ID] = `America/Mexico_City`, **fija y deliberada**. NUNCA
 * `TimeZone.getDefault()`. La empresa opera en México; la hora que el operador
 * necesita leer es la hora de la puerta, no la de su teléfono. Es el mismo
 * criterio que `apps/api/src/common/time/workday.ts` aplica en el servidor.
 *
 * Se resuelve por identificador IANA (no por un offset a pelo) para que la
 * tzdata de la plataforma aporte el historial: México suprimió el horario de
 * verano en octubre de 2022, pero una reserva o un evento anterior a esa fecha
 * sigue necesitando −05:00 en verano, y la tzdata lo sabe.
 *
 * ## Por qué `java.util` y no `java.time`
 *
 * El módulo declara `minSdk = 24` y **no tiene `coreLibraryDesugaring`
 * habilitado**, así que `java.time` sólo existe a partir de API 26. Este archivo
 * se queda en `Calendar` / `TimeZone`, disponibles desde API 1, para que las dos
 * pantallas nuevas funcionen en todo el rango declarado. (Hay ~40 archivos del
 * proyecto que ya importan `java.time` sin desugaring; se reporta aparte.)
 */
object AcsTime {

    const val MEXICO_ZONE_ID: String = "America/Mexico_City"

    /** Convención Hikvision para «sin fecha fin». */
    const val ISAPI_INDEFINITE_END: String = "2037-12-31T23:59:59"

    /** Inicio por defecto de una vigencia ISAPI. */
    const val ISAPI_DEFAULT_BEGIN: String = "2020-01-01T00:00:00"

    private val DAY_SHORT = arrayOf("dom", "lun", "mar", "mié", "jue", "vie", "sáb")
    private val MONTH_SHORT = arrayOf(
        "ene", "feb", "mar", "abr", "may", "jun",
        "jul", "ago", "sep", "oct", "nov", "dic",
    )

    /**
     * Regex de ISO-8601 tolerante: acepta `T` o espacio, segundos y fracción
     * opcionales, y designador de zona opcional (`Z`, `+HH:MM`, `-HHMM`).
     */
    private val ISO = Regex(
        "^(\\d{4})-(\\d{2})-(\\d{2})[Tt ](\\d{1,2}):(\\d{2})(?::(\\d{2}))?" +
            "(?:\\.(\\d{1,9}))?\\s*(Z|z|[+-]\\d{2}:?\\d{2})?$",
    )

    private val HHMM = Regex("^(\\d{1,2}):(\\d{2})")

    /**
     * Zona de la empresa. Si la tzdata del dispositivo no conociera el id,
     * `TimeZone.getTimeZone` devuelve GMT en silencio; se detecta comparando el
     * id resuelto y se deja constancia en [zoneResolved] para que la UI pueda
     * avisar en vez de mentir con horas de Greenwich.
     */
    fun mexicoTimeZone(): TimeZone = TimeZone.getTimeZone(MEXICO_ZONE_ID)

    /** false = la plataforma no conoce `America/Mexico_City` y cayó a GMT. */
    val zoneResolved: Boolean get() = mexicoTimeZone().id == MEXICO_ZONE_ID

    /** Partes de un reloj de pared, sin zona asociada. */
    data class WallClock(
        val year: Int,
        val month: Int,
        val day: Int,
        val hour: Int,
        val minute: Int,
        val second: Int = 0,
    )

    // ── Instantes (UTC del servidor ⇄ pared de México) ────────────────────────

    /**
     * Milisegundos epoch de una marca ISO-8601 del servidor.
     *
     * Con designador de zona (`Z` o `±HH:MM`) se respeta el que venga. **Sin
     * designador** se interpreta como reloj de pared de México, que es la
     * lectura correcta aquí: una marca ingenua en este API es el espejo de un
     * equipo instalado en sitio, no una hora de Greenwich.
     *
     * Devuelve `null` si la cadena no es una fecha reconocible, para que quien
     * llame pinte «—» en vez de una fecha de 1970.
     */
    fun parseInstantMillis(iso: String?): Long? {
        val m = ISO.matchEntire(iso?.trim().orEmpty()) ?: return null
        val year = m.groupValues[1].toIntOrNull() ?: return null
        val month = m.groupValues[2].toIntOrNull() ?: return null
        val day = m.groupValues[3].toIntOrNull() ?: return null
        val hour = m.groupValues[4].toIntOrNull() ?: return null
        val minute = m.groupValues[5].toIntOrNull() ?: return null
        val second = m.groupValues[6].toIntOrNull() ?: 0
        val millis = fractionToMillis(m.groupValues[7])
        val zone = m.groupValues[8]

        if (zone.isBlank()) {
            return mexicoLocalToInstantMillis(
                WallClock(year, month, day, hour, minute, second),
            ) + millis
        }
        val utc = civilToMillis(TimeZone.getTimeZone("UTC"), year, month, day, hour, minute, second)
        val offset = offsetMillisOf(zone) ?: return null
        return utc - offset + millis
    }

    private fun fractionToMillis(raw: String): Long {
        if (raw.isBlank()) return 0L
        val padded = (raw + "000").substring(0, 3)
        return padded.toLongOrNull() ?: 0L
    }

    private fun offsetMillisOf(zone: String): Long? {
        if (zone.equals("Z", ignoreCase = true)) return 0L
        val sign = if (zone.startsWith("-")) -1 else 1
        val digits = zone.drop(1).replace(":", "")
        if (digits.length != 4) return null
        val h = digits.substring(0, 2).toIntOrNull() ?: return null
        val mi = digits.substring(2, 4).toIntOrNull() ?: return null
        return sign * (h * 3_600_000L + mi * 60_000L)
    }

    private fun civilToMillis(
        tz: TimeZone,
        year: Int,
        month: Int,
        day: Int,
        hour: Int,
        minute: Int,
        second: Int,
    ): Long {
        val cal = GregorianCalendar(tz)
        cal.clear()
        cal.set(year, month - 1, day, hour, minute, second)
        return cal.timeInMillis
    }

    /** Reloj de pared de México → instante epoch. Usado al crear una reserva. */
    fun mexicoLocalToInstantMillis(wc: WallClock): Long =
        civilToMillis(mexicoTimeZone(), wc.year, wc.month, wc.day, wc.hour, wc.minute, wc.second)

    /** Instante epoch → reloj de pared de México. Usado al pintar. */
    fun mexicoPartsOf(millis: Long): WallClock {
        val cal = GregorianCalendar(mexicoTimeZone())
        cal.timeInMillis = millis
        return WallClock(
            year = cal.get(Calendar.YEAR),
            month = cal.get(Calendar.MONTH) + 1,
            day = cal.get(Calendar.DAY_OF_MONTH),
            hour = cal.get(Calendar.HOUR_OF_DAY),
            minute = cal.get(Calendar.MINUTE),
            second = cal.get(Calendar.SECOND),
        )
    }

    /** Offset de México en ese instante, en minutos (−360 fuera de horario de verano). */
    fun mexicoOffsetMinutes(millis: Long): Int = mexicoTimeZone().getOffset(millis) / 60_000

    /**
     * Instante epoch → `yyyy-MM-ddTHH:mm:ss.SSSZ`, que es lo que espera el
     * `new Date(...)` del `POST integra/spaces-bookings`. Se envía en UTC a
     * propósito: el servidor guarda instantes, no relojes de pared.
     */
    fun toIsoUtc(millis: Long): String {
        val cal = GregorianCalendar(TimeZone.getTimeZone("UTC"))
        cal.timeInMillis = millis
        return buildString {
            append(pad4(cal.get(Calendar.YEAR))).append('-')
            append(pad2(cal.get(Calendar.MONTH) + 1)).append('-')
            append(pad2(cal.get(Calendar.DAY_OF_MONTH))).append('T')
            append(pad2(cal.get(Calendar.HOUR_OF_DAY))).append(':')
            append(pad2(cal.get(Calendar.MINUTE))).append(':')
            append(pad2(cal.get(Calendar.SECOND))).append('.')
            append(pad3(cal.get(Calendar.MILLISECOND))).append('Z')
        }
    }

    // ── Formato para pantalla (siempre en hora de México) ─────────────────────

    /** `"14:30"` en hora de México. */
    fun hhMmMexico(iso: String?): String =
        parseInstantMillis(iso)?.let { hhMmMexico(it) } ?: "—"

    fun hhMmMexico(millis: Long): String {
        val wc = mexicoPartsOf(millis)
        return "${pad2(wc.hour)}:${pad2(wc.minute)}"
    }

    /** `"sáb 6 sep · 14:30"` en hora de México. */
    fun dayTimeMexico(iso: String?): String =
        parseInstantMillis(iso)?.let { dayTimeMexico(it) } ?: "—"

    fun dayTimeMexico(millis: Long): String {
        val cal = GregorianCalendar(mexicoTimeZone())
        cal.timeInMillis = millis
        val dow = DAY_SHORT.getOrElse(cal.get(Calendar.DAY_OF_WEEK) - 1) { "" }
        val month = MONTH_SHORT.getOrElse(cal.get(Calendar.MONTH)) { "" }
        val day = cal.get(Calendar.DAY_OF_MONTH)
        return "$dow $day $month · ${pad2(cal.get(Calendar.HOUR_OF_DAY))}:${pad2(cal.get(Calendar.MINUTE))}"
    }

    /** `"06/09/2026"` en hora de México. */
    fun dateMexico(millis: Long): String {
        val wc = mexicoPartsOf(millis)
        return "${pad2(wc.day)}/${pad2(wc.month)}/${pad4(wc.year)}"
    }

    /**
     * Rango de una ventana de uso. El fin lleva fecha completa si cae en otro
     * día que el inicio; sin eso una reserva de 23:00 a 01:00 se lee como si
     * terminara antes de empezar.
     */
    fun rangeMexico(startIso: String?, endIso: String?): String {
        val a = parseInstantMillis(startIso)
        val b = parseInstantMillis(endIso)
        if (a == null && b == null) return "—"
        if (a == null) return "hasta ${dayTimeMexico(b ?: 0L)}"
        if (b == null) return "desde ${dayTimeMexico(a)}"
        val sameDay = mexicoPartsOf(a).let { s ->
            val e = mexicoPartsOf(b)
            s.year == e.year && s.month == e.month && s.day == e.day
        }
        return if (sameDay) "${dayTimeMexico(a)} → ${hhMmMexico(b)}"
        else "${dayTimeMexico(a)} → ${dayTimeMexico(b)}"
    }

    /** «hace 4 min» / «hace 3 h» / fecha larga a partir de 36 h. */
    fun relativeEs(iso: String?, nowMillis: Long = System.currentTimeMillis()): String {
        val t = parseInstantMillis(iso) ?: return "—"
        val seconds = ((nowMillis - t) / 1000L).coerceAtLeast(0L)
        if (seconds < 60L) return "hace ${seconds}s"
        val minutes = seconds / 60L
        if (minutes < 60L) return "hace $minutes min"
        val hours = minutes / 60L
        if (hours < 36L) return "hace $hours h"
        return dayTimeMexico(t)
    }

    // ── Reloj de pared del ACS (SIN conversión de zona) ───────────────────────

    /**
     * `"2026-09-06T08:00:00"` → `"06/09/2026 08:00"`. Reordena caracteres y nada
     * más: la marca del ACS ya está en la hora del terminal y convertirla la
     * movería. Si la cadena no tiene la forma esperada se devuelve intacta, que
     * es menos dañino que inventar una fecha.
     */
    fun acsWallClockLabel(raw: String?): String {
        val value = raw?.trim().orEmpty()
        if (value.isEmpty()) return "—"
        val m = ISO.matchEntire(value) ?: return value
        val date = "${m.groupValues[3]}/${m.groupValues[2]}/${m.groupValues[1]}"
        val time = "${pad2(m.groupValues[4].toIntOrNull() ?: 0)}:${m.groupValues[5]}"
        return "$date $time"
    }

    /** `"08:00:00"` o `"2026-09-06T08:00:00"` → `"08:00"`, sin conversión. */
    fun acsHhMm(raw: String?): String {
        val value = raw?.trim().orEmpty()
        if (value.isEmpty()) return "??:??"
        val iso = ISO.matchEntire(value)
        if (iso != null) {
            return "${pad2(iso.groupValues[4].toIntOrNull() ?: 0)}:${iso.groupValues[5]}"
        }
        val hm = HHMM.find(value) ?: return value
        return "${pad2(hm.groupValues[1].toIntOrNull() ?: 0)}:${hm.groupValues[2]}"
    }

    /** Minutos desde medianoche de un `HH:MM[:SS]` del ACS. `null` si no parsea. */
    fun minutesOfDay(raw: String?): Int? {
        val hm = HHMM.find(raw?.trim().orEmpty()) ?: return null
        val h = hm.groupValues[1].toIntOrNull() ?: return null
        val mi = hm.groupValues[2].toIntOrNull() ?: return null
        if (h < 0 || mi < 0 || mi > 59) return null
        return minOf(1440, h * 60 + mi)
    }

    /**
     * Franja como fracción del día `[inicio, ancho]` en 0..1, para la barra de
     * 24 h. Un fin en `00:00` es la medianoche siguiente, no el mismo instante
     * que el principio: así escribe el terminal el día completo, y sin esta
     * corrección la banda salía de ancho cero.
     */
    fun bandGeometry(beginTime: String?, endTime: String?): Pair<Float, Float>? {
        val a = minutesOfDay(beginTime) ?: return null
        val rawEnd = minutesOfDay(endTime) ?: return null
        val b = if (rawEnd <= a) 1440 else rawEnd
        val start = a / 1440f
        val width = ((b - a) / 1440f).coerceAtLeast(0.01f)
        return start to width
    }

    // ── Vigencia ─────────────────────────────────────────────────────────────

    /** Un fin en 2037 / 2099 / 9999 es la marca ISAPI de «sin fecha fin». */
    fun isIndefiniteEnd(end: String?): Boolean {
        val value = end?.trim().orEmpty()
        if (value.isEmpty()) return true
        return value.startsWith("2037") || value.startsWith("2099") || value.startsWith("9999")
    }

    /**
     * Etiqueta de vigencia lista para pintar. Espeja `formatValidityLabel` de
     * `apps/web/.../_schedulesApi.ts` para que las dos plataformas digan lo
     * mismo con los mismos datos.
     */
    fun validityLabel(
        validEnable: Boolean?,
        validFrom: String?,
        validTo: String?,
        indefinite: Boolean? = null,
        validMode: String? = null,
    ): String {
        if (validMode == "disabled" || validEnable == false) return "Sin acceso"
        if (validMode == "indefinite" || indefinite == true || isIndefiniteEnd(validTo)) {
            return "Indefinido"
        }
        val from = validFrom?.trim()?.take(10).orEmpty().ifBlank { "—" }
        val to = validTo?.trim()?.take(10).orEmpty().ifBlank { "—" }
        return "$from → $to"
    }

    // ── Utilidades de formato ────────────────────────────────────────────────

    private fun pad2(n: Int): String = if (n in 0..9) "0$n" else n.toString()
    private fun pad3(n: Int): String = when {
        n in 0..9 -> "00$n"
        n in 10..99 -> "0$n"
        else -> n.toString()
    }

    private fun pad4(n: Int): String {
        val s = n.toString()
        return if (s.length >= 4) s else "0".repeat(4 - s.length) + s
    }
}
