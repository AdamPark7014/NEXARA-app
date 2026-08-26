package mx.nexara.mobile.nativeapp.data.api

/**
 * Solicitud ops (GET /client-ticket-requests) tipada desde mapas genéricos.
 * Distinta de [ClientTicketRequestDto] de TicketsApi (portal Retrofit/Moshi).
 */
data class OpsClientTicketRequestDto(
    val id: Long = 0L,
    val description: String = "",
    val title: String = "",
    val status: String = "",
    val urgency: String = "",
    val requestType: String = "",
    val branchName: String = "",
    val branchNumber: String = "",
    val city: String = "",
    val state: String = "",
    val address: String = "",
    val clientId: Long? = null,
    val clientName: String = "",
    val createdAt: String = "",
    val dueAt: String = "",
) {
    val rowKey: String get() = "ctr-$id"
    val displayTitle: String
        get() = description.ifBlank { title.ifBlank { "Solicitud" } }
    val isHighUrgency: Boolean get() = urgency.equals("HIGH", ignoreCase = true)

    fun toFlatMap(): Map<String, Any?> = buildMap {
        put("id", id)
        put("description", description)
        put("title", title.ifBlank { description })
        put("status", status)
        put("urgency", urgency)
        put("requestType", requestType)
        put("branchName", branchName)
        put("branchNumber", branchNumber)
        put("city", city)
        put("state", state)
        put("address", address)
        put("clientId", clientId)
        put("clientName", clientName)
        put("createdAt", createdAt)
        put("dueAt", dueAt)
    }

    companion object {
        fun fromRaw(row: Map<String, Any?>): OpsClientTicketRequestDto {
            @Suppress("UNCHECKED_CAST")
            val client = row["client"] as? Map<String, Any?>
            return OpsClientTicketRequestDto(
                id = ProcParse.lng(row["id"]) ?: 0L,
                description = ProcParse.str(row["description"], row["descripcion"]),
                title = ProcParse.str(row["title"], row["titulo"]),
                status = ProcParse.str(row["status"], row["estado"]),
                urgency = ProcParse.str(row["urgency"], row["urgencia"]),
                requestType = ProcParse.str(row["requestType"], row["tipo"]),
                branchName = ProcParse.str(row["branchName"], row["sucursal"]),
                branchNumber = ProcParse.str(row["branchNumber"]),
                city = ProcParse.str(row["city"], row["ciudad"]),
                state = ProcParse.str(row["state"], row["estado"]),
                address = ProcParse.str(row["address"], row["direccion"]),
                clientId = ProcParse.lng(client?.get("id")),
                clientName = ProcParse.str(
                    client?.get("name"), client?.get("nombre"),
                    row["clientName"], row["client"], row["name"],
                ),
                createdAt = ProcParse.str(row["createdAt"], row["fecha"]),
                dueAt = ProcParse.str(row["dueAt"], row["fechaVencimiento"]),
            )
        }
    }
}
