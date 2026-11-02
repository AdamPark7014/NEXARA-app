package mx.nexara.mobile.nativeapp.ui.console.vehiculos

import mx.nexara.mobile.nativeapp.ui.console.vehiculos.GasolinaRules.CargaPrevia
import mx.nexara.mobile.nativeapp.ui.console.vehiculos.GasolinaRules.FormCarga
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mismos casos que `rendimientoDeEstaCarga` y `aNumero` de `apps/web/lib/vehiculos-ficha.ts`. */
class GasolinaRulesTest {

    private val llena12030 = CargaPrevia(odometro = 12030, litros = 50.0, tanqueLleno = true)

    @Test
    fun `el rendimiento son los km desde el ultimo lleno entre los litros`() {
        val r = GasolinaRules.rendimientoDeEstaCarga(listOf(llena12030), odometro = 12480, litros = 52.3)
        assertNotNull(r)
        assertEquals(450, r!!.km)
        assertEquals(52.3, r.litros, 0.001)
        assertEquals(8.6, r.kmPorLitro, 0.001)
        assertEquals("8.6 km por litro", GasolinaRules.tituloRendimiento(r))
        assertEquals("450 km desde el tanque anterior, entre 52.3 litros.", GasolinaRules.detalleRendimiento(r))
    }

    @Test
    fun `una carga parcial se suma a la siguiente`() {
        val parcial = CargaPrevia(odometro = 12300, litros = 20.0, tanqueLleno = false)
        val r = GasolinaRules.rendimientoDeEstaCarga(listOf(parcial, llena12030), odometro = 12480, litros = 30.0)
        assertEquals(450, r!!.km)
        assertEquals(50.0, r.litros, 0.001)
        assertEquals(9.0, r.kmPorLitro, 0.001)
    }

    @Test
    fun `sin un lleno anterior no se puede medir`() {
        assertNull(GasolinaRules.rendimientoDeEstaCarga(emptyList(), 12480, 52.3))
        val soloParcial = CargaPrevia(odometro = 12300, litros = 20.0, tanqueLleno = false)
        assertNull(GasolinaRules.rendimientoDeEstaCarga(listOf(soloParcial), 12480, 52.3))
    }

    @Test
    fun `un rendimiento imposible no se enseña`() {
        assertNull(GasolinaRules.rendimientoDeEstaCarga(listOf(llena12030), 12040, 50.0))
        assertNull(GasolinaRules.rendimientoDeEstaCarga(listOf(llena12030), 14000, 10.0))
    }

    @Test
    fun `no llenar el tanque no mide nada`() {
        val form = FormCarga(litros = "52.3", odometro = "12480", lleno = false)
        assertNull(GasolinaRules.rendimientoDelForm(form, listOf(llena12030)))
        assertNotNull(GasolinaRules.rendimientoDelForm(form.copy(lleno = true), listOf(llena12030)))
    }

    @Test
    fun `aNumero acepta comas y signo de pesos y lo vacio es null`() {
        assertEquals(1281.35, GasolinaRules.aNumero("$1,281.35")!!, 0.001)
        assertNull(GasolinaRules.aNumero(""))
        assertNull(GasolinaRules.aNumero("  "))
        assertNull(GasolinaRules.aNumero("abc"))
    }

    @Test
    fun `lo que se teclea se limpia`() {
        assertEquals("12480", GasolinaRules.soloDigitos("12,480 km"))
        assertEquals("1234567", GasolinaRules.soloDigitos("123456789"))
        assertEquals("1281.35", GasolinaRules.soloDecimal("$1,281.35"))
        assertEquals("1.55", GasolinaRules.soloDecimal("1.5.5"))
    }

    @Test
    fun `el texto del campo no lleva ceros de mas`() {
        assertEquals("52", GasolinaRules.textoCrudo(52.0))
        assertEquals("52.3", GasolinaRules.textoCrudo(52.3))
        assertEquals("1281.35", GasolinaRules.textoCrudo(1281.35))
        assertEquals("12,480", GasolinaRules.miles(12480))
        assertEquals("156 km", GasolinaRules.km(156))
    }

    @Test
    fun `lo leido llena lo vacio`() {
        assertEquals("12480", GasolinaRules.tras("12480", actual = "", escrito = false))
    }

    @Test
    fun `lo leido no pisa lo escrito`() {
        assertEquals("12490", GasolinaRules.tras("99999", actual = "12490", escrito = true))
    }

    @Test
    fun `si la persona borro lo escrito cuenta como vacio`() {
        assertEquals("12480", GasolinaRules.tras("12480", actual = "", escrito = true))
    }

    @Test
    fun `repetir la foto reemplaza lo que lleno la lectura anterior`() {
        assertEquals("12480", GasolinaRules.tras("12480", actual = "12400", escrito = false))
    }

    @Test
    fun `si no se pudo leer el campo se queda como estaba`() {
        assertEquals("12400", GasolinaRules.tras(null, actual = "12400", escrito = false))
        assertEquals("", GasolinaRules.tras(null, actual = "", escrito = false))
    }

    @Test
    fun `el ticket llena litros y total sin pisar lo escrito`() {
        val leido = GasolinaRules.conTicket(FormCarga(), litros = 52.3, total = 1281.35, revisar = false, veCostos = true)
        assertEquals("52.3", leido.litros)
        assertEquals("1281.35", leido.total)

        val escrito = FormCarga(litros = "40", litrosEscritos = true)
        val otra = GasolinaRules.conTicket(escrito, litros = 52.3, total = 1281.35, revisar = false, veCostos = true)
        assertEquals("40", otra.litros)
        assertEquals("1281.35", otra.total)
    }

    @Test
    fun `quien no ve costos no ve el total leido pero viaja`() {
        val leido = GasolinaRules.conTicket(FormCarga(), litros = 52.3, total = 1281.35, revisar = false, veCostos = false)
        assertEquals("1281.35", leido.total)
        assertTrue(GasolinaRules.totalLeidoOculto(veCostos = false, leido))
        assertFalse(GasolinaRules.totalLeidoOculto(veCostos = true, leido))
        assertNull(GasolinaRules.faltaEnCarga(leido.copy(odometro = "12480")))
    }

    @Test
    fun `quien no ve costos escribe el total si no se pudo leer`() {
        val sinLeer = GasolinaRules.conTicket(FormCarga(), litros = null, total = null, revisar = false, veCostos = false)
        assertFalse(GasolinaRules.totalLeidoOculto(veCostos = false, sinLeer))
        val escrito = sinLeer.copy(total = "900", totalEscrito = true)
        assertFalse(GasolinaRules.totalLeidoOculto(veCostos = false, escrito))
    }

    @Test
    fun `si las cifras no cuadran quien no ve costos escribe el total del papel`() {
        val previo = GasolinaRules.conTicket(FormCarga(), 50.0, 1000.0, revisar = false, veCostos = false)
        val leido = GasolinaRules.conTicket(previo, litros = 52.3, total = 999.0, revisar = true, veCostos = false)
        assertEquals("", leido.total)
        assertFalse(GasolinaRules.totalLeidoOculto(veCostos = false, leido))
        assertEquals(
            "Los litros no cuadran con el ticket: revísalos y escribe el total.",
            GasolinaRules.avisoTicket(legible = true, revisar = true, veCostos = false),
        )

        val yaEscrito = FormCarga(total = "900", totalEscrito = true)
        assertEquals("900", GasolinaRules.conTicket(yaEscrito, 52.3, 999.0, revisar = true, veCostos = false).total)
    }

    @Test
    fun `si las cifras no cuadran quien ve costos las revisa`() {
        val leido = GasolinaRules.conTicket(FormCarga(), litros = 52.3, total = 999.0, revisar = true, veCostos = true)
        assertEquals("999", leido.total)
        assertEquals(
            "Los litros por el precio no dan el total: revisa las cifras.",
            GasolinaRules.avisoTicket(legible = true, revisar = true, veCostos = true),
        )
    }

    @Test
    fun `un ticket ilegible se captura a mano`() {
        assertEquals(
            "No se pudo leer el ticket: escribe los datos.",
            GasolinaRules.avisoTicket(legible = false, revisar = false, veCostos = false),
        )
        assertNull(GasolinaRules.avisoTicket(legible = true, revisar = false, veCostos = false))
    }

    @Test
    fun `para guardar faltan odometro litros e importe`() {
        val falta = "Faltan el odómetro, los litros o el importe"
        assertEquals(falta, GasolinaRules.faltaEnCarga(FormCarga()))
        assertEquals(falta, GasolinaRules.faltaEnCarga(FormCarga(litros = "0", total = "10", odometro = "1")))
        assertNull(GasolinaRules.faltaEnCarga(FormCarga(litros = "52.3", total = "1281.35", odometro = "12480")))
    }

    @Test
    fun `los km del viaje no salen si el final es menor`() {
        assertEquals(156, GasolinaRules.kmDelViaje(12324, 12480))
        assertNull(GasolinaRules.kmDelViaje(12324, 12000))
        assertNull(GasolinaRules.kmDelViaje(null, 12480))
        assertNull(GasolinaRules.kmDelViaje(12324, null))
    }

    @Test
    fun `el encabezado del regreso dice a que trabajo va`() {
        assertEquals(
            listOf("Nissan Frontier · Instalación de cámaras", "CCTV Bodega Norte"),
            GasolinaRules.encabezadoRegreso("Nissan Frontier", "TXA-12-34", "Instalación de cámaras", "CCTV Bodega Norte"),
        )
        assertEquals(
            listOf("Nissan Frontier · Instalación de cámaras"),
            GasolinaRules.encabezadoRegreso("Nissan Frontier", "TXA-12-34", "Instalación de cámaras", null),
        )
    }

    @Test
    fun `sin actividad el encabezado lleva nombre y placas`() {
        assertEquals(
            listOf("Nissan Frontier · TXA-12-34"),
            GasolinaRules.encabezadoRegreso("Nissan Frontier", "TXA-12-34", null, null),
        )
        assertEquals(listOf("Vehículo"), GasolinaRules.encabezadoRegreso(null, null, " ", "Sin actividad no cuenta"))
    }

    @Test
    fun `el nivel se lee como en el mockup y viaja como lo pide el API`() {
        assertEquals("3/4 de tanque", GasolinaRules.textoNivel("3/4"))
        assertEquals("", GasolinaRules.textoNivel(null))
        ChecklistVehiculoRules.NIVELES.forEach { assertTrue(GasolinaRules.textoNivel(it).isNotEmpty()) }
    }
}
