package mx.nexara.mobile.nativeapp.ui.console.util

import mx.nexara.mobile.nativeapp.data.api.MeetingCatalog
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

/**
 * Validación de convocar una reunión y de registrar lo que sale de ella,
 * sin Android ni red.
 *
 * Vive aparte de la pantalla porque estas reglas son exactamente las que el
 * servidor rechaza con un 400, y descubrirlas después del viaje de red deja al
 * usuario con un botón que no hace nada. Son tres, y las tres están en
 * `apps/api/src/meetings/`:
 *
 *  1. `parseEnum` — tipo y estado tienen que ser claves del catálogo.
 *  2. `requireText` — la descripción de un acuerdo no puede ir vacía.
 *  3. `agreementRequiresOwner` — **un acuerdo necesita responsable; una
 *     lección aprendida y un riesgo, no.** Es la regla que da sentido a la
 *     junta del viernes: un acuerdo sin dueño es un deseo.
 */
object MeetingForms {

    private val ISO: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE
    private val HHMM = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")

    sealed interface Result<out T> {
        data class Valid<T>(val value: T) : Result<T>
        data class Invalid(val message: String) : Result<Nothing>
    }

    /** Datos limpios de una convocatoria, listos para el repositorio. */
    data class MeetingDraft(
        val tipo: String,
        val fecha: String,
        val titulo: String?,
        val horaInicio: String?,
        val agenda: String?,
        val asistentes: List<Long>,
    )

    /** Datos limpios de un acuerdo, lección o riesgo. */
    data class AgreementDraft(
        val tipo: String,
        val descripcion: String,
        val responsableId: Long?,
        val fechaCompromiso: String?,
    )

    /** Fecha ISO válida, o `null`. No lanza: se llama mientras se teclea. */
    fun parseDate(value: String): LocalDate? =
        try {
            LocalDate.parse(value.trim(), ISO)
        } catch (_: DateTimeParseException) {
            null
        }

    fun isValidTime(value: String): Boolean = HHMM.matches(value.trim())

    /**
     * Valida la convocatoria.
     *
     * El título, la hora y la agenda son opcionales a propósito: el servidor
     * los rellena desde `MEETING_DEFAULTS` / `MEETING_AGENDA` según el tipo, y
     * así la diaria de las 10:00 se convoca en un clic desde el teléfono.
     */
    fun validateMeeting(
        tipo: String,
        fecha: String,
        titulo: String,
        horaInicio: String,
        agenda: String,
        asistentes: Collection<Long>,
    ): Result<MeetingDraft> {
        val cleanTipo = tipo.trim().uppercase()
        if (cleanTipo.isBlank()) return Result.Invalid("Elige el tipo de reunión")
        if (MeetingCatalog.TYPES.none { it.first == cleanTipo }) {
            return Result.Invalid("Tipo de reunión no reconocido")
        }
        val fechaLimpia = fecha.trim()
        if (fechaLimpia.isBlank()) return Result.Invalid("Indica la fecha de la reunión")
        if (parseDate(fechaLimpia) == null) return Result.Invalid("La fecha debe ser AAAA-MM-DD")

        val hora = horaInicio.trim()
        if (hora.isNotBlank() && !isValidTime(hora)) {
            return Result.Invalid("La hora debe ser HH:MM de 24 horas")
        }

        // Un mismo convocado repetido hace fallar `validateAttendees` en el
        // servidor con un mensaje sobre empresas que no explica nada.
        val ids = asistentes.filter { it > 0L }.distinct()

        return Result.Valid(
            MeetingDraft(
                tipo = cleanTipo,
                fecha = fechaLimpia,
                titulo = titulo.trim().takeIf { it.isNotBlank() },
                horaInicio = hora.takeIf { it.isNotBlank() },
                agenda = agenda.trim().takeIf { it.isNotBlank() },
                asistentes = ids,
            ),
        )
    }

    /**
     * Valida un acuerdo, lección o riesgo.
     *
     * La regla que importa: sólo `ACUERDO` exige responsable. Pedir dueño a una
     * lección aprendida haría que nadie escribiera ninguna, y dejar un acuerdo
     * sin dueño es lo que vacía de sentido la junta.
     */
    fun validateAgreement(
        tipo: String,
        descripcion: String,
        responsableId: Long?,
        fechaCompromiso: String,
    ): Result<AgreementDraft> {
        val cleanTipo = tipo.trim().uppercase()
        if (MeetingCatalog.AGREEMENT_KINDS.none { it.first == cleanTipo }) {
            return Result.Invalid("Tipo de apunte no reconocido")
        }
        val texto = descripcion.trim()
        if (texto.isBlank()) return Result.Invalid("Escribe de qué se trata")

        val owner = responsableId?.takeIf { it > 0L }
        if (MeetingCatalog.requiresOwner(cleanTipo) && owner == null) {
            return Result.Invalid("Un acuerdo necesita responsable; una lección o un riesgo, no")
        }

        val fecha = fechaCompromiso.trim()
        if (fecha.isNotBlank() && parseDate(fecha) == null) {
            return Result.Invalid("La fecha compromiso debe ser AAAA-MM-DD")
        }
        // Una lección aprendida no tiene fecha de entrega; si alguien la teclea
        // se descarta en vez de guardar un compromiso que nadie va a cumplir.
        val fechaFinal = if (MeetingCatalog.requiresOwner(cleanTipo)) fecha.takeIf { it.isNotBlank() } else null

        return Result.Valid(
            AgreementDraft(
                tipo = cleanTipo,
                descripcion = texto,
                responsableId = if (MeetingCatalog.requiresOwner(cleanTipo)) owner else null,
                fechaCompromiso = fechaFinal,
            ),
        )
    }

    /**
     * Roles que conducen la reunión: convocan, cierran, pasan lista y registran
     * acuerdos de otros.
     *
     * Espejo de `MEETINGS_LEAD_URL_RULES` en `url-matrix.ts`. El resto del
     * personal lee y mueve **lo suyo** — enseñarles el botón «Convocar» sólo
     * les daba un 403 al pulsarlo.
     */
    val LEAD_ROLES: Set<String> = setOf(
        "super_admin",
        "ceo",
        "arquitecto",
        "dir_operaciones",
        "dir_admin",
        "coord_admin",
        "coord_operaciones",
        "coord_ventas",
        "lider_diseno",
        "rh",
    )

    fun canLeadMeetings(canonicalRole: String?, isSuperAdmin: Boolean): Boolean {
        if (isSuperAdmin) return true
        val key = canonicalRole?.trim()?.lowercase() ?: return false
        return key in LEAD_ROLES
    }
}
