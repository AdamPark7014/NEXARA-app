package mx.nexara.mobile.nativeapp.ui.console.inicio

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.TextStyle
import java.util.Locale
import mx.nexara.mobile.nativeapp.data.api.FestivoDto
import mx.nexara.mobile.nativeapp.data.api.FestivosMioDto
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules

/**
 * Días festivos en «Mi día» (mockup aprobado por Adam el 29-10, tableros «App · quien descansa»
 * y «App · a quien le toca laborar»). Si a alguien le toca o no lo resuelve el servidor
 * (`GET festivos/mio`); aquí solo se nombra. Reglas puras: `FestivoRulesTest`.
 */
object FestivoRules {
    enum class Estado { NINGUNO, DESCANSA, LABORA }

    data class Proximo(val dia: String, val nombre: String, val como: String)

    data class Cifra(val etiqueta: String, val valor: String)

    private val ES = Locale.forLanguageTag("es-MX")

    /** [hoyMexico]: si la respuesta guardada ya no es de hoy (no se pudo volver a pedir), no cuenta. */
    fun estado(f: FestivosMioDto?, hoyMexico: String? = null): Estado {
        if (hoyMexico != null && f?.hoy?.take(10) != hoyMexico) return Estado.NINGUNO
        val hoy = f?.festivoHoy ?: return Estado.NINGUNO
        return if (hoy.como?.trabaja == true) Estado.LABORA else Estado.DESCANSA
    }

    /** «Día de la Revolución · festivo de ley» / «· lo da la empresa» / «· festivo trabajado». */
    fun chip(f: FestivoDto, estado: Estado): String {
        val nombre = f.nombre?.trim().takeUnless { it.isNullOrEmpty() } ?: "Día festivo"
        val tipo = when {
            estado == Estado.LABORA -> "festivo trabajado"
            f.origen.equals("EMPRESA", ignoreCase = true) -> "lo da la empresa"
            else -> "festivo de ley"
        }
        return "$nombre · $tipo"
    }

    const val TITULO_DESCANSA = "Hoy descansas"
    const val TEXTO_DESCANSA =
        "Es descanso pagado. No necesitas checar entrada ni salida, y este día no cuenta en tu desempeño."

    /** «Hoy te toca de 10:00 a 14:00»; sin horario propio, la jornada completa. */
    fun tituloLabora(f: FestivoDto): String {
        val h = horario(f) ?: return "Hoy te toca tu jornada completa"
        return "Hoy te toca de ${h.first} a ${h.second}"
    }

    fun textoLabora(f: FestivoDto): String? =
        if (f.como?.pagoDoble == true) "Se paga como festivo trabajado (doble)." else null

    /** Entrada, salida y jornada; vacío si le toca la jornada completa (no hay horario propio). */
    fun cifras(f: FestivoDto): List<Cifra> {
        val (entrada, salida) = horario(f) ?: return emptyList()
        val min = minutosEntre(entrada, salida)
        return listOfNotNull(
            Cifra("Entrada", entrada),
            Cifra("Salida", salida),
            min?.takeIf { it > 0 }?.let { Cifra("Jornada", CoreActivityRules.formatMinutes(it.toDouble())) },
        )
    }

    fun nota(f: FestivoDto): String? = f.nota?.trim()?.takeIf { it.isNotEmpty() }

    /**
     * El siguiente día de trabajo: entre semana y sin un festivo que no le toque. Hasta 14 días;
     * los fines de semana con guardia no cuentan aquí.
     */
    fun siguienteDiaDeTrabajo(f: FestivosMioDto): LocalDate? {
        val hoy = dia(f.hoy) ?: return null
        val descansos = f.proximos.orEmpty()
            .filter { it.como?.trabaja != true }
            .mapNotNull { dia(it.fecha) }
            .toSet()
        return (1L..14L).asSequence()
            .map { hoy.plusDays(it) }
            .firstOrNull { it.dayOfWeek != DayOfWeek.SATURDAY && it.dayOfWeek != DayOfWeek.SUNDAY && it !in descansos }
    }

    /** «Vuelves mañana» o «Vuelves el martes». */
    fun vuelves(hoy: LocalDate, siguiente: LocalDate): String =
        if (siguiente == hoy.plusDays(1)) "Vuelves mañana" else "Vuelves el ${siguiente.dayOfWeek.getDisplayName(TextStyle.FULL, ES)}"

    /** Lo de la tarjeta del día: «NOV», «17», «mar». */
    fun mesCorto(d: LocalDate): String = d.month.getDisplayName(TextStyle.SHORT, ES).replace(".", "").uppercase(ES)

    fun diaSemanaCorto(d: LocalDate): String = d.dayOfWeek.getDisplayName(TextStyle.SHORT, ES).replace(".", "").lowercase(ES)

    /** Los próximos festivos (sin el de hoy): «Vie 25 dic» · Navidad · «No se labora». */
    fun proximos(f: FestivosMioDto): List<Proximo> = f.proximos.orEmpty()
        .filter { it.fecha != f.hoy }
        .mapNotNull { p ->
            val d = dia(p.fecha) ?: return@mapNotNull null
            val nombre = p.nombre?.trim().takeUnless { it.isNullOrEmpty() } ?: return@mapNotNull null
            val dSemana = diaSemanaCorto(d).replaceFirstChar { it.titlecase(ES) }
            val mes = d.month.getDisplayName(TextStyle.SHORT, ES).replace(".", "").lowercase(ES)
            Proximo("$dSemana ${d.dayOfMonth} $mes", nombre, como(p))
        }

    /** «No se labora», «De 10:00 a 14:00» o «Se labora». */
    fun como(p: FestivoDto): String = when {
        p.como?.trabaja != true -> "No se labora"
        horario(p) != null -> horario(p)!!.let { "De ${it.first} a ${it.second}" }
        else -> "Se labora"
    }

    private fun horario(f: FestivoDto): Pair<String, String>? {
        val h = f.como?.horario ?: return null
        val e = hora(h.entrada) ?: return null
        val s = hora(h.salida) ?: return null
        return e to s
    }

    private fun hora(v: String?): String? =
        v?.trim()?.let { runCatching { LocalTime.parse(it.take(5)) }.getOrNull() }
            ?.let { "%02d:%02d".format(it.hour, it.minute) }

    private fun minutosEntre(a: String, b: String): Int? {
        val x = runCatching { LocalTime.parse(a) }.getOrNull() ?: return null
        val y = runCatching { LocalTime.parse(b) }.getOrNull() ?: return null
        return (y.toSecondOfDay() - x.toSecondOfDay()) / 60
    }

    private fun dia(v: String?): LocalDate? = v?.trim()?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
}
