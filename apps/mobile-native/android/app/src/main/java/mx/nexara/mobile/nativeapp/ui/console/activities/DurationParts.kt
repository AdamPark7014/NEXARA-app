package mx.nexara.mobile.nativeapp.ui.console.activities

/**
 * Tiempo estimado como horas + minutos (lo que la gente entiende),
 * convertido a minutos totales para el API (`tiempoEstimadoMin`).
 */
object DurationParts {
    data class Parts(val horas: Int, val minutos: Int)

    fun fromMinutes(total: Int?): Parts {
        val n = (total ?: 0).coerceAtLeast(0)
        return Parts(horas = n / 60, minutos = n % 60)
    }

    fun toMinutes(horas: Int, minutos: Int): Int =
        horas.coerceAtLeast(0) * 60 + minutos.coerceIn(0, 59)

    fun label(horas: Int, minutos: Int): String {
        val h = horas.coerceAtLeast(0)
        val m = minutos.coerceIn(0, 59)
        if (h == 0 && m == 0) return "Sin tiempo"
        if (h == 0) return "$m min"
        if (m == 0) return if (h == 1) "1 h" else "$h h"
        return "$h h $m min"
    }
}
