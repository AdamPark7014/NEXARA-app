package mx.nexara.mobile.nativeapp.data.api

/** Portfolio / marketing project — GET /projects */
data class PortfolioProjectDto(
    val id: Long = 0L,
    val title: String = "",
    val slug: String = "",
    val sector: String = "",
    val summary: String = "",
    val impact: String = "",
    val services: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
    val highlights: List<String> = emptyList(),
    val mainImage: String = "",
    val gallery: List<String> = emptyList(),
    val createdAt: String = "",
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "pp-$id"
    val displayTitle: String get() = title.ifBlank { "Proyecto" }
    val subtitle: String
        get() = listOf(sector, impact).filter { it.isNotBlank() }.joinToString(" · ")

    fun toFlatMap(): Map<String, Any?> = buildMap {
        putAll(raw)
        put("id", id)
        put("title", title)
        put("name", title)
        put("nombre", title)
        put("slug", slug)
        put("sector", sector)
        put("summary", summary)
        put("impact", impact)
        put("services", services)
        put("tags", tags)
        put("highlights", highlights)
        put("mainImage", mainImage)
        put("gallery", gallery)
        put("createdAt", createdAt)
    }

    companion object {
        @Suppress("UNCHECKED_CAST")
        fun fromRaw(row: Map<String, Any?>): PortfolioProjectDto = PortfolioProjectDto(
            id = ProcParse.lng(row["id"]) ?: 0L,
            title = ProcParse.str(row["title"], row["name"], row["nombre"]),
            slug = ProcParse.str(row["slug"]),
            sector = ProcParse.str(row["sector"]),
            summary = ProcParse.str(row["summary"], row["description"], row["descripcion"]),
            impact = ProcParse.str(row["impact"]),
            services = stringList(row["services"]),
            tags = stringList(row["tags"]),
            highlights = stringList(row["highlights"]),
            mainImage = ProcParse.str(row["mainImage"], row["image"], row["coverUrl"]),
            gallery = stringList(row["gallery"]),
            createdAt = ProcParse.str(row["createdAt"], row["fecha"]),
            raw = row,
        )

        private fun stringList(value: Any?): List<String> = when (value) {
            is List<*> -> value.mapNotNull { it?.toString()?.takeIf { s -> s.isNotBlank() && s != "null" } }
            is String -> if (value.isBlank()) emptyList() else value.split(',').map { it.trim() }.filter { it.isNotEmpty() }
            else -> emptyList()
        }
    }
}

/** Hoja de servicio — GET /service-sheets */
data class ServiceSheetListDto(
    val id: Long = 0L,
    val activityId: Long = 0L,
    val clientName: String = "",
    val technicianName: String = "",
    val serviceType: String = "",
    val status: String = "",
    val managerName: String = "",
    val managerRole: String = "",
    val workSummary: String = "",
    val observations: String = "",
    val signedName: String = "",
    val pdfUrl: String = "",
    val createdAt: String = "",
    val equipmentList: List<Map<String, Any?>> = emptyList(),
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "ss-$id"
    val displayTitle: String
        get() = clientName.ifBlank { serviceType.ifBlank { "Hoja #$id" } }

    fun toFlatMap(): Map<String, Any?> = buildMap {
        putAll(raw)
        put("id", id)
        put("activityId", activityId)
        put("clientName", clientName)
        put("technicianName", technicianName)
        put("serviceType", serviceType)
        put("status", status)
        put("managerName", managerName)
        put("managerRole", managerRole)
        put("workSummary", workSummary)
        put("observations", observations)
        put("signedName", signedName)
        put("pdfUrl", pdfUrl)
        put("createdAt", createdAt)
        put("equipmentList", equipmentList)
        put("materials", equipmentList)
    }

    companion object {
        @Suppress("UNCHECKED_CAST")
        fun fromRaw(row: Map<String, Any?>): ServiceSheetListDto {
            val equipment = when (val e = row["equipmentList"] ?: row["materials"] ?: row["materiales"]) {
                is List<*> -> e.mapNotNull { it as? Map<String, Any?> }
                else -> emptyList()
            }
            return ServiceSheetListDto(
                id = ProcParse.lng(row["id"]) ?: 0L,
                activityId = ProcParse.lng(row["activityId"]) ?: 0L,
                clientName = ProcParse.str(row["clientName"], row["cliente"]),
                technicianName = ProcParse.str(row["technicianName"], row["userName"], row["responsable"]),
                serviceType = ProcParse.str(row["serviceType"], row["ticketType"], row["tipo"]),
                status = ProcParse.str(row["status"], row["estado"], row["estatus"]),
                managerName = ProcParse.str(row["managerName"]),
                managerRole = ProcParse.str(row["managerRole"]),
                workSummary = ProcParse.str(row["workSummary"], row["summary"]),
                observations = ProcParse.str(row["observations"], row["observaciones"], row["notes"]),
                signedName = ProcParse.str(row["signedName"], row["clientSignature"]),
                pdfUrl = ProcParse.str(row["pdfUrl"]),
                createdAt = ProcParse.str(row["createdAt"], row["fecha"]),
                equipmentList = equipment,
                raw = row,
            )
        }
    }
}
