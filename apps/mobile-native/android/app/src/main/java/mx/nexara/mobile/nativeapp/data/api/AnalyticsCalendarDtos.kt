package mx.nexara.mobile.nativeapp.data.api

data class CalendarEventDto(
    val id: String = "",
    val title: String = "",
    val source: String = "",
    val type: String = "",
    val start: String = "",
    val end: String = "",
    val ownerName: String = "",
    val description: String = "",
    val location: String = "",
    val result: String = "",
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "cal-${id.ifBlank { "$title-$start" }}"
    val dayKey: String get() = start.take(10)
    val displayTitle: String get() = title.ifBlank { type.ifBlank { "Evento" } }
    val timeLabel: String
        get() {
            if (start.length >= 16) return start.substring(11, 16)
            return start.takeLast(8)
        }

    companion object {
        fun fromRaw(row: Map<String, Any?>): CalendarEventDto = CalendarEventDto(
            id = ProcParse.str(row["id"]),
            title = ProcParse.str(row["title"], row["titulo"], row["subject"]),
            source = ProcParse.str(row["source"], row["origen"]),
            type = ProcParse.str(row["type"], row["tipo"]),
            start = ProcParse.str(row["start"], row["startAt"], row["fecha"]),
            end = ProcParse.str(row["end"], row["endAt"], row["fin"]),
            ownerName = ProcParse.str(row["ownerName"], row["attendeeName"], row["responsable"]),
            description = ProcParse.str(row["description"], row["notes"], row["notas"]),
            location = ProcParse.str(row["location"], row["ubicacion"]),
            result = ProcParse.str(row["result"], row["resultado"]),
            raw = row,
        )
    }
}

data class AnalyticsDashboardDto(
    val revenue: Double = 0.0,
    val expenses: Double = 0.0,
    val openPurchaseOrders: Int = 0,
    val pendingMaintenanceOrders: Int = 0,
    val lowStockAlerts: Int = 0,
    val raw: Map<String, Any?> = emptyMap(),
) {
    val isEmpty: Boolean get() = raw.isEmpty()

    companion object {
        fun fromRaw(row: Map<String, Any?>): AnalyticsDashboardDto = AnalyticsDashboardDto(
            revenue = ProcParse.dbl(row["revenue"], row["ingresos"]) ?: 0.0,
            expenses = ProcParse.dbl(row["expenses"], row["gastos"]) ?: 0.0,
            openPurchaseOrders = ProcParse.dbl(row["openPurchaseOrders"])?.toInt() ?: 0,
            pendingMaintenanceOrders = ProcParse.dbl(row["pendingMaintenanceOrders"])?.toInt() ?: 0,
            lowStockAlerts = ProcParse.dbl(row["lowStockAlerts"])?.toInt() ?: 0,
            raw = row,
        )
    }
}

data class ComputedKpiDto(
    val name: String = "",
    val unit: String = "",
    val category: String = "",
    val status: String = "",
    val value: Double? = null,
    val valueLabel: String = "",
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "kpi-${name.ifBlank { category }}-$status"

    companion object {
        fun fromRaw(row: Map<String, Any?>): ComputedKpiDto {
            val v = ProcParse.dbl(row["value"])
            return ComputedKpiDto(
                name = ProcParse.str(row["name"], row["nombre"]),
                unit = ProcParse.str(row["unit"], row["unidad"]),
                category = ProcParse.str(row["category"], row["categoria"]).ifBlank { "General" },
                status = ProcParse.str(row["status"], row["estado"]),
                value = v,
                valueLabel = when {
                    v != null -> v.toString()
                    else -> ProcParse.str(row["value"])
                },
                raw = row,
            )
        }
    }
}

data class BiMarginRowDto(
    val projectType: String = "",
    val count: Int = 0,
    val budget: Double = 0.0,
    val margin: Double = 0.0,
    val marginPercent: Double = 0.0,
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "bm-${projectType.ifBlank { "row" }}"

    companion object {
        fun fromRaw(row: Map<String, Any?>): BiMarginRowDto = BiMarginRowDto(
            projectType = ProcParse.str(row["projectType"], row["type"], row["linea"]),
            count = ProcParse.dbl(row["count"], row["projects"])?.toInt() ?: 0,
            budget = ProcParse.dbl(row["budget"], row["presupuesto"]) ?: 0.0,
            margin = ProcParse.dbl(row["margin"], row["margen"]) ?: 0.0,
            marginPercent = ProcParse.dbl(row["marginPercent"], row["margenPct"]) ?: 0.0,
            raw = row,
        )
    }
}

data class BiEngineerRowDto(
    val engineerId: String = "",
    val engineerName: String = "",
    val completed: Int = 0,
    val totalActivities: Int = 0,
    val completionRate: Double = 0.0,
    val avgDurationMin: Double? = null,
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "be-${engineerId.ifBlank { engineerName }}"

    companion object {
        fun fromRaw(row: Map<String, Any?>): BiEngineerRowDto = BiEngineerRowDto(
            engineerId = ProcParse.str(row["engineerId"], row["id"]),
            engineerName = ProcParse.str(row["engineerName"], row["nombre"], row["name"]),
            completed = ProcParse.dbl(row["completed"])?.toInt() ?: 0,
            totalActivities = ProcParse.dbl(row["totalActivities"], row["total"])?.toInt() ?: 0,
            completionRate = ProcParse.dbl(row["completionRate"]) ?: 0.0,
            avgDurationMin = ProcParse.dbl(row["avgDurationMin"], row["avgDuration"]),
            raw = row,
        )
    }
}

data class BiClientRoiDto(
    val clientId: String = "",
    val clientName: String = "",
    val projects: Int = 0,
    val revenue: Double = 0.0,
    val roi: Double = 0.0,
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "bc-${clientId.ifBlank { clientName }}"

    companion object {
        fun fromRaw(row: Map<String, Any?>): BiClientRoiDto = BiClientRoiDto(
            clientId = ProcParse.str(row["clientId"], row["id"]),
            clientName = ProcParse.str(row["clientName"], row["nombre"], row["name"]),
            projects = ProcParse.dbl(row["projects"], row["count"])?.toInt() ?: 0,
            revenue = ProcParse.dbl(row["revenue"], row["ingresos"]) ?: 0.0,
            roi = ProcParse.dbl(row["roi"]) ?: 0.0,
            raw = row,
        )
    }
}
