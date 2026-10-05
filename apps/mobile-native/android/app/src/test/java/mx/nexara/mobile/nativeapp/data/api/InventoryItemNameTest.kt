package mx.nexara.mobile.nativeapp.data.api

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * El API manda el nombre del equipo en `equipmentName`; Android leía
 * `itemName` (que no existe en `InventoryItem`) y cada equipo salía como
 * «Equipo» o con el nombre de su grupo.
 */
class InventoryItemNameTest {

    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    @Test
    fun `lee equipmentName del detalle que manda el API`() {
        // Forma real de `GET client-portal/inventories/:id` (recortada).
        val json = """
            {
              "id": 77, "title": "Inventario sucursal Centro", "status": "PENDING",
              "clientId": 3, "branchId": 9, "activityId": null,
              "branch": { "id": 9, "name": "Centro", "branchNumber": "001" },
              "items": [
                { "id": 1, "snapshotId": 77, "sectionName": null, "groupName": "CCTV",
                  "equipmentName": "Cámara domo 4MP", "serialNumber": "SN-1",
                  "compareState": "UNCHANGED", "itemStatus": "ACTIVE", "sortOrder": 0 },
                { "id": 2, "snapshotId": 77, "groupName": "GENERAL",
                  "equipmentName": "NVR 16 canales", "serialNumber": "SN-2" }
              ]
            }
        """.trimIndent()
        val snap = moshi.adapter(ClientPortalInventorySnapshotDto::class.java).fromJson(json)!!
        val items = snap.items!!
        assertEquals(listOf("Cámara domo 4MP", "NVR 16 canales"), items.map { it.displayName() })
        assertEquals("CCTV", items[0].groupName)
        assertEquals(9L, snap.branch?.id)
    }

    @Test
    fun `respaldo a itemName si no viene equipmentName`() {
        val item = moshi.adapter(ClientPortalInventoryItemDto::class.java)
            .fromJson("""{ "id": 5, "groupName": "RED", "itemName": "Switch 8p" }""")!!
        assertEquals("Switch 8p", item.displayName())
    }

    @Test
    fun `equipmentName en blanco cae a itemName y sin ninguno es null`() {
        assertEquals("AP", ClientPortalInventoryItemDto(equipmentName = "  ", itemName = " AP ").displayName())
        assertNull(ClientPortalInventoryItemDto(groupName = "GENERAL").displayName())
    }
}
