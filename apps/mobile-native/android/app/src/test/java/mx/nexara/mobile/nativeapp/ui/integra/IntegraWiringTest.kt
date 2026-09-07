package mx.nexara.mobile.nativeapp.ui.integra

import mx.nexara.mobile.nativeapp.access.ModulePanelMap
import mx.nexara.mobile.nativeapp.access.PanelId
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog
import mx.nexara.mobile.nativeapp.ui.catalog.ParityStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El cableado de INTEGRA, con red.
 *
 * El defecto que más veces se ha repetido en este proyecto no es una pantalla
 * mal escrita: es una pantalla BIEN escrita que nadie puede abrir. `chat`
 * (2 919 líneas) y `dispatch` estuvieron meses invisibles porque faltaba su
 * clave en una lista; los cinco paquetes de INTEGRA —13 438 líneas— estuvieron
 * escritos y sin cablear hasta el 2026-09-07.
 *
 * Tres listas tienen que decir lo mismo para que un módulo sea alcanzable:
 * el catálogo (qué se pinta), `ModulePanelMap` (qué se permite) y
 * `integraRouteForKey` (a dónde se va). Estas pruebas fallan si alguien añade
 * un módulo a una y se olvida de las otras dos.
 */
class IntegraWiringTest {

    private val home = "integra/home"

    private fun integraKeys(): Set<String> =
        ModulePanelMap.integraKeysFor(PanelId.INTEGRA).orEmpty()

    @Test
    fun `toda clave del catalogo esta permitida en ModulePanelMap`() {
        val permitidas = integraKeys()
        val huerfanas = ModuleCatalog.integra
            .map { it.key }
            .filter { it !in permitidas }

        assertEquals(
            "Estas claves del catálogo NO están en INTEGRA_KEYS: se pintarían " +
                "en el catálogo pero allowedIntegraKeys() las descartaría y la " +
                "tarjeta no aparecería nunca. $huerfanas",
            emptyList<String>(),
            huerfanas,
        )
    }

    @Test
    fun `toda clave permitida tiene entrada en el catalogo`() {
        val delCatalogo = ModuleCatalog.integra.map { it.key }.toSet()
        val sinFicha = integraKeys().filter { it !in delCatalogo }

        assertEquals(
            "Estas claves están permitidas pero no tienen entrada de catálogo, " +
                "así que nadie las pinta: $sinFicha",
            emptyList<String>(),
            sinFicha,
        )
    }

    @Test
    fun `toda clave del catalogo resuelve a una ruta propia y no al hub`() {
        // `integra-home` ES el hub; el resto tiene que llevar a otro sitio.
        val caenAlHub = ModuleCatalog.integra
            .map { it.key }
            .filter { it != "integra-home" }
            .filter { integraRouteForKey(it) == home }

        assertEquals(
            "Estas claves caen al hub en vez de a su pantalla. Su módulo es " +
                "inalcanzable desde la tarjeta y desde un enlace profundo: $caenAlHub",
            emptyList<String>(),
            caenAlHub,
        )
    }

    @Test
    fun `dos claves distintas no comparten ruta`() {
        val porRuta = ModuleCatalog.integra
            .map { it.key }
            .filter { it != "integra-home" }
            .groupBy { integraRouteForKey(it) }
            .filterValues { it.size > 1 }

        assertTrue(
            "Varias claves apuntan a la misma ruta; una de ellas está mal " +
                "mapeada y su pantalla real queda muerta: $porRuta",
            porRuta.isEmpty(),
        )
    }

    @Test
    fun `los modulos cableados el 07-09 resuelven a su ruta`() {
        // Fija el contrato de los cinco paquetes nuevos. Si alguien renombra
        // una ruta sin actualizar el resolutor, esto lo dice.
        val esperado = mapOf(
            "integra-video" to "integra/video",
            "integra-vehicles" to "integra/vehicles",
            "integra-anpr" to "integra/anpr",
            "integra-schedules" to "integra/schedules",
            "integra-espacios" to "integra/espacios",
            "integra-detection" to "integra/detection",
            "integra-audit" to "integra/audit",
            "integra-notifications" to "integra/notifications-center",
            "integra-my-profile" to "integra/my-profile",
            // Sube de la lista de solo lectura a la pantalla de Ajustes.
            "integra-sites" to "integra/settings",
        )

        esperado.forEach { (clave, ruta) ->
            assertEquals("Ruta de $clave", ruta, integraRouteForKey(clave))
        }
    }

    @Test
    fun `un modulo marcado NATIVO no puede ser inalcanzable`() {
        // Etiquetar NATIVO algo que no se puede abrir es exactamente el «todo
        // verde» que motivó esta revisión.
        val mentirosos = ModuleCatalog.integra
            .filter { it.parityStatus == ParityStatus.NATIVO }
            .map { it.key }
            .filter { it != "integra-home" }
            .filter { integraRouteForKey(it) == home }

        assertEquals(
            "Marcados NATIVO pero sin ruta propia: $mentirosos",
            emptyList<String>(),
            mentirosos,
        )
    }
}
