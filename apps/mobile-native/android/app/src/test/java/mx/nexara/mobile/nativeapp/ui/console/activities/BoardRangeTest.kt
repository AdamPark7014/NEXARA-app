package mx.nexara.mobile.nativeapp.ui.console.activities

import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Test

/** Contrato C: `me/board?desde&hasta` con Hoy · Semana · Mes. */
class BoardRangeTest {

    /** Jueves 17 de septiembre de 2026. */
    private val hoy = LocalDate.of(2026, 9, 17)

    @Test
    fun `hoy es un solo dia`() {
        assertEquals("2026-09-17" to "2026-09-17", BoardRange.fechas(BoardRange.HOY, hoy))
    }

    @Test
    fun `la semana empieza en lunes y termina hoy`() {
        assertEquals("2026-09-14" to "2026-09-17", BoardRange.fechas(BoardRange.SEMANA, hoy))
    }

    @Test
    fun `el mes empieza el dia uno`() {
        assertEquals("2026-09-01" to "2026-09-17", BoardRange.fechas(BoardRange.MES, hoy))
    }

    @Test
    fun `un lunes la semana es solo hoy`() {
        val lunes = LocalDate.of(2026, 9, 14)
        assertEquals("2026-09-14" to "2026-09-14", BoardRange.fechas(BoardRange.SEMANA, lunes))
        assertEquals("Hoy", BoardRange.descripcion(BoardRange.SEMANA, lunes))
    }

    @Test
    fun `la descripcion dice el rango`() {
        assertEquals("Hoy", BoardRange.descripcion(BoardRange.HOY, hoy))
        assertEquals("Del 14 al 17 de septiembre", BoardRange.descripcion(BoardRange.SEMANA, hoy))
        assertEquals("Del 1 al 17 de septiembre", BoardRange.descripcion(BoardRange.MES, hoy))
    }

    @Test
    fun `un rango que cruza de mes dice los dos meses`() {
        val primeroDeOctubre = LocalDate.of(2026, 10, 1)
        // Semana del lunes 28 de septiembre al jueves 1 de octubre.
        assertEquals("2026-09-28" to "2026-10-01", BoardRange.fechas(BoardRange.SEMANA, primeroDeOctubre))
        assertEquals(
            "Del 28 de septiembre al 1 de octubre",
            BoardRange.descripcion(BoardRange.SEMANA, primeroDeOctubre),
        )
    }
}
