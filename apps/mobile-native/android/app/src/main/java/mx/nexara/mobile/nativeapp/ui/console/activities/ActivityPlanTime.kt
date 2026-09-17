package mx.nexara.mobile.nativeapp.ui.console.activities

import kotlin.math.round

/**
 * «Tiempo estimado» de quien asigna → `horasPlan` (contrato B).
 *
 * La gente escribe «1.5», «1,5» o «2» horas; el API quiere horas decimales.
 * Sin Android: se prueba en la JVM (`ActivityPlanTimeTest`).
 */
object ActivityPlanTime {

    /** Máximo razonable de una jornada; más que eso casi siempre es un dedazo. */
    const val MAX_HORAS = 24.0

    /** Solo dígitos y un separador decimal: lo que se deja teclear en el campo. */
    fun filtrarEntrada(texto: String): String {
        val limpio = texto.replace(',', '.').filter { it.isDigit() || it == '.' }
        val punto = limpio.indexOf('.')
        if (punto < 0) return limpio.take(5)
        return (limpio.substring(0, punto + 1) + limpio.substring(punto + 1).filter { it.isDigit() }).take(5)
    }

    /** `null` cuando está vacío o no es un número útil (0, negativo, absurdo). */
    fun horas(texto: String?): Double? {
        val valor = texto?.trim()?.replace(',', '.')?.takeIf { it.isNotEmpty() }?.toDoubleOrNull() ?: return null
        if (!valor.isFinite() || valor <= 0.0 || valor > MAX_HORAS) return null
        return round(valor * 100) / 100
    }

    /** El alta ya pregunta minutos: se convierten a horas para `horasPlan`. */
    fun horasDesdeMinutos(minutos: Double?): Double? {
        val m = minutos?.takeIf { it.isFinite() && it > 0 } ?: return null
        return round(m / 60.0 * 100) / 100
    }

    fun horasDesdeMinutos(minutos: Int?): Double? = horasDesdeMinutos(minutos?.toDouble())
}
