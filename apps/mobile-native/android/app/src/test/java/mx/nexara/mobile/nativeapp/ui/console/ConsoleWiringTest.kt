package mx.nexara.mobile.nativeapp.ui.console

import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El cableado de Core, con red. Un módulo necesita tres cosas de acuerdo para
 * ser alcanzable: su ficha en `ModuleCatalog.core` (paridad con la web), su
 * entrada en [CoreModule] (menú) y su ruta en [ConsoleRoutes] (NavHost). Nada
 * más: la app ya no tiene módulos genéricos ni un «Más».
 */
class ConsoleWiringTest {

    private val catalogKeys: List<String> = ModuleCatalog.core.map { it.key }

    @Test
    fun theCatalogOnlyHasCoreModules() {
        val expected = CoreModule.entries.map { it.key }.toSet() + "notifications-center"
        assertEquals(expected, catalogKeys.toSet())
    }

    @Test
    fun everyMenuModuleHasACatalogEntry() {
        CoreModule.entries.forEach { module ->
            assertNotNull("`${module.key}` no tiene ficha en ModuleCatalog.core", ModuleCatalog.byKey(module.key))
        }
    }

    @Test
    fun everyMenuModuleHasItsOwnRoute() {
        CoreModule.entries.forEach { module ->
            assertEquals(module, ConsoleRoutes.forModuleKey(module.key))
        }
        val routes = CoreModule.entries.map { ConsoleRoutes.forModule(it) }
        assertEquals("dos módulos comparten ruta: $routes", routes.distinct(), routes)
    }

    @Test
    fun everyCatalogWebPathIsCore() {
        ModuleCatalog.core.forEach { entry ->
            assertTrue("${entry.key} apunta fuera de /erp: ${entry.webPath}", entry.webPath.startsWith("/erp/"))
        }
    }

    @Test
    fun misActividadesIsInsideActividades() {
        assertEquals(CoreModule.ACTIVIDADES, ConsoleRoutes.forModuleKey("my-activities"))
    }

    @Test
    fun nonCoreModulesHaveNoRoute() {
        listOf(
            "dashboard", "viatics", "vehicles", "gps", "tools", "users", "projects", "evidences",
            "accounting", "leads", "integra-access", "reuniones", "service-clients",
        ).forEach { key ->
            assertNull("`$key` no debe abrirse en Core", ConsoleRoutes.forModuleKey(key))
        }
    }

    @Test
    fun noDuplicateCatalogKeys() {
        val repetidas = catalogKeys.groupingBy { it }.eachCount().filterValues { it > 1 }
        assertTrue("claves repetidas en el catálogo: $repetidas", repetidas.isEmpty())
    }
}
