package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.data.SessionUser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Core-only (2026-09-15): solo existe NEXARA Core. No hay selector de paneles;
 * el personal entra directo a Core y solo las cuentas de cliente y de sucursal
 * entran al portal.
 */
class PanelAccessResolverTest {

    private fun user(
        role: String = "",
        roleKey: String? = null,
        isSuperAdmin: Boolean = false,
        isClient: Boolean = false,
        isBranchUser: Boolean = false,
        navPanels: List<String>? = null,
    ) = SessionUser(
        id = 1L,
        nombre = "Prueba",
        email = "prueba@nexara.com.mx",
        role = role,
        department = "",
        token = "t",
        permissions = emptyList(),
        isSuperAdmin = isSuperAdmin,
        isClient = isClient,
        isBranchUser = isBranchUser,
        roleKey = roleKey,
        navPanels = navPanels,
    )

    @Test
    fun everyStaffRoleLandsInCore() {
        listOf(
            user(role = "Recursos Humanos", roleKey = "rh"),
            user(role = "Ingeniero de Campo", roleKey = "ing_campo"),
            user(role = "Vendedor", roleKey = "vendedor"),
            user(role = "Diseñador", roleKey = "disenador"),
            user(role = "Contabilidad", roleKey = "contabilidad"),
            user(role = "CEO", roleKey = "ceo"),
            user(role = "Super Administrador", isSuperAdmin = true),
            user(role = "Rol Inventado Que Nadie Mapeó"),
            user(),
        ).forEach { u ->
            assertEquals("$u", PanelId.ERP, PanelAccessResolver.homePanel(u))
            assertEquals("erp", PanelAccessResolver.routeForPanel(PanelAccessResolver.homePanel(u)!!))
        }
    }

    @Test
    fun clientAndBranchAccountsLandInThePortal() {
        assertEquals(PanelId.PORTAL, PanelAccessResolver.homePanel(user(role = "CLIENT_PORTAL", isClient = true)))
        assertEquals(PanelId.PORTAL, PanelAccessResolver.homePanel(user(role = "BRANCH_PORTAL", isBranchUser = true)))
        assertEquals("portal", PanelAccessResolver.routeForPanel(PanelId.PORTAL))
    }

    @Test
    fun staffNeverSeesThePortal() {
        // Ni por el nombre del rol ni porque `me/navigation` diga «portal».
        listOf(
            user(role = "Coordinador de Atención a Clientes", roleKey = "coord_operaciones"),
            user(role = "Ingeniero de Soporte", roleKey = "ing_soporte", navPanels = listOf("ops", "portal")),
            user(role = "cliente"),
        ).forEach { u ->
            assertFalse(PanelAccessResolver.isPortalAccount(u))
            assertEquals(PanelId.ERP, PanelAccessResolver.homePanel(u))
            assertFalse(PanelAccessResolver.canOpen(u, PanelId.PORTAL))
        }
    }

    @Test
    fun portalAccountsDoNotOpenCore() {
        val client = user(isClient = true)
        assertTrue(PanelAccessResolver.canOpen(client, PanelId.PORTAL))
        assertFalse(PanelAccessResolver.canOpen(client, PanelId.ERP))
    }

    @Test
    fun onlyTwoSurfacesExist() {
        assertEquals(listOf(PanelId.ERP, PanelId.PORTAL), PanelId.entries.toList())
    }

    @Test
    fun noSessionMeansNoSurface() {
        assertNull(PanelAccessResolver.homePanel(null))
        assertFalse(PanelAccessResolver.isPortalAccount(null))
    }

    @Test
    fun roleKeysStillResolveByExactAlias() {
        listOf("Recursos Humanos", "RECURSOS HUMANOS", "RH", "Recursos Humanos (RH)").forEach {
            assertEquals("rol «$it»", RoleKeys.RH, RoleKeys.canonicalRoleKey(null, null, it))
        }
        assertEquals(RoleKeys.RH, RoleKeys.canonicalRoleKey(null, "hr_specialist", "Especialista de personal"))
        assertEquals(RoleKeys.ING_CAMPO, RoleKeys.canonicalRoleKey("ing_campo", null, null))
        assertNull(RoleKeys.canonicalRoleKey(null, null, "Rol Inventado"))
    }
}
