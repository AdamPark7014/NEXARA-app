package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.ActivityCotizacionDto
import mx.nexara.mobile.nativeapp.data.api.ActivityMaterialMovDto
import mx.nexara.mobile.nativeapp.data.api.ActivityMaterialesDto
import mx.nexara.mobile.nativeapp.data.api.ViaticoDto
import mx.nexara.mobile.nativeapp.data.api.ViaticoRepartoDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** «Costo directo» y la cotización ligada del detalle de actividad. */
class ActividadCostoRulesTest {

    private fun ve(roleKey: String?, rolVisible: String? = null, superAdmin: Boolean = false, email: String? = "x@nexara.com.mx") =
        ActividadCostoRules.puedeVer(
            isSuperAdmin = superAdmin,
            email = email,
            roleKey = roleKey,
            orgRoleKey = null,
            rolVisible = rolVisible,
        )

    @Test
    fun soloDireccionYCoordinacionDeAdminYOperaciones() {
        assertTrue(ve("ceo"))
        assertTrue(ve("dir_admin"))
        assertTrue(ve("dir_operaciones"))
        assertTrue(ve("coord_admin"))
        assertTrue(ve("coord_operaciones"))
        assertTrue(ve(null, rolVisible = "Director de Operaciones"))
        assertTrue(ve(null, superAdmin = true))
        // El dueño de la plataforma cuenta como CEO.
        assertTrue(ve(null, email = "gerencia@nexara.com.mx"))

        assertFalse(ve("ing_campo"))
        assertFalse(ve("vendedor"))
        assertFalse(ve("coord_ventas"))
        assertFalse(ve("administrativo"))
        assertFalse(ve("arquitecto"))
        assertFalse(ve(null))
    }

    @Test
    fun viaticosPropiosYRepartidos() {
        val propio = ViaticoDto(id = 1, actividadId = 7, montoSolicitado = 500.0, montoAprobado = 400.0)
        // Repartido: a esta actividad le toca su parte, aunque cuelgue de otra.
        val repartido = ViaticoDto(
            id = 2,
            actividadId = 8,
            montoSolicitado = 1000.0,
            repartos = listOf(ViaticoRepartoDto(actividadId = 8, monto = 600.0), ViaticoRepartoDto(actividadId = 7, monto = 400.0)),
        )
        // Cuelga de esta, pero el reparto no le dejó nada.
        val sinParte = ViaticoDto(
            id = 3,
            actividadId = 7,
            montoSolicitado = 300.0,
            repartos = listOf(ViaticoRepartoDto(actividadId = 9, monto = 300.0)),
        )
        val ajeno = ViaticoDto(id = 4, actividadId = 9, montoSolicitado = 999.0)

        assertEquals(500.0, ActividadCostoRules.montoEnActividad(propio, 7)!!, 0.001)
        assertEquals(400.0, ActividadCostoRules.montoEnActividad(repartido, 7)!!, 0.001)
        assertEquals(0.0, ActividadCostoRules.montoEnActividad(sinParte, 7)!!, 0.001)
        assertNull(ActividadCostoRules.montoEnActividad(ajeno, 7))

        val materiales = ActivityMaterialesDto(
            movimientos = listOf(ActivityMaterialMovDto(id = 1), ActivityMaterialMovDto(id = 2)),
            costoTotal = 1250.5,
        )
        val c = ActividadCostoRules.costo(listOf(propio, repartido, sinParte, ajeno), 7, materiales)
        assertEquals(90_000L, c.viaticosCentavos)
        assertEquals(3, c.nViaticos)
        assertEquals(125_050L, c.materialCentavos)
        assertEquals(2, c.nMaterial)
        assertEquals(215_050L, c.totalCentavos)
        assertTrue(ActividadCostoRules.visible(c))
        assertEquals("Viáticos · 3", ActividadCostoRules.etiquetaViaticos(c))
        assertEquals("Material del almacén · 2", ActividadCostoRules.etiquetaMaterial(c))
        assertEquals("$2,150.50", ActividadCostoRules.pesos(c.totalCentavos))
    }

    @Test
    fun sinNadaQueSumarNoSePinta() {
        val vacio = ActividadCostoRules.costo(emptyList(), 7, ActivityMaterialesDto(movimientos = emptyList(), costoTotal = 0.0))
        assertFalse(ActividadCostoRules.visible(vacio))
        assertEquals("Viáticos", ActividadCostoRules.etiquetaViaticos(vacio))
        assertEquals("Material del almacén", ActividadCostoRules.etiquetaMaterial(vacio))
        // Las dos consultas fallaron: también vacío.
        assertFalse(ActividadCostoRules.visible(ActividadCostoRules.costo(null, 7, null)))
        // Un renglón aunque sea de $0 sí se enseña (como la web).
        val ceros = ActividadCostoRules.costo(listOf(ViaticoDto(id = 1, actividadId = 7)), 7, null)
        assertTrue(ActividadCostoRules.visible(ceros))
    }

    // ── Cotización ligada ───────────────────────────────────────────────────

    @Test
    fun cotizacionLigadaFolioEstadoYTotal() {
        val c = ActivityCotizacionDto(id = 12, quoteNumber = "NEX-COT-0012", status = "SENT", total = "14500.5")
        assertTrue(ActividadCotizacionRules.aplica("comercial", c))
        assertFalse(ActividadCotizacionRules.aplica("servicio", c))
        assertFalse(ActividadCotizacionRules.aplica("Comercial", null))
        assertFalse(ActividadCotizacionRules.aplica("comercial", ActivityCotizacionDto(id = null)))
        assertEquals("NEX-COT-0012 · Enviada · $14,500.50", ActividadCotizacionRules.linea(c))
        // Sin estado conocido es «Borrador» y sin total no se escribe.
        assertEquals("#5 · Borrador", ActividadCotizacionRules.linea(ActivityCotizacionDto(id = 5, status = null)))
        assertEquals("Aprobada", ActividadCotizacionRules.estado("APPROVED"))
        assertEquals("Vencida", ActividadCotizacionRules.estado("VENCIDA"))
    }

    @Test
    fun errorDelPdf() {
        assertEquals("No tienes acceso a cotizaciones", ActividadCotizacionRules.error(prohibido = true, mensaje = "Forbidden"))
        assertEquals("Sin red", ActividadCotizacionRules.error(prohibido = false, mensaje = "Sin red"))
        assertEquals(ActividadCotizacionRules.FALLO, ActividadCotizacionRules.error(prohibido = false, mensaje = " "))
    }
}
