package mx.nexara.mobile.nativeapp.data.api

/** Candidato / CV — GET /cvs */
data class CandidateDto(
    val id: Long = 0L,
    val fullName: String = "",
    val email: String = "",
    val whatsapp: String = "",
    val category: String = "",
    val stage: String = "",
    val employmentStatus: String = "",
    val cvUrl: String = "",
    val experience: String = "",
    val notes: String = "",
    val source: String = "",
    val expectedSalary: String = "",
    val position: String = "",
    val createdAt: String = "",
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "cv-$id"
    val displayName: String get() = fullName.ifBlank { "Candidato #$id" }
    val stageKey: String get() = stage.ifBlank { "INBOX" }
    val isRejected: Boolean get() = stageKey.contains("REJECTED")
    val isApproved: Boolean get() = stageKey == "APPROVED"

    fun toFlatMap(): Map<String, Any?> = buildMap {
        putAll(raw)
        put("id", id)
        put("fullName", fullName)
        put("nombre", fullName)
        put("email", email)
        put("whatsapp", whatsapp)
        put("category", category)
        put("stage", stage)
        put("status", stage)
        put("employmentStatus", employmentStatus)
        put("cvUrl", cvUrl)
        put("fileUrl", cvUrl)
        put("experience", experience)
        put("notes", notes)
        put("source", source)
        put("expectedSalary", expectedSalary)
        put("position", position)
        put("createdAt", createdAt)
    }

    companion object {
        fun fromRaw(row: Map<String, Any?>): CandidateDto = CandidateDto(
            id = ProcParse.lng(row["id"]) ?: 0L,
            fullName = ProcParse.str(row["fullName"], row["nombre"], row["name"]),
            email = ProcParse.str(row["email"], row["correo"]),
            whatsapp = ProcParse.str(row["whatsapp"], row["phone"], row["telefono"]),
            category = ProcParse.str(row["category"], row["categoria"]),
            stage = ProcParse.str(row["stage"], row["status"], row["estado"]),
            employmentStatus = ProcParse.str(row["employmentStatus"]),
            cvUrl = ProcParse.str(row["cvUrl"], row["fileUrl"], row["url"]),
            experience = ProcParse.str(row["experience"], row["experiencia"]),
            notes = ProcParse.str(row["notes"], row["notas"]),
            source = ProcParse.str(row["source"], row["origen"]),
            expectedSalary = ProcParse.str(row["expectedSalary"], row["salary"], row["sueldo"]),
            position = ProcParse.str(row["position"], row["role"], row["puesto"]),
            createdAt = ProcParse.str(row["createdAt"], row["fecha"]),
            raw = row,
        )
    }
}
