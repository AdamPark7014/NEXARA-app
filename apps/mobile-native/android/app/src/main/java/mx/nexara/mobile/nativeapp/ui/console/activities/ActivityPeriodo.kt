package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.ActivityPeriodoDto

/**
 * Periodo de una actividad de varios días (regla del 18-09).
 *
 * La actividad sigue en «Mis actividades» cada día hasta su fin y no cuenta como atrasada
 * antes del último día. La frase («Día 3 de 10 · termina vie 25 sep») la arma la API con el
 * «hoy» de México; aquí solo se decide qué mostrar. Con una API vieja no llega nada y todo
 * queda como antes.
 */
object ActivityPeriodo {

    /** La frase del periodo si la hay; si no, lo de siempre (día y hora programados). */
    fun cuandoTexto(periodo: ActivityPeriodoDto?, siNoHay: String?): String? =
        periodo?.etiqueta?.trim()?.takeIf { it.isNotEmpty() } ?: siNoHay

    /** Pasó su último día y sigue abierta: se pinta en rojo. */
    fun vencido(periodo: ActivityPeriodoDto?): Boolean = periodo?.estado == "vencida"

    /** Todavía no llega su primer día. */
    fun programada(periodo: ActivityPeriodoDto?): Boolean = periodo?.estado == "programada"
}
