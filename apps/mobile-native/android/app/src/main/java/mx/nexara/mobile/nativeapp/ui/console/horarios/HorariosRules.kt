package mx.nexara.mobile.nativeapp.ui.console.horarios

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import mx.nexara.mobile.nativeapp.data.api.DiaHorarioDto

/** Textos y reglas de Horarios. Sin Android: se prueba solo. */
object HorariosRules {
    private val MX: ZoneId = ZoneId.of("America/Mexico_City")
    private val ES = Locale("es", "MX")
    private val HORA = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")

    fun hoy(): LocalDate = LocalDate.now(MX)

    fun horaValida(t: String): Boolean = HORA.matches(t)

    /** «miércoles 25»; vacío si la fecha no se entiende. */
    fun dia(fecha: String?): String =
        runCatching { LocalDate.parse(fecha.orEmpty().take(10)) }.getOrNull()
            ?.let { it.format(DateTimeFormatter.ofPattern("EEEE d", ES)) }.orEmpty()

    fun diaConMayuscula(fecha: String?): String = dia(fecha).replaceFirstChar { it.titlecase(ES) }

    /** «10:00–18:00» o «Descansas». */
    fun rango(d: DiaHorarioDto): String {
        val e = d.horario?.horaEntrada.orEmpty()
        val s = d.horario?.horaSalida.orEmpty()
        return if (d.trabaja == false || e.isEmpty() || s.isEmpty()) "Descansas" else "$e–$s"
    }

    /** «Extendido por Luis: cerrar rack»; null si es el de siempre. */
    fun quienYPorQue(d: DiaHorarioDto): String? {
        if (d.programado != true) return null
        val que = when (d.ajuste) {
            "extender" -> "Extendido"
            "recortar" -> "Recortado"
            else -> "Programado"
        }
        val quien = d.loPuso?.trim()?.takeIf { it.isNotEmpty() }?.let { " por $it" }.orEmpty()
        val motivo = d.horario?.motivo?.trim()?.takeIf { it.isNotEmpty() }?.let { ": $it" }.orEmpty()
        return que + quien + motivo
    }

    /** «2 h», «2 h 30», «45 min». */
    fun horas(min: Int?): String {
        val n = (min ?: 0).coerceAtLeast(0)
        val h = n / 60
        val m = n % 60
        return when {
            h == 0 -> "$m min"
            m == 0 -> "$h h"
            else -> "$h h $m"
        }
    }

    /** La hora de una checada, en México. */
    fun horaDe(iso: String?): String? =
        runCatching { Instant.parse(iso.orEmpty()).atZone(MX).format(DateTimeFormatter.ofPattern("HH:mm")) }.getOrNull()

    /** Tres salidas cómodas para extender: las siguientes horas en punto después de la citada. */
    fun sugerenciasExtender(salida: String?): List<String> {
        if (salida == null || !horaValida(salida)) return emptyList()
        val h = salida.take(2).toInt()
        return (1..3).map { "%02d:00".format(Locale.ROOT, (h + it) % 24) }
    }

    /** Tres salidas antes de la citada, sin pasarse de la entrada. */
    fun sugerenciasRecortar(entrada: String?, salida: String?): List<String> {
        if (entrada == null || salida == null || !horaValida(entrada) || !horaValida(salida)) return emptyList()
        val total = duracion(entrada, salida)
        val h = salida.take(2).toInt()
        val base = if (salida.endsWith(":00")) 1 else 0
        return (0..2).map { "%02d:00".format(Locale.ROOT, (h - base - it + 48) % 24) }
            .filter { it != entrada && duracion(entrada, it) < total }
    }

    private fun duracion(e: String, s: String): Int {
        val a = e.take(2).toInt() * 60 + e.takeLast(2).toInt()
        val b = s.take(2).toInt() * 60 + s.takeLast(2).toInt()
        return if (b > a) b - a else b + 24 * 60 - a
    }

    /** null = se puede mandar. */
    fun falta(hora: String, entrada: String?, salida: String?, extender: Boolean): String? {
        if (!horaValida(hora)) return "Escribe la hora como 20:00"
        if (hora == entrada) return "La salida no puede ser igual a la entrada"
        if (entrada == null || salida == null || !horaValida(entrada) || !horaValida(salida)) return null
        val antes = duracion(entrada, salida)
        val ahora = duracion(entrada, hora)
        return when {
            extender && ahora <= antes -> "Para extender, la salida va después de las $salida"
            !extender && ahora >= antes -> "Para terminar antes, la salida va antes de las $salida"
            else -> null
        }
    }
}
