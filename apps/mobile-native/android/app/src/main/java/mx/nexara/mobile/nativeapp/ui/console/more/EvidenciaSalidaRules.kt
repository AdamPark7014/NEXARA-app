package mx.nexara.mobile.nativeapp.ui.console.more

import mx.nexara.mobile.nativeapp.data.api.HerramientaActividadDto

/**
 * Evidencia de una salida de almacén (21-11-2026): lo que sale lleva responsable, foto, y la
 * actividad a la que se carga o el motivo. Reglas puras, se prueban en la JVM; son las mismas
 * que aplica la web (`apps/web/lib/stock-api.ts`) y el servidor (`evidencia-salida.ts`).
 */
object EvidenciaSalidaRules {

    /** Fotos por subida (el tope del `FilesInterceptor` de `stock/movements/:id/evidencia`). */
    const val MAX_FOTOS = 8

    /** Largo máximo de un número de serie (el del DTO del servidor). */
    private const val MAX_LARGO_SERIE = 80

    /**
     * Números de serie como se teclean o se pegan: uno por renglón (también coma o punto y
     * coma), en mayúsculas y sin repetir.
     */
    fun series(texto: String): List<String> {
        val vistas = LinkedHashSet<String>()
        texto.split('\n', '\r', ',', ';').forEach { cruda ->
            val serie = cruda.trim().replace(Regex("\\s+"), " ").uppercase()
            if (serie.isNotEmpty() && serie.length <= MAX_LARGO_SERIE) vistas.add(serie)
        }
        return vistas.toList()
    }

    /** Piezas que de verdad se mueven: si se leyó una caja, la cantidad cuenta cajas. */
    fun piezas(cantidad: Double, piezasPorCaja: Double?): Double =
        if (piezasPorCaja != null && piezasPorCaja > 0) cantidad * piezasPorCaja else cantidad

    /** No puede haber más series que piezas; `null` si cuadra. */
    fun errorSeries(series: Int, piezas: Double): String? =
        if (series > Math.ceil(piezas).toInt()) {
            "Hay $series ${if (series == 1) "número de serie" else "números de serie"} y el movimiento es de " +
                "${AlmacenRules.formato(piezas)} ${if (piezas == 1.0) "pieza" else "piezas"}."
        } else {
            null
        }

    /** Qué le falta a una salida para registrarse; `null` si ya está completa. */
    fun errorSalida(recibeId: Long?, fotos: Int, actividadId: Long?, motivo: String): String? = when {
        recibeId == null -> "Elige quién se lleva el material."
        fotos <= 0 -> "Toma al menos una foto de lo que sale."
        actividadId == null && motivo.isBlank() -> "Liga la salida a una actividad o escribe para qué es."
        else -> null
    }

    /** «AN-120 · Instalación día 1», con lo que haya. */
    fun textoActividad(a: HerramientaActividadDto): String =
        listOfNotNull(a.anNumber?.trim()?.ifEmpty { null }, a.titulo?.trim()?.ifEmpty { null })
            .joinToString(" · ")
            .ifEmpty { "Actividad ${a.id ?: ""}".trim() }

    /** El movimiento quedó hecho pero las fotos no subieron: se dice, no se esconde. */
    fun avisoFotosPendientes(aviso: String): String =
        "$aviso Las fotos no se subieron: agrégalas desde la web, en Movimientos."
}
