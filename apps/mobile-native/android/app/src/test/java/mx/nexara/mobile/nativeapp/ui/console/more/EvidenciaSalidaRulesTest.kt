package mx.nexara.mobile.nativeapp.ui.console.more

import mx.nexara.mobile.nativeapp.data.api.HerramientaActividadDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** La evidencia de una salida de almacén: quién, foto, actividad o motivo, y series. */
class EvidenciaSalidaRulesTest {

    @Test
    fun `las series van una por renglon en mayusculas y sin repetir`() {
        assertEquals(
            listOf("DS-001", "DS-002"),
            EvidenciaSalidaRules.series("ds-001\nDS-002\n ds-001 \n\n"),
        )
    }

    @Test
    fun `tambien se aceptan coma y punto y coma`() {
        assertEquals(listOf("A1", "B2", "C3"), EvidenciaSalidaRules.series("A1, B2;C3"))
    }

    @Test
    fun `una serie demasiado larga no cuenta`() {
        assertEquals(emptyList<String>(), EvidenciaSalidaRules.series("X".repeat(81)))
    }

    @Test
    fun `una caja cuenta por las piezas que trae`() {
        assertEquals(24.0, EvidenciaSalidaRules.piezas(2.0, 12.0), 0.0)
        assertEquals(3.0, EvidenciaSalidaRules.piezas(3.0, null), 0.0)
    }

    @Test
    fun `no puede haber mas series que piezas`() {
        assertNull(EvidenciaSalidaRules.errorSeries(series = 2, piezas = 2.0))
        assertNull(EvidenciaSalidaRules.errorSeries(series = 0, piezas = 5.0))
        assertTrue(EvidenciaSalidaRules.errorSeries(series = 3, piezas = 2.0)!!.startsWith("Hay 3 números de serie"))
    }

    @Test
    fun `una salida pide responsable y luego foto y luego actividad o motivo`() {
        assertEquals(
            "Elige quién se lleva el material.",
            EvidenciaSalidaRules.errorSalida(recibeId = null, fotos = 2, actividadId = 9, motivo = ""),
        )
        assertEquals(
            "Toma al menos una foto de lo que sale.",
            EvidenciaSalidaRules.errorSalida(recibeId = 3, fotos = 0, actividadId = 9, motivo = ""),
        )
        assertEquals(
            "Liga la salida a una actividad o escribe para qué es.",
            EvidenciaSalidaRules.errorSalida(recibeId = 3, fotos = 1, actividadId = null, motivo = " "),
        )
    }

    @Test
    fun `con actividad o con motivo la salida esta completa`() {
        assertNull(EvidenciaSalidaRules.errorSalida(recibeId = 3, fotos = 1, actividadId = 9, motivo = ""))
        assertNull(EvidenciaSalidaRules.errorSalida(recibeId = 3, fotos = 1, actividadId = null, motivo = "Reposición"))
    }

    @Test
    fun `la actividad se lee con su folio y su titulo`() {
        assertEquals(
            "AN-120 · Instalación día 1",
            EvidenciaSalidaRules.textoActividad(HerramientaActividadDto(id = 9, anNumber = "AN-120", titulo = "Instalación día 1")),
        )
        assertEquals("Actividad 9", EvidenciaSalidaRules.textoActividad(HerramientaActividadDto(id = 9)))
    }

    @Test
    fun `si las fotos no suben se dice donde agregarlas`() {
        val aviso = EvidenciaSalidaRules.avisoFotosPendientes("Salida registrada: 2 pz de Cámara.")
        assertTrue(aviso.startsWith("Salida registrada: 2 pz de Cámara."))
        assertTrue(aviso.contains("Movimientos"))
    }
}
