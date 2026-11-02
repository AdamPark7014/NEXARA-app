package mx.nexara.mobile.nativeapp.ui.console.vehiculos

import mx.nexara.mobile.nativeapp.access.PlatformAccounts
import mx.nexara.mobile.nativeapp.data.api.ConductorRefDto
import mx.nexara.mobile.nativeapp.data.api.ProximoServicioDto
import mx.nexara.mobile.nativeapp.data.api.RenglonRepartoDto
import mx.nexara.mobile.nativeapp.data.api.RepartoMesDto
import mx.nexara.mobile.nativeapp.data.api.VehiculoFlotaDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FlotillaYPermisoTest {

    // ── Permiso para leer con IA ────────────────────────────────────────────

    private fun permiso(concedido: Boolean = false, guardados: MutableList<Boolean> = mutableListOf()) =
        PermisoLecturaIa(concedido) { guardados += true }

    @Test
    fun `sin contestar no se abre la camara ni se puede leer`() {
        val p = permiso()
        var abierta = false
        p.antesDeLaFoto { abierta = true }
        assertFalse(abierta)
        assertFalse(p.puedeLeer)
        assertTrue(p.pendiente != null)
    }

    @Test
    fun `permitir abre la camara se guarda y ya no vuelve a preguntar`() {
        val guardados = mutableListOf<Boolean>()
        val p = permiso(guardados = guardados)
        var veces = 0
        p.antesDeLaFoto { veces++ }
        p.permitir()
        assertEquals(1, veces)
        assertTrue(p.puedeLeer)
        assertEquals(1, guardados.size)
        p.antesDeLaFoto { veces++ }
        assertEquals(2, veces)
        assertNull(p.pendiente)
    }

    @Test
    fun `a mano abre la camara y no permite leer`() {
        val guardados = mutableListOf<Boolean>()
        val p = permiso(guardados = guardados)
        var veces = 0
        p.antesDeLaFoto { veces++ }
        p.escribirAMano()
        assertEquals(1, veces)
        assertFalse(p.puedeLeer)
        assertTrue("No se guarda: la siguiente vez se vuelve a preguntar", guardados.isEmpty())
        p.antesDeLaFoto { veces++ }
        assertEquals("En la misma pantalla no pregunta dos veces", 2, veces)
    }

    @Test
    fun `cerrar el aviso no abre la camara ni da permiso`() {
        val p = permiso()
        var abierta = false
        p.antesDeLaFoto { abierta = true }
        p.cancelar()
        assertFalse(abierta)
        assertFalse(p.puedeLeer)
        assertNull(p.pendiente)
    }

    @Test
    fun `con permiso guardado no pregunta`() {
        val p = permiso(concedido = true)
        var abierta = false
        p.antesDeLaFoto { abierta = true }
        assertTrue(abierta)
        assertTrue(p.puedeLeer)
    }

    @Test
    fun `el aviso nombra al servicio y da la salida a mano`() {
        assertTrue(PermisoLecturaIa.MENSAJE.contains("Anthropic"))
        assertTrue(PermisoLecturaIa.MENSAJE.contains("inteligencia artificial"))
        assertTrue(PermisoLecturaIa.MENSAJE.contains("a mano"))
    }

    // ── Quién ve la vista de dirección ──────────────────────────────────────

    @Test
    fun `el CEO ve la vista de direccion por rol o por correo`() {
        assertTrue(FlotillaRules.esDireccion("alguien@x.mx", "ceo", null, null, false))
        assertTrue(FlotillaRules.esDireccion(PlatformAccounts.CEO_EMAIL, null, null, null, false))
        assertTrue(FlotillaRules.esDireccion("alguien@x.mx", null, null, null, true))
    }

    @Test
    fun `quien no es CEO sigue con lo suyo`() {
        assertFalse(FlotillaRules.esDireccion("tecnico@x.mx", "tecnico", null, "Técnico", false))
        assertFalse(FlotillaRules.esDireccion(null, null, null, null, false))
    }

    // ── Textos ──────────────────────────────────────────────────────────────

    @Test
    fun `los meses cruzan el anio`() {
        assertEquals("Noviembre 2026", FlotillaRules.nombreMes("2026-11"))
        assertEquals("2025-12", FlotillaRules.mesAnterior("2026-01"))
        assertEquals("2027-01", FlotillaRules.mesSiguiente("2026-12"))
        assertEquals("2026-10", FlotillaRules.mesAnterior("2026-11"))
    }

    @Test
    fun `sin dato es una raya y no cero`() {
        assertEquals("—", FlotillaRules.pesos(null))
        assertEquals("—", FlotillaRules.km(null))
        assertEquals("$1,235", FlotillaRules.pesos(1234.6))
        assertEquals("$6.64", FlotillaRules.pesos2(6.64))
        assertEquals("12,480 km", FlotillaRules.km(12480.0))
        assertEquals("8.6 km/L", FlotillaRules.kmPorLitro(8.6))
    }

    @Test
    fun `la fecha no se corre de dia`() {
        assertEquals("28 oct", FlotillaRules.fechaCorta("2026-10-28T02:00:00.000Z"))
        assertEquals("—", FlotillaRules.fechaCorta(null))
    }

    @Test
    fun `el proximo servicio dice cuanto falta`() {
        assertEquals("En 7,540 km", FlotillaRules.textoServicio(ProximoServicioDto(faltanKm = 7540.0)))
        assertEquals("Vencido por 320 km", FlotillaRules.textoServicio(ProximoServicioDto(faltanKm = -320.0, estado = "VENCIDO")))
        assertEquals("Venció 3 nov", FlotillaRules.textoServicio(ProximoServicioDto(fecha = "2026-11-03", estado = "VENCIDO")))
        assertEquals("Sin programa", FlotillaRules.textoServicio(null))
    }

    @Test
    fun `dice quien trae el vehiculo`() {
        assertEquals("Lo trae Juan", FlotillaRules.quienLoTrae(VehiculoFlotaDto(conductor = ConductorRefDto(nombre = "Juan"))))
        assertEquals("Libre", FlotillaRules.quienLoTrae(VehiculoFlotaDto(disponible = true)))
        assertEquals("En taller", FlotillaRules.quienLoTrae(VehiculoFlotaDto(disponible = false, estatus = "En taller")))
    }

    @Test
    fun `el reparto no pinta lo que vale cero y saca porcentajes`() {
        val r = FlotillaRules.repartoDelMes(
            RepartoMesDto(
                proyectos = RenglonRepartoDto(km = 300.0, importe = 750.0),
                cotizaciones = RenglonRepartoDto(km = 0.0, importe = 0.0),
                oficina = RenglonRepartoDto(km = 100.0, importe = 250.0),
                parado = 0.0,
            ),
        )
        assertEquals(listOf("A proyectos", "Oficina"), r.map { it.nombre })
        assertEquals(listOf(75, 25), r.map { it.pct })
    }

    @Test
    fun `sin gasto no hay reparto`() {
        assertTrue(FlotillaRules.repartoDelMes(null).isEmpty())
        assertTrue(FlotillaRules.repartoDelMes(RepartoMesDto(parado = null)).isEmpty())
    }
}
