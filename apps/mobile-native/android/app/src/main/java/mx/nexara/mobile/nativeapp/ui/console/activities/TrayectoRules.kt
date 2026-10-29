package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.TrayectoDto

/**
 * Trayecto de una actividad (API `me/activities/:id/trayectos`, 29-10): «Iniciar trayecto» →
 * llegar e «Iniciar actividad» (la ida se cierra sola) → entregar en el sitio → «Regreso a la
 * oficina» → «Llegué». Cada tramo se mide aparte del reloj de la actividad y se califica contra
 * la ruta + 25 %. Sin Android: se prueba en la JVM (`TrayectoRulesTest`).
 */
object TrayectoRules {
    const val IDA = "IDA"
    const val REGRESO = "REGRESO"

    enum class Accion { INICIAR_IDA, LLEGUE, REGRESO, NINGUNA }

    data class Estado(
        val accion: Accion,
        val titulo: String?,
        val detalle: String?,
        /** Tramos ya cerrados: «Ida · 18 min · en tiempo». */
        val resumen: List<String>,
    ) {
        /** Sin nada que hacer ni que contar: la tarjeta no se pinta. */
        val vacio: Boolean get() = accion == Accion.NINGUNA && titulo == null && resumen.isEmpty()
    }

    fun abierto(tramos: List<TrayectoDto>): TrayectoDto? = tramos.lastOrNull { it.endedAt.isNullOrBlank() }

    /**
     * Qué toca ahora.
     * - [iniciada]: ya tiene hora real de inicio (o va «En Proceso»).
     * - [entregada]: ya mandó su evidencia (Por Validar o cerrada con éxito): ahí se ofrece el regreso.
     * - [cancelada]: cancelada o «No cumplida»: ya no se ofrece ningún tramo nuevo.
     */
    fun estado(
        tramos: List<TrayectoDto>,
        iniciada: Boolean,
        entregada: Boolean,
        cancelada: Boolean,
    ): Estado {
        val resumen = tramos.filter { !it.endedAt.isNullOrBlank() }.map(::resumenDe)
        val abierto = abierto(tramos)
        if (abierto != null) {
            val ida = abierto.tipo == IDA
            val desde = CoreActivityRules.formatClock(abierto.startedAt).takeIf { it != "—" }
            val ruta = abierto.estimadoMin?.takeIf { it > 0 }?.let { "Ruta de ${CoreActivityRules.formatMinutes(it)}" }
            return Estado(
                accion = Accion.LLEGUE,
                titulo = (if (ida) "En camino al sitio" else "De regreso a la oficina") + (desde?.let { " desde $it" } ?: ""),
                detalle = listOfNotNull(
                    ruta,
                    if (ida) "al llegar, inicia la actividad y la ida se cierra sola" else "toca «Llegué» al entrar",
                ).joinToString(" · ").replaceFirstChar { it.uppercaseChar() },
                resumen = resumen,
            )
        }
        if (cancelada) return Estado(Accion.NINGUNA, null, null, resumen)
        val yaFue = tramos.any { it.tipo == IDA }
        val yaRegreso = tramos.any { it.tipo == REGRESO }
        if (!iniciada && !yaFue) {
            return Estado(
                Accion.INICIAR_IDA,
                "¿Vas al sitio?",
                "«Iniciar trayecto» mide el camino; se cierra solo al iniciar la actividad.",
                resumen,
            )
        }
        if (entregada && !yaRegreso) {
            return Estado(
                Accion.REGRESO,
                "¿Regresas a la oficina?",
                "Mide el regreso; toca «Llegué» al entrar. Al checar salida se cierra solo.",
                resumen,
            )
        }
        return Estado(Accion.NINGUNA, null, null, resumen)
    }

    /** «Ida · 18 min · en tiempo» o «Regreso · 32 min · se pasó (ruta 21 min)». */
    fun resumenDe(t: TrayectoDto): String {
        val nombre = if (t.tipo == REGRESO) "Regreso" else "Ida"
        val dur = t.minutos?.let { CoreActivityRules.formatMinutes(it.coerceAtLeast(1.0)) }
        val calif = when (t.estado) {
            "en_tiempo" -> "en tiempo"
            "excedido" -> t.estimadoMin?.takeIf { it > 0 }
                ?.let { "se pasó (ruta ${CoreActivityRules.formatMinutes(it)})" } ?: "se pasó"
            else -> null
        }
        return listOfNotNull(nombre, dur, calif).joinToString(" · ")
    }

    /** Estatus que ya no admiten tramos nuevos. */
    fun cancelada(estatus: String?): Boolean =
        Regex("cancelada|no cumplida|incumplida", RegexOption.IGNORE_CASE).containsMatchIn(estatus.orEmpty())

    /** Ya entregó en el sitio: evidencia enviada o actividad cerrada con éxito. */
    fun entregada(estatus: String?, fotoSalida: Boolean): Boolean =
        fotoSalida || Regex("validar|finalizada|completada|aprobada", RegexOption.IGNORE_CASE).containsMatchIn(estatus.orEmpty())
}
