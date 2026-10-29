package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.ActivityCotizacionDto
import mx.nexara.mobile.nativeapp.ui.console.cotizaciones.CotizacionesRules

/**
 * La cotización ligada a una actividad comercial, como la web (`CotizacionDeActividad.tsx` y
 * `PropuestaEmbebida.tsx`): folio · estado · total y la propuesta en PDF
 * (`GET cotizaciones/:id/pdf`). El teléfono solo la consulta: hacerla o ligarla es de la computadora.
 * Reglas puras: `ActividadCotizacionRulesTest`.
 */
object ActividadCotizacionRules {
    const val TITULO = "Cotización"
    const val NOTA = "Las fotos del levantamiento de esta actividad salen como anexos (03 Planos) de la propuesta."
    const val BOTON = "Ver propuesta en PDF"
    const val ABRIENDO = "Abriendo la propuesta…"
    const val SIN_ACCESO = "No tienes acceso a cotizaciones"
    const val FALLO = "No se pudo generar la propuesta en PDF."

    /** Solo en comerciales con una cotización ligada. */
    fun aplica(coreKind: String?, cotizacion: ActivityCotizacionDto?): Boolean =
        CoreActivityRules.esComercial(coreKind) && (cotizacion?.id ?: 0L) > 0L

    fun folio(c: ActivityCotizacionDto): String =
        c.quoteNumber?.trim()?.takeIf { it.isNotEmpty() } ?: "#${c.id ?: 0}"

    /** El estado en español; sin estado conocido es «Borrador», como en la web. */
    fun estado(status: String?): String {
        val e = CotizacionesRules.estado(status)
        return if (e == CotizacionesRules.Estado.DESCONOCIDO) CotizacionesRules.Estado.BORRADOR.etiqueta else e.etiqueta
    }

    /** «COT-0012 · Enviada · $14,500.00» (sin total si no llega o no se lee). */
    fun linea(c: ActivityCotizacionDto): String =
        listOfNotNull(
            folio(c),
            estado(c.status),
            CotizacionesRules.pesos(c.total).takeIf { it != "—" },
        ).joinToString(" · ")

    /** El mensaje cuando el PDF no abre: 403 = el rol no ve cotizaciones. */
    fun error(prohibido: Boolean, mensaje: String?): String =
        if (prohibido) SIN_ACCESO else mensaje?.trim()?.takeIf { it.isNotEmpty() } ?: FALLO
}
