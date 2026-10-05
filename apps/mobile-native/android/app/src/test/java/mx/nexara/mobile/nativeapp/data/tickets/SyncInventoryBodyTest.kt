package mx.nexara.mobile.nativeapp.data.tickets

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.api.ClientPortalInventoryItemDto
import mx.nexara.mobile.nativeapp.data.api.SyncInventoryInputDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * «Sincronizar inventario» borraba todos los equipos: Android reenviaba
 * `items` sin `equipmentName` y el API (`sanitizeItems`) los descartaba antes
 * de borrar los del inventario. Estas pruebas fijan el cuerpo que se manda.
 */
class SyncInventoryBodyTest {

    /** Misma configuración que `ApiClient` (Moshi + Kotlin, nulos omitidos). */
    private val adapter = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()
        .adapter(SyncInventoryInputDto::class.java)

    @Test
    fun `sin equipos el cuerpo no lleva items y el API conserva los que tiene`() {
        val body = buildSyncInventoryBody(
            branchId = 12,
            snapshotId = 345,
            title = "  Inventario Centro ",
            notes = "Revisado",
            completed = true,
            confirmDifference = false,
        )
        assertNull(body.items)
        val json = adapter.toJson(body)
        assertFalse("no debe viajar `items`: el API reemplazaría los equipos", json.contains("\"items\""))
        assertTrue(json.contains("\"branchId\":12"))
        assertTrue(json.contains("\"snapshotId\":345"))
        assertTrue(json.contains("\"title\":\"Inventario Centro\""))
        assertTrue(json.contains("\"completed\":true"))
        assertTrue(json.contains("\"confirmDifference\":false"))
    }

    @Test
    fun `notas y titulo en blanco no viajan`() {
        val body = buildSyncInventoryBody(
            branchId = 1,
            snapshotId = null,
            title = "   ",
            notes = "",
            completed = false,
            confirmDifference = false,
        )
        assertNull(body.title)
        assertNull(body.notes)
        val json = adapter.toJson(body)
        assertFalse(json.contains("\"title\""))
        assertFalse(json.contains("\"notes\""))
    }

    @Test
    fun `si se mandan equipos cada uno lleva equipmentName`() {
        val body = buildSyncInventoryBody(
            branchId = 1,
            snapshotId = 2,
            title = null,
            notes = null,
            completed = false,
            confirmDifference = false,
            items = listOf(
                ClientPortalInventoryItemDto(id = 1, groupName = "CCTV", equipmentName = "Cámara bala"),
                // Respuesta vieja: sólo `itemName`.
                ClientPortalInventoryItemDto(id = 2, groupName = "RED", itemName = "Switch 8p"),
            ),
        )
        val names = body.items!!.map { it.equipmentName }
        assertEquals(listOf("Cámara bala", "Switch 8p"), names)
        val json = adapter.toJson(body)
        assertTrue(json.contains("\"equipmentName\":\"Cámara bala\""))
        assertTrue(json.contains("\"equipmentName\":\"Switch 8p\""))
    }

    @Test
    fun `un equipo sin nombre detiene la sincronizacion en vez de borrar`() {
        try {
            buildSyncInventoryBody(
                branchId = 1,
                snapshotId = 2,
                title = null,
                notes = null,
                completed = false,
                confirmDifference = false,
                items = listOf(
                    ClientPortalInventoryItemDto(id = 1, equipmentName = "NVR"),
                    ClientPortalInventoryItemDto(id = 2, groupName = "GENERAL", equipmentName = "  "),
                ),
            )
            fail("Debió rechazar el equipo sin nombre")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message!!.contains("sin nombre"))
        }
    }
}
