package mx.nexara.mobile.nativeapp.ui.shared

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Cita el texto viejo, que juntaba el estado y la cuenta en un renglón:
 * «Sin conexión · 3 en cola (incl. fotos)»,
 * «Pendientes de sync: 3 · toca para reintentar»,
 * «Sin conexión · 3 operaciones pendiente(s) de envío»,
 * «Sesión sin validar · reconecta para sincronizar · ».
 */
class OfflineBannerTextoTest {

    @Test
    fun unDatoPorRenglonYReintentar() {
        val viejoCola = "Sin conexión · 3 en cola (incl. fotos)"
        val viejoSync = "Pendientes de sync: 3 · toca para reintentar"
        val viejoWeb = "Sin conexión · 3 operaciones pendiente(s) de envío"
        val viejoSesion = "Sesión sin validar · reconecta para sincronizar · "

        val cola = lineasOfflineBanner(isOffline = true, pendingMutations = 3)
        assertEquals(listOf("Sin conexión", "3 en cola (incl. fotos)"), cola)
        assertFalse(cola.contains(viejoCola))
        assertTrue(cola.none { it.contains(" · ") })
        assertEquals("Reintentar", ACCION_REINTENTAR_OFFLINE)
        assertFalse(viejoSync.contains(ACCION_REINTENTAR_OFFLINE))

        val sync = lineasOfflineBanner(isOffline = false, pendingMutations = 3)
        assertEquals(listOf("Pendientes de sync: 3"), sync)
        assertFalse(sync.any { it == viejoSync || it.contains("toca para reintentar") })

        val vacio = lineasOfflineBanner(isOffline = true, pendingMutations = 0)
        assertEquals(listOf("Sin conexión", "cambios y fotos se encolan localmente"), vacio)
        assertTrue(vacio.none { it.contains(" · ") })

        val root = repoRoot()
        val fuentes = listOf(
            File(root, "apps/mobile-native/android/app/src/main/java/mx/nexara/mobile/nativeapp/ui/shared/OfflineBanner.kt"),
            File(root, "apps/mobile-native/ios/NexaraApp/UI/Common/OfflineBanner.swift"),
            File(root, "apps/web/components/OfflineNetworkBanner.tsx"),
        ).map { it.readText() }
        val junto = fuentes.joinToString("\n")
        assertFalse(junto.contains(viejoCola))
        assertFalse(junto.contains(viejoSync))
        assertFalse(junto.contains(viejoWeb))
        assertFalse(junto.contains(viejoSesion))
        assertFalse(junto.contains("toca para reintentar"))
        assertFalse(junto.contains("Sin conexión ·"))
        assertFalse(junto.contains("Sesión sin validar ·"))
        assertFalse(junto.contains("reconecta para sincronizar ·"))
        assertTrue(junto.contains("Reintentar"))
        assertTrue(fuentes[1].contains("en cola (incl. fotos)"))
        assertTrue(fuentes[1].contains("Pendientes de sync:"))
        assertTrue(fuentes[2].contains("Sin conexión"))
        assertTrue(fuentes[2].contains("Sesión sin validar"))
        assertTrue(fuentes[2].contains("reconecta para sincronizar"))
        assertFalse(junto.contains("pendiente(s)"))
        assertFalse(junto.contains("(s)"))
        assertTrue(fuentes[2].contains("operación pendiente de envío"))
        assertTrue(fuentes[2].contains("operaciones pendientes de envío"))
        assertTrue(fuentes[2].contains(">Reintentar<") || fuentes[2].contains("Reintentar"))
    }

    private fun repoRoot(): File {
        val cwd = System.getProperty("user.dir") ?: error("sin directorio de trabajo")
        var dir: File? = File(cwd).absoluteFile
        repeat(8) {
            val actual = dir ?: error("No se encontró el repo")
            if (File(actual, "apps/web/components/OfflineNetworkBanner.tsx").isFile) return actual
            dir = actual.parentFile
        }
        error("No se encontró el repo desde $cwd")
    }
}
