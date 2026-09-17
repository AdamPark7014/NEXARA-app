package mx.nexara.mobile.nativeapp.ui.console.activities

import kotlin.math.roundToInt
import mx.nexara.mobile.nativeapp.data.api.TeamBoardKpisDto

/**
 * Los números de una persona en la pizarra (contrato C), ya listos para pintar.
 *
 * Lo que el API no manda no se inventa: sale «—». Sin Android: se prueba en la
 * JVM (`BoardKpisTest`).
 */
object BoardKpis {

    data class Tile(val etiqueta: String, val valor: String, val pie: String, val color: Long)

    /** Debajo de esto el número está diciendo algo: se pinta en rojo. */
    const val PCT_MALO = 60.0

    /** Arriba de esto va en verde. */
    const val PCT_BUENO = 85.0

    fun pct(value: Double?): String {
        val v = value?.takeIf { it.isFinite() } ?: return "—"
        return "${v.roundToInt()} %"
    }

    fun colorPct(value: Double?): Long = when {
        value == null || !value.isFinite() -> CoreActivityRules.GRIS
        value >= PCT_BUENO -> CoreActivityRules.VERDE
        value >= PCT_MALO -> CoreActivityRules.NARANJA
        else -> CoreActivityRules.ROJO
    }

    /** «4/6» · «—» cuando no hay nada asignado que contar. */
    fun razon(hechas: Int?, total: Int?): String {
        if (total == null && hechas == null) return "—"
        return "${hechas ?: 0}/${total ?: 0}"
    }

    /** `null` cuando el API todavía no manda KPI: la tira no se pinta. */
    fun tiles(kpis: TeamBoardKpisDto?): List<Tile> {
        if (kpis == null) return emptyList()
        return listOf(
            Tile(
                etiqueta = "A tiempo",
                valor = pct(kpis.aTiempoPct),
                pie = razon(kpis.aTiempo, kpis.cerradas) + " cerradas",
                color = colorPct(kpis.aTiempoPct),
            ),
            Tile(
                etiqueta = "Eficiencia",
                valor = pct(kpis.eficienciaPct),
                pie = "plan ${CoreActivityRules.formatBoardMinutes(kpis.minutosPlan)} · " +
                    "real ${CoreActivityRules.formatBoardMinutes(kpis.minutosReales)}",
                color = colorPct(kpis.eficienciaPct),
            ),
            Tile(
                etiqueta = "Productividad",
                valor = pct(kpis.productividadPct),
                pie = "${CoreActivityRules.formatBoardMinutes(kpis.minutosEnActividad)} de " +
                    CoreActivityRules.formatBoardMinutes(kpis.minutosAsistidos),
                color = colorPct(kpis.productividadPct),
            ),
            Tile(
                etiqueta = "Cerradas",
                valor = razon(kpis.cerradas, kpis.asignadas),
                pie = rechazadasTexto(kpis.rechazadas),
                color = CoreActivityRules.AZUL,
            ),
        )
    }

    /** «Ninguna rechazada» · «1 rechazada» · «3 rechazadas». */
    fun rechazadasTexto(rechazadas: Int?): String = when {
        rechazadas == null -> "de lo asignado"
        rechazadas <= 0 -> "ninguna rechazada"
        rechazadas == 1 -> "1 rechazada"
        else -> "$rechazadas rechazadas"
    }
}
