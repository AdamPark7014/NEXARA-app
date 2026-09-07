package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Ritmo operativo: reuniones, acuerdos y lecciones aprendidas.
 *
 * Espejo de `apps/api/src/meetings/meetings.controller.ts` (`@Controller('reuniones')`).
 * El módulo no existía en el móvil — ni la pantalla ni el cliente — así que la
 * junta diaria de las 10:00 y los acuerdos que salen de ella sólo se podían
 * consultar desde la web.
 *
 * Todas las respuestas se leen como `ResponseBody` y se parsean a mano: los
 * `include` de Prisma devuelven relaciones anidadas que pueden venir en `null`
 * (`facilitador`, `responsable`, `activity`), y un `data class` con campos no
 * nulables revienta la deserialización y deja la pantalla en blanco sin decir
 * por qué.
 */
interface MeetingsApi {

    @GET("reuniones")
    suspend fun listMeetingsRaw(
        @Query("tipo") tipo: String? = null,
        @Query("estado") estado: String? = null,
        @Query("desde") desde: String? = null,
        @Query("hasta") hasta: String? = null,
    ): okhttp3.ResponseBody

    @GET("reuniones/{id}")
    suspend fun getMeetingRaw(@Path("id") id: Long): okhttp3.ResponseBody

    @POST("reuniones")
    suspend fun createMeeting(@Body body: CreateMeetingBody): okhttp3.ResponseBody

    @PATCH("reuniones/{id}")
    suspend fun updateMeeting(@Path("id") id: Long, @Body body: UpdateMeetingBody): okhttp3.ResponseBody

    /** Cierra la junta y guarda la minuta. */
    @POST("reuniones/{id}/cerrar")
    suspend fun closeMeeting(@Path("id") id: Long, @Body body: CloseMeetingBody): okhttp3.ResponseBody

    /**
     * Pasa lista. Reemplaza la lista completa de asistentes.
     *
     * El servidor sustituye, no fusiona (`setAttendance`): hay que mandar
     * **todos** los convocados en cada llamada o los que falten quedan fuera
     * del acta.
     */
    @PUT("reuniones/{id}/asistencia")
    suspend fun setAttendance(
        @Path("id") id: Long,
        @Body body: MeetingAttendanceBody,
    ): okhttp3.ResponseBody

    @POST("reuniones/{id}/acuerdos")
    suspend fun addAgreement(@Path("id") id: Long, @Body body: CreateAgreementBody): okhttp3.ResponseBody

    @PATCH("reuniones/{id}/acuerdos/{agreementId}")
    suspend fun updateAgreement(
        @Path("id") id: Long,
        @Path("agreementId") agreementId: Long,
        @Body body: UpdateAgreementBody,
    ): okhttp3.ResponseBody

    /** Lo que me toca a mí. Es la pantalla de entrada, no el archivo de juntas. */
    @GET("reuniones/mis-acuerdos")
    suspend fun myAgreementsRaw(): okhttp3.ResponseBody

    @PATCH("reuniones/mis-acuerdos/{agreementId}")
    suspend fun updateMyAgreement(
        @Path("agreementId") agreementId: Long,
        @Body body: UpdateMyAgreementBody,
    ): okhttp3.ResponseBody

    @GET("reuniones/acuerdos/vencidos")
    suspend fun overdueAgreementsRaw(): okhttp3.ResponseBody

    @GET("reuniones/lecciones")
    suspend fun lessonsRaw(@Query("q") q: String? = null): okhttp3.ResponseBody
}

// ── Cuerpos de petición ───────────────────────────────────────────────────

data class CreateMeetingBody(
    val tipo: String,
    val fecha: String,
    val titulo: String? = null,
    val horaInicio: String? = null,
    val agenda: String? = null,
    val facilitadorId: Long? = null,
    val asistentes: List<Long>? = null,
)

data class UpdateMeetingBody(
    val titulo: String? = null,
    val fecha: String? = null,
    val horaInicio: String? = null,
    val agenda: String? = null,
    val notas: String? = null,
    val estado: String? = null,
)

data class CloseMeetingBody(val notas: String? = null)

data class CreateAgreementBody(
    val tipo: String,
    val descripcion: String,
    val responsableId: Long? = null,
    val fechaCompromiso: String? = null,
    val activityId: Long? = null,
)

data class UpdateAgreementBody(
    val estado: String? = null,
    val descripcion: String? = null,
    val responsableId: Long? = null,
    val fechaCompromiso: String? = null,
)

data class UpdateMyAgreementBody(val estado: String)

data class MeetingAttendeeMark(val userId: Long, val asistio: Boolean = true)

data class MeetingAttendanceBody(val asistentes: List<MeetingAttendeeMark>)

// ── Catálogo del dominio ──────────────────────────────────────────────────

/**
 * Espejo de `apps/api/src/meetings/meeting-rhythm.ts`.
 *
 * Las claves viajan en inglés-mayúsculas como las guarda Prisma; las etiquetas
 * son las que ve la persona.
 */
object MeetingCatalog {

    val TYPES: List<Pair<String, String>> = listOf(
        "DIARIA" to "Reunión diaria",
        "PLANEACION_SEMANAL" to "Planeación semanal",
        "REVISION_AVANCES" to "Revisión de avances",
        "CIERRE_SEMANAL" to "Junta de cierre",
        "EXTRAORDINARIA" to "Reunión extraordinaria",
    )

    /** Hora sugerida de cada ritmo, igual que `MEETING_DEFAULTS` en el API. */
    val DEFAULT_TIME: Map<String, String> = mapOf(
        "DIARIA" to "10:00",
        "PLANEACION_SEMANAL" to "09:00",
        "REVISION_AVANCES" to "10:00",
        "CIERRE_SEMANAL" to "16:00",
        "EXTRAORDINARIA" to "10:00",
    )

    val MEETING_STATUSES: List<Pair<String, String>> = listOf(
        "PROGRAMADA" to "Programada",
        "REALIZADA" to "Realizada",
        "CANCELADA" to "Cancelada",
    )

    /**
     * Tipos de apunte que sale de una junta.
     *
     * Un acuerdo tiene dueño y fecha; una lección y un riesgo son conocimiento
     * y no los tienen (`agreementRequiresOwner` en el API).
     */
    val AGREEMENT_KINDS: List<Pair<String, String>> = listOf(
        "ACUERDO" to "Acuerdo",
        "LECCION" to "Lección aprendida",
        "RIESGO" to "Riesgo",
    )

    val AGREEMENT_STATUSES: List<Pair<String, String>> = listOf(
        "PENDIENTE" to "Pendiente",
        "EN_PROCESO" to "En proceso",
        "CUMPLIDO" to "Cumplido",
        "CANCELADO" to "Cancelado",
    )

    /**
     * Puntos de agenda sugeridos por tipo (espejo de `MEETING_AGENDA`).
     *
     * No es decorado. La junta del viernes que no pregunta explícitamente por
     * lecciones aprendidas acaba siendo un repaso de pendientes: por eso el
     * punto viene escrito de fábrica y el móvil lo propone igual que la web.
     * El servidor rellena la agenda si va vacía, así que esto es lo que la
     * persona ve **antes** de convocar, no una segunda verdad.
     */
    val AGENDA: Map<String, List<String>> = mapOf(
        "DIARIA" to listOf(
            "Prioridades del día",
            "Servicios programados",
            "Materiales y herramienta requeridos",
            "Bloqueos e incidencias abiertas",
        ),
        "PLANEACION_SEMANAL" to listOf(
            "Metas de la semana",
            "Asignación de actividades por técnico",
            "Compras y materiales a gestionar",
            "Riesgos previstos",
        ),
        "REVISION_AVANCES" to listOf(
            "Avance contra el plan del lunes",
            "Actividades en riesgo de SLA",
            "Ajustes de asignación",
        ),
        "CIERRE_SEMANAL" to listOf(
            "Resultados de la semana",
            "Problemas encontrados",
            "Lecciones aprendidas",
            "Acuerdos para la semana entrante",
        ),
        "EXTRAORDINARIA" to listOf("Motivo de la convocatoria", "Acuerdos"),
    )

    /** Agenda sugerida ya formateada como líneas, lista para el campo de texto. */
    fun suggestedAgenda(tipo: String): String =
        AGENDA[tipo.trim().uppercase()].orEmpty().joinToString("\n") { "• $it" }

    /** Título por defecto del ritmo — el mismo que pondría el servidor. */
    fun defaultTitle(tipo: String): String = typeLabel(tipo)

    /** Estados en los que el acuerdo todavía espera algo de alguien. */
    val OPEN_AGREEMENT_STATUSES: Set<String> = setOf("PENDIENTE", "EN_PROCESO")

    private fun label(pairs: List<Pair<String, String>>, raw: String): String =
        pairs.firstOrNull { it.first.equals(raw.trim(), ignoreCase = true) }?.second
            ?: raw.ifBlank { "—" }

    fun typeLabel(raw: String): String = label(TYPES, raw)
    fun meetingStatusLabel(raw: String): String = label(MEETING_STATUSES, raw)
    fun agreementKindLabel(raw: String): String = label(AGREEMENT_KINDS, raw)
    fun agreementStatusLabel(raw: String): String = label(AGREEMENT_STATUSES, raw)

    /** Sólo el acuerdo necesita responsable; la lección y el riesgo, no. */
    fun requiresOwner(kind: String): Boolean = kind.trim().equals("ACUERDO", ignoreCase = true)

    fun isOpen(status: String): Boolean = status.trim().uppercase() in OPEN_AGREEMENT_STATUSES
}

// ── DTOs ──────────────────────────────────────────────────────────────────

/** Una reunión del ritmo operativo. */
data class MeetingDto(
    val id: Long = 0L,
    val tipo: String = "",
    val titulo: String = "",
    val fecha: String = "",
    val horaInicio: String = "",
    val estado: String = "",
    val agenda: String = "",
    val notas: String = "",
    val facilitadorNombre: String = "",
    val asistentes: Int = 0,
    val acuerdos: Int = 0,
) {
    val rowKey: String get() = "mtg-$id"
    val tipoLabel: String get() = MeetingCatalog.typeLabel(tipo)
    val estadoLabel: String get() = MeetingCatalog.meetingStatusLabel(estado)
    val isClosed: Boolean get() = !estado.trim().equals("PROGRAMADA", ignoreCase = true)

    /** «2026-09-07 · 10:00» */
    val whenLabel: String
        get() = listOf(fecha.take(10), horaInicio).filter { it.isNotBlank() }.joinToString(" · ")

    companion object {
        fun fromRaw(row: Map<String, Any?>): MeetingDto {
            @Suppress("UNCHECKED_CAST")
            val facilitador = row["facilitador"] as? Map<String, Any?>
            return MeetingDto(
                id = ProcParse.lng(row["id"]) ?: 0L,
                tipo = ProcParse.str(row["tipo"]),
                titulo = ProcParse.str(row["titulo"]),
                fecha = ProcParse.str(row["fecha"]),
                horaInicio = ProcParse.str(row["horaInicio"]),
                estado = ProcParse.str(row["estado"]),
                agenda = ProcParse.str(row["agenda"]),
                notas = ProcParse.str(row["notas"]),
                facilitadorNombre = ProcParse.str(facilitador?.get("nombre"), facilitador?.get("email")),
                // En el listado son conteos; en el detalle son arreglos.
                asistentes = countOrSize(row["asistentes"]),
                acuerdos = countOrSize(row["acuerdos"]),
            )
        }

        private fun countOrSize(value: Any?): Int = when (value) {
            is Number -> value.toInt()
            is List<*> -> value.size
            else -> 0
        }
    }
}

/**
 * Un acuerdo, lección o riesgo.
 *
 * `vencido` y `diasVencido` los calcula el servidor (`decorateAgreement`) — no
 * se recalculan aquí para no acabar con dos verdades sobre la misma fecha.
 */
data class MeetingAgreementDto(
    val id: Long = 0L,
    val meetingId: Long = 0L,
    val tipo: String = "ACUERDO",
    val descripcion: String = "",
    val estado: String = "",
    val responsableId: Long? = null,
    val responsableNombre: String = "",
    val fechaCompromiso: String = "",
    val vencido: Boolean = false,
    val diasVencido: Int = 0,
    val meetingTitulo: String = "",
    val meetingFecha: String = "",
    val activityId: Long? = null,
    val activityNumero: String = "",
    val activityTitulo: String = "",
) {
    val rowKey: String get() = "agr-$id"
    val tipoLabel: String get() = MeetingCatalog.agreementKindLabel(tipo)
    val estadoLabel: String get() = MeetingCatalog.agreementStatusLabel(estado)
    val isOpen: Boolean get() = MeetingCatalog.isOpen(estado)

    /** «Vencido hace 3 días» / «Vence el 2026-09-10» / «Sin fecha». */
    val dueLabel: String
        get() = when {
            vencido && diasVencido == 1 -> "Vencido hace 1 día"
            vencido -> "Vencido hace $diasVencido días"
            fechaCompromiso.isNotBlank() -> "Vence el ${fechaCompromiso.take(10)}"
            else -> "Sin fecha compromiso"
        }

    /** «AN-1042 · Cambio de switch», vacío si no está ligado a una actividad. */
    val activityLabel: String
        get() = listOf(activityNumero, activityTitulo).filter { it.isNotBlank() }.joinToString(" · ")

    companion object {
        fun fromRaw(row: Map<String, Any?>): MeetingAgreementDto {
            @Suppress("UNCHECKED_CAST")
            val responsable = row["responsable"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val meeting = row["meeting"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val activity = row["activity"] as? Map<String, Any?>
            return MeetingAgreementDto(
                id = ProcParse.lng(row["id"]) ?: 0L,
                meetingId = ProcParse.lng(row["meetingId"], meeting?.get("id")) ?: 0L,
                tipo = ProcParse.str(row["tipo"]).ifBlank { "ACUERDO" },
                descripcion = ProcParse.str(row["descripcion"]),
                estado = ProcParse.str(row["estado"]),
                responsableId = ProcParse.lng(row["responsableId"], responsable?.get("id")),
                responsableNombre = ProcParse.str(responsable?.get("nombre"), responsable?.get("email")),
                fechaCompromiso = ProcParse.str(row["fechaCompromiso"]),
                vencido = row["vencido"] == true,
                diasVencido = ProcParse.lng(row["diasVencido"])?.toInt() ?: 0,
                meetingTitulo = ProcParse.str(meeting?.get("titulo")),
                meetingFecha = ProcParse.str(meeting?.get("fecha")),
                activityId = ProcParse.lng(row["activityId"], activity?.get("id")),
                activityNumero = ProcParse.str(activity?.get("anNumber")),
                activityTitulo = ProcParse.str(activity?.get("titulo")),
            )
        }
    }
}

/**
 * Una persona convocada al acta.
 *
 * Lleva `userId` a propósito. La versión anterior aplanaba la lista a cadenas
 * («Ana ✓») y con eso se podía dibujar la asistencia pero no **pasar lista**:
 * `PUT reuniones/{id}/asistencia` reemplaza la lista completa y necesita los
 * ids de todos los convocados, no sus nombres.
 */
data class MeetingAttendeeDto(
    val userId: Long = 0L,
    val nombre: String = "",
    val asistio: Boolean = false,
) {
    val rowKey: String get() = "att-$userId"
    val displayName: String get() = nombre.ifBlank { "Usuario $userId" }

    companion object {
        fun fromRaw(row: Map<String, Any?>): MeetingAttendeeDto {
            @Suppress("UNCHECKED_CAST")
            val user = row["user"] as? Map<String, Any?>
            return MeetingAttendeeDto(
                userId = ProcParse.lng(row["userId"], user?.get("id")) ?: 0L,
                nombre = ProcParse.str(user?.get("nombre"), user?.get("email")),
                asistio = row["asistio"] == true,
            )
        }
    }
}

/** Detalle completo de una reunión: cabecera + acuerdos + asistentes. */
data class MeetingDetailDto(
    val meeting: MeetingDto = MeetingDto(),
    val acuerdos: List<MeetingAgreementDto> = emptyList(),
    val asistentes: List<MeetingAttendeeDto> = emptyList(),
) {
    /** «3 de 7 asistieron» — lo primero que se pregunta al abrir un acta vieja. */
    val attendanceLabel: String
        get() = if (asistentes.isEmpty()) "Sin convocados" else
            "${asistentes.count { it.asistio }} de ${asistentes.size} asistieron"

    companion object {
        fun fromRaw(row: Map<String, Any?>): MeetingDetailDto {
            val acuerdosRaw = (row["acuerdos"] as? List<*>).orEmpty().filterIsInstance<Map<String, Any?>>()
            val asistentesRaw = (row["asistentes"] as? List<*>).orEmpty().filterIsInstance<Map<String, Any?>>()
            return MeetingDetailDto(
                meeting = MeetingDto.fromRaw(row),
                acuerdos = acuerdosRaw.map { MeetingAgreementDto.fromRaw(it) },
                // Una fila sin id de usuario no se puede volver a mandar en el
                // acta; se descarta en vez de viajar como userId=0.
                asistentes = asistentesRaw.map { MeetingAttendeeDto.fromRaw(it) }.filter { it.userId > 0L },
            )
        }
    }
}

/** Respuesta de `GET reuniones/mis-acuerdos`. */
data class MyAgreementsDto(
    val total: Int = 0,
    val vencidos: Int = 0,
    val acuerdos: List<MeetingAgreementDto> = emptyList(),
)
