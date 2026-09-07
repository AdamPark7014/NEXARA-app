package mx.nexara.mobile.nativeapp.ui.integra.common

import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Fechas y horas de INTEGRA.
 *
 * Las pantallas pintaban la marca de tiempo cruda: `2026-09-06T19:24:11.000Z`.
 * Nadie en una caseta lee eso. Peor: esa `Z` es UTC, así que un acceso de las
 * 13:24 de Puebla se leía como las 19:24.
 *
 * El servidor mezcla tres formatos y hay que aguantar los tres:
 *  - ISO con `Z` (`toISOString()`): asistencia, ocupación, alarmas SOC, sitios.
 *  - ISO con desfase (`2026-09-06T13:24:11-06:00`): eventos Artemis.
 *  - Hora local **sin desfase** (`2026-09-06T13:24:11`): eventos ISAPI y las
 *    vigencias de persona (`validTo: 2037-12-31T23:59:59`). Aquí no hay nada
 *    que convertir: el equipo ya dio la hora de pared.
 *
 * Todo recibe la zona por parámetro para poder probarlo sin depender del
 * dispositivo.
 */
object IntegraFormat {

    /** Zona de operación real del parque. Solo se usa como fallback explícito. */
    val MexicoCity: ZoneId = ZoneId.of("America/Mexico_City")

    private val HOUR_MINUTE = DateTimeFormatter.ofPattern("HH:mm", Locale("es", "MX"))
    private val DAY_MONTH_HOUR = DateTimeFormatter.ofPattern("dd/MM HH:mm", Locale("es", "MX"))
    private val FULL = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm", Locale("es", "MX"))
    private val DAY_LONG = DateTimeFormatter.ofPattern("EEE dd 'de' MMM", Locale("es", "MX"))

    /**
     * Interpreta cualquiera de los tres formatos. Devuelve el instante ya
     * situado en [zone]; para la hora local sin desfase se asume que la hora de
     * pared es la de [zone], que es lo que el terminal quiso decir.
     */
    fun parse(raw: String?, zone: ZoneId): ZonedDateTime? {
        val s = raw?.trim().orEmpty()
        if (s.isEmpty() || s == "null" || s == "undefined") return null
        // 1) Con desfase explícito o `Z`.
        runCatching { return OffsetDateTime.parse(s).atZoneSameInstant(zone) }
        runCatching { return Instant.parse(s).atZone(zone) }
        // 2) Hora de pared sin desfase, con o sin la `T`.
        runCatching { return LocalDateTime.parse(s).atZone(zone) }
        runCatching { return LocalDateTime.parse(s.replace(' ', 'T')).atZone(zone) }
        // 3) Solo fecha (`day` de asistencia: 2026-09-06).
        runCatching { return LocalDate.parse(s).atStartOfDay(zone) }
        return null
    }

    /** `06/09/2026 13:24`, o `—` si no vino nada legible. */
    fun dateTime(raw: String?, zone: ZoneId): String = format(raw, zone, FULL)

    /** `06/09 13:24` — para listas donde el año no aporta. */
    fun shortDateTime(raw: String?, zone: ZoneId): String = format(raw, zone, DAY_MONTH_HOUR)

    /** `13:24` — para columnas de entrada/salida del mismo día. */
    fun time(raw: String?, zone: ZoneId): String = format(raw, zone, HOUR_MINUTE)

    /** `vie 06 de sep` — encabezado de día en asistencia. */
    fun dayLabel(raw: String?, zone: ZoneId): String = format(raw, zone, DAY_LONG)

    private fun format(raw: String?, zone: ZoneId, fmt: DateTimeFormatter): String {
        val z = parse(raw, zone) ?: return EMPTY
        return try {
            fmt.format(z)
        } catch (_: DateTimeException) {
            EMPTY
        }
    }

    /**
     * «hace 3 min», «hace 2 h», «ayer», «hace 4 d». Sin futuros inventados: si
     * la marca es posterior a `now` (relojes de terminal desfasados, que los
     * hay) se dice «ahora» en vez de «en -2 min».
     */
    fun relative(raw: String?, zone: ZoneId, now: Instant): String {
        val z = parse(raw, zone) ?: return EMPTY
        val seconds = now.epochSecond - z.toInstant().epochSecond
        return when {
            seconds < 60 -> "ahora"
            seconds < 3600 -> "hace ${seconds / 60} min"
            seconds < 86_400 -> "hace ${seconds / 3600} h"
            seconds < 172_800 -> "ayer"
            seconds < 2_592_000 -> "hace ${seconds / 86_400} d"
            else -> shortDateTime(raw, zone)
        }
    }

    /** Día absoluto, para restar vigencias sin arrastrar horas ni husos. */
    fun epochDay(raw: String?, zone: ZoneId): Long? = parse(raw, zone)?.toLocalDate()?.toEpochDay()

    /** `YYYY-MM-DD` del día local, que es lo que aceptan `validFrom`/`validTo`. */
    fun isoDate(raw: String?, zone: ZoneId): String =
        parse(raw, zone)?.toLocalDate()?.toString() ?: ""

    /** `8 h 12 min`, `47 min`, o `—` si la API mandó `null` (que es un dato). */
    fun duration(minutes: Int?): String {
        if (minutes == null || minutes < 0) return EMPTY
        if (minutes < 60) return "$minutes min"
        val h = minutes / 60
        val m = minutes % 60
        return if (m == 0) "$h h" else "$h h $m min"
    }

    const val EMPTY = "—"
}
