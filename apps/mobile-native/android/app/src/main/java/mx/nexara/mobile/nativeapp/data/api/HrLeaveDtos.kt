package mx.nexara.mobile.nativeapp.data.api

data class HrLeaveDto(
    val id: Long = 0L,
    val type: String = "",
    val reason: String = "",
    val status: String = "",
    val userName: String = "",
    val startDate: String = "",
    val endDate: String = "",
    val days: String = "",
    val approverName: String = "",
    val notes: String = "",
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "hr-$id"
    val displayReason: String
        get() = reason.ifBlank { type.ifBlank { "Permiso" } }
    val dateRange: String
        get() {
            val s = startDate.take(10)
            val e = endDate.take(10)
            return when {
                s.isBlank() -> e
                e.isBlank() -> s
                else -> "$s → $e"
            }
        }

    companion object {
        fun fromRaw(row: Map<String, Any?>): HrLeaveDto {
            @Suppress("UNCHECKED_CAST")
            val user = row["user"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val employee = row["employee"] as? Map<String, Any?>
            val daysVal = ProcParse.dbl(row["days"], row["diasSolicitados"], row["totalDays"])
            return HrLeaveDto(
                id = ProcParse.lng(row["id"]) ?: 0L,
                type = ProcParse.str(row["type"], row["tipo"]),
                reason = ProcParse.str(row["reason"], row["motivo"]),
                status = ProcParse.str(row["status"], row["estado"]),
                userName = ProcParse.str(
                    row["userName"], row["employeeName"], row["nombre"],
                    user?.get("name"), user?.get("nombre"),
                    employee?.get("name"), employee?.get("nombre"),
                ),
                startDate = ProcParse.str(row["startDate"], row["startAt"], row["fechaInicio"], row["inicio"]),
                endDate = ProcParse.str(row["endDate"], row["endAt"], row["fechaFin"], row["fin"]),
                days = daysVal?.let { if (it % 1.0 == 0.0) it.toInt().toString() else it.toString() }
                    ?: ProcParse.str(row["days"], row["diasSolicitados"], row["totalDays"]),
                approverName = ProcParse.str(row["approverName"], row["approvedBy"], row["aprobadoPor"]),
                notes = ProcParse.str(row["notes"], row["notas"], row["comments"], row["comentarios"]),
                raw = row,
            )
        }
    }
}
