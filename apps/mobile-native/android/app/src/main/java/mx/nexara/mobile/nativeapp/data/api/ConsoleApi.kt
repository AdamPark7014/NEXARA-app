package mx.nexara.mobile.nativeapp.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

data class ViaticDto(
    val id: Long,
    val usuarioId: Long? = null,
    val montoSolicitado: Double? = null,
    val estatusPago: String? = null,
    val estatus: String? = null,
    val razonGasto: String? = null,
    val motivo: String? = null,
    val categoria: String? = null,
    val createdAt: String? = null,
    val usuario: SimpleUserDto? = null,
    val actividadId: Long? = null,
    val actividad: ActivityShortDto? = null,
    val ticketEvidenciaUrl: String? = null,
) {
    fun displayStatus(): String = estatusPago ?: estatus ?: "—"
    fun linkedActivityId(): Long? = actividadId ?: actividad?.id
}

data class CreateViaticJsonRequest(
    val montoSolicitado: Double,
    val motivo: String,
    val categoria: String? = null,
    val actividadId: Long? = null,
    val ticketEvidenciaUrl: String,
)

data class AssignViaticJsonRequest(
    val usuarioId: Long,
    val montoSolicitado: Double,
    val motivo: String,
    val categoria: String? = null,
    val actividadId: Long? = null,
    val projectId: Long? = null,
    val vehicleId: Long? = null,
)

data class ActivityShortDto(
    val id: Long? = null,
    val anNumber: String? = null,
)

data class ActivityClientDto(
    val id: Long? = null,
    val name: String? = null,
)

data class ActivityEvidenceSummaryDto(
    val reviewStatus: String? = null,
    val entryLatitude: Double? = null,
    val entryLongitude: Double? = null,
    val exitLatitude: Double? = null,
    val exitLongitude: Double? = null,
)

data class ActivityDto(
    val id: Long,
    val estatus: String,
    val titulo: String? = null,
    val anNumber: String? = null,
    val descripcion: String? = null,
    val indicaciones: String? = null,
    val prioridad: String? = null,
    val ticketType: String? = null,
    val branchName: String? = null,
    val branchAddress: String? = null,
    val branchCity: String? = null,
    val branchState: String? = null,
    val fechaAsignacion: String? = null,
    val fechaInicio: String? = null,
    val fechaEntregaEsperada: String? = null,
    val fechaMaxima: String? = null,
    val fechaFinalizacion: String? = null,
    val tiempoEstimadoMin: Int? = null,
    val tiempoMaximoMin: Int? = null,
    val slaAlertedAt: String? = null,
    val branchLatitude: Double? = null,
    val branchLongitude: Double? = null,
    val creador: SimpleUserDto? = null,
    val responsableId: Long? = null,
    val responsable: SimpleUserDto? = null,
    val client: ActivityClientDto? = null,
    val activityEvidence: ActivityEvidenceSummaryDto? = null,
    /** Tipo Core: tarea | proyecto | obra | servicio | comercial. */
    val coreKind: String? = null,
    /** Encargo: ejecucion | despacho (en despacho el LEAD solo reparte). */
    val assignmentCharge: String? = null,
    val ticketTypeCustom: String? = null,
    /** Fotos de evidencia que pide la actividad (mínimo). */
    val evidencePhotoRequired: Int? = null,
    val assignees: List<ActivityAssigneeRefDto>? = null,
    /** Cancelada por un superior: motivo, cuándo y quién. */
    val cancelReason: String? = null,
    val cancelledAt: String? = null,
    val cancelledBy: ActivityPersonRefDto? = null,
)

/** `{ id, nombre }` con nombre opcional: una persona borrada no debe tumbar el detalle. */
data class ActivityPersonRefDto(
    val id: Long? = null,
    val nombre: String? = null,
)

/** Persona de la actividad que quien consulta puede reemplazar. */
data class ActivityAccionPersonaDto(
    val userId: Long,
    val nombre: String? = null,
    /** LEAD | TECNICO | APOYO */
    val rol: String? = null,
    val responsable: Boolean? = null,
    /** Ejecuta (sube evidencia); en despacho el LEAD solo reparte. */
    val ejecuta: Boolean? = null,
)

/** `GET activities/:id/acciones`: lo que un superior puede hacer con la actividad. */
data class ActivityAccionesDto(
    val puedeCancelar: Boolean? = null,
    val puedePasar: Boolean? = null,
    val personas: List<ActivityAccionPersonaDto>? = null,
    val cerrada: Boolean? = null,
    val estatus: String? = null,
    val motivoMinimo: Int? = null,
)

data class CancelActivityRequest(
    val motivo: String,
)

/** «Pasar a otro compañero»: quien la deja, quien la continúa y por qué. */
data class ReassignActivityRequest(
    val aUsuarioId: Long,
    val deUsuarioId: Long,
    val motivo: String,
)

/** Fila de equipo de `GET activities/:id` (quién la reparte, quién la ejecuta). */
data class ActivityAssigneeRefDto(
    val id: Long? = null,
    val rol: String? = null,
    val asignadoAt: String? = null,
    val retiradoAt: String? = null,
    val indicaciones: String? = null,
    val user: ActivityAssigneeUserDto? = null,
)

data class ActivityAssigneeUserDto(
    val id: Long? = null,
    val nombre: String? = null,
    val email: String? = null,
)

data class UpdateActivityRequest(
    val estatus: String? = null,
    val prioridad: String? = null,
    val descripcion: String? = null,
    val indicaciones: String? = null,
    val fechaInicio: String? = null,
    val fechaEntregaEsperada: String? = null,
    val fechaFinalizacion: String? = null,
)

data class CreateActivityRequest(
    val titulo: String,
    val indicaciones: String? = null,
    val prioridad: String? = null,
    val activityType: String? = "INTERNAL",
    val ticketType: String? = null,
    val ticketTypeCustom: String? = null,
    val workType: String? = null,
    val clientId: Long? = null,
    val projectId: Long? = null,
    val branchName: String? = null,
    val branchNumber: String? = null,
    val branchCity: String? = null,
    val branchState: String? = null,
    val branchAddress: String? = null,
    val tiempoEstimadoMin: Int? = null,
    val tiempoMaximoMin: Int? = null,
    val creadoPorId: Long,
    val responsableId: Long,
    val estatus: String? = "Pendiente",
    val fechaInicio: String? = null,
    val fechaEntregaEsperada: String? = null,
    val fechaMaxima: String? = null,
    /** Fotos de evidencia por persona (2–8). */
    val evidencePhotoRequired: Int? = null,
    /** tarea | proyecto | obra | servicio | comercial. */
    val coreKind: String? = null,
    /** ejecucion | despacho. */
    val assignmentCharge: String? = null,
)

data class ExecuteActivityRequest(
    val estatus: String? = null,
    val fechaInicio: String? = null,
    val fechaFinalizacion: String? = null,
)

data class ActivityIncidentDto(
    val id: Long,
    val activityId: Long,
    val tipo: String,
    val severidad: String,
    val descripcion: String,
    val accionTomada: String? = null,
    val horasPerdidas: Double? = null,
    val reportadoPor: SimpleUserDto? = null,
    val resueltoPor: SimpleUserDto? = null,
    val resueltoAt: String? = null,
    val createdAt: String? = null,
)

data class ActivityRecommendationCotizacionDto(
    val id: Long,
    val quoteNumber: String,
    val status: String? = null,
    val total: Double? = null,
)

data class ActivityRecommendationDto(
    val id: Long,
    val activityId: Long,
    val tipo: String,
    val prioridad: String,
    val estado: String,
    val descripcion: String,
    val costoEstimado: Double? = null,
    val cotizacionId: Long? = null,
    val cotizacion: ActivityRecommendationCotizacionDto? = null,
    val creadoPor: SimpleUserDto? = null,
    val cerradoAt: String? = null,
    val createdAt: String? = null,
)

data class AddActivityIncidentRequest(
    val tipo: String,
    val severidad: String? = null,
    val descripcion: String,
    val accionTomada: String? = null,
    val horasPerdidas: Double? = null,
)

data class ResolveActivityIncidentRequest(
    val accionTomada: String? = null,
)

data class AddActivityRecommendationRequest(
    val tipo: String,
    val prioridad: String? = null,
    val descripcion: String,
    val costoEstimado: Double? = null,
)

data class UpdateActivityRecommendationRequest(
    val estado: String? = null,
    val prioridad: String? = null,
    val cotizacionId: Long? = null,
    val costoEstimado: Double? = null,
)

data class SimpleUserDto(
    val id: Long? = null,
    val nombre: String,
)

data class VisibleUserDto(
    val id: Long,
    val nombre: String,
    val email: String? = null,
)

data class AttendanceDayDto(
    val date: String,
    val totalMinutes: Int = 0,
    val isOpen: Boolean? = null,
)

/**
 * Checada suelta. `entry*` / `exit*` llegan como `Decimal` de Prisma: según el
 * serializador salen como número o como cadena, así que se leen con
 * [attendanceCoord] en vez de declararlos `Double`.
 */
data class AttendanceEventDto(
    val type: String,
    val timestamp: String,
    val deviceInfo: String? = null,
    val photoUrl: String? = null,
    val entryLatitude: Any? = null,
    val entryLongitude: Any? = null,
    val exitLatitude: Any? = null,
    val exitLongitude: Any? = null,
)

/** `null` cuando el valor no es una coordenada real (espejo de `toCoord` en la web). */
fun attendanceCoord(value: Any?): Double? = when (value) {
    null -> null
    is Double -> value.takeIf { it.isFinite() }
    is Float -> value.toDouble().takeIf { it.isFinite() }
    is Number -> value.toDouble().takeIf { it.isFinite() }
    is String -> value.trim().toDoubleOrNull()?.takeIf { it.isFinite() }
    else -> null
}

data class AttendanceRangeUserDto(
    val userId: Long,
    val userName: String? = null,
    val email: String? = null,
    val department: String? = null,
    val roleName: String? = null,
    val totalMinutes: Int? = null,
    val days: List<AttendanceDayDto>? = null,
    val attendances: List<AttendanceEventDto>? = null,
    /** Días sin checada que Christian justificó. */
    val justificaciones: List<AttendanceJustificacionDto>? = null,
)

data class AttendanceRangeDto(
    val rangeStart: String? = null,
    val rangeEnd: String? = null,
    val totalMinutesAll: Int? = null,
    val totalUsers: Int? = null,
    val users: List<AttendanceRangeUserDto>? = null,
    /** `attendance/range` (lo propio): las faltas justificadas vienen arriba, sin `users`. */
    val justificaciones: List<AttendanceJustificacionDto>? = null,
)

/**
 * Falta justificada: ese día se lee «Falta justificada · motivo», ni ausente ni
 * asistió. No es checada ni suma horas.
 */
data class AttendanceJustificacionDto(
    val id: Long? = null,
    val userId: Long? = null,
    /** AAAA-MM-DD */
    val fecha: String? = null,
    val motivo: String? = null,
    /** FALTA_JUSTIFICADA */
    val estado: String? = null,
    val etiqueta: String? = null,
    val justificadaPor: ActivityPersonRefDto? = null,
    val justificadaAt: String? = null,
)

/** `POST attendance/justificaciones` (solo Christian). */
data class JustificarFaltaRequest(
    val userId: Long,
    /** AAAA-MM-DD */
    val fecha: String,
    val motivo: String,
)

data class AttendanceCurrentDto(
    val id: Long? = null,
    val userId: Long? = null,
    val date: String? = null,
    val checkIn: String? = null,
    val checkOut: String? = null,
    val totalMinutes: Int? = null,
    val isOpen: Boolean? = null,
    /** Hora de la última entrada de la jornada abierta (`AttendanceDay.lastEntryAt`). */
    val lastEntryAt: String? = null,
)

/**
 * `POST attendance` — contrato A (asistencia no manipulable).
 *
 * La hora que vale es la del servidor: ya no se manda `timestamp`. `capturedAt`
 * es informativo (la hora del teléfono al capturar) y solo se respeta cuando la
 * checada viene de la cola sin conexión, que es quien agrega `offline: true` al
 * cuerpo al reenviarla (ver `OfflineQueueBody`).
 */
data class AttendanceRegisterRequest(
    val type: String, // "entrada" | "salida"
    /** Hora del teléfono al capturar (ISO-8601). */
    val capturedAt: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    /** Precisión del GPS en metros; el servidor marca «Ubicación imprecisa» arriba de 200. */
    val accuracyM: Double? = null,
    /** El teléfono detectó ubicación simulada; el servidor contesta 422 y avisa a sus jefes. */
    val mockLocation: Boolean? = null,
    val photoBase64: String,
)

data class AttendanceRegisterResponse(
    val id: Long? = null,
    val type: String? = null,
    val timestamp: String? = null,
    val message: String? = null,
    /** OK | PENDIENTE | REVISAR (contrato A); ausente en APIs viejas. */
    val validacion: String? = null,
    val motivoValidacion: String? = null,
    val fueraDeSitio: Boolean? = null,
    val distanciaSitioM: Int? = null,
    val sitioNombre: String? = null,
)

/**
 * Endpoints usados por Console/Dashboard en apps/mobile.
 * BaseURL ya incluye /api.
 */
interface ConsoleApi {
    @GET("viatics")
    suspend fun getViatics(): List<ViaticDto>

    @retrofit2.http.POST("viatics")
    suspend fun createViatic(
        @retrofit2.http.Body body: CreateViaticJsonRequest,
    ): ViaticDto

    @retrofit2.http.POST("viatics/assign")
    suspend fun assignViatic(
        @retrofit2.http.Body body: AssignViaticJsonRequest,
    ): ViaticDto

    @GET("activities")
    suspend fun getActivities(
        @Query("scope") scope: String? = null,
    ): List<ActivityDto>

    @GET("activity-feed")
    suspend fun getActivityFeedRaw(@Query("limit") limit: Int = 40): okhttp3.ResponseBody

    @GET("activities/{id}")
    suspend fun getActivity(
        @Path("id") id: Long,
    ): ActivityDto

    @PATCH("activities/{id}")
    suspend fun patchActivity(
        @Path("id") id: Long,
        @retrofit2.http.Body body: UpdateActivityRequest,
    ): ActivityDto

    @PATCH("activities/{id}/execute")
    suspend fun patchActivityExecute(
        @Path("id") id: Long,
        @retrofit2.http.Body body: ExecuteActivityRequest,
    ): ActivityDto

    @GET("activities/{activityId}/incidencias")
    suspend fun getActivityIncidents(
        @Path("activityId") activityId: Long,
    ): List<ActivityIncidentDto>

    @retrofit2.http.POST("activities/{activityId}/incidencias")
    suspend fun addActivityIncident(
        @Path("activityId") activityId: Long,
        @retrofit2.http.Body body: AddActivityIncidentRequest,
    ): ActivityIncidentDto

    @PATCH("activities/{activityId}/incidencias/{incidentId}/resolver")
    suspend fun resolveActivityIncident(
        @Path("activityId") activityId: Long,
        @Path("incidentId") incidentId: Long,
        @retrofit2.http.Body body: ResolveActivityIncidentRequest = ResolveActivityIncidentRequest(),
    ): ActivityIncidentDto

    @PATCH("activities/{activityId}/incidencias/{incidentId}/reabrir")
    suspend fun reopenActivityIncident(
        @Path("activityId") activityId: Long,
        @Path("incidentId") incidentId: Long,
    ): okhttp3.ResponseBody

    @GET("activities/{activityId}/recomendaciones")
    suspend fun getActivityRecommendations(
        @Path("activityId") activityId: Long,
    ): List<ActivityRecommendationDto>

    @retrofit2.http.POST("activities/{activityId}/recomendaciones")
    suspend fun addActivityRecommendation(
        @Path("activityId") activityId: Long,
        @retrofit2.http.Body body: AddActivityRecommendationRequest,
    ): ActivityRecommendationDto

    @PATCH("activities/{activityId}/recomendaciones/{recommendationId}")
    suspend fun updateActivityRecommendation(
        @Path("activityId") activityId: Long,
        @Path("recommendationId") recommendationId: Long,
        @retrofit2.http.Body body: UpdateActivityRecommendationRequest,
    ): ActivityRecommendationDto

    @GET("users/assignable")
    suspend fun getAssignableUsers(): List<VisibleUserDto>

    @GET("users")
    suspend fun getUsers(): List<VisibleUserDto>

    /**
     * @param scope `subtree` limita al organigrama de quien consulta. Sin él, un
     * usuario con `attendance.manage` recibe la empresa entera (la web solo lo
     * omite para CEO / plataforma).
     */
    @GET("attendance/hierarchy/range")
    suspend fun getAttendanceHierarchyRange(
        @Query("from") from: String,
        @Query("to") to: String,
        @Query("scope") scope: String? = null,
    ): AttendanceRangeDto

    /** Checadas propias del día (`attendance/history?date=`). */
    @GET("attendance/history")
    suspend fun getAttendanceHistory(
        @Query("date") date: String? = null,
    ): List<AttendanceEventDto>

    @GET("attendance/range")
    suspend fun getAttendanceRange(
        @Query("from") from: String,
        @Query("to") to: String,
    ): AttendanceRangeDto

    /** Justificar la falta de un día sin checada. Solo Christian; no crea checadas. */
    @POST("attendance/justificaciones")
    suspend fun justificarFalta(@Body body: JustificarFaltaRequest): okhttp3.ResponseBody

    @GET("attendance/current")
    suspend fun getAttendanceCurrent(): AttendanceCurrentDto

    @retrofit2.http.POST("attendance")
    suspend fun postAttendance(
        @retrofit2.http.Body body: AttendanceRegisterRequest,
    ): AttendanceRegisterResponse

    // ── Evidences (Activity Evidence) ─────────────────────────────────────────

    @GET("activities/{id}/timeline")
    suspend fun getActivityTimeline(@retrofit2.http.Path("id") id: Long): okhttp3.ResponseBody

    @GET("activities/{id}/materiales")
    suspend fun getActivityMaterials(@retrofit2.http.Path("id") id: Long): okhttp3.ResponseBody

    @GET("activities/{id}/team")
    suspend fun getActivityTeam(@retrofit2.http.Path("id") id: Long): okhttp3.ResponseBody

    @GET("activities/{id}/reasignaciones")
    suspend fun getActivityReassignments(@retrofit2.http.Path("id") id: Long): okhttp3.ResponseBody

    /** Cancelar y «pasar a otro compañero»: qué puede hacer quien consulta. */
    @GET("activities/{id}/acciones")
    suspend fun getActivityActions(@Path("id") id: Long): ActivityAccionesDto

    /** Solo superiores de quien la ejecuta; motivo de al menos `motivoMinimo` caracteres. */
    @POST("activities/{id}/cancelar")
    suspend fun cancelActivity(
        @Path("id") id: Long,
        @Body body: CancelActivityRequest,
    ): okhttp3.ResponseBody

    @POST("activities/{id}/reasignar")
    suspend fun reassignActivity(
        @Path("id") id: Long,
        @Body body: ReassignActivityRequest,
    ): okhttp3.ResponseBody

    @GET("gps/me")
    suspend fun getGpsMe(): GpsMeResponse

    @GET("gps/team")
    suspend fun getGpsTeam(): List<GpsLocationDto>

    @GET("gps/trajectory")
    suspend fun getGpsTrajectory(
        @Query("date") date: String? = null,
        @Query("userId") userId: Long? = null,
    ): List<GpsLocationDto>

    @retrofit2.http.POST("gps")
    suspend fun postGpsLocation(
        @retrofit2.http.Body body: PostGpsLocationRequest,
    ): okhttp3.ResponseBody

    @PATCH("gps/consent")
    suspend fun patchGpsConsent(
        @retrofit2.http.Body body: GpsConsentRequest,
    ): GpsConsentResponse

    // ── Tools ────────────────────────────────────────────────────────────────

    @GET("users/profile/me")
    suspend fun getMyProfile(): UserProfileMeDto

    @retrofit2.http.PATCH("users/profile/me")
    suspend fun updateMyProfile(
        @retrofit2.http.Body body: UpdateUserProfileBody,
    ): UserProfileDataDto

    // ── System settings (console.admin) ─────────────────────────────────────

}

data class OperationalProjectDto(
    val id: Long,
    val title: String,
    val description: String? = null,
    val status: String,
    val startDate: String? = null,
    val endDate: String? = null,
    val actualEndDate: String? = null,
    val vendor: VisibleUserDto? = null,
    val client: ServiceClientDto? = null,
    val engineers: List<OperationalProjectEngineerAssignmentDto>? = null,
    val activities: List<OperationalProjectActivityRefDto>? = null,
)

data class OperationalProjectEngineerAssignmentDto(
    val id: Long,
    val engineer: VisibleUserDto,
)

data class OperationalProjectActivityRefDto(
    val id: Long,
)

data class ServiceClientDto(
    val id: Long,
    val name: String? = null,
    val nombre: String? = null,
    val razonSocial: String? = null,
    val rfc: String? = null,
    val email: String? = null,
    val telefono: String? = null,
    val direccion: String? = null,
    val contacto: String? = null,
    val logoUrl: String? = null,
    val logo: String? = null,
    val contactName: String? = null,
    val contactEmail: String? = null,
    val contactPhone: String? = null,
    val address: String? = null,
    val city: String? = null,
    val state: String? = null,
    val country: String? = null,
    val accountCode: String? = null,
    val portalEmail: String? = null,
    val isActive: Boolean? = null,
    val activo: Boolean? = null,
    val createdAt: String? = null,
    val branchCount: Int? = null,
    val branches: Any? = null,
    val _count: Any? = null,
)

data class ActivityEvidenceActivityDto(
    val id: Long? = null,
    val anNumber: String,
    val titulo: String? = null,
    val indicaciones: String? = null,
    val branchName: String? = null,
    val branchCity: String? = null,
    val branchState: String? = null,
    val branchAddress: String? = null,
    val creador: SimpleUserDto? = null,
    val responsable: SimpleUserDto? = null,
)

data class ActivityEvidenceDetailDto(
    val id: Long,
    val activityId: Long,
    val status: String,
    val reviewStatus: String? = null,
    val rejectedStep: String? = null,
    val reviewNotes: String? = null,
    val entryPhotoUrl: String? = null,
    val entryLatitude: Double? = null,
    val entryLongitude: Double? = null,
    val evidencePhotos: List<String>? = null,
    val serviceSheetPdfUrl: String? = null,
    val serviceSheetData: Any? = null,
    val exitPhotoUrl: String? = null,
    val exitLatitude: Double? = null,
    val exitLongitude: Double? = null,
)

data class ActivityEvidencePhotoStepRequest(
    val photoUrl: String,
    val latitude: Double,
    val longitude: Double,
)

data class ActivityEvidencePdfStepRequest(
    val pdfUrl: String,
)

data class GpsUserDto(
    val id: Long,
    val nombre: String,
    val email: String? = null,
)

data class GpsLocationDto(
    val id: Long,
    val usuarioId: Long,
    val latitud: Any,
    val longitud: Any,
    val velocidadKmh: Any? = null,
    val ultimaActualizacion: String? = null,
    val usuario: GpsUserDto? = null,
    val actividad: ActivityEvidenceActivityDto? = null,
)

data class GpsMeResponse(
    val consent: Boolean? = null,
    val location: GpsLocationDto? = null,
)

data class PostGpsLocationRequest(
    val latitud: Double,
    val longitud: Double,
    val velocidadKmh: Double? = null,
    val estaActivo: Boolean = true,
    val ultimaActualizacion: String,
    val actividadId: Long? = null,
)

data class GpsConsentRequest(
    val enabled: Boolean,
)

data class GpsConsentResponse(
    val consent: Boolean? = null,
)

data class UserProfileMeDto(
    val id: Long,
    val nombre: String,
    val email: String,
    /** Nº de empleado ERP; la web lo usa como último recurso para la ficha ACS. */
    val employeeNumber: String? = null,
    val perfil: UserProfileDataDto? = null,
    val role: UserRoleRefDto? = null,
    val department: UserDepartmentRefDto? = null,
)

data class UserProfileDataDto(
    val telefono: String? = null,
    val fechaNacimiento: String? = null,
    val direccion: String? = null,
    val colonia: String? = null,
    val ciudad: String? = null,
    val estado: String? = null,
    val codigoPostal: String? = null,
    val pais: String? = null,
    val curp: String? = null,
    val rfc: String? = null,
    val ineNumero: String? = null,
    val nss: String? = null,
    val contactoEmergenciaNombre: String? = null,
    val contactoEmergenciaTelefono: String? = null,
    val estatus: String? = null,
)

data class UserRoleRefDto(
    val nombre: String? = null,
)

data class UserDepartmentRefDto(
    val nombre: String? = null,
)

data class UpdateUserProfileBody(
    val telefono: String? = null,
    val fechaNacimiento: String? = null,
    val direccion: String? = null,
    val colonia: String? = null,
    val ciudad: String? = null,
    val estado: String? = null,
    val codigoPostal: String? = null,
    val pais: String? = null,
    val curp: String? = null,
    val rfc: String? = null,
    val ineNumero: String? = null,
    val nss: String? = null,
    val contactoEmergenciaNombre: String? = null,
    val contactoEmergenciaTelefono: String? = null,
)
