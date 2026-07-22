package mx.nexara.mobile.nativeapp.data.api

/** Orden de mantenimiento — GET /maintenance/work-orders */
data class WorkOrderDto(
    val id: Long? = null,
    val orderNumber: String = "",
    val title: String = "",
    val description: String = "",
    val status: String = "",
    val priority: String = "",
    val type: String = "",
    val assetName: String = "",
    val assetId: Long? = null,
    val technicianName: String = "",
    val assignedToId: Long? = null,
    val plannedDate: String = "",
    val completedDate: String = "",
    val workPerformed: String = "",
    val notes: String = "",
) {
    val displayTitle: String
        get() = title.ifBlank { orderNumber.ifBlank { "Orden" } }

    fun toFlatMap(): Map<String, Any?> = buildMap {
        put("id", id)
        put("orderNumber", orderNumber)
        put("title", title)
        put("description", description)
        put("status", status)
        put("estado", status)
        put("priority", priority)
        put("prioridad", priority)
        put("type", type)
        put("assetName", assetName)
        put("equipmentName", assetName)
        put("assetId", assetId)
        put("technicianName", technicianName)
        put("responsable", technicianName)
        put("assignedToId", assignedToId)
        put("plannedDate", plannedDate)
        put("scheduledDate", plannedDate)
        put("createdAt", plannedDate)
        put("completedDate", completedDate)
        put("workPerformed", workPerformed)
        put("notes", notes.ifBlank { workPerformed })
        put("observaciones", notes.ifBlank { workPerformed })
    }

    companion object {
        fun fromRaw(row: Map<String, Any?>): WorkOrderDto {
            @Suppress("UNCHECKED_CAST")
            val asset = row["asset"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val assigned = row["assignedTo"] as? Map<String, Any?>
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
            val notes = str(row["notes"], row["observaciones"], row["workPerformed"], row["description"])
            return WorkOrderDto(
                id = lng(row["id"]),
                orderNumber = str(row["orderNumber"], row["number"], row["folio"]),
                title = str(row["title"], row["titulo"]),
                description = str(row["description"], row["descripcion"]),
                status = str(row["status"], row["estado"]),
                priority = str(row["priority"], row["prioridad"]),
                type = str(row["type"], row["tipo"]),
                assetName = str(asset?.get("name"), asset?.get("code"), row["assetName"], row["equipmentName"], row["asset"]),
                assetId = lng(asset?.get("id"), row["assetId"]),
                technicianName = str(assigned?.get("nombre"), assigned?.get("name"), row["technicianName"], row["responsable"]),
                assignedToId = lng(assigned?.get("id"), row["assignedToId"]),
                plannedDate = str(row["plannedDate"], row["scheduledDate"], row["scheduledAt"], row["createdAt"]),
                completedDate = str(row["completedDate"], row["completedAt"]),
                workPerformed = str(row["workPerformed"]),
                notes = notes,
            )
        }
    }
}
