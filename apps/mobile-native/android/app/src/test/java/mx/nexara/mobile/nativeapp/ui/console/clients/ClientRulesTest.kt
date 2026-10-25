package mx.nexara.mobile.nativeapp.ui.console.clients

import mx.nexara.mobile.nativeapp.data.api.ClientDto
import mx.nexara.mobile.nativeapp.data.api.ClientPermissionsDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Padrón: solo Christian desactiva, reactiva o elimina. La app decide qué
 * enseñar con `ventas/clientes/permisos`; el servidor vuelve a decidir con 403.
 */
class ClientRulesTest {

    @Test
    fun inactivoSeReconoceComoElServidor() {
        assertTrue(ClientRules.isInactive("Inactivo"))
        assertTrue(ClientRules.isInactive(" INACTIVE "))
        assertTrue(ClientRules.isInactive("inactiva"))
        assertFalse(ClientRules.isInactive("Activo"))
        assertFalse(ClientRules.isInactive(null))
        assertFalse(ClientRules.isInactive(""))
    }

    @Test
    fun sinRespuestaDePermisosNoSeEnsenaNada() {
        val nada = ClientPermissionsDto()
        assertFalse(nada.puedeAgregar)
        assertFalse(nada.puedeEditar)
        assertFalse(nada.puedeDesactivar)
        assertFalse(nada.puedeEliminar)
        assertFalse(ClientDetailUiState(permisos = nada).showOwnerActions)
    }

    @Test
    fun elMenuDeLaFichaSoloSaleConPermisoDeDueno() {
        val jefe = ClientPermissionsDto(puedeAgregar = true, puedeEditar = true)
        val christian = ClientPermissionsDto(
            puedeAgregar = true,
            puedeEditar = true,
            puedeDesactivar = true,
            puedeEliminar = true,
        )
        assertFalse(ClientDetailUiState(permisos = jefe).showOwnerActions)
        assertTrue(ClientDetailUiState(permisos = christian).showOwnerActions)
        assertTrue(ClientDetailUiState(permisos = ClientPermissionsDto(puedeEliminar = true)).showOwnerActions)
    }

    @Test
    fun laFichaSabeSiElClienteEstaInactivo() {
        val inactivo = ClientDto(id = 5, name = "Acme", status = "Inactivo")
        val activo = inactivo.copy(status = "Activo")
        assertTrue(ClientDetailUiState(client = inactivo).inactivo)
        assertFalse(ClientDetailUiState(client = activo).inactivo)
        assertFalse(ClientDetailUiState(client = null).inactivo)
    }

    @Test
    fun proyectoEnPausaSeLeeInactivo() {
        assertTrue(ClientRules.isProjectInactive("ON_HOLD"))
        assertTrue(ClientRules.isProjectInactive(" on_hold "))
        assertFalse(ClientRules.isProjectInactive("ACTIVE"))
        assertFalse(ClientRules.isProjectInactive(null))
        assertEquals("Inactivo", ClientRules.projectStatusLabel("ON_HOLD"))
        assertEquals("Activo", ClientRules.projectStatusLabel("ACTIVE"))
        assertEquals("Terminado", ClientRules.projectStatusLabel("COMPLETED"))
        assertEquals("Sin estatus", ClientRules.projectStatusLabel(null))
        assertEquals("OTRO", ClientRules.projectStatusLabel(" OTRO "))
    }

    @Test
    fun textosDeConfirmacionDeProyectos() {
        assertEquals("Desactivar proyecto", ClientRules.projectToggleTitle(inactivo = false))
        assertEquals("Reactivar proyecto", ClientRules.projectToggleTitle(inactivo = true))
        assertTrue(ClientRules.projectToggleMessage("Torre A", inactivo = false).contains("quedará inactivo"))
        val borrar = ClientRules.projectDeleteMessage("Torre A")
        assertTrue(borrar.contains("«Torre A»"))
        assertTrue(borrar.contains("sin poder deshacerlo"))
        assertTrue(ClientRules.projectDeleteMessage(null).contains("«Proyecto sin nombre»"))
    }

    @Test
    fun textosDeConfirmacion() {
        assertEquals("Desactivar cliente", ClientRules.toggleActiveTitle(inactivo = false))
        assertEquals("Reactivar cliente", ClientRules.toggleActiveTitle(inactivo = true))
        assertEquals("Desactivar", ClientRules.toggleActiveConfirmLabel(inactivo = false))
        assertEquals("Reactivar", ClientRules.toggleActiveConfirmLabel(inactivo = true))
        assertTrue(ClientRules.toggleActiveMessage("Acme", inactivo = false).contains("podrás reactivarlo"))
        assertTrue(ClientRules.toggleActiveMessage("Acme", inactivo = true).startsWith("«Acme»"))

        val borrar = ClientRules.deleteMessage("Acme")
        assertTrue(borrar.contains("«Acme»"))
        assertTrue("eliminar debe avisar que no se deshace", borrar.contains("sin poder deshacerlo"))
        assertTrue(ClientRules.deleteMessage("  ").contains("«Sin nombre»"))
    }

    @Test
    fun avisosDeDesactivarYEliminarCabenEnUnaFrase() {
        val viejoDesactivarCliente =
            "«Acme» quedará inactivo. Sus datos y su historial se conservan y podrás reactivarlo después."
        val viejoEliminarCliente =
            "¿Eliminar «Acme» del padrón? Esta acción no se puede deshacer. Si solo ya no trabajan con él, mejor desactívalo."
        val viejoDesactivarProyecto =
            "«Torre A» quedará inactivo. Sus actividades y su historial se conservan y podrás reactivarlo después."
        val viejoEliminarProyecto =
            "¿Eliminar «Torre A»? Dejará de aparecer en las listas y esta acción no se puede deshacer. Si solo está detenido, mejor desactívalo."

        assertEquals(2, frases(viejoDesactivarCliente).size)
        assertEquals(3, frases(viejoEliminarCliente).size)
        assertEquals(2, frases(viejoDesactivarProyecto).size)
        assertEquals(3, frases(viejoEliminarProyecto).size)

        val desactivarCliente = ClientRules.toggleActiveMessage("Acme", inactivo = false)
        val eliminarCliente = ClientRules.deleteMessage("Acme")
        val desactivarProyecto = ClientRules.projectToggleMessage("Torre A", inactivo = false)
        val eliminarProyecto = ClientRules.projectDeleteMessage("Torre A")

        assertNotEquals(viejoDesactivarCliente, desactivarCliente)
        assertNotEquals(viejoEliminarCliente, eliminarCliente)
        assertNotEquals(viejoDesactivarProyecto, desactivarProyecto)
        assertNotEquals(viejoEliminarProyecto, eliminarProyecto)
        assertEquals(1, frases(desactivarCliente).size)
        assertEquals(1, frases(eliminarCliente).size)
        assertEquals(1, frases(desactivarProyecto).size)
        assertEquals(1, frases(eliminarProyecto).size)

        assertTrue(desactivarCliente.contains("sus datos y su historial se conservan"))
        assertTrue(desactivarCliente.contains("podrás reactivarlo después"))
        assertTrue(eliminarCliente.contains("del padrón"))
        assertTrue(eliminarCliente.contains("sin poder deshacerlo"))
        assertTrue(eliminarCliente.contains("si solo ya no trabajan con él"))
        assertTrue(eliminarCliente.contains("desactiv"))
        assertTrue(desactivarProyecto.contains("sus actividades y su historial se conservan"))
        assertTrue(desactivarProyecto.contains("podrás reactivarlo después"))
        assertTrue(eliminarProyecto.contains("dejará de aparecer en las listas"))
        assertTrue(eliminarProyecto.contains("sin poder deshacerlo"))
        assertTrue(eliminarProyecto.contains("si solo está detenido"))
        assertTrue(eliminarProyecto.contains("desactiv"))

        assertEquals("Desactivar", ClientRules.toggleActiveConfirmLabel(inactivo = false))
        assertEquals("Eliminar cliente", ClientRules.DELETE_TITLE)
        assertEquals("Desactivar proyecto", ClientRules.projectToggleTitle(inactivo = false))
        assertEquals("Eliminar proyecto", ClientRules.PROJECT_DELETE_TITLE)
        assertEquals(
            "«Acme» volverá a estar activo en el padrón.",
            ClientRules.toggleActiveMessage("Acme", inactivo = true),
        )
        assertEquals(
            "«Torre A» volverá a estar activo.",
            ClientRules.projectToggleMessage("Torre A", inactivo = true),
        )
    }

    private fun frases(texto: String): List<String> =
        texto.trim().split(Regex("(?<=[.!?])\\s+")).map { it.trim() }.filter { it.isNotEmpty() }
}
