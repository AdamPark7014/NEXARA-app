package mx.nexara.mobile.nativeapp.data.api

data class ExecutiveHeadlineDto(
    val revenueMtd: Double = 0.0,
    val pipelineValue: Double = 0.0,
    val cashOnHand: Double = 0.0,
    val arOutstanding: Double = 0.0,
) {
    companion object {
        fun fromRaw(row: Map<String, Any?>): ExecutiveHeadlineDto = ExecutiveHeadlineDto(
            revenueMtd = ProcParse.dbl(row["revenueMtd"], row["revenue"]) ?: 0.0,
            pipelineValue = ProcParse.dbl(row["pipelineValue"], row["pipeline"]) ?: 0.0,
            cashOnHand = ProcParse.dbl(row["cashOnHand"], row["cash"]) ?: 0.0,
            arOutstanding = ProcParse.dbl(row["arOutstanding"], row["accountsReceivable"]) ?: 0.0,
        )
    }
}

data class ExecutiveOpsDto(
    val otOpen: Int = 0,
    val otOverdue: Int = 0,
    val ticketsOpen: Int = 0,
) {
    companion object {
        fun fromRaw(row: Map<String, Any?>): ExecutiveOpsDto = ExecutiveOpsDto(
            otOpen = ProcParse.dbl(row["otOpen"])?.toInt() ?: 0,
            otOverdue = ProcParse.dbl(row["otOverdue"])?.toInt() ?: 0,
            ticketsOpen = ProcParse.dbl(row["ticketsOpen"])?.toInt() ?: 0,
        )
    }
}

data class ExecutiveFinanceDto(
    val invoicedMtd: Double = 0.0,
) {
    companion object {
        fun fromRaw(row: Map<String, Any?>): ExecutiveFinanceDto = ExecutiveFinanceDto(
            invoicedMtd = ProcParse.dbl(row["invoicedMtd"], row["invoiced"]) ?: 0.0,
        )
    }
}

data class ExecutiveAlertDto(
    val title: String = "",
    val detail: String = "",
) {
    val rowKey: String get() = "ea-${title.hashCode()}-${detail.hashCode()}"

    companion object {
        fun fromRaw(row: Map<String, Any?>): ExecutiveAlertDto = ExecutiveAlertDto(
            title = ProcParse.str(row["title"], row["message"]),
            detail = ProcParse.str(row["detail"], row["description"]),
        )
    }
}

data class ExecutiveCLevelDto(
    val headline: ExecutiveHeadlineDto = ExecutiveHeadlineDto(),
    val operations: ExecutiveOpsDto = ExecutiveOpsDto(),
    val finance: ExecutiveFinanceDto = ExecutiveFinanceDto(),
    val alerts: List<ExecutiveAlertDto> = emptyList(),
    val raw: Map<String, Any?> = emptyMap(),
) {
    companion object {
        @Suppress("UNCHECKED_CAST")
        fun fromRaw(row: Map<String, Any?>): ExecutiveCLevelDto {
            val h = row["headlineKpis"] as? Map<String, Any?> ?: emptyMap()
            val ops = row["operations"] as? Map<String, Any?> ?: emptyMap()
            val fin = row["finance"] as? Map<String, Any?> ?: emptyMap()
            val alerts = (row["alerts"] as? List<*>)
                ?.mapNotNull { it as? Map<*, *> }
                ?.map { ExecutiveAlertDto.fromRaw(it as Map<String, Any?>) }
                ?: emptyList()
            return ExecutiveCLevelDto(
                headline = ExecutiveHeadlineDto.fromRaw(h),
                operations = ExecutiveOpsDto.fromRaw(ops),
                finance = ExecutiveFinanceDto.fromRaw(fin),
                alerts = alerts,
                raw = row,
            )
        }
    }
}

data class CompanyDto(
    val id: Long = 0L,
    val legalName: String = "",
    val tradeName: String = "",
    val rfc: String = "",
    val fiscalRegime: String = "",
    val email: String = "",
    val phone: String = "",
    val address: String = "",
    val city: String = "",
    val state: String = "",
    val isPrimary: Boolean = false,
    val isActive: Boolean = true,
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "co-$id"
    val displayName: String get() = legalName.ifBlank { tradeName.ifBlank { "Empresa" } }
    val trailingLabel: String
        get() = when {
            isPrimary -> "Principal"
            !isActive -> "Inactiva"
            else -> tradeName.ifBlank { "Activa" }
        }

    companion object {
        fun fromRaw(row: Map<String, Any?>): CompanyDto {
            val primary = when (val v = row["isPrimary"]) {
                is Boolean -> v
                else -> ProcParse.str(row["isPrimary"]).lowercase() in setOf("true", "1", "yes")
            }
            val active = when (val v = row["isActive"]) {
                is Boolean -> v
                null -> true
                else -> ProcParse.str(row["isActive"]).lowercase() !in setOf("false", "0", "no")
            }
            return CompanyDto(
                id = ProcParse.lng(row["id"]) ?: 0L,
                legalName = ProcParse.str(row["legalName"], row["razonSocial"]),
                tradeName = ProcParse.str(row["tradeName"], row["name"], row["nombre"]),
                rfc = ProcParse.str(row["rfc"]),
                fiscalRegime = ProcParse.str(row["fiscalRegime"], row["regimenFiscal"]),
                email = ProcParse.str(row["email"]),
                phone = ProcParse.str(row["phone"], row["telefono"]),
                address = ProcParse.str(row["address"], row["direccion"]),
                city = ProcParse.str(row["city"], row["ciudad"]),
                state = ProcParse.str(row["state"], row["estado"]),
                isPrimary = primary,
                isActive = active,
                raw = row,
            )
        }
    }
}

data class KbArticleDto(
    val id: String = "",
    val slug: String = "",
    val title: String = "",
    val excerpt: String = "",
    val content: String = "",
    val category: String = "",
    val status: String = "",
    val tags: String = "",
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "kb-${id.ifBlank { slug.ifBlank { title } }}"
    val openKey: String get() = slug.ifBlank { id }

    companion object {
        fun fromRaw(row: Map<String, Any?>): KbArticleDto {
            val tagsVal = row["tags"]
            val tagsStr = when (tagsVal) {
                is List<*> -> tagsVal.joinToString(", ")
                else -> ProcParse.str(tagsVal)
            }
            return KbArticleDto(
                id = ProcParse.str(row["id"]),
                slug = ProcParse.str(row["slug"]),
                title = ProcParse.str(row["title"], row["titulo"]),
                excerpt = ProcParse.str(row["excerpt"], row["resumen"]),
                content = ProcParse.str(row["content"], row["body"], row["contenido"]),
                category = ProcParse.str(row["category"], row["name"], row["categoria"]),
                status = ProcParse.str(row["status"], row["visibility"], row["estado"]),
                tags = tagsStr,
                raw = row,
            )
        }
    }
}

data class OrgNodeDto(
    val id: String = "",
    val name: String = "",
    val roleName: String = "",
    val departmentName: String = "",
    val children: List<OrgNodeDto> = emptyList(),
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "org-${id.ifBlank { name }}"

    companion object {
        @Suppress("UNCHECKED_CAST")
        fun fromRaw(row: Map<String, Any?>): OrgNodeDto {
            val role = row["role"] as? Map<String, Any?>
            val dept = row["department"] as? Map<String, Any?>
            val kids = (row["children"] as? List<*>)
                ?.mapNotNull { it as? Map<*, *> }
                ?.map { fromRaw(it as Map<String, Any?>) }
                ?: emptyList()
            return OrgNodeDto(
                id = ProcParse.str(row["id"]),
                name = ProcParse.str(row["nombre"], row["name"]),
                roleName = ProcParse.str(role?.get("nombre"), role?.get("name"), row["roleName"]),
                departmentName = ProcParse.str(dept?.get("nombre"), dept?.get("name"), row["departmentName"]),
                children = kids,
                raw = row,
            )
        }
    }
}

data class TenderDto(
    val id: String = "",
    val title: String = "",
    val status: String = "",
    val clientName: String = "",
    val amount: Double = 0.0,
    val deadline: String = "",
    val description: String = "",
    val result: String = "",
    val ownerName: String = "",
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "td-${id.ifBlank { title }}"
    val displayTitle: String get() = title.ifBlank { "Licitación" }
    val statusLower: String get() = status.lowercase()
    val isActive: Boolean get() = statusLower in setOf("activo", "abierto", "open")
    val isClosed: Boolean get() = statusLower in setOf("cerrado", "closed", "ganado", "perdido")

    companion object {
        fun fromRaw(row: Map<String, Any?>): TenderDto = TenderDto(
            id = ProcParse.str(row["id"]),
            title = ProcParse.str(row["title"], row["name"], row["titulo"]),
            status = ProcParse.str(row["status"], row["estado"]),
            clientName = ProcParse.str(row["clientName"], row["cliente"]),
            amount = ProcParse.dbl(row["amount"], row["value"], row["monto"]) ?: 0.0,
            deadline = ProcParse.str(row["deadline"], row["dueDate"], row["fechaLimite"]),
            description = ProcParse.str(row["description"], row["notes"]),
            result = ProcParse.str(row["result"], row["resultado"]),
            ownerName = ProcParse.str(row["ownerName"], row["responsable"]),
            raw = row,
        )
    }
}

data class SalesTargetDto(
    val id: String = "",
    val ownerName: String = "",
    val year: String = "",
    val month: String = "",
    val targetAmount: Double = 0.0,
    val actualAmount: Double = 0.0,
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "tg-${id.ifBlank { ownerName }}"
    val progress: Float
        get() = if (targetAmount > 0) (actualAmount / targetAmount).coerceIn(0.0, 1.0).toFloat() else 0f

    companion object {
        fun fromRaw(row: Map<String, Any?>): SalesTargetDto = SalesTargetDto(
            id = ProcParse.str(row["id"]),
            ownerName = ProcParse.str(row["ownerName"], row["userName"], row["nombre"]),
            year = ProcParse.str(row["year"], row["anio"]),
            month = ProcParse.str(row["month"], row["mes"]),
            targetAmount = ProcParse.dbl(row["targetAmount"], row["amount"]) ?: 0.0,
            actualAmount = ProcParse.dbl(row["actualAmount"], row["actual"], row["currentAmount"]) ?: 0.0,
            raw = row,
        )
    }
}

data class SalesTeamMemberDto(
    val id: String = "",
    val name: String = "",
    val role: String = "",
    val totalSales: Double = 0.0,
    val totalLeads: String = "",
    val totalOpps: String = "",
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "st-${id.ifBlank { name }}"

    companion object {
        fun fromRaw(row: Map<String, Any?>): SalesTeamMemberDto = SalesTeamMemberDto(
            id = ProcParse.str(row["id"]),
            name = ProcParse.str(row["nombre"], row["name"], row["userName"]),
            role = ProcParse.str(row["role"], row["puesto"], row["cargo"]),
            totalSales = ProcParse.dbl(row["totalVentas"], row["salesTotal"], row["amount"]) ?: 0.0,
            totalLeads = ProcParse.str(row["totalLeads"], row["leads"]),
            totalOpps = ProcParse.str(row["totalOportunidades"], row["oportunidades"]),
            raw = row,
        )
    }
}

/** KPIs ventas — GET /ventas/reportes/metricas */
data class SalesMetricsDto(
    val totalRevenue: Double = 0.0,
    val pipelineValue: Double = 0.0,
    val conversionRate: Double = 0.0,
    val averageMargin: Double = 0.0,
    val opportunityCount: Int = 0,
    val projectCount: Int = 0,
    val closedProjects: Int = 0,
    val activeClients: Int = 0,
    val raw: Map<String, Any?> = emptyMap(),
) {
    val isEmpty: Boolean get() = raw.isEmpty() && totalRevenue == 0.0 && pipelineValue == 0.0

    companion object {
        fun fromRaw(row: Map<String, Any?>): SalesMetricsDto = SalesMetricsDto(
            totalRevenue = ProcParse.dbl(row["totalRevenue"], row["revenue"], row["ingresos"]) ?: 0.0,
            pipelineValue = ProcParse.dbl(row["pipelineValue"], row["pipeline"]) ?: 0.0,
            conversionRate = ProcParse.dbl(row["conversionRate"]) ?: 0.0,
            averageMargin = ProcParse.dbl(row["averageMargin"], row["margin"]) ?: 0.0,
            opportunityCount = ProcParse.dbl(row["opportunityCount"], row["opportunities"])?.toInt() ?: 0,
            projectCount = ProcParse.dbl(row["projectCount"], row["projects"])?.toInt() ?: 0,
            closedProjects = ProcParse.dbl(row["closedProjects"])?.toInt() ?: 0,
            activeClients = ProcParse.dbl(row["activeClients"], row["clients"])?.toInt() ?: 0,
            raw = row,
        )
    }
}

/** Vendedor en reportes — GET /ventas/reportes/vendedores */
data class VendorReportItemDto(
    val userId: Long = 0L,
    val userName: String = "",
    val email: String = "",
    val role: String = "",
    val status: String = "",
    val revenue: Double = 0.0,
    val targetRevenue: Double = 0.0,
    val attainmentRevenue: Double = 0.0,
    val opportunities: Int = 0,
    val projects: Int = 0,
    val leads: Int = 0,
    val activities: Int = 0,
    val performance: Double = 0.0,
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "vr-${if (userId > 0) userId else userName.hashCode()}"
    val displayName: String get() = userName.ifBlank { "Vendedor" }

    companion object {
        fun fromRaw(row: Map<String, Any?>): VendorReportItemDto = VendorReportItemDto(
            userId = ProcParse.lng(row["userId"], row["id"]) ?: 0L,
            userName = ProcParse.str(row["userName"], row["nombre"], row["name"]),
            email = ProcParse.str(row["email"]),
            role = ProcParse.str(row["role"], row["rol"]),
            status = ProcParse.str(row["status"]),
            revenue = ProcParse.dbl(row["revenue"], row["totalRevenue"]) ?: 0.0,
            targetRevenue = ProcParse.dbl(row["targetRevenue"], row["target"]) ?: 0.0,
            attainmentRevenue = ProcParse.dbl(row["attainmentRevenue"], row["attainment"]) ?: 0.0,
            opportunities = ProcParse.dbl(row["opportunities"])?.toInt() ?: 0,
            projects = ProcParse.dbl(row["projects"])?.toInt() ?: 0,
            leads = ProcParse.dbl(row["leads"])?.toInt() ?: 0,
            activities = ProcParse.dbl(row["activities"])?.toInt() ?: 0,
            performance = ProcParse.dbl(row["performance"], row["performanceScore"]) ?: 0.0,
            raw = row,
        )
    }
}
