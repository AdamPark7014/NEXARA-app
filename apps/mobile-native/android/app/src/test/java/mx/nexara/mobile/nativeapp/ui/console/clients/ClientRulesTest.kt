package mx.nexara.mobile.nativeapp.ui.console.clients

import mx.nexara.mobile.nativeapp.data.api.ClientDto
import mx.nexara.mobile.nativeapp.data.api.ClientPermissionsDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
        assertTrue(borrar.contains("no se puede deshacer"))
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
        assertTrue("eliminar debe avisar que no se deshace", borrar.contains("no se puede deshacer"))
        assertTrue(ClientRules.deleteMessage("  ").contains("«Sin nombre»"))
    }
}
