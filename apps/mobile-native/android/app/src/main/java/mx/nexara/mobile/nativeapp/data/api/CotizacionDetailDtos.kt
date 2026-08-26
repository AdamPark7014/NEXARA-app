package mx.nexara.mobile.nativeapp.data.api

data class CotizacionItemDto(
    val id: Long = 0L,
    val name: String = "",
    val qty: Int = 1,
    val unitPrice: Double = 0.0,
    val unitCost: Double = 0.0,
    val marginPercent: Double? = null,
    val discount: Double = 0.0,
    val tax: Double = 16.0,
    val lineTotal: Double = 0.0,
    val brand: String? = null,
    val model: String? = null,
    val sku: String? = null,
    val supplierCode: String? = null,
) {
    val lineCost: Double get() = if (unitCost > 0) unitCost * qty else 0.0
    val lineSellNet: Double get() = unitPrice * qty
    val lineMargin: Double get() = if (unitCost > 0) lineSellNet - lineCost else 0.0
    val lineMarginPercent: Double?
        get() = marginPercent ?: if (lineSellNet > 0 && unitCost > 0) (lineMargin / lineSellNet) * 100.0 else null

    companion object {
        fun fromRaw(row: Map<String, Any?>): CotizacionItemDto {
            val qty = ProcParse.lng(row["qty"])?.toInt() ?: 1
            val unitPrice = ProcParse.dbl(row["unitPrice"]) ?: 0.0
            val lineTotal = ProcParse.dbl(row["lineTotal"]) ?: (unitPrice * qty)
            return CotizacionItemDto(
                id = ProcParse.lng(row["id"]) ?: 0L,
                name = ProcParse.str(row["name"], row["nombre"]),
                qty = qty,
                unitPrice = unitPrice,
                unitCost = ProcParse.dbl(row["unitCost"]) ?: 0.0,
                marginPercent = ProcParse.dbl(row["marginPercent"]),
                discount = ProcParse.dbl(row["discount"]) ?: 0.0,
                tax = ProcParse.dbl(row["tax"]) ?: 16.0,
                lineTotal = lineTotal,
                brand = ProcParse.str(row["brand"], row["marca"]).takeIf { it.isNotBlank() },
                model = ProcParse.str(row["model"], row["modelo"]).takeIf { it.isNotBlank() },
                sku = ProcParse.str(row["sku"], row["clave"]).takeIf { it.isNotBlank() },
                supplierCode = ProcParse.str(row["supplierCode"]).takeIf { it.isNotBlank() },
            )
        }
    }
}

data class CotizacionDetailDto(
    val id: Long,
    val quoteNumber: String,
    val status: String,
    val issueDate: String? = null,
    val validUntil: String? = null,
    val clientName: String? = null,
    val clientCompany: String? = null,
    val clientEmail: String? = null,
    val projectName: String? = null,
    val subtotal: Double = 0.0,
    val taxTotal: Double = 0.0,
    val total: Double = 0.0,
    val sentAt: String? = null,
    val sentToEmail: String? = null,
    val items: List<CotizacionItemDto> = emptyList(),
) {
    val displayFolio: String get() = quoteNumber.ifBlank { "COT-$id" }
    val hasCtLines: Boolean get() = items.any { it.supplierCode == "CT" }

    companion object {
        fun fromRaw(row: Map<String, Any?>): CotizacionDetailDto {
            @Suppress("UNCHECKED_CAST")
            val itemsRaw = row["items"] as? List<Map<String, Any?>>
            val items = itemsRaw?.map { CotizacionItemDto.fromRaw(it) } ?: emptyList()
            return CotizacionDetailDto(
                id = ProcParse.lng(row["id"]) ?: 0L,
                quoteNumber = ProcParse.str(row["quoteNumber"], row["folio"]),
                status = ProcParse.str(row["status"], row["estatus"], "DRAFT"),
                issueDate = ProcParse.str(row["issueDate"], row["fecha"]).takeIf { it.isNotBlank() },
                validUntil = ProcParse.str(row["validUntil"]).takeIf { it.isNotBlank() },
                clientName = ProcParse.str(row["clientName"], row["cliente"]).takeIf { it.isNotBlank() },
                clientCompany = ProcParse.str(row["clientCompany"]).takeIf { it.isNotBlank() },
                clientEmail = ProcParse.str(row["clientEmail"]).takeIf { it.isNotBlank() },
                projectName = ProcParse.str(row["projectName"], row["proyecto"]).takeIf { it.isNotBlank() },
                subtotal = ProcParse.dbl(row["subtotal"]) ?: 0.0,
                taxTotal = ProcParse.dbl(row["taxTotal"]) ?: 0.0,
                total = ProcParse.dbl(row["total"]) ?: 0.0,
                sentAt = ProcParse.str(row["sentAt"]).takeIf { it.isNotBlank() },
                sentToEmail = ProcParse.str(row["sentToEmail"]).takeIf { it.isNotBlank() },
                items = items,
            )
        }
    }
}

data class CrmActivityDto(
    val id: Long = 0L,
    val title: String = "",
    val activityType: String = "",
    val status: String = "",
    val dueDate: String? = null,
    val notes: String? = null,
    val outcome: String? = null,
    val relatedLabel: String = "",
) {
    val rowKey: String get() = "crm-act-$id"
    val displayTitle: String get() = title.ifBlank { activityType.ifBlank { "Actividad" } }
    val isOverdue: Boolean
        get() {
            if (status.uppercase() != "PENDING" || dueDate.isNullOrBlank()) return false
            return dueDate.take(10) < java.time.LocalDate.now().toString()
        }

    companion object {
        fun fromRaw(row: Map<String, Any?>): CrmActivityDto {
            @Suppress("UNCHECKED_CAST")
            val lead = row["lead"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val opp = row["opportunity"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val tender = row["tender"] as? Map<String, Any?>
            val related = when {
                opp != null -> ProcParse.str(opp["title"])
                lead != null -> ProcParse.str(lead["name"], lead["company"])
                tender != null -> ProcParse.str(tender["tenderNumber"])
                else -> ""
            }
            return CrmActivityDto(
                id = ProcParse.lng(row["id"]) ?: 0L,
                title = ProcParse.str(row["title"], row["subject"]),
                activityType = ProcParse.str(row["activityType"], row["type"]),
                status = ProcParse.str(row["status"], "PENDING"),
                dueDate = ProcParse.str(row["dueDate"]).takeIf { it.isNotBlank() },
                notes = ProcParse.str(row["notes"], row["description"]).takeIf { it.isNotBlank() },
                outcome = ProcParse.str(row["outcome"]).takeIf { it.isNotBlank() },
                relatedLabel = related,
            )
        }
    }
}

data class CrmAgendaDto(
    val pendingToday: List<CrmActivityDto> = emptyList(),
    val overdue: List<CrmActivityDto> = emptyList(),
    val upcoming: List<CrmActivityDto> = emptyList(),
    val recentlyCompleted: List<CrmActivityDto> = emptyList(),
) {
    val allPending: List<CrmActivityDto>
        get() = (overdue + pendingToday + upcoming).distinctBy { it.id }
}
