package mx.nexara.mobile.nativeapp.data.api

data class SlaBucketDto(
    val onTime: Int = 0,
    val late: Int = 0,
    val compliancePercent: Double = 0.0,
) {
    companion object {
        fun fromRaw(row: Map<String, Any?>): SlaBucketDto = SlaBucketDto(
            onTime = ProcParse.dbl(row["onTime"])?.toInt() ?: 0,
            late = ProcParse.dbl(row["late"])?.toInt() ?: 0,
            compliancePercent = ProcParse.dbl(row["compliancePercent"]) ?: 0.0,
        )
    }
}

data class SlaBreachDto(
    val id: String = "",
    val title: String = "",
    val anNumber: String = "",
    val type: String = "",
    val priority: String = "",
    val hoursLate: Double = 0.0,
) {
    val rowKey: String get() = "sb-${id.ifBlank { anNumber.ifBlank { title } }}"
    val displayTitle: String get() = title.ifBlank { anNumber.ifBlank { "Incumplimiento" } }

    companion object {
        fun fromRaw(row: Map<String, Any?>): SlaBreachDto = SlaBreachDto(
            id = ProcParse.str(row["id"], row["anNumber"], row["titulo"]),
            title = ProcParse.str(row["titulo"], row["title"]),
            anNumber = ProcParse.str(row["anNumber"], row["folio"]),
            type = ProcParse.str(row["type"], row["tipo"]),
            priority = ProcParse.str(row["priority"], row["prioridad"]),
            hoursLate = ProcParse.dbl(row["hoursLate"], row["hours"]) ?: 0.0,
        )
    }
}

data class SlaStatsDto(
    val total: Int = 0,
    val stillOpen: Int = 0,
    val response: SlaBucketDto = SlaBucketDto(),
    val resolution: SlaBucketDto = SlaBucketDto(),
    val recentBreaches: List<SlaBreachDto> = emptyList(),
    val raw: Map<String, Any?> = emptyMap(),
) {
    companion object {
        fun fromRaw(row: Map<String, Any?>): SlaStatsDto {
            @Suppress("UNCHECKED_CAST")
            val resp = row["responseSla"] as? Map<String, Any?> ?: emptyMap()
            @Suppress("UNCHECKED_CAST")
            val resol = row["resolutionSla"] as? Map<String, Any?> ?: emptyMap()
            val breaches = (row["recentBreaches"] as? List<*>)
                ?.mapNotNull { it as? Map<*, *> }
                ?.map { m ->
                    @Suppress("UNCHECKED_CAST")
                    SlaBreachDto.fromRaw(m as Map<String, Any?>)
                }
                ?: emptyList()
            return SlaStatsDto(
                total = ProcParse.dbl(row["total"])?.toInt() ?: 0,
                stillOpen = ProcParse.dbl(row["stillOpen"])?.toInt() ?: 0,
                response = SlaBucketDto.fromRaw(resp),
                resolution = SlaBucketDto.fromRaw(resol),
                recentBreaches = breaches,
                raw = row,
            )
        }
    }
}

data class MaintenanceContractDto(
    val id: Long = 0L,
    val contractNumber: String = "",
    val title: String = "",
    val status: String = "",
    val clientName: String = "",
    val frequency: String = "",
    val startDate: String = "",
    val endDate: String = "",
    val monthlyFee: Double? = null,
    val currency: String = "MXN",
    val slaResponseHours: Int? = null,
    val slaResolutionHours: Int? = null,
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "mc-$id"
    val displayTitle: String
        get() = title.ifBlank { contractNumber.ifBlank { "Contrato" } }

    @Suppress("UNCHECKED_CAST")
    val activities: List<Map<String, Any?>>
        get() = (raw["activities"] as? List<*>)?.filterIsInstance<Map<String, Any?>>()
            ?: (raw["actividades"] as? List<*>)?.filterIsInstance<Map<String, Any?>>()
            ?: emptyList()

    @Suppress("UNCHECKED_CAST")
    val slaEntries: List<Map<String, Any?>>
        get() = (raw["sla"] as? List<*>)?.filterIsInstance<Map<String, Any?>>()
            ?: (raw["slaEntries"] as? List<*>)?.filterIsInstance<Map<String, Any?>>()
            ?: emptyList()

    @Suppress("UNCHECKED_CAST")
    val inventory: List<Map<String, Any?>>
        get() = (raw["inventory"] as? List<*>)?.filterIsInstance<Map<String, Any?>>()
            ?: (raw["inventario"] as? List<*>)?.filterIsInstance<Map<String, Any?>>()
            ?: emptyList()

    fun toFlatMap(): Map<String, Any?> = buildMap {
        putAll(raw)
        put("id", id)
        put("contractNumber", contractNumber)
        put("title", title)
        put("name", title)
        put("status", status)
        put("estado", status)
        put("clientName", clientName)
        put("cliente", clientName)
        put("frequency", frequency)
        put("startDate", startDate)
        put("endDate", endDate)
        put("expiresAt", endDate)
        put("monthlyFee", monthlyFee)
        put("amount", monthlyFee)
        put("currency", currency)
        put("slaResponseHours", slaResponseHours)
        put("slaResolutionHours", slaResolutionHours)
    }

    companion object {
        fun fromRaw(row: Map<String, Any?>): MaintenanceContractDto {
            @Suppress("UNCHECKED_CAST")
            val client = row["client"] as? Map<String, Any?>
            return MaintenanceContractDto(
                id = ProcParse.lng(row["id"]) ?: 0L,
                contractNumber = ProcParse.str(row["contractNumber"], row["number"], row["folio"]),
                title = ProcParse.str(row["title"], row["name"], row["titulo"]),
                status = ProcParse.str(row["status"], row["estado"]),
                clientName = ProcParse.str(
                    client?.get("name"), client?.get("nombre"),
                    row["clientName"], row["cliente"],
                ),
                frequency = ProcParse.str(row["frequency"], row["frecuencia"], row["type"], row["tipo"]),
                startDate = ProcParse.str(row["startDate"], row["fechaInicio"]),
                endDate = ProcParse.str(row["endDate"], row["expiresAt"], row["fechaFin"]),
                monthlyFee = ProcParse.dbl(row["monthlyFee"], row["amount"], row["monto"]),
                currency = ProcParse.str(row["currency"], row["moneda"]).ifBlank { "MXN" },
                slaResponseHours = ProcParse.dbl(row["slaResponseHours"])?.toInt(),
                slaResolutionHours = ProcParse.dbl(row["slaResolutionHours"])?.toInt(),
                raw = row,
            )
        }
    }
}
