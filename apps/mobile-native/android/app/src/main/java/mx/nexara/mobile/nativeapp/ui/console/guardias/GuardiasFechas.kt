package mx.nexara.mobile.nativeapp.ui.console.guardias

import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * Sábados y domingos del rango que devuelve `GET /guardias`.
 * Misma cuenta que `finesDeSemana` de `apps/web/lib/guardias-api.ts`:
 * el día se lee en UTC, no en la zona del teléfono.
 */
data class FinDeSemana(val sabado: String?, val domingo: String?)

object GuardiasTextos {
    const val VACIO = "No tienes guardias programadas."
    const val ERROR_CARGA = "No se pudieron cargar las guardias."
    const val ERROR_PROGRAMAR = "No se pudo programar la guardia."
    const val ERROR_QUITAR = "No se pudo quitar la guardia."
    const val EN_COLA = "Sin conexión: se enviará al volver la red."
    const val NADIE = "Nadie de guardia."

    fun confirmarQuitar(nombre: String, dia: String): String = "$nombre ya no podrá checar el $dia."
}

object GuardiasFechas {
    private val FECHA = DateTimeFormatter.ISO_LOCAL_DATE
    private val SEMANAS = arrayOf("dom", "lun", "mar", "mié", "jue", "vie", "sáb")
    private val MESES = arrayOf("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")

    fun fechaValida(fecha: String): LocalDate? {
        val t = fecha.trim()
        if (!Regex("""^\d{4}-\d{2}-\d{2}$""").matches(t)) return null
        return runCatching { LocalDate.parse(t, FECHA) }.getOrNull()?.takeIf { it.toString() == t }
    }

    /** 0 = domingo … 6 = sábado. */
    fun diaDeLaSemana(fecha: String): Int? {
        val d = fechaValida(fecha) ?: return null
        return d.dayOfWeek.value % 7
    }

    fun esFinDeSemana(fecha: String): Boolean {
        val dia = diaDeLaSemana(fecha) ?: return false
        return dia == 0 || dia == 6
    }

    /** Sábados y domingos entre dos fechas, inclusive, agrupados. Máximo 20. */
    fun finesDeSemana(desde: String, hasta: String): List<FinDeSemana> {
        val inicio = fechaValida(desde) ?: return emptyList()
        val fin = fechaValida(hasta) ?: return emptyList()
        if (fin < inicio) return emptyList()
        val out = ArrayList<FinDeSemana>()
        var d = inicio
        while (d <= fin && out.size < 20) {
            val clave = d.toString()
            when (d.dayOfWeek.value % 7) {
                6 -> out.add(FinDeSemana(sabado = clave, domingo = null))
                0 -> {
                    val ultimo = out.lastOrNull()
                    if (ultimo != null && ultimo.domingo == null && ultimo.sabado != null) {
                        out[out.lastIndex] = ultimo.copy(domingo = clave)
                    } else {
                        out.add(FinDeSemana(sabado = null, domingo = clave))
                    }
                }
            }
            d = d.plusDays(1)
        }
        return out
    }

    /** Sábados y domingos del rango que todavía se pueden programar (de hoy en adelante). */
    fun diasProgramables(desde: String, hasta: String, hoy: String): List<String> =
        finesDeSemana(desde, hasta).flatMap { listOfNotNull(it.sabado, it.domingo) }.filter { it >= hoy }

    /** «sáb 3 oct». Nombres fijos: el teléfono no decide el idioma de la etiqueta. */
    fun diaCorto(fecha: String): String {
        val d = fechaValida(fecha) ?: return fecha
        val semana = SEMANAS[d.dayOfWeek.value % 7]
        return "$semana ${d.dayOfMonth} ${MESES[d.monthValue - 1]}"
    }

    fun tituloFin(fin: FinDeSemana): String =
        listOfNotNull(fin.sabado, fin.domingo).joinToString(" · ") { diaCorto(it) }

    /** Sin gente a cargo y sin guardias propias: una frase, no el calendario vacío. */
    fun mostrarVacio(puedeProgramar: Boolean, guardias: Int): Boolean = !puedeProgramar && guardias == 0
}
