package mx.nexara.mobile.nativeapp.access

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PermissionLabelsTest {
    @Test
    fun `agrupa por modulo en lenguaje llano y Core primero`() {
        val grupos = PermissionLabels.agrupar(
            listOf("workflow.manage", "activities.view", "activities.manage", "activities.export", "company.settings.view"),
        )
        assertTrue(grupos.first().modulo.core)
        val actividades = grupos.first { it.modulo.nombre == "Actividades" }
        assertEquals(listOf("ver", "administrar", "exportar"), actividades.acciones)
        assertTrue(grupos.first { it.modulo.nombre == "Datos de la empresa" }.modulo.core)
        val flujos = grupos.first { it.modulo.nombre == "Flujos de aprobación" }
        assertFalse(flujos.modulo.core)
        assertEquals(listOf("administrar"), flujos.acciones)
        assertTrue(grupos.indexOf(flujos) > grupos.indexOf(actividades))
    }

    @Test
    fun `une acciones con y`() {
        assertEquals("Ver, administrar y exportar", PermissionLabels.unirAcciones(listOf("ver", "administrar", "exportar")))
        assertEquals("Ver", PermissionLabels.unirAcciones(listOf("ver")))
    }

    @Test
    fun `permisos compuestos se entienden`() {
        val rh = PermissionLabels.agrupar(listOf("hr.approve.leave")).single()
        assertEquals("Recursos humanos", rh.modulo.nombre)
        assertEquals(listOf("aprobar permisos y vacaciones"), rh.acciones)
    }
}
