package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.TeamBoardKpisDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Contrato C: los números de la persona en el rango, sin inventar lo que no llega. */
class BoardKpisTest {

    @Test
    fun `sin kpis no se pinta la tira`() {
        assertTrue(BoardKpis.tiles(null).isEmpty())
    }

    @Test
    fun `porcentajes redondeados y con su color`() {
        assertEquals("87 %", BoardKpis.pct(86.6))
        assertEquals("—", BoardKpis.pct(null))
        assertEquals("—", BoardKpis.pct(Double.NaN))
        assertEquals(CoreActivityRules.VERDE, BoardKpis.colorPct(92.0))
        assertEquals(CoreActivityRules.NARANJA, BoardKpis.colorPct(70.0))
        assertEquals(CoreActivityRules.ROJO, BoardKpis.colorPct(40.0))
        assertEquals(CoreActivityRules.GRIS, BoardKpis.colorPct(null))
    }

    @Test
    fun `cerradas de asignadas`() {
        assertEquals("4/6", BoardKpis.razon(4, 6))
        assertEquals("0/3", BoardKpis.razon(null, 3))
        assertEquals("—", BoardKpis.razon(null, null))
    }

    @Test
    fun `las rechazadas se dicen en singular y plural`() {
        assertEquals("ninguna rechazada", BoardKpis.rechazadasTexto(0))
        assertEquals("1 rechazada", BoardKpis.rechazadasTexto(1))
        assertEquals("3 rechazadas", BoardKpis.rechazadasTexto(3))
        assertEquals("de lo asignado", BoardKpis.rechazadasTexto(null))
    }

    @Test
    fun `la tira trae a tiempo, eficiencia, productividad y cerradas`() {
        val tiles = BoardKpis.tiles(
            TeamBoardKpisDto(
                asignadas = 6,
                cerradas = 4,
                aTiempo = 3,
                aTiempoPct = 75.0,
                minutosPlan = 480.0,
                minutosReales = 540.0,
                eficienciaPct = 88.9,
                minutosAsistidos = 520.0,
                minutosEnActividad = 400.0,
                productividadPct = 76.9,
                rechazadas = 1,
            ),
        )
        assertEquals(listOf("A tiempo", "Eficiencia", "Productividad", "Cerradas"), tiles.map { it.etiqueta })
        assertEquals("75 %", tiles[0].valor)
        assertEquals("3/4 cerradas", tiles[0].pie)
        assertEquals("89 %", tiles[1].valor)
        assertEquals("plan 8 h 00 min · real 9 h 00 min", tiles[1].pie)
        assertEquals("77 %", tiles[2].valor)
        assertEquals("4/6", tiles[3].valor)
        assertEquals("1 rechazada", tiles[3].pie)
    }
}
