package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.DesgloseTiempoDto
import mx.nexara.mobile.nativeapp.data.api.TiempoCalculadoDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Lo que fija el sistema en la autoasignación (`POST me/activities/tiempo-calculado`). */
class TiempoCalculadoTest {
    private val t = TiempoCalculadoDto(
        tiempoEstandarMin = 140.0,
        desglose = listOf(
            DesgloseTiempoDto("Base de Reporte / documentación", 90.0),
            DesgloseTiempoDto("Traslado ida y vuelta", 50.0),
            DesgloseTiempoDto("Supuesto: una sola visita", 0.0),
            DesgloseTiempoDto("  ", 10.0),
        ),
        complejidad = "ESTANDAR",
        fechaEntregaEsperada = "2026-10-29T17:20:00.000Z",
    )

    @Test
    fun resumenLineasYEntrega() {
        assertEquals("Estándar 2 h 20 min · Estándar", TiempoCalculado.resumen(t))
        val l = TiempoCalculado.lineas(t)
        assertEquals(3, l.size)
        assertEquals("1 h 30 min", l[0].minutos)
        assertNull(l[2].minutos)
        assertEquals("Entrega a más tardar 11:20", TiempoCalculado.entrega(t, "2026-10-29T15:00:00.000Z"))
        assertEquals("Entrega a más tardar el 29/10 a las 11:20", TiempoCalculado.entrega(t, "2026-10-28T15:00:00.000Z"))
        assertNull(TiempoCalculado.entrega(TiempoCalculadoDto(), null))
        assertNull(TiempoCalculado.resumen(TiempoCalculadoDto()))
    }
}
