package mx.nexara.mobile.nativeapp.ui.console.aprobaciones

import mx.nexara.mobile.nativeapp.data.api.LoteItemDto
import mx.nexara.mobile.nativeapp.data.api.RevisionPendienteDto

/**
 * La bandeja de Aprobaciones junta lo que espera tu firma, venga de donde venga.
 *
 * Adam (04-11-2026): «en aprobaciones no le aparece nada sin embargo si hay por revisar cosas». Solo
 * leía `workflow/my-pending`, que nunca ha tenido filas; las evidencias viven en `me/revisiones`.
 *
 * Sin Android: se prueba en la JVM (`BandejaRulesTest`). Espejo: `BandejaRules.swift`.
 */
object BandejaRules {
    /** Lo que acepta la API de una sola vez. */
    const val TOPE_LOTE = 50
    const val NOTA_LOTE = "Revisado en lote: todo correcto."
    const val MIN_NOTA = 5
    const val FILAS_A_LA_VISTA = 5

    data class Evidencias(
        val teTocan: List<RevisionPendienteDto> = emptyList(),
        val deOtros: List<RevisionPendienteDto> = emptyList(),
    ) {
        val total: Int get() = teTocan.size + deOtros.size
    }

    fun separar(revisiones: List<RevisionPendienteDto>): Evidencias {
        val (deOtros, teTocan) = revisiones.partition { it.paraTi == false }
        return Evidencias(teTocan = teTocan, deOtros = deOtros)
    }

    /** «28 te tocan · 27 con sus jefes». Solo dice lo que no es cero. */
    fun resumen(e: Evidencias): String = listOfNotNull(
        when (e.teTocan.size) {
            0 -> null
            1 -> "1 te toca"
            else -> "${e.teTocan.size} te tocan"
        },
        e.deOtros.size.takeIf { it > 0 }?.let { "$it con sus jefes" },
    ).joinToString(" · ")

    /** Sin persona no hay a quién aprobarle: esa fila se abre y se revisa una por una. */
    fun loteDe(e: Evidencias): List<LoteItemDto> =
        e.teTocan.mapNotNull { r -> r.persona?.id?.let { LoteItemDto(r.activityId, it) } }.take(TOPE_LOTE)

    fun textoBotonLote(cuantas: Int): String =
        if (cuantas == 1) "Aprobar 1" else "Aprobar $cuantas en lote"

    fun notaValida(nota: String): Boolean = nota.trim().length >= MIN_NOTA

    fun calificacionValida(estrellas: Int): Boolean = estrellas in 1..5

    fun mensajeLote(aprobadas: Int, fallidas: Int): String = when {
        aprobadas == 0 && fallidas == 0 -> "No había nada que aprobar."
        fallidas == 0 -> if (aprobadas == 1) "Se aprobó 1 evidencia." else "Se aprobaron $aprobadas evidencias."
        aprobadas == 0 -> if (fallidas == 1) "No se pudo aprobar 1 evidencia." else "No se pudieron aprobar $fallidas evidencias."
        else -> "Se aprobaron $aprobadas; $fallidas no se pudieron, revísalas una por una."
    }

    /** Con algo de esto ya no es «no hay nada esperándote». */
    fun hayAlgo(filas: Int, evidencias: Evidencias, viaticos: Int, gastos: Int): Boolean =
        filas > 0 || evidencias.total > 0 || viaticos > 0 || gastos > 0

    fun textoCuenta(cuantos: Int, singular: String, plural: String): String =
        if (cuantos == 1) "1 $singular" else "$cuantos $plural"
}
