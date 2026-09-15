package mx.nexara.mobile.nativeapp.ui.console

import mx.nexara.mobile.nativeapp.data.SessionUser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El menú de Core por rol — espejo del sidebar web con `CORE_SURFACE_ONLY`:
 * `CORE_OLA1_MODULE_IDS` filtrado por url-matrix (`me/navigation.paths`) y, para
 * Clientes, por los sectores del correo.
 */
class CoreMenuTest {

    private fun user(
        email: String = "prueba@nexara.com.mx",
        roleKey: String? = null,
        isSuperAdmin: Boolean = false,
        navPaths: List<String>? = null,
    ) = SessionUser(
        id = 1L,
        nombre = "Prueba",
        email = email,
        role = "",
        department = "",
        token = "t",
        permissions = emptyList(),
        isSuperAdmin = isSuperAdmin,
        roleKey = roleKey,
        navPaths = navPaths,
    )

    /** `CORE_OLA1_URL_RULES` + my-profile, como los recibe ING_CAMPO. */
    private val coreOla1Rules = listOf(
        "/erp/mis-actividades", "/erp/mis-actividades/**",
        "/erp/pizarra", "/erp/pizarra/**",
        "/erp/asistencias", "/erp/asistencias/**",
        "/erp/chat", "/erp/chat/**",
        "/erp/clientes", "/erp/clientes/**",
        "/erp/my-profile",
        "/api/activities/**",
    )

    private val all = CoreModule.entries.toList()
    private val sinClientes = listOf(CoreModule.ACTIVIDADES, CoreModule.ASISTENCIAS, CoreModule.CHAT, CoreModule.MI_PERFIL)

    @Test
    fun ingenieroSeesChatActividadesAsistenciasYMiPerfil() {
        val ingeniero = user(email = "joan.sanchez@nexara.com.mx", roleKey = "ing_campo", navPaths = coreOla1Rules)
        assertEquals(sinClientes, CoreMenu.modulesFor(ingeniero))
    }

    @Test
    fun ceoAlsoSeesClientes() {
        val ceo = user(email = "gerencia@nexara.com.mx", roleKey = "ceo", navPaths = listOf("/erp/**", "/api/**"))
        assertEquals(all, CoreMenu.modulesFor(ceo))
    }

    @Test
    fun aBareErpRuleDoesNotOpenEveryCoreModule() {
        // RH tiene `{path:'/erp'}` suelto: la coincidencia laxa de la web le abría todo.
        val rh = user(roleKey = "rh", navPaths = listOf("/erp", "/erp/chat", "/erp/my-profile", "/api/**"))
        assertEquals(listOf(CoreModule.CHAT, CoreModule.MI_PERFIL), CoreMenu.modulesFor(rh))
    }

    @Test
    fun apiRulesNeverOpenAScreen() {
        val u = user(email = "operaciones@nexara.com.mx", navPaths = listOf("/api/ventas/clientes/**", "/erp/chat"))
        assertEquals(listOf(CoreModule.CHAT, CoreModule.MI_PERFIL), CoreMenu.modulesFor(u))
    }

    @Test
    fun clientesDependsOnTheEmailSectors() {
        val monica = user(email = "soluciones@nexara.com.mx", roleKey = "administrativo", navPaths = coreOla1Rules)
        assertTrue(CoreModule.CLIENTES in CoreMenu.modulesFor(monica))

        val developer = user(email = "developer@nexara.com.mx", isSuperAdmin = true)
        assertEquals(all, CoreMenu.modulesFor(developer))

        // Super admin sin sectores: la web tampoco le pinta Clientes.
        val otroSuper = user(email = "otro@nexara.com.mx", isSuperAdmin = true)
        assertEquals(sinClientes, CoreMenu.modulesFor(otroSuper))
    }

    @Test
    fun offlineFallbackUsesTheSameRoleTable() {
        assertEquals(sinClientes, CoreMenu.modulesFor(user(roleKey = "ing_campo")))
        assertEquals(sinClientes, CoreMenu.modulesFor(user(roleKey = "coord_operaciones")))
        assertEquals(listOf(CoreModule.CHAT, CoreModule.MI_PERFIL), CoreMenu.modulesFor(user(roleKey = "vendedor")))
        assertEquals(listOf(CoreModule.CHAT, CoreModule.MI_PERFIL), CoreMenu.modulesFor(user(roleKey = "dir_operaciones")))
        assertEquals(listOf(CoreModule.CHAT, CoreModule.MI_PERFIL), CoreMenu.modulesFor(user()))
    }

    @Test
    fun theMenuIsNeverEmptyWithASession() {
        assertTrue(CoreMenu.modulesFor(user(navPaths = listOf("/nada"))).isNotEmpty())
        assertTrue(CoreMenu.modulesFor(null).isEmpty())
    }

    @Test
    fun misActividadesOpensActividades() {
        val ingeniero = user(roleKey = "ing_campo")
        assertTrue(CoreMenu.canOpen(ingeniero, "my-activities"))
        assertTrue(CoreMenu.canOpen(ingeniero, "activities"))
        assertFalse(CoreMenu.canOpen(ingeniero, "erp-clients"))
        assertFalse(CoreMenu.canOpen(ingeniero, "dashboard"))
    }

    @Test
    fun ruleMatchingIsStrict() {
        assertTrue(CoreMenu.ruleMatches("/erp/**", "/erp/pizarra"))
        assertTrue(CoreMenu.ruleMatches("/**", "/erp/chat"))
        assertTrue(CoreMenu.ruleMatches("/erp/pizarra/**", "/erp/pizarra"))
        assertTrue(CoreMenu.ruleMatches("/erp/chat", "/erp/chat"))
        assertFalse(CoreMenu.ruleMatches("/erp", "/erp/pizarra"))
        assertFalse(CoreMenu.ruleMatches("/erp/pizarra", "/erp/pizarra/33"))
        assertFalse(CoreMenu.ruleMatches("/erp/chatx/**", "/erp/chat"))
    }
}
