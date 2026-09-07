package mx.nexara.mobile.nativeapp.data.api

/**
 * Catálogo de permisos de RR. HH., espejo de los enums `LeaveType` y
 * `LeaveStatus` de `schema.prisma`.
 *
 * El API devuelve las claves en inglés y en mayúsculas (`VACATION`, `PENDING`).
 * La pantalla las tenía comparadas contra `"pendiente"`, así que el contador de
 * pendientes daba siempre cero y al empleado se le mostraba «PENDING» en crudo.
 * Aquí se traduce una sola vez, en el sitio donde también se decide qué se
 * puede aprobar.
 */
object HrLeaveCatalog {

    /** `LeaveType` → etiqueta. El orden es el del formulario de alta. */
    val TYPES: List<Pair<String, String>> = listOf(
        "VACATION" to "Vacaciones",
        "SICK" to "Incapacidad / enfermedad",
        "PERSONAL" to "Permiso personal",
        "MATERNITY" to "Maternidad",
        "PATERNITY" to "Paternidad",
        "BEREAVEMENT" to "Duelo",
        "UNPAID" to "Sin goce de sueldo",
    )

    private val TYPE_LABELS: Map<String, String> = TYPES.toMap()

    private val STATUS_LABELS: Map<String, String> = mapOf(
        "PENDING" to "Pendiente",
        "APPROVED" to "Aprobado",
        "REJECTED" to "Rechazado",
        "CANCELLED" to "Cancelado",
    )

    fun typeLabel(raw: String): String =
        TYPE_LABELS[raw.trim().uppercase()] ?: raw.ifBlank { "Permiso" }

    fun statusLabel(raw: String): String =
        STATUS_LABELS[raw.trim().uppercase()] ?: raw.ifBlank { "—" }

    /**
     * Una solicitud sigue esperando decisión.
     *
     * Acepta la clave del API y la palabra en español porque hay filas
     * antiguas guardadas con el texto ya traducido.
     */
    fun isPending(raw: String): Boolean =
        raw.trim().uppercase().let { it == "PENDING" || it == "PENDIENTE" }
}

/**
 * Saldo de permisos del año (`GET hr/leaves/balance/:userId`).
 *
 * El servidor sólo suma lo **aprobado**; no hay cuota configurada en base de
 * datos, así que la pantalla informa días usados, nunca «días restantes»
 * inventados.
 */
data class HrLeaveBalanceDto(
    val year: Int = 0,
    val totalUsed: Double = 0.0,
    /** Días usados por tipo, ya con la etiqueta en español. */
    val usedByType: List<Pair<String, Double>> = emptyList(),
) {
    companion object {
        fun fromRaw(row: Map<String, Any?>): HrLeaveBalanceDto {
            @Suppress("UNCHECKED_CAST")
            val byType = row["usedByType"] as? Map<String, Any?> ?: emptyMap()
            return HrLeaveBalanceDto(
                year = ProcParse.lng(row["year"])?.toInt() ?: 0,
                totalUsed = ProcParse.dbl(row["totalUsed"]) ?: 0.0,
                usedByType = byType.entries
                    .mapNotNull { (k, v) ->
                        val days = ProcParse.dbl(v) ?: return@mapNotNull null
                        HrLeaveCatalog.typeLabel(k) to days
                    }
                    .sortedByDescending { it.second },
            )
        }
    }
}

data class HrLeaveDto(
    val id: Long = 0L,
    val type: String = "",
    val reason: String = "",
    val status: String = "",
    /** Quién solicitó. Decide si el usuario puede cancelarla. */
    val userId: Long? = null,
    val userName: String = "",
    val startDate: String = "",
    val endDate: String = "",
    val days: String = "",
    val approverName: String = "",
    val notes: String = "",
    val raw: Map<String, Any?> = emptyMap(),
) {
    val rowKey: String get() = "hr-$id"

    /** Tipo de permiso en español; nunca la clave cruda del enum. */
    val typeLabel: String get() = HrLeaveCatalog.typeLabel(type)

    /** Estatus en español; nunca «PENDING» en pantalla. */
    val statusLabel: String get() = HrLeaveCatalog.statusLabel(status)

    /** Sigue esperando decisión: es lo único aprobable o cancelable. */
    val isPending: Boolean get() = HrLeaveCatalog.isPending(status)

    val displayReason: String
        get() = reason.ifBlank { typeLabel }
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
                userId = ProcParse.lng(row["userId"], user?.get("id"), employee?.get("id")),
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
