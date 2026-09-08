package mx.nexara.mobile.nativeapp.ui.console

import mx.nexara.mobile.nativeapp.access.ModulePanelMap
import mx.nexara.mobile.nativeapp.access.PanelId
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog
import mx.nexara.mobile.nativeapp.ui.catalog.ParityStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El cableado de la consola, con red — el hermano de `IntegraWiringTest`.
 *
 * INTEGRA ya tenía su malla; la consola no, y es donde vive la mayoría de los
 * módulos. Un módulo de consola necesita CUATRO listas de acuerdo para ser
 * alcanzable:
 *
 *   1. `ModuleCatalog.console` — qué se pinta,
 *   2. `ModulePanelMap` (ERP u OPS) — qué panel lo deja pasar,
 *   3. `consoleSidebarGroups` — en qué grupo del menú aparece,
 *   4. `ConsoleModuleKeys.HANDLED` — que la ruta `console/m/{key}` lo sepa abrir.
 *
 * Faltando cualquiera, la pantalla queda escrita y muerta. Eso ya pasó con
 * `chat` (2 919 líneas invisibles), con `dispatch` y con los cinco paquetes de
 * INTEGRA. Estas pruebas son lo que impide que vuelva a pasar.
 */
class ConsoleWiringTest {

    private val catalogKeys: List<String> = ModuleCatalog.console.map { it.key }

    private fun panelKeys(): Set<String> =
        ModulePanelMap.consoleKeysFor(PanelId.ERP).orEmpty() +
            ModulePanelMap.consoleKeysFor(PanelId.OPS).orEmpty()

    @Test
    fun `toda clave del catalogo pertenece a algun panel`() {
        val huerfanas = catalogKeys.filter { it !in panelKeys() }

        assertEquals(
            "Estas claves están en el catálogo pero ni en ERP_KEYS ni en OPS_KEYS: " +
                "el panel las recorta y la tarjeta no aparece nunca. $huerfanas",
            emptyList<String>(),
            huerfanas,
        )
    }

    @Test
    fun `toda clave de panel tiene ficha en el catalogo`() {
        val sinFicha = panelKeys().filter { it !in catalogKeys }.sorted()

        assertEquals(
            "Estas claves están permitidas en un panel pero no tienen entrada de " +
                "catálogo, así que nadie las pinta: $sinFicha",
            emptyList<String>(),
            sinFicha,
        )
    }

    @Test
    fun `toda clave del catalogo la sabe abrir el NavHost`() {
        // `ConsoleModuleKeys.HANDLED` es la lista que decide si `console/m/{key}`
        // pinta la pantalla real o cae en PlaceholderScreen.
        val alPlaceholder = catalogKeys.filter { it !in ConsoleModuleKeys.HANDLED }

        assertEquals(
            "Estas claves caen en PlaceholderScreen aunque tengan pantalla: falta " +
                "añadirlas a ConsoleModuleKeys.HANDLED. $alPlaceholder",
            emptyList<String>(),
            alPlaceholder,
        )
    }

    @Test
    fun `el NavHost no promete claves que el catalogo no tiene`() {
        // `offline` es un alias histórico de `offline-queue` y no tiene ficha
        // propia; el resto sí debería tenerla.
        val fantasmas = ConsoleModuleKeys.HANDLED
            .filter { it != "offline" }
            .filter { it !in catalogKeys }
            .sorted()

        assertEquals(
            "El NavHost dice saber abrir estas claves, pero no existen en el " +
                "catálogo: o sobran aquí, o falta su ficha. $fantasmas",
            emptyList<String>(),
            fantasmas,
        )
    }

    @Test
    fun `un modulo marcado NATIVO no puede caer en el placeholder`() {
        // Etiquetar NATIVO algo inalcanzable es el «todo verde» que costó caro.
        val mentirosos = ModuleCatalog.console
            .filter { it.parityStatus == ParityStatus.NATIVO }
            .map { it.key }
            .filter { it !in ConsoleModuleKeys.HANDLED }

        assertEquals(
            "Marcados NATIVO pero sin rama en el NavHost: $mentirosos",
            emptyList<String>(),
            mentirosos,
        )
    }

    @Test
    fun `no hay claves duplicadas en el catalogo de consola`() {
        val repetidas = catalogKeys.groupingBy { it }.eachCount().filterValues { it > 1 }

        assertTrue(
            "Dos fichas con la misma clave: la segunda es inalcanzable porque " +
                "`associateBy` se queda con una sola. $repetidas",
            repetidas.isEmpty(),
        )
    }

    // ── Módulos cableados el 2026-09-08 ─────────────────────────────────────

    @Test
    fun `comunicados internos esta cableado de punta a punta`() {
        val entry = ModuleCatalog.console.firstOrNull { it.key == "comunicados" }
        assertTrue("Falta la ficha de `comunicados` en el catálogo", entry != null)
        assertTrue(
            "`comunicados` no está en ERP_KEYS: la tarjeta no se pintaría",
            "comunicados" in ModulePanelMap.consoleKeysFor(PanelId.ERP).orEmpty(),
        )
        assertTrue(
            "`comunicados` no está en ConsoleModuleKeys.HANDLED: caería en el placeholder",
            "comunicados" in ConsoleModuleKeys.HANDLED,
        )
        // Honestidad: lee y publica un borrador, pero no da de alta ni edita ni
        // borra. Eso no es CRUD nativo.
        assertEquals(
            "El estado de paridad de `comunicados` tiene que seguir siendo " +
                "SOLO_LECTURA mientras no se pueda redactar desde el teléfono",
            ParityStatus.SOLO_LECTURA,
            entry?.parityStatus,
        )
    }

    @Test
    fun `compras y recursos humanos siguen siendo alcanzables`() {
        // Ambos ganaron profundidad el 2026-09-08 (RFQ, aprobación de OC,
        // evaluaciones). Se fija el contrato para que un renombrado no los deje
        // en el placeholder sin que nadie se entere.
        listOf("procurement", "hr", "chat").forEach { key ->
            assertTrue("`$key` desapareció del catálogo", key in catalogKeys)
            assertTrue("`$key` ya no lo abre el NavHost", key in ConsoleModuleKeys.HANDLED)
        }
    }
}
