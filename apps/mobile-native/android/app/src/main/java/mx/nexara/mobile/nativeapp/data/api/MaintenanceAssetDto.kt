package mx.nexara.mobile.nativeapp.data.api

/** Activo de mantenimiento — GET /maintenance/assets */
data class MaintenanceAssetDto(
    val id: Long? = null,
    val code: String = "",
    val name: String = "",
    val description: String = "",
    val category: String = "",
    val location: String = "",
    val status: String = "",
    val serialNumber: String = "",
    val manufacturer: String = "",
    val model: String = "",
    val responsibleName: String = "",
    val responsibleId: Long? = null,
    val lastMaintenanceDate: String = "",
) {
    val displayName: String
        get() = name.ifBlank { code.ifBlank { "Activo" } }

    fun toFlatMap(): Map<String, Any?> = buildMap {
        put("id", id)
        put("code", code)
        put("tag", code)
        put("serial", serialNumber.ifBlank { code })
        put("name", name)
        put("nombre", name)
        put("description", description)
        put("category", category)
        put("type", category)
        put("tipo", category)
        put("location", location)
        put("ubicacion", location)
        put("status", status)
        put("estado", status)
        put("serialNumber", serialNumber)
        put("manufacturer", manufacturer)
        put("model", model)
        put("responsibleName", responsibleName)
        put("responsable", responsibleName)
        put("assignedTo", responsibleName)
        put("responsibleId", responsibleId)
        put("lastMaintenanceDate", lastMaintenanceDate)
        put("lastService", lastMaintenanceDate)
    }

    companion object {
        fun fromRaw(row: Map<String, Any?>): MaintenanceAssetDto {
            @Suppress("UNCHECKED_CAST")
            val responsible = row["responsible"] as? Map<String, Any?>
            fun str(vararg keys: Any?): String {
                for (v in keys) {
                    when (v) {
                        is String -> if (v.isNotBlank() && v != "null") return v
                        is Number -> return v.toString()
                        is Map<*, *> -> {
                            val n = v["name"] ?: v["nombre"] ?: v["code"]
                            if (n != null) return n.toString()
                        }
                    }
                }
                return ""
            }
            fun lng(vararg keys: Any?): Long? {
                for (v in keys) {
                    when (v) {
                        is Number -> return v.toLong()
                        is String -> v.toLongOrNull()?.let { return it }
                    }
                }
                return null
            }
            return MaintenanceAssetDto(
                id = lng(row["id"]),
                code = str(row["code"], row["tag"], row["codigo"]),
                name = str(row["name"], row["nombre"]),
                description = str(row["description"], row["descripcion"]),
                category = str(row["category"], row["categoria"], row["type"], row["tipo"]),
                location = str(row["location"], row["ubicacion"]),
                status = str(row["status"], row["estado"], row["condition"]),
                serialNumber = str(row["serialNumber"], row["serial"], row["serie"]),
                manufacturer = str(row["manufacturer"], row["fabricante"]),
                model = str(row["model"], row["modelo"]),
                responsibleName = str(
                    responsible?.get("nombre"), responsible?.get("name"),
                    row["responsibleName"], row["responsable"], row["assignedTo"],
                ),
                responsibleId = lng(responsible?.get("id"), row["responsibleId"]),
                lastMaintenanceDate = str(row["lastMaintenanceDate"], row["lastService"], row["updatedAt"]),
            )
        }
    }
}
