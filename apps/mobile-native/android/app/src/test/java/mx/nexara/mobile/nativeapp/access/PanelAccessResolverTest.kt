package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.data.SessionUser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El bug que reportó Adam vivía exactamente aquí y no había ni una prueba.
 *
 * `PanelAccessResolver` decidía los paneles con `role.contains("rh")` sobre el
 * nombre visible del rol, así que un usuario de «Recursos Humanos» no casaba
 * con nada y aterrizaba en «No hay paneles disponibles para tu cuenta».
 *
 * Core (2026-09): OPS ya no es una superficie; en todos los casos se pliega en
 * ERP, que incluye sus módulos.
 */
class PanelAccessResolverTest {

    private fun user(
        role: String = "",
        roleKey: String? = null,
        orgRoleKey: String? = null,
        permissions: List<String> = emptyList(),
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
        permissions = permissions,
        isSuperAdmin = isSuperAdmin,
        isClient = isClient,
        isBranchUser = isBranchUser,
        roleKey = roleKey,
        orgRoleKey = orgRoleKey,
        navPanels = navPanels,
    )

    // ─────────────────────────────────────────────────────────────────────
    // Recursos Humanos — la regresión reportada
    // ─────────────────────────────────────────────────────────────────────

    @Test
    fun rhUserGetsPanelsFromTheServerNavigation() {
        val panels = PanelAccessResolver.accessiblePanels(
            user(role = "Recursos Humanos", roleKey = "rh", navPanels = listOf("erp", "ops")),
        )
        // OPS se pliega en ERP: un solo panel, sin duplicados.
        assertEquals(listOf(PanelId.ERP), panels)
    }

    @Test
    fun rhUserWithoutServerNavigationStillGetsErp() {
        // `/me/navigation` cae o devuelve panels vacíos (roleKey crudo nulo en
        // el servidor, o el teléfono sin conexión): el rol canónico responde.
        val panels = PanelAccessResolver.accessiblePanels(user(role = "Recursos Humanos", roleKey = "rh"))
        assertEquals(listOf(PanelId.ERP), panels)
    }

    @Test
    fun rhUserIdentifiedOnlyByItsDisplayNameStillGetsPanels() {
        // Sin roleKey ni orgRoleKey: solo `Role.nombre` de la BD legacy.
        // Esta es la combinación exacta que daba cero paneles.
        listOf("Recursos Humanos", "RECURSOS HUMANOS", "recursos humanos", "RH", "Recursos Humanos (RH)")
            .forEach { displayName ->
                val panels = PanelAccessResolver.accessiblePanels(user(role = displayName))
                assertEquals("rol «$displayName»", listOf(PanelId.ERP), panels)
            }
    }

    @Test
    fun rhUserByLegacyOrgRoleKey() {
        val panels = PanelAccessResolver.accessiblePanels(
            user(role = "Especialista de personal", orgRoleKey = "hr_specialist"),
        )
        assertEquals(listOf(PanelId.ERP), panels)
    }

    // ─────────────────────────────────────────────────────────────────────
    // Nunca una pantalla muerta
    // ─────────────────────────────────────────────────────────────────────

    @Test
    fun authenticatedInternalUserNeverEndsWithZeroPanels() {
        val panels = PanelAccessResolver.accessiblePanels(user(role = "Rol Inventado Que Nadie Mapeó"))
        assertTrue("un usuario interno autenticado siempre entra a algún panel", panels.isNotEmpty())
        assertEquals(listOf(PanelId.ERP), panels)
    }

    @Test
    fun userWithBlankRoleAndNoPermissionsStillLands() {
        assertEquals(listOf(PanelId.ERP), PanelAccessResolver.accessiblePanels(user()))
    }

    @Test
    fun noSessionMeansNoPanels() {
        assertEquals(emptyList<PanelId>(), PanelAccessResolver.accessiblePanels(null))
    }

    // ─────────────────────────────────────────────────────────────────────
    // Un usuario no ve paneles de otro
    // ─────────────────────────────────────────────────────────────────────

    @Test
    fun vendedorDoesNotSeeOpsOrIntegra() {
        val panels = PanelAccessResolver.accessiblePanels(user(role = "Vendedor", roleKey = "vendedor"))
        assertEquals(listOf(PanelId.CRM), panels)
        assertFalse(panels.contains(PanelId.OPS))
        assertFalse(panels.contains(PanelId.INTEGRA))
        assertFalse(panels.contains(PanelId.LAB))
    }

    @Test
    fun fieldEngineerLandsInErp() {
        // Antes solo veía OPS; en Core sus módulos viven dentro de ERP.
        val engineer = user(role = "Ingeniero de Campo", roleKey = "ing_campo")
        assertEquals(listOf(PanelId.ERP), PanelAccessResolver.accessiblePanels(engineer))
        assertEquals("erp", PanelAccessResolver.routeForSinglePanelUser(engineer))
    }

    @Test
    fun designerOnlySeesStudio() {
        assertEquals(
            listOf(PanelId.STUDIO),
            PanelAccessResolver.accessiblePanels(user(role = "Diseñador", roleKey = "disenador")),
        )
    }

    @Test
    fun contabilidadDoesNotSeeCrmNorOps() {
        val panels = PanelAccessResolver.accessiblePanels(user(role = "Contabilidad", roleKey = "contabilidad"))
        assertEquals(listOf(PanelId.ERP), panels)
    }

    @Test
    fun serverNavigationWinsOverTheLocalRoleFallback() {
        // Si la API recorta, la app recorta: nada de ampliar por nuestra cuenta
        // (el rol daría también CRM e INTEGRA). OPS del servidor abre ERP.
        val panels = PanelAccessResolver.accessiblePanels(
            user(role = "Director de Operaciones", roleKey = "dir_operaciones", navPanels = listOf("ops")),
        )
        assertEquals(listOf(PanelId.ERP), panels)
    }

    @Test
    fun superAdminSeesEveryInternalPanel() {
        val panels = PanelAccessResolver.accessiblePanels(user(role = "Super Administrador", isSuperAdmin = true))
        assertEquals(
            listOf(PanelId.ERP, PanelId.CRM, PanelId.STUDIO, PanelId.LAB, PanelId.INTEGRA),
            panels,
        )
    }

    @Test
    fun opsNeverSurvivesAsAPanel() {
        listOf(
            user(roleKey = "ing_soporte"),
            user(roleKey = "coord_operaciones"),
            user(roleKey = "arquitecto"),
            user(roleKey = "ceo", navPanels = listOf("ops", "erp", "crm")),
            user(role = "Rol Nuevo", permissions = listOf("activities.view")),
            user(isSuperAdmin = true),
        ).forEach { u ->
            assertFalse("OPS no debe aparecer: $u", PanelAccessResolver.accessiblePanels(u).contains(PanelId.OPS))
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Cuentas externas
    // ─────────────────────────────────────────────────────────────────────

    @Test
    fun clientAndBranchAccountsOnlySeeThePortal() {
        assertEquals(
            listOf(PanelId.PORTAL),
            PanelAccessResolver.accessiblePanels(user(role = "CLIENT_PORTAL", isClient = true)),
        )
        assertEquals(
            listOf(PanelId.PORTAL),
            PanelAccessResolver.accessiblePanels(user(role = "BRANCH_PORTAL", isBranchUser = true)),
        )
    }

    @Test
    fun internalRoleNamedAfterClientsIsNotDemotedToThePortal() {
        // La regex vieja `(cliente|client|sucursal|branch)` sobre el nombre del
        // rol mandaba al portal a cualquier interno con «clientes» en el título.
        val panels = PanelAccessResolver.accessiblePanels(
            user(role = "Coordinador de Atención a Clientes", roleKey = "coord_operaciones"),
        )
        assertFalse("un interno no cae al portal por cómo se llame su rol", panels.contains(PanelId.PORTAL))
        assertTrue(panels.contains(PanelId.ERP))
    }

    @Test
    fun serverNavigationNeverGrantsThePortalToAnInternalUser() {
        val panels = PanelAccessResolver.accessiblePanels(
            user(role = "Ingeniero de Soporte", roleKey = "ing_soporte", navPanels = listOf("ops", "portal")),
        )
        assertEquals(listOf(PanelId.ERP), panels)
    }

    // ─────────────────────────────────────────────────────────────────────
    // Claves de panel del servidor y alias legacy
    // ─────────────────────────────────────────────────────────────────────

    @Test
    fun legacyPanelKeysFromNavigationAreUnderstood() {
        val panels = PanelAccessResolver.accessiblePanels(
            user(role = "CEO", roleKey = "ceo", navPanels = listOf("core", "sales", "operacion", "web")),
        )
        assertEquals(listOf(PanelId.ERP, PanelId.CRM, PanelId.STUDIO), panels)
    }

    @Test
    fun unknownNavigationKeysFallBackToTheRoleInsteadOfEmptying() {
        val panels = PanelAccessResolver.accessiblePanels(
            user(role = "Vendedor", roleKey = "vendedor", navPanels = listOf("panel-que-no-existe")),
        )
        assertEquals(listOf(PanelId.CRM), panels)
    }

    // ─────────────────────────────────────────────────────────────────────
    // Permisos como respaldo
    // ─────────────────────────────────────────────────────────────────────

    @Test
    fun permissionsOpenPanelsWhenTheRoleIsUnknown() {
        val panels = PanelAccessResolver.accessiblePanels(
            user(role = "Rol Nuevo Sin Mapear", permissions = listOf("panel.ventas", "gps.view")),
        )
        assertEquals(listOf(PanelId.CRM, PanelId.ERP), panels)
    }

    @Test
    fun integraPermissionsOpenTheIntegraPanel() {
        val panels = PanelAccessResolver.accessiblePanels(
            user(role = "Operador ACS", permissions = listOf("integra.door.open")),
        )
        assertTrue(panels.contains(PanelId.INTEGRA))
    }

    // ─────────────────────────────────────────────────────────────────────
    // Ruta directa cuando solo hay un panel
    // ─────────────────────────────────────────────────────────────────────

    @Test
    fun singlePanelUsersSkipTheHub() {
        assertEquals("crm", PanelAccessResolver.routeForSinglePanelUser(user(roleKey = "vendedor")))
        assertEquals("erp", PanelAccessResolver.routeForSinglePanelUser(user(role = "Recursos Humanos")))
    }

    @Test
    fun multiPanelUsersGoThroughTheHub() {
        assertEquals(
            null,
            PanelAccessResolver.routeForSinglePanelUser(user(roleKey = "dir_operaciones")),
        )
    }
}
