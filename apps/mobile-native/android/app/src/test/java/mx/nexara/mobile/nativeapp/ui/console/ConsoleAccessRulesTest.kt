package mx.nexara.mobile.nativeapp.ui.console

import mx.nexara.mobile.nativeapp.access.ModulePanelMap
import mx.nexara.mobile.nativeapp.access.PanelId
import mx.nexara.mobile.nativeapp.data.SessionUser
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Menú de la consola: qué módulos ve realmente cada rol.
 *
 * Cubre las tres formas de desaparecer que tenía un módulo:
 *   1. el rol no casaba con ninguna regla y se quedaba sin panel,
 *   2. la clave no estaba en `ModulePanelMap` y el panel la recortaba,
 *   3. el `webPath` canónico (`/ops/…`, `/erp/…`) no casaba con la lista de
 *      rutas permitidas del rol, que solo pelaba `/console` y `/operacion`.
 */
class ConsoleAccessRulesTest {

    private fun user(
        role: String = "",
        roleKey: String? = null,
        orgRoleKey: String? = null,
        permissions: List<String> = emptyList(),
        isSuperAdmin: Boolean = false,
        navModuleKeys: List<String>? = null,
    ) = SessionUser(
        id = 1L,
        nombre = "Prueba",
        email = "prueba@nexara.com.mx",
        role = role,
        department = "",
        token = "t",
        permissions = permissions,
        isSuperAdmin = isSuperAdmin,
        roleKey = roleKey,
        orgRoleKey = orgRoleKey,
        navModuleKeys = navModuleKeys,
    )

    private fun visibleKeys(u: SessionUser, panel: PanelId): List<String> =
        consoleSidebarGroups(u, panel).flatMap { g -> g.modules.map { it.key } }

    private val rh = user(role = "Recursos Humanos", roleKey = "rh")
    private val ingeniero = user(role = "Ingeniero de Campo", roleKey = "ing_campo")
    private val soporte = user(role = "Ingeniero de Soporte", roleKey = "ing_soporte")
    private val vendedor = user(role = "Vendedor", roleKey = "vendedor")
    private val administrativo = user(role = "Administrativo", roleKey = "administrativo")

    // ─────────────────────────────────────────────────────────────────────
    // Recursos Humanos ve lo suyo
    // ─────────────────────────────────────────────────────────────────────

    @Test
    fun rhSeesItsOwnModulesInErp() {
        val keys = visibleKeys(rh, PanelId.ERP)
        listOf(
            "dashboard", "attendance", "lunch-breaks", "hr", "cvs", "recruiting",
            "employee-payments", "fines", "orgchart", "kpis-hr", "documents", "chat",
        ).forEach {
            assertTrue("RH debería ver «$it» en ERP, y no está: $keys", it in keys)
        }
    }

    @Test
    fun cvsAndRecruitingReachTheErpPanel() {
        // RH aterriza en ERP (roles.v2 · ROLE_HOME_PANEL = core), pero `cvs` y
        // `recruiting` solo estaban listados en OPS: el panel los recortaba.
        val erpKeys = ModulePanelMap.consoleKeysFor(PanelId.ERP).orEmpty()
        assertTrue("cvs" in erpKeys)
        assertTrue("recruiting" in erpKeys)
    }

    @Test
    fun rhIsNotTreatedAsAdministrativo() {
        assertFalse(rh.isAdministrativoRole())
    }

    // ─────────────────────────────────────────────────────────────────────
    // Módulos recuperados: chat, dispatch, recruiting
    // ─────────────────────────────────────────────────────────────────────

    @Test
    fun chatIsVisibleForFieldEngineers() {
        // `/erp/chat` no casaba con "/chat" porque el prefijo `/erp` no se pelaba.
        val chat = ModuleCatalog.console.first { it.key == "chat" }
        assertTrue(canAccessConsoleModule(ingeniero, chat))
        assertTrue("chat" in visibleKeys(ingeniero, PanelId.OPS))
    }

    @Test
    fun dispatchIsVisibleForFieldEngineers() {
        val dispatch = ModuleCatalog.console.first { it.key == "dispatch" }
        assertTrue(canAccessConsoleModule(ingeniero, dispatch))
        assertTrue("dispatch" in visibleKeys(ingeniero, PanelId.OPS))
    }

    @Test
    fun supportAndNocAreVisibleForSupportEngineers() {
        val keys = visibleKeys(soporte, PanelId.OPS)
        listOf("support", "noc", "support-sla", "maintenance", "assets", "service-clients").forEach {
            assertTrue("soporte debería ver «$it»: $keys", it in keys)
        }
    }

    @Test
    fun recruitingIsVisibleForRh() {
        assertTrue("recruiting" in visibleKeys(rh, PanelId.ERP))
    }

    @Test
    fun everyRecoveredModuleAppearsExactlyOnce() {
        // `chat`, `dispatch` y `recruiting` estaban declarados en dos grupos.
        listOf(rh, ingeniero, soporte, user(roleKey = "super_admin", isSuperAdmin = true)).forEach { u ->
            listOf(PanelId.ERP, PanelId.OPS).forEach { panel ->
                val keys = visibleKeys(u, panel)
                assertEquals("módulos duplicados en el menú de $panel: $keys", keys.distinct(), keys)
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Nadie ve el menú de otro
    // ─────────────────────────────────────────────────────────────────────

    @Test
    fun fieldEngineerDoesNotSeeFinanceOrHrAdmin() {
        val keys = visibleKeys(ingeniero, PanelId.OPS)
        listOf("accounting", "banking", "invoicing", "employee-payments", "users", "hr", "settings")
            .forEach { assertFalse("ingeniero no debería ver «$it»: $keys", it in keys) }
    }

    @Test
    fun vendedorDoesNotSeeOperationsModules() {
        val keys = visibleKeys(vendedor, PanelId.ERP)
        listOf("gps", "evidences", "dispatch", "banking", "users", "settings")
            .forEach { assertFalse("vendedor no debería ver «$it»: $keys", it in keys) }
    }

    @Test
    fun administrativoIsLimitedToItsOwnList() {
        val keys = visibleKeys(administrativo, PanelId.ERP)
        assertTrue(keys.isNotEmpty())
        keys.forEach {
            assertTrue("«$it» no está en ADMINISTRATIVO_ERP_MODULE_KEYS", it in ADMINISTRATIVO_ERP_MODULE_KEYS)
        }
        assertTrue("dashboard" in keys)
        assertTrue("chat" in keys)
    }

    @Test
    fun superAdminDoesNotGetThePersonalMirrorModules() {
        val superAdmin = user(role = "Super Administrador", isSuperAdmin = true)
        val keys = visibleKeys(superAdmin, PanelId.ERP)
        listOf("my-activities", "my-evidences", "my-viatics", "my-vehicles")
            .forEach { assertFalse("super admin no usa «$it»: $keys", it in keys) }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Nunca un menú vacío
    // ─────────────────────────────────────────────────────────────────────

    @Test
    fun anUnmappedRoleStillGetsAMenu() {
        val keys = visibleKeys(user(role = "Rol Nuevo Sin Mapear"), PanelId.ERP)
        assertTrue("un usuario interno nunca debe ver un menú vacío", keys.isNotEmpty())
        assertTrue("dashboard" in keys)
    }

    @Test
    fun serverNavigationKeysGrantAccessWithoutHidingTheRest() {
        // `/me/navigation` abre puertas, nunca cierra las que ya estaban abiertas:
        // un clip incompleto del servidor no debe esconder pantallas existentes.
        val withNav = user(role = "Ingeniero de Campo", roleKey = "ing_campo", navModuleKeys = listOf("dashboard"))
        val keys = visibleKeys(withNav, PanelId.OPS)
        assertTrue("dashboard" in keys)
        assertTrue("my-activities" in keys)
    }

    // ─────────────────────────────────────────────────────────────────────
    // Coherencia catálogo ↔ mapa de paneles
    // ─────────────────────────────────────────────────────────────────────

    @Test
    fun everyPanelMapKeyExistsInTheCatalog() {
        val catalogKeys = ModuleCatalog.console.map { it.key }.toSet()
        val mapped = ModulePanelMap.consoleKeysFor(PanelId.ERP).orEmpty() +
            ModulePanelMap.consoleKeysFor(PanelId.OPS).orEmpty()
        val ghosts = mapped - catalogKeys
        assertTrue("el mapa apunta a módulos que no existen: $ghosts", ghosts.isEmpty())

        val integraCatalog = ModuleCatalog.integra.map { it.key }.toSet()
        val integraGhosts = ModulePanelMap.integraKeysFor(PanelId.INTEGRA).orEmpty() - integraCatalog
        assertTrue("INTEGRA apunta a módulos que no existen: $integraGhosts", integraGhosts.isEmpty())
    }

    @Test
    fun everyCatalogModuleBelongsToSomePanel() {
        val mapped = ModulePanelMap.consoleKeysFor(PanelId.ERP).orEmpty() +
            ModulePanelMap.consoleKeysFor(PanelId.OPS).orEmpty()
        val orphans = ModuleCatalog.console.map { it.key }.toSet() - mapped
        assertTrue("módulos del catálogo sin panel — menú a ninguna parte: $orphans", orphans.isEmpty())
    }

    @Test
    fun everyCatalogModuleIsReachableFromSomeMenu() {
        // Super admin ve todo menos los módulos «mis …» (los suyos son la vista
        // de supervisión), así que se suma un interno normal para cubrirlos.
        val superAdmin = user(role = "Super Administrador", isSuperAdmin = true)
        val staff = user(role = "Personal Interno")
        val reachable = listOf(superAdmin, staff)
            .flatMap { u -> visibleKeys(u, PanelId.ERP) + visibleKeys(u, PanelId.OPS) }
            .toSet()
        val orphans = ModuleCatalog.console.map { it.key }.toSet() - reachable
        assertTrue("módulos con pantalla escrita y sin entrada de menú: $orphans", orphans.isEmpty())
    }
}
