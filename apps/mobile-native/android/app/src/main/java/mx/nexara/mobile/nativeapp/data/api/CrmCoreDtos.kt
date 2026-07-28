package mx.nexara.mobile.nativeapp.data.api

data class CrmOpportunityDto(
    val id: Long = 0L,
    val title: String = "",
    val stage: String = "",
    val value: Double = 0.0,
    val probability: Double = 0.0,
    val clientName: String = "",
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "opp-$id"
    val displayTitle: String get() = title.ifBlank { "Oportunidad" }
    val stageKey: String get() = stage.ifBlank { "Sin etapa" }
    val weightedValue: Double get() = value * ((if (probability > 0) probability else 20.0) / 100.0)
    val isWon: Boolean
        get() {
            val s = stage.lowercase()
            return s == "won" || s.contains("ganad")
        }

    fun toFlatMap(): Map<String, Any?> = buildMap {
        putAll(raw)
        put("id", id)
        put("title", title)
        put("name", title)
        put("stage", stage)
        put("etapa", stage)
        put("value", value)
        put("amount", value)
        put("probability", probability)
        put("clientName", clientName)
    }

    companion object {
        fun fromRaw(row: Map<String, Any?>): CrmOpportunityDto {
            @Suppress("UNCHECKED_CAST")
            val client = row["client"] as? Map<String, Any?>
            return CrmOpportunityDto(
                id = ProcParse.lng(row["id"]) ?: 0L,
                title = ProcParse.str(row["title"], row["name"], row["titulo"]),
                stage = ProcParse.str(row["stage"], row["etapa"], row["status"]),
                value = ProcParse.dbl(row["value"], row["amount"], row["monto"]) ?: 0.0,
                probability = ProcParse.dbl(row["probability"], row["probabilidad"]) ?: 0.0,
                clientName = ProcParse.str(
                    row["clientName"], row["cliente"], row["accountName"],
                    client?.get("name"), client?.get("nombre"),
                ),
                raw = row,
            )
        }
    }
}

data class CrmOppNoteDto(
    val id: String = "",
    val message: String = "",
    val createdAt: String = "",
) {
    val rowKey: String get() = "note-${id.ifBlank { message }}"

    companion object {
        fun fromRaw(row: Map<String, Any?>): CrmOppNoteDto {
            val id = ProcParse.str(row["id"])
            return CrmOppNoteDto(
                id = id.ifBlank { ProcParse.str(row["createdAt"], row["fecha"], row["message"]) },
                message = ProcParse.str(row["message"], row["mensaje"], row["content"]),
                createdAt = ProcParse.str(row["createdAt"], row["fecha"]),
            )
        }
    }
}

data class CrmOppAttachmentDto(
    val id: String = "",
    val name: String = "",
    val url: String = "",
) {
    val rowKey: String get() = "att-${id.ifBlank { url.ifBlank { name } }}"
    val displayName: String get() = name.ifBlank { "Archivo" }

    companion object {
        fun fromRaw(row: Map<String, Any?>): CrmOppAttachmentDto {
            val id = ProcParse.str(row["id"])
            return CrmOppAttachmentDto(
                id = id.ifBlank { ProcParse.str(row["url"], row["fileUrl"], row["name"]) },
                name = ProcParse.str(row["name"], row["nombre"], row["fileName"]),
                url = ProcParse.str(row["url"], row["fileUrl"]),
            )
        }
    }
}

data class CrmOppQuoteDto(
    val id: String = "",
    val label: String = "",
    val pdfUrl: String = "",
    val createdAt: String = "",
) {
    val rowKey: String get() = "quote-${id.ifBlank { label.ifBlank { pdfUrl } }}"
    val displayLabel: String get() = label.ifBlank { "Cotización" }

    companion object {
        fun fromRaw(row: Map<String, Any?>): CrmOppQuoteDto {
            val id = ProcParse.str(row["id"])
            return CrmOppQuoteDto(
                id = id.ifBlank { ProcParse.str(row["folio"], row["versionLabel"], row["pdfUrl"]) },
                label = ProcParse.str(row["versionLabel"], row["folio"], row["name"]),
                pdfUrl = ProcParse.str(row["pdfUrl"], row["url"]),
                createdAt = ProcParse.str(row["createdAt"], row["fecha"]),
            )
        }
    }
}

data class CrmOppHistoryEventDto(
    val id: String = "",
    val action: String = "",
    val userName: String = "",
    val createdAt: String = "",
    val detail: String = "",
) {
    val rowKey: String get() = "hist-${id.ifBlank { "$action-$createdAt" }}"
    val displayAction: String get() = action.ifBlank { "Cambio" }

    companion object {
        fun fromRaw(row: Map<String, Any?>, index: Int = 0): CrmOppHistoryEventDto {
            val id = ProcParse.str(row["id"])
            return CrmOppHistoryEventDto(
                id = id.ifBlank { "$index-${ProcParse.str(row["createdAt"], row["timestamp"], row["action"])}" },
                action = ProcParse.str(row["action"], row["accion"], row["event"], row["type"]),
                userName = ProcParse.str(row["userName"], row["createdByName"], row["usuario"]),
                createdAt = ProcParse.str(row["createdAt"], row["timestamp"], row["fecha"]),
                detail = ProcParse.str(row["detail"], row["description"], row["changes"], row["mensaje"]),
            )
        }
    }
}

/** Detalle completo — GET /ventas/oportunidades/:id */
data class CrmOpportunityDetailDto(
    val id: Long = 0L,
    val title: String = "",
    val stage: String = "",
    val value: Double = 0.0,
    val probability: Double = 0.0,
    val clientName: String = "",
    val description: String = "",
    val expectedCloseDate: String = "",
    val notes: List<CrmOppNoteDto> = emptyList(),
    val attachments: List<CrmOppAttachmentDto> = emptyList(),
    val quotes: List<CrmOppQuoteDto> = emptyList(),
    val history: List<CrmOppHistoryEventDto> = emptyList(),
    val raw: Map<String, Any?> = emptyMap(),
) {
    val displayTitle: String get() = title.ifBlank { "Oportunidad" }
    val stageKey: String get() = stage.ifBlank { "Sin etapa" }
    val isEmpty: Boolean get() = id == 0L && title.isBlank() && raw.isEmpty()

    companion object {
        @Suppress("UNCHECKED_CAST")
        fun fromRaw(row: Map<String, Any?>): CrmOpportunityDetailDto {
            val client = row["client"] as? Map<String, Any?>
            val flatClient = ProcParse.str(row["clientName"], row["cliente"], row["accountName"])
            val nestedClient = ProcParse.str(client?.get("name"), client?.get("nombre"))
            return CrmOpportunityDetailDto(
                id = ProcParse.lng(row["id"]) ?: 0L,
                title = ProcParse.str(row["title"], row["name"], row["titulo"]),
                stage = ProcParse.str(row["stage"], row["etapa"], row["status"]),
                value = ProcParse.dbl(row["value"], row["amount"], row["monto"]) ?: 0.0,
                probability = ProcParse.dbl(row["probability"], row["probabilidad"]) ?: 0.0,
                clientName = flatClient.ifBlank { nestedClient },
                description = ProcParse.str(row["description"], row["descripcion"]),
                expectedCloseDate = ProcParse.str(row["expectedCloseDate"], row["closeDate"]),
                notes = mapArray(row, "notes", "notas").map(CrmOppNoteDto::fromRaw),
                attachments = mapArray(row, "evidences", "evidencias").map(CrmOppAttachmentDto::fromRaw),
                quotes = mapArray(row, "quotes", "cotizaciones").map(CrmOppQuoteDto::fromRaw),
                history = mapArray(row, "history", "historial", "activityLog", "changelog")
                    .mapIndexed { i, m -> CrmOppHistoryEventDto.fromRaw(m, i) },
                raw = row,
            )
        }

        @Suppress("UNCHECKED_CAST")
        private fun mapArray(row: Map<String, Any?>, vararg keys: String): List<Map<String, Any?>> {
            for (k in keys) {
                val v = row[k] as? List<*> ?: continue
                val maps = v.mapNotNull { it as? Map<String, Any?> }
                if (maps.isNotEmpty() || v.isEmpty()) return maps
            }
            return emptyList()
        }
    }
}

data class CrmClientDto(
    val id: Long = 0L,
    val name: String = "",
    val email: String = "",
    val rfc: String = "",
    val phone: String = "",
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "cli-$id"
    val displayName: String get() = name.ifBlank { "Cliente" }
    val subtitle: String get() = email.ifBlank { rfc }

    fun toFlatMap(): Map<String, Any?> = buildMap {
        putAll(raw)
        put("id", id)
        put("name", name)
        put("nombre", name)
        put("email", email)
        put("rfc", rfc)
        put("phone", phone)
    }

    companion object {
        fun fromRaw(row: Map<String, Any?>): CrmClientDto = CrmClientDto(
            id = ProcParse.lng(row["id"]) ?: 0L,
            name = ProcParse.str(row["name"], row["nombre"], row["razonSocial"]),
            email = ProcParse.str(row["email"]),
            rfc = ProcParse.str(row["rfc"]),
            phone = ProcParse.str(row["phone"], row["telefono"]),
            raw = row,
        )
    }
}

data class CrmLeadDto(
    val id: String = "",
    val title: String = "",
    val description: String = "",
    val status: String = "",
    val clientName: String = "",
    val branchName: String = "",
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "lead-${id.ifBlank { title }}"
    val displayTitle: String get() = title.ifBlank { description.ifBlank { "Lead" } }

    companion object {
        fun fromRaw(row: Map<String, Any?>): CrmLeadDto = CrmLeadDto(
            id = ProcParse.str(row["id"]),
            title = ProcParse.str(row["title"], row["titulo"], row["name"], row["subject"], row["asunto"]),
            description = ProcParse.str(row["description"], row["descripcion"], row["notes"], row["notas"]),
            status = ProcParse.str(row["status"], row["estatus"], row["estado"], row["urgency"]),
            clientName = ProcParse.str(row["clientName"], row["cliente"]),
            branchName = ProcParse.str(row["branchName"], row["sucursal"]),
            raw = row,
        )
    }
}

data class CrmProductDto(
    val id: Long = 0L,
    val name: String = "",
    val sku: String = "",
    val price: Double = 0.0,
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "prd-$id"
    val displayName: String get() = name.ifBlank { "Producto" }

    fun toFlatMap(): Map<String, Any?> = buildMap {
        putAll(raw)
        put("id", id)
        put("name", name)
        put("nombre", name)
        put("sku", sku)
        put("code", sku)
        put("price", price)
        put("precio", price)
    }

    companion object {
        fun fromRaw(row: Map<String, Any?>): CrmProductDto = CrmProductDto(
            id = ProcParse.lng(row["id"]) ?: 0L,
            name = ProcParse.str(row["name"], row["nombre"]),
            sku = ProcParse.str(row["sku"], row["code"], row["codigo"]),
            price = ProcParse.dbl(row["price"], row["precio"]) ?: 0.0,
            raw = row,
        )
    }
}

/** Plantilla PDF de cotización — GET /ventas/order-templates */
data class OrderTemplateDto(
    val id: Long = 0L,
    val name: String = "",
    val description: String = "",
    val companyName: String = "",
    val companyEmail: String = "",
    val companyPhone: String = "",
    val companyRfc: String = "",
    val primaryColor: String = "",
    val footerText: String = "",
    val isDefault: Boolean = false,
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "ot-$id"
    val displayName: String get() = name.ifBlank { "Plantilla" }
    val colorHex: String get() = primaryColor.ifBlank { "#0f6ad6" }

    companion object {
        fun fromRaw(row: Map<String, Any?>): OrderTemplateDto {
            val isDefault = when (val v = row["isDefault"] ?: row["is_default"]) {
                is Boolean -> v
                is Number -> v.toInt() != 0
                is String -> v.equals("true", true) || v == "1"
                else -> false
            }
            return OrderTemplateDto(
                id = ProcParse.lng(row["id"]) ?: 0L,
                name = ProcParse.str(row["name"], row["nombre"]),
                description = ProcParse.str(row["description"], row["descripcion"]),
                companyName = ProcParse.str(row["companyName"], row["company_name"]),
                companyEmail = ProcParse.str(row["companyEmail"], row["company_email"]),
                companyPhone = ProcParse.str(row["companyPhone"], row["company_phone"]),
                companyRfc = ProcParse.str(row["companyRfc"], row["company_rfc"]),
                primaryColor = ProcParse.str(row["primaryColor"], row["primary_color"]),
                footerText = ProcParse.str(row["footerText"], row["footer_text"]),
                isDefault = isDefault,
                raw = row,
            )
        }
    }
}

/** Proyecto comercial CRM — GET /ventas/proyectos (SalesProject) */
data class CrmSalesProjectDto(
    val id: Long = 0L,
    val name: String = "",
    val status: String = "",
    val projectType: String = "",
    val clientName: String = "",
    val ownerName: String = "",
    val scopeSummary: String = "",
    val budget: Double = 0.0,
    val costProducts: Double = 0.0,
    val costViaticos: Double = 0.0,
    val costOperativo: Double = 0.0,
    val margin: Double = 0.0,
    val startDate: String = "",
    val endDate: String = "",
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "sp-$id"
    val displayName: String get() = name.ifBlank { "Proyecto" }
    val costRows: List<Pair<String, Double>>
        get() = listOf(
            "Productos" to costProducts,
            "Viáticos" to costViaticos,
            "Operativo" to costOperativo,
        ).filter { it.second != 0.0 }

    fun toFlatMap(): Map<String, Any?> = buildMap {
        putAll(raw)
        put("id", id)
        put("name", name)
        put("title", name)
        put("nombre", name)
        put("status", status)
        put("estado", status)
        put("projectType", projectType)
        put("type", projectType)
        put("clientName", clientName)
        put("ownerName", ownerName)
        put("scopeSummary", scopeSummary)
        put("description", scopeSummary)
        put("budget", budget)
        put("costProducts", costProducts)
        put("costViaticos", costViaticos)
        put("costOperativo", costOperativo)
        put("margin", margin)
        put("startDate", startDate)
        put("endDate", endDate)
    }

    companion object {
        @Suppress("UNCHECKED_CAST")
        fun fromRaw(row: Map<String, Any?>): CrmSalesProjectDto {
            val opportunity = row["opportunity"] as? Map<String, Any?>
            val client = row["client"] as? Map<String, Any?>
                ?: opportunity?.get("client") as? Map<String, Any?>
            val owner = opportunity?.get("owner") as? Map<String, Any?>
                ?: row["owner"] as? Map<String, Any?>
            return CrmSalesProjectDto(
                id = ProcParse.lng(row["id"]) ?: 0L,
                name = ProcParse.str(row["name"], row["title"], row["nombre"]),
                status = ProcParse.str(row["status"], row["estado"]),
                projectType = ProcParse.str(row["projectType"], row["type"], row["tipo"]),
                clientName = ProcParse.str(
                    row["clientName"], row["cliente"],
                    client?.get("name"), client?.get("nombre"),
                ),
                ownerName = ProcParse.str(
                    row["ownerName"], row["assignedName"], row["vendorName"],
                    owner?.get("nombre"), owner?.get("name"),
                ),
                scopeSummary = ProcParse.str(row["scopeSummary"], row["description"], row["descripcion"], row["notes"]),
                budget = ProcParse.dbl(row["budget"], row["presupuesto"]) ?: 0.0,
                costProducts = ProcParse.dbl(row["costProducts"]) ?: 0.0,
                costViaticos = ProcParse.dbl(row["costViaticos"]) ?: 0.0,
                costOperativo = ProcParse.dbl(row["costOperativo"]) ?: 0.0,
                margin = ProcParse.dbl(row["margin"]) ?: 0.0,
                startDate = ProcParse.str(row["startDate"], row["startAt"], row["createdAt"]),
                endDate = ProcParse.str(row["endDate"], row["closedAt"]),
                raw = row,
            )
        }
    }
}

data class HrStaffDto(
    val id: Long = 0L,
    val name: String = "",
    val estadoRrhh: String = "",
    val isActive: Boolean = true,
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "hs-$id"
    val isBaja: Boolean
        get() = estadoRrhh.equals("Baja", true) || !isActive

    companion object {
        fun fromRaw(row: Map<String, Any?>): HrStaffDto {
            val active = when (val v = row["isActive"]) {
                is Boolean -> v
                null -> true
                else -> ProcParse.str(row["isActive"]).lowercase() !in setOf("false", "0", "no")
            }
            return HrStaffDto(
                id = ProcParse.lng(row["id"]) ?: 0L,
                name = ProcParse.str(row["nombre"], row["name"], row["fullName"]),
                estadoRrhh = ProcParse.str(row["estadoRRHH"], row["estado"], row["status"]),
                isActive = active,
                raw = row,
            )
        }
    }
}
