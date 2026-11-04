package mx.nexara.mobile.nativeapp.ui.console.more

import mx.nexara.mobile.nativeapp.data.api.ProyectoActividadDto
import mx.nexara.mobile.nativeapp.data.api.ProyectoAlcanceDto
import mx.nexara.mobile.nativeapp.data.api.ProyectoDetalleDto
import mx.nexara.mobile.nativeapp.data.api.ProyectoEtapaDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProyectoDetalleRulesTest {
    @Test
    fun `una seccion sin nada no sale`() {
        val p = ProyectoDetalleDto(
            milestones = listOf(ProyectoEtapaDto(id = 1)),
            activities = listOf(ProyectoActividadDto(id = 2)),
        )
        assertEquals(
            listOf(
                ProyectoDetalleRules.Seccion.RESUMEN,
                ProyectoDetalleRules.Seccion.CRONOGRAMA,
                ProyectoDetalleRules.Seccion.ACTIVIDADES,
            ),
            ProyectoDetalleRules.secciones(p),
        )
        assertEquals(listOf(ProyectoDetalleRules.Seccion.RESUMEN), ProyectoDetalleRules.secciones(ProyectoDetalleDto()))
    }

    @Test
    fun `el alcance va en el orden de la web y cada grupo por su orden`() {
        val grupos = ProyectoDetalleRules.alcancePorTipo(
            listOf(
                ProyectoAlcanceDto(id = 1, kind = "SUPUESTO", orden = 1),
                ProyectoAlcanceDto(id = 2, kind = "ENTREGABLE", orden = 2),
                ProyectoAlcanceDto(id = 3, kind = "ENTREGABLE", orden = 1),
                ProyectoAlcanceDto(id = 4, kind = "EXCLUSION", orden = 1),
            ),
        )
        assertEquals(listOf("Qué entregamos", "Qué no incluye", "De qué partimos"), grupos.map { it.first })
        assertEquals(listOf(3L, 2L), grupos.first().second.map { it.id })
    }

    @Test
    fun `las etapas van por su orden y las que no tienen, al final`() {
        val r = ProyectoDetalleRules.etapasEnOrden(
            listOf(ProyectoEtapaDto(id = 1), ProyectoEtapaDto(id = 2, orden = 2), ProyectoEtapaDto(id = 3, orden = 1)),
        )
        assertEquals(listOf(3L, 2L, 1L), r.map { it.id })
    }

    @Test
    fun `cambiar de estado no ofrece el actual y cancelar pide motivo`() {
        assertFalse("ACTIVE" in ProyectoDetalleRules.estadosPosibles("ACTIVE"))
        assertEquals(4, ProyectoDetalleRules.estadosPosibles("ACTIVE").size)
        assertFalse(ProyectoDetalleRules.motivoValido("CANCELLED", "  "))
        assertTrue(ProyectoDetalleRules.motivoValido("CANCELLED", "El cliente desistió"))
        assertTrue(ProyectoDetalleRules.motivoValido("ON_HOLD", ""))
    }

    @Test
    fun `las etiquetas son las de la web`() {
        assertEquals("En curso", ProyectoDetalleRules.etiquetaEstado("ACTIVE"))
        assertEquals("Cumplida", ProyectoDetalleRules.etiquetaEtapa("CUMPLIDO"))
        assertEquals("Listo", ProyectoDetalleRules.etiquetaRequerimiento("CUMPLIDO"))
        assertEquals("Instalador", ProyectoDetalleRules.etiquetaRol(null, "INSTALADOR"))
        assertEquals("Jefe de obra", ProyectoDetalleRules.etiquetaRol("Jefe de obra", "INSTALADOR"))
    }
}
