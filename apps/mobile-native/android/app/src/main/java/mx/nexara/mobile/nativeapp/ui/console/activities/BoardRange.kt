package mx.nexara.mobile.nativeapp.ui.console.activities

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters

/**
 * Rango de la pizarra: Hoy · Semana · Mes → `me/board?desde&hasta` (contrato C).
 *
 * La semana empieza en lunes, como el calendario de la empresa, y ningún rango
 * pasa de hoy: en la pizarra no hay futuro que enseñar.
 *
 * Sin Android: se prueba en la JVM (`BoardRangeTest`).
 */
enum class BoardRange(val etiqueta: String) {
    HOY("Hoy"),
    SEMANA("Semana"),
    MES("Mes"),
    ;

    companion object {
        private val ISO: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE

        /** `desde` a `hasta` en `AAAA-MM-DD`. */
        fun fechas(rango: BoardRange, hoy: LocalDate = LocalDate.now()): Pair<String, String> {
            val desde = when (rango) {
                HOY -> hoy
                SEMANA -> hoy.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
                MES -> hoy.withDayOfMonth(1)
            }
            return desde.format(ISO) to hoy.format(ISO)
        }

        /** «Hoy» · «Del 14 al 17 de septiembre» — lo que se lee bajo los botones. */
        fun descripcion(rango: BoardRange, hoy: LocalDate = LocalDate.now()): String {
            if (rango == HOY) return "Hoy"
            val (desde, _) = fechas(rango, hoy)
            val inicio = LocalDate.parse(desde, ISO)
            if (inicio == hoy) return "Hoy"
            val fmt = DateTimeFormatter.ofPattern("d 'de' MMMM", java.util.Locale.forLanguageTag("es-MX"))
            val mismoMes = inicio.month == hoy.month && inicio.year == hoy.year
            val inicioTexto = if (mismoMes) inicio.dayOfMonth.toString() else inicio.format(fmt)
            return "Del $inicioTexto al ${hoy.format(fmt)}"
        }
    }
}
