package mx.nexara.mobile.nativeapp.ui.console.cotizaciones

import mx.nexara.mobile.nativeapp.data.api.CotizacionDetalleDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionGrupoDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionPartidaDto
import mx.nexara.mobile.nativeapp.ui.console.cotizaciones.CotizacionesRules.Accion
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Lo que la API no permite en ese estado no se ofrece (`estado-cotizacion.ts`, `validarParaEnviar`). */
class CotizacionesAccionesTest {

    private val conPartida = listOf(CotizacionGrupoDto(partidas = listOf(CotizacionPartidaDto(name = "Cámara"))))

    private fun cotizacion(
        estado: String?,
        cliente: Long? = 5L,
        grupos: List<CotizacionGrupoDto>? = conPartida,
    ) = CotizacionDetalleDto(
        id = 1L,
        folio = "NEX-0007",
        estado = estado,
        salesClientId = cliente,
        clientCompany = "BUAP",
        total = "1500.5",
        grupos = grupos,
    )

    @Test
    fun `un borrador listo se marca como enviado, sea quien sea`() {
        assertEquals(Accion.MARCAR_ENVIADA, CotizacionesRules.accion(cotizacion("BORRADOR"), esDireccion = false))
        assertEquals(Accion.MARCAR_ENVIADA, CotizacionesRules.accion(cotizacion("BORRADOR"), esDireccion = true))
        // La base guarda el enum en inglés.
        assertEquals(Accion.MARCAR_ENVIADA, CotizacionesRules.accion(cotizacion("DRAFT"), esDireccion = false))
    }

    @Test
    fun `solo direccion aprueba, y solo una enviada`() {
        assertEquals(Accion.APROBAR, CotizacionesRules.accion(cotizacion("ENVIADA"), esDireccion = true))
        assertNull(CotizacionesRules.accion(cotizacion("ENVIADA"), esDireccion = false))
    }

    @Test
    fun `lo cerrado no ofrece nada`() {
        for (estado in listOf("APROBADA", "RECHAZADA", "VENCIDA", null, "RARO")) {
            assertNull(CotizacionesRules.accion(cotizacion(estado), esDireccion = true))
            assertNull(CotizacionesRules.accion(cotizacion(estado), esDireccion = false))
        }
    }

    @Test
    fun `un borrador al que le falta algo no ofrece un boton que fallaria`() {
        val sinCliente = cotizacion("BORRADOR", cliente = null)
        val sinPartidas = cotizacion("BORRADOR", grupos = emptyList())
        assertNull(CotizacionesRules.accion(sinCliente, esDireccion = true))
        assertNull(CotizacionesRules.accion(sinPartidas, esDireccion = true))
        assertEquals(listOf("elegir o crear el cliente"), CotizacionesRules.faltasParaEnviar(sinCliente))
        assertEquals(listOf("al menos una partida"), CotizacionesRules.faltasParaEnviar(sinPartidas))
    }

    @Test
    fun `lo que falta se dice en una frase, solo en borrador`() {
        val aviso = CotizacionesRules.avisoFaltas(cotizacion("BORRADOR", cliente = null, grupos = emptyList()))
        assertEquals(
            "Para marcarla como enviada falta al menos una partida y elegir o crear el cliente: " +
                "se completa en la computadora.",
            aviso,
        )
        assertNull(CotizacionesRules.avisoFaltas(cotizacion("BORRADOR")))
        assertNull(CotizacionesRules.avisoFaltas(cotizacion("ENVIADA", cliente = null)))
    }

    @Test
    fun `los medios son los que acepta el servidor`() {
        assertEquals(
            listOf("WHATSAPP", "CORREO_EXTERNO", "EN_PERSONA", "OTRO"),
            CotizacionesRules.MedioEnvio.entries.map { it.clave },
        )
    }

    @Test
    fun `aprobar dice que, cuanto y de quien`() {
        val texto = CotizacionesRules.confirmacionAprobar(cotizacion("ENVIADA"))
        assertTrue(texto, texto.contains("NEX-0007"))
        assertTrue(texto, texto.contains("$1,500.50"))
        assertTrue(texto, texto.contains("BUAP"))
        assertTrue(texto, texto.contains("no se reabre"))
    }

    @Test
    fun `el vacio ya no manda solo a la computadora`() {
        assertFalse(CotizacionesRules.vacioSinRegistros(esDireccion = true).contains("computadora"))
        assertTrue(CotizacionesRules.vacioSinRegistros(esDireccion = true).contains("apruebas"))
        // Quien no puede armarla lee la verdad, y además qué sí puede hacer aquí.
        val personal = CotizacionesRules.vacioSinRegistros(esDireccion = false)
        assertTrue(personal.contains("computadora"))
        assertTrue(personal.contains("marcas como enviada"))
    }

    @Test
    fun `el pie dice que aprobar es de direccion`() {
        assertTrue(CotizacionesRules.limite(esDireccion = true).contains("apruebas"))
        assertFalse(CotizacionesRules.limite(esDireccion = false).contains("apruebas"))
        assertTrue(CotizacionesRules.limite(esDireccion = false).contains("marcas como enviada"))
    }
}
