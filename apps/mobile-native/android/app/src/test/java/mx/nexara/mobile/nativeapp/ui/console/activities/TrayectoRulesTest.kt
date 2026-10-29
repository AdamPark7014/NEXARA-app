package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.TrayectoDto
import mx.nexara.mobile.nativeapp.ui.console.activities.TrayectoRules.Accion as A
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Qué botón de trayecto toca en cada momento (API `me/activities/:id/trayectos`). */
class TrayectoRulesTest {
    private val r = TrayectoRules

    private fun tramo(
        tipo: String,
        endedAt: String? = null,
        minutos: Double? = null,
        estimado: Double? = null,
        estado: String? = null,
    ) = TrayectoDto(
        id = 1,
        tipo = tipo,
        startedAt = "2026-10-29T15:12:00Z",
        endedAt = endedAt,
        minutos = minutos,
        estimadoMin = estimado,
        estado = estado,
    )

    @Test
    fun sinIniciarOfreceElTrayectoDeIda() {
        val e = r.estado(emptyList(), iniciada = false, entregada = false, cancelada = false)
        assertEquals(A.INICIAR_IDA, e.accion)
        assertEquals("¿Vas al sitio?", e.titulo)
    }

    @Test
    fun enCaminoPideLlegarYDiceLaRuta() {
        val e = r.estado(listOf(tramo(r.IDA, estimado = 18.0)), iniciada = false, entregada = false, cancelada = false)
        assertEquals(A.LLEGUE, e.accion)
        assertTrue(e.titulo!!.startsWith("En camino al sitio desde "))
        assertEquals("Ruta de 18 min · al llegar, inicia la actividad y la ida se cierra sola", e.detalle)
    }

    @Test
    fun iniciadaYaNoOfreceIdaYEntregadaOfreceRegreso() {
        val ida = tramo(r.IDA, endedAt = "2026-10-29T15:30:00Z", minutos = 18.0, estimado = 18.0, estado = "en_tiempo")
        val trabajando = r.estado(listOf(ida), iniciada = true, entregada = false, cancelada = false)
        assertEquals(A.NINGUNA, trabajando.accion)
        assertEquals(listOf("Ida · 18 min · en tiempo"), trabajando.resumen)
        assertFalse(trabajando.vacio)

        val entregada = r.estado(listOf(ida), iniciada = true, entregada = true, cancelada = false)
        assertEquals(A.REGRESO, entregada.accion)
    }

    @Test
    fun deRegresoYDespuesDeLlegarNoHayMasBotones() {
        val ida = tramo(r.IDA, endedAt = "2026-10-29T15:30:00Z", minutos = 18.0)
        val regreso = tramo(r.REGRESO, estimado = 21.0)
        val enCamino = r.estado(listOf(ida, regreso), iniciada = true, entregada = true, cancelada = false)
        assertEquals(A.LLEGUE, enCamino.accion)
        assertTrue(enCamino.titulo!!.startsWith("De regreso a la oficina"))

        val llego = regreso.copy(endedAt = "2026-10-29T23:00:00Z", minutos = 32.0, estado = "excedido")
        val fin = r.estado(listOf(ida, llego), iniciada = true, entregada = true, cancelada = false)
        assertEquals(A.NINGUNA, fin.accion)
        assertEquals("Regreso · 32 min · se pasó (ruta 21 min)", fin.resumen.last())
    }

    @Test
    fun canceladaNoOfreceTramosNuevosYSinNadaNoSePinta() {
        val e = r.estado(emptyList(), iniciada = false, entregada = false, cancelada = true)
        assertEquals(A.NINGUNA, e.accion)
        assertTrue(e.vacio)
        assertNull(r.abierto(emptyList()))
    }

    @Test
    fun estatusQueCuentan() {
        assertTrue(r.cancelada("Cancelada"))
        assertTrue(r.cancelada("No cumplida"))
        assertFalse(r.cancelada("Por Validar"))
        assertTrue(r.entregada("Por Validar", fotoSalida = false))
        assertTrue(r.entregada("En Proceso", fotoSalida = true))
        assertFalse(r.entregada("En Proceso", fotoSalida = false))
    }
}
