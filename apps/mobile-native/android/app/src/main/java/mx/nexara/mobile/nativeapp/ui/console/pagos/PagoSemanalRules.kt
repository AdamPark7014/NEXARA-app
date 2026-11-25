package mx.nexara.mobile.nativeapp.ui.console.pagos

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong
import mx.nexara.mobile.nativeapp.ui.console.viaticos.Dinero

/** Textos y cuentas del pago semanal. Sin Android: se prueba solo. */
object PagoSemanalRules {
    private val ES = Locale("es", "MX")
    val FORMAS = listOf("transferencia" to "Transferencia", "efectivo" to "Efectivo", "otro" to "Otro")

    fun lunes(d: LocalDate): LocalDate = d.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))

    /** «16 al 22 de noviembre» */
    fun titulo(lunes: LocalDate): String {
        val dom = lunes.plusDays(6)
        val mes = DateTimeFormatter.ofPattern("MMMM", ES)
        return if (lunes.month == dom.month) {
            "${lunes.dayOfMonth} al ${dom.dayOfMonth} de ${dom.format(mes)}"
        } else {
            "${lunes.dayOfMonth} de ${lunes.format(mes)} al ${dom.dayOfMonth} de ${dom.format(mes)}"
        }
    }

    fun centavos(v: Double?): Long = ((v ?: 0.0) * 100).roundToLong()

    fun pesos(v: Double?): String {
        val c = centavos(v)
        return (if (c < 0) "−" else "") + Dinero.pesos(abs(c))
    }

    fun ajuste(v: Double?): String = if (centavos(v) > 0) "+${pesos(v)}" else pesos(v)

    fun estado(clave: String?): String = when (clave) {
        "por_pagar" -> "Por pagar"
        "parcial" -> "Parcial, falta"
        "pagado" -> "Pagado"
        else -> "Sin monto"
    }

    fun forma(clave: String?): String = if (clave == "lista") "Pagado en la lista" else FORMAS.firstOrNull { it.first == clave }?.second ?: "Pago"

    /** null = se puede registrar. */
    fun faltaParaPagar(importe: String, saldo: Double?): String? {
        val c = Dinero.parsearCentavos(importe)
        val tope = centavos(saldo)
        return when {
            c == null || c <= 0L -> "Escribe cuánto pagas"
            c > tope -> "Solo faltan ${Dinero.pesos(tope)} por pagar"
            else -> null
        }
    }
}
