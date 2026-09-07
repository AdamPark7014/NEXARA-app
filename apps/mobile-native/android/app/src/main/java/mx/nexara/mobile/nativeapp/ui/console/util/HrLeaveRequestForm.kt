package mx.nexara.mobile.nativeapp.ui.console.util

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

/**
 * Validación del alta de una solicitud de permiso, sin Android ni red.
 *
 * Vive aparte de la pantalla por dos motivos. El primero es que se puede
 * probar. El segundo es que el conteo de días **tiene que coincidir con el del
 * servidor**: `hr.service.ts::createLeave` calcula
 * `ceil((fin - inicio) / 1 día) + 1`, es decir, ambos extremos incluidos, y si
 * el móvil enseñara otra cifra el empleado firmaría una solicitud por unos días
 * y le descontarían otros del saldo.
 */
object HrLeaveRequestForm {

    private val ISO: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE

    /** Resultado de validar el formulario antes de gastar un viaje de red. */
    sealed interface Result {
        data class Valid(
            val type: String,
            val startDate: String,
            val endDate: String,
            val reason: String?,
            /** Días naturales solicitados, ambos extremos incluidos. */
            val days: Long,
        ) : Result

        data class Invalid(val message: String) : Result
    }

    /**
     * Días naturales entre dos fechas con ambos extremos incluidos.
     *
     * Un permiso de un solo día es 1, no 0: ésa es la regla del servidor.
     */
    fun daysBetween(start: LocalDate, end: LocalDate): Long =
        java.time.temporal.ChronoUnit.DAYS.between(start, end) + 1

    /** Fecha ISO válida, o `null`. No lanza: el formulario la usa mientras se teclea. */
    fun parseDate(value: String): LocalDate? =
        try {
            LocalDate.parse(value.trim(), ISO)
        } catch (_: DateTimeParseException) {
            null
        }

    /**
     * Vista previa del conteo mientras el usuario elige fechas.
     * Cadena vacía si aún no hay un rango legible.
     */
    fun daysPreview(startDate: String, endDate: String): String {
        val start = parseDate(startDate) ?: return ""
        val end = parseDate(endDate) ?: return ""
        if (end.isBefore(start)) return ""
        val days = daysBetween(start, end)
        return if (days == 1L) "1 día" else "$days días"
    }

    /**
     * Valida el formulario completo.
     *
     * El tipo se comprueba contra el catálogo porque el API lo castea al enum
     * sin validarlo (`dto.type as any`): una clave inventada revienta en la
     * base de datos con un error que no dice nada.
     */
    fun validate(
        type: String,
        startDate: String,
        endDate: String,
        reason: String,
        knownTypes: Collection<String>,
    ): Result {
        val cleanType = type.trim().uppercase()
        if (cleanType.isBlank()) return Result.Invalid("Elige el tipo de permiso")
        if (knownTypes.none { it.equals(cleanType, ignoreCase = true) }) {
            return Result.Invalid("Tipo de permiso no reconocido")
        }

        val start = parseDate(startDate)
            ?: return Result.Invalid("Fecha de inicio inválida (usa AAAA-MM-DD)")
        val end = parseDate(endDate)
            ?: return Result.Invalid("Fecha de fin inválida (usa AAAA-MM-DD)")
        if (end.isBefore(start)) {
            return Result.Invalid("La fecha de fin no puede ser anterior a la de inicio")
        }

        val cleanReason = reason.trim()
        // El motivo es opcional en el API, pero sin él la aprobación se decide a
        // ciegas: en los tipos discrecionales se exige aquí.
        if (cleanReason.isBlank() && cleanType in TYPES_REQUIRING_REASON) {
            return Result.Invalid("Explica el motivo para este tipo de permiso")
        }

        return Result.Valid(
            type = cleanType,
            startDate = start.format(ISO),
            endDate = end.format(ISO),
            reason = cleanReason.takeIf { it.isNotBlank() },
            days = daysBetween(start, end),
        )
    }

    /**
     * Tipos en los que el motivo no se puede omitir.
     *
     * Vacaciones y los permisos de ley se explican solos; un permiso personal o
     * sin goce de sueldo, no — y quien aprueba desde el teléfono no tiene a
     * quién preguntarle.
     */
    val TYPES_REQUIRING_REASON: Set<String> = setOf("PERSONAL", "UNPAID")
}
