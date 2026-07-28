package mx.nexara.mobile.nativeapp.data.api

/** Aprobación pendiente — GET /workflow/my-pending */
data class WorkflowApprovalDto(
    val id: Long = 0L,
    val status: String = "",
    val workflowName: String = "",
    val entityType: String = "",
    val entityId: Long? = null,
    val stepNumber: Int? = null,
    val stepName: String = "",
    val requestedByName: String = "",
    val createdAt: String = "",
    val priority: String = "",
) {
    val rowKey: String get() = "wa-$id"

    val displayTitle: String
        get() = workflowName.ifBlank { stepName.ifBlank { entityType.ifBlank { "Aprobación" } } }

    val displaySubtitle: String
        get() = buildList {
            entityId?.let { add("Entidad #$it") }
            stepNumber?.let { add("Paso $it") }
            if (requestedByName.isNotBlank()) add(requestedByName)
        }.joinToString(" · ")

    val urgencyLabel: String get() = priority.ifBlank { "normal" }

    fun toFlatMap(): Map<String, Any?> = buildMap {
        put("id", id)
        put("approvalId", id)
        put("status", status)
        put("title", displayTitle)
        put("entityType", entityType)
        put("stepName", stepName)
        put("requestedBy", requestedByName)
        put("userName", requestedByName)
        put("solicita", requestedByName)
        put("createdAt", createdAt)
        put("priority", priority)
        put("urgencia", priority)
        put("entityId", entityId)
        put("stepNumber", stepNumber)
    }

    companion object {
        fun fromRaw(row: Map<String, Any?>): WorkflowApprovalDto {
            @Suppress("UNCHECKED_CAST")
            val instance = row["instance"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val workflow = instance?.get("workflow") as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val step = row["step"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val startedBy = instance?.get("startedBy") as? Map<String, Any?>
            return WorkflowApprovalDto(
                id = ProcParse.lng(row["id"], row["approvalId"]) ?: 0L,
                status = ProcParse.str(row["status"], row["estado"]),
                workflowName = ProcParse.str(workflow?.get("name"), row["title"], row["workflowName"]),
                entityType = ProcParse.str(
                    instance?.get("entityType"), workflow?.get("entityType"), row["entityType"],
                ),
                entityId = ProcParse.lng(instance?.get("entityId"), row["entityId"]),
                stepNumber = ProcParse.dbl(step?.get("stepNumber"), row["stepNumber"])?.toInt(),
                stepName = ProcParse.str(step?.get("name"), step?.get("title"), row["stepName"]),
                requestedByName = ProcParse.str(
                    startedBy?.get("nombre"), startedBy?.get("name"),
                    row["requestedBy"], row["userName"], row["solicita"],
                ),
                createdAt = ProcParse.str(row["createdAt"], row["fecha"]),
                priority = ProcParse.str(row["priority"], row["urgencia"], row["urgency"]),
            )
        }
    }
}
