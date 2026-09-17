package mx.nexara.mobile.nativeapp.data.api

import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

/*
 * Core (/erp): Mis actividades, pizarra del equipo, evidencias del equipo y el
 * flujo de captura de quien ejecuta.
 *
 * Espejo de apps/web/lib/my-activities-api.ts y team-board-api.ts, contra
 * apps/api/src/me/me.controller.ts y activity-evidence.controller.ts.
 *
 * Todo campo es opcional a propósito: un campo nuevo o nulo del lado del API no
 * debe tumbar la pantalla. Latitudes y `evidencePhotosGeo` van como `Any?`
 * porque Prisma serializa `Decimal` como texto y los `snapshot` de revisiones
 * son JSON libre; se leen con `CoreActivityRules.anyToDouble`.
 */

// ── Mis actividades (GET me/activities) ─────────────────────────────────────

data class MyActivityRefDto(
    val id: Long? = null,
    val nombre: String? = null,
)

/** Registro de despacho: a quién se pasó después de este usuario. */
data class MyActivityPasadaDto(
    val nombre: String? = null,
    val rol: String? = null,
    val at: String? = null,
    val por: String? = null,
    val evidenceStatus: String? = null,
)

/** Última reprogramación de día y hora (quién, cuándo, de → a). */
data class MyActivityReprogramacionDto(
    val at: String? = null,
    val por: String? = null,
    val de: String? = null,
    val a: String? = null,
    val motivo: String? = null,
)

data class MyActivityItemDto(
    val id: Long,
    val anNumber: String? = null,
    val titulo: String? = null,
    val descripcion: String? = null,
    val estatus: String? = null,
    val prioridad: String? = null,
    val coreKind: String? = null,
    val ticketTypeCustom: String? = null,
    val assignmentCharge: String? = null,
    val fechaInicio: String? = null,
    val fechaMaxima: String? = null,
    val fechaAsignacion: String? = null,
    val fechaFinalizacion: String? = null,
    val tiempoEstimadoMin: Double? = null,
    val tiempoMaximoMin: Double? = null,
    val rol: String? = null,
    /** Indicaciones personales de esta persona en la actividad. */
    val indicaciones: String? = null,
    val asignadaPor: MyActivityRefDto? = null,
    val autoAsignada: Boolean? = null,
    val proyecto: String? = null,
    val cliente: String? = null,
    val evidenceStatus: String? = null,
    val orden: Double? = null,
    val ordenJustificacion: String? = null,
    val ordenActualizadoAt: String? = null,
    /** En despacho, este usuario solo reparte (no sube evidencia). */
    val despachador: Boolean? = null,
    /** Despachador que todavía no la pasa a nadie. */
    val porRepartir: Boolean? = null,
    val pasadaA: List<MyActivityPasadaDto>? = null,
    val ultimaReprogramacion: MyActivityReprogramacionDto? = null,
    // ── Contrato B (aceptación y tiempos); todo opcional: la API vieja no lo manda.
    /** PENDIENTE | ACEPTADA | RECHAZADA. */
    val aceptacion: String? = null,
    val motivoRechazo: String? = null,
    /** rojo | amarillo | verde (lo calcula el servidor). */
    val semaforo: String? = null,
    /** Tiempo planeado en minutos (`horasPlan` × 60). */
    val minutosPlan: Double? = null,
    /** Tiempo real: inicio → fin, o inicio → ahora si sigue en curso. */
    val minutosReales: Double? = null,
    val excedida: Boolean? = null,
    val inicioRealAt: String? = null,
    val finRealAt: String? = null,
    /** Quién se la asignó (nombre del contrato; `asignadaPor` es el campo viejo). */
    val asignadoPor: MyActivityRefDto? = null,
    /** La empezó habiendo otra de más prioridad sin terminar. */
    val saltoPrioridad: Boolean? = null,
    val justificacionOrden: String? = null,
) {
    /** El contrato dice `asignadoPor`; las respuestas de hoy traen `asignadaPor`. */
    val quienAsigno: MyActivityRefDto? get() = asignadoPor ?: asignadaPor
}

data class MyActivitiesResponseDto(
    /** Encargados de área: pueden reordenar su cola (con justificación). */
    val canReorder: Boolean? = null,
    /** Encargados de área: pueden auto-asignarse actividades. */
    val canSelfAssign: Boolean? = null,
    val open: List<MyActivityItemDto>? = null,
    /** Ya repartidas por este usuario: da seguimiento. */
    val seguimiento: List<MyActivityItemDto>? = null,
    val doneToday: List<MyActivityItemDto>? = null,
)

data class ReorderMyActivitiesRequest(
    /** Cola completa en el nuevo orden. */
    val activityIds: List<Long>,
    val movedActivityId: Long,
    val justificacion: String,
)

data class DispatchMyActivityRequest(
    val userIds: List<Long>,
    val indicaciones: String? = null,
    /** Tiempo estimado en horas (contrato B); el API viejo lo ignora. */
    val horasPlan: Double? = null,
)

/** `POST me/activities/:id/rechazar` — el motivo es obligatorio (≥ 10). */
data class RechazarActividadRequest(
    val motivo: String,
)

data class ReprogramarDespachoRequest(
    /** Día y hora nuevos en ISO-8601 (UTC). */
    val fecha: String,
    val motivo: String? = null,
)

// ── Pizarra del equipo (GET me/board) ───────────────────────────────────────

data class TeamBoardActivityDto(
    val id: Long,
    val anNumber: String? = null,
    val titulo: String? = null,
    val estatus: String? = null,
    val fechaMaxima: String? = null,
    val bucket: String? = null,
)

data class TeamBoardOpenActivityDto(
    val id: Long,
    val anNumber: String? = null,
    val titulo: String? = null,
    val estatus: String? = null,
    val evidenceStatus: String? = null,
    val progressPct: Double? = null,
    val coreKind: String? = null,
    val assignmentCharge: String? = null,
    val fechaFinalizacion: String? = null,
    val indicaciones: String? = null,
    /** Emails del equipo activo: dice si un despacho ya se repartió. */
    val teamEmails: List<String>? = null,
    /** En despacho esta persona (LEAD) solo reparte. */
    val reparte: Boolean? = null,
    /** Día y hora programados (reprogramable por quien reparte). */
    val fechaInicio: String? = null,
)

/** Última actividad que la persona terminó hoy (estado `libre`). */
data class TeamBoardLastFinishedDto(
    val id: Long? = null,
    val anNumber: String? = null,
    val titulo: String? = null,
    val finishedAt: String? = null,
    /** Minutos contra la fecha máxima; null = no tenía fecha máxima. */
    val lateMinutes: Double? = null,
)

data class TeamBoardUserDto(
    val id: Long,
    val nombre: String? = null,
    val email: String? = null,
    val avatarUrl: String? = null,
    val puesto: String? = null,
    /** activo | atrasado | libre | sin_actividad (inactivo solo en APIs viejas). */
    val status: String? = null,
    val currentActivity: TeamBoardActivityDto? = null,
    val openActivities: List<TeamBoardOpenActivityDto>? = null,
    val clockInAt: String? = null,
    val workedMinutes: Double? = null,
    val activityStartedAt: String? = null,
    val activityElapsedMinutes: Double? = null,
    /** Atrasado: minutos pasados de la fecha máxima de lo que está haciendo. */
    val currentLateMinutes: Double? = null,
    /** Libre: desde cuándo no tiene nada abierto. */
    val idleSinceAt: String? = null,
    val lastFinished: TeamBoardLastFinishedDto? = null,
    /** Actividades suyas entregadas que nadie ha aprobado. */
    val enEsperaAprobacion: Int? = null,
    /** Actividades con evidencia devuelta que está corrigiendo. */
    val enCorreccion: Int? = null,
)

data class TeamBoardResponseDto(
    /** company (CEO) | subtree (encargados). */
    val scope: String? = null,
    val users: List<TeamBoardUserDto>? = null,
)

data class TeamBoardHistoryEvidenceDto(
    val status: String? = null,
    val progressPct: Double? = null,
    val entryPhotoUrl: String? = null,
    val evidencePhotos: List<String>? = null,
    val exitPhotoUrl: String? = null,
    val serviceSheetPdfUrl: String? = null,
    val serviceSheetData: Any? = null,
)

data class TeamBoardHistoryItemDto(
    val id: Long,
    val anNumber: String? = null,
    val titulo: String? = null,
    val estatus: String? = null,
    val coreKind: String? = null,
    val ticketTypeCustom: String? = null,
    val assignmentCharge: String? = null,
    val fechaAsignacion: String? = null,
    val fechaFinalizacion: String? = null,
    val evidence: TeamBoardHistoryEvidenceDto? = null,
)

// ── Evidencias del equipo (GET me/activities/:id/evidencias) ────────────────

/**
 * Lo que subió una persona. La misma forma sirve para la copia (`snapshot`)
 * que se guarda al devolverla; ahí los campos de revisión llegan nulos.
 */
data class TeamEvidenceDto(
    val status: String? = null,
    val completedAt: String? = null,
    val entryPhotoUrl: String? = null,
    val entryLatitude: Any? = null,
    val entryLongitude: Any? = null,
    val entryPhotoUploadedAt: String? = null,
    val evidencePhotos: List<String>? = null,
    /** `[{latitude, longitude, capturedAt} | null]`, alineado con evidencePhotos. */
    val evidencePhotosGeo: Any? = null,
    val evidencePhotosUploadedAt: String? = null,
    val serviceSheetPdfUrl: String? = null,
    val serviceSheetUploadedAt: String? = null,
    val serviceSheetData: Any? = null,
    val serviceSheetCompletedAt: String? = null,
    val exitPhotoUrl: String? = null,
    val exitLatitude: Any? = null,
    val exitLongitude: Any? = null,
    val exitPhotoUploadedAt: String? = null,
    val reviewStatus: String? = null,
    val reviewNotes: String? = null,
    val reviewedAt: String? = null,
    val reviewedBy: String? = null,
    /** Cuándo envió la corrección de lo que se le devolvió. */
    val correctionSubmittedAt: String? = null,
)

data class TeamEvidenceReviewDto(
    val id: Long,
    /** APROBADA | DEVUELTA_PASOS | DEVUELTA_TODO */
    val decision: String? = null,
    val pasos: List<String>? = null,
    val observaciones: String? = null,
    val calificacion: Double? = null,
    val at: String? = null,
    val revisor: String? = null,
    /** Copia de lo devuelto (null en aprobaciones). */
    val snapshot: TeamEvidenceDto? = null,
)

data class TeamEvidencePasoDto(
    val nombre: String? = null,
    val at: String? = null,
)

data class TeamEvidenceMemberDto(
    val userId: Long,
    val nombre: String? = null,
    val puesto: String? = null,
    val avatarUrl: String? = null,
    val rol: String? = null,
    /** En despacho solo reparte (no sube evidencias). */
    val reparte: Boolean? = null,
    val asignadoAt: String? = null,
    val asignadoPor: String? = null,
    val retiradoAt: String? = null,
    val indicaciones: String? = null,
    val pasoA: List<TeamEvidencePasoDto>? = null,
    val progressPct: Double? = null,
    /** Puedo aprobarla o devolverla (ya la envió y soy su superior en la cadena). */
    val puedoRevisar: Boolean? = null,
    /** Pasos que le devolvieron y está corrigiendo. */
    val rejectedSteps: List<String>? = null,
    /** Eficiencia (1–5) de su última revisión. */
    val eficienciaScore: Double? = null,
    /** Más reciente primero. */
    val revisiones: List<TeamEvidenceReviewDto>? = null,
    val evidence: TeamEvidenceDto? = null,
    /** Salidas de la zona de 100 m alrededor de su punto de inicio (la más reciente primero). */
    val alertasZona: List<GeocercaAlertaDto>? = null,
)

// ── Geocerca de la actividad (GET activity-evidence/:id/geocerca) ───────────

data class GeocercaPuntoDto(
    val latitude: Double? = null,
    val longitude: Double? = null,
    val at: String? = null,
    val distanciaM: Int? = null,
)

data class GeocercaOrigenDto(
    val latitude: Double? = null,
    val longitude: Double? = null,
    val at: String? = null,
)

data class GeocercaAlertaDto(
    val id: Long,
    val detectedAt: String? = null,
    val returnedAt: String? = null,
    val distanciaM: Int? = null,
    val maxDistanciaM: Int? = null,
    val radioM: Int? = null,
    /** ABIERTA | JUSTIFICADA */
    val status: String? = null,
    /** Sigue fuera (no ha vuelto al radio). */
    val abierta: Boolean? = null,
    val justificacion: String? = null,
    val fotoUrl: String? = null,
    val justificadaAt: String? = null,
)

data class GeocercaDto(
    val activityId: Long? = null,
    val radioM: Int? = null,
    val origen: GeocercaOrigenDto? = null,
    val seguimientoActivo: Boolean? = null,
    val dentro: Boolean? = null,
    val ultimo: GeocercaPuntoDto? = null,
    val puntos: List<GeocercaPuntoDto>? = null,
    val alertas: List<GeocercaAlertaDto>? = null,
)

data class JustificarZonaRequest(
    val motivo: String,
    val fotoBase64: String? = null,
)

data class TeamEvidenceActivityDto(
    val id: Long? = null,
    val anNumber: String? = null,
    val titulo: String? = null,
    val estatus: String? = null,
    val coreKind: String? = null,
    val assignmentCharge: String? = null,
    val evidencePhotoRequired: Int? = null,
    val fechaFinalizacion: String? = null,
)

data class TeamEvidenceResumenDto(
    val ejecutores: Int? = null,
    val terminaron: Int? = null,
    val aprobadas: Int? = null,
    val porRevisarMias: Int? = null,
)

data class TeamEvidenceResponseDto(
    val activity: TeamEvidenceActivityDto? = null,
    /** todo: toda la cadena · equipo: de ti hacia abajo · propio: solo lo tuyo. */
    val alcance: String? = null,
    val creador: String? = null,
    val responsable: String? = null,
    /** No puedes revisar a nadie de lo que ves (p. ej. quien la creó). */
    val soloLectura: Boolean? = null,
    val resumen: TeamEvidenceResumenDto? = null,
    val members: List<TeamEvidenceMemberDto>? = null,
)

data class RevisarEvidenciaRequest(
    /** aprobar | devolver */
    val decision: String,
    val pasos: List<String>? = null,
    /** Devolver todo: rehace sus evidencias desde cero. */
    val todo: Boolean? = null,
    val observaciones: String,
    /** Eficiencia de 1 a 5. */
    val calificacion: Int,
)

// ── Flujo de captura de quien ejecuta (activity-evidence/:id) ───────────────

data class EvidenceFlowActivityDto(
    val id: Long? = null,
    val indicaciones: String? = null,
    val coreKind: String? = null,
    val evidencePhotoRequired: Int? = null,
    val responsableId: Long? = null,
    val estatus: String? = null,
)

/**
 * `GET activity-evidence/:id` y la fila que devuelven los POST de cada paso.
 * Los POST no traen `activity`: se conserva la del GET.
 */
data class EvidenceFlowDto(
    val id: Long? = null,
    val activityId: Long? = null,
    val userId: Long? = null,
    /** Paso actual: ENTRY_PHOTO … EXIT_PHOTO | COMPLETED. */
    val status: String? = null,
    /** APPROVED | REJECTED | null */
    val reviewStatus: String? = null,
    val rejectedStep: String? = null,
    val rejectedSteps: Any? = null,
    val reviewNotes: String? = null,
    val entryPhotoUrl: String? = null,
    val entryLatitude: Any? = null,
    val entryLongitude: Any? = null,
    val evidencePhotos: List<String>? = null,
    val evidencePhotosGeo: Any? = null,
    val serviceSheetPdfUrl: String? = null,
    val serviceSheetData: Any? = null,
    val exitPhotoUrl: String? = null,
    val exitLatitude: Any? = null,
    val exitLongitude: Any? = null,
    val completedAt: String? = null,
    val activity: EvidenceFlowActivityDto? = null,
    val assigneeIndicaciones: String? = null,
    val progressPct: Double? = null,
    val stepsForKind: List<String>? = null,
    /** Lo que dejó quien la tenía antes de que te la pasaran (solo lectura). Solo en el GET. */
    val avancesAnteriores: List<AvanceAnteriorDto>? = null,
)

/**
 * «Avance anterior de X»: evidencia parcial de quien dejó la actividad. Quien
 * continúa la ve pero toma su propia foto de entrada y de salida.
 */
data class AvanceAnteriorDto(
    val userId: Long? = null,
    val nombre: String? = null,
    val titulo: String? = null,
    val motivo: String? = null,
    val reasignadaAt: String? = null,
    /** Quién la movió (el superior). */
    val movidaPor: String? = null,
    val progressPct: Double? = null,
    val evidence: TeamEvidenceDto? = null,
)

data class EvidencePhotoGeoRequest(
    val latitude: Double,
    val longitude: Double,
    val capturedAt: String,
)

/** Cada foto viaja con la ubicación donde se tomó (null si no hubo GPS). */
data class EvidencePhotosWithGeoRequest(
    val photoUrls: List<String>,
    val photoGeo: List<EvidencePhotoGeoRequest?>,
)

/** Corrección de un paso devuelto: mismo payload que el paso original. */
data class EvidenceResubmitRequest(
    val step: String,
    val data: Any,
)

/** `SERVICE_SHEET_DATA` en corrección va envuelto: `{ formData }`. */
data class EvidenceFormDataWrapper(
    val formData: Map<String, String>,
)

// ── Alta de actividad (Core) ────────────────────────────────────────────────

/** `POST activities/:id/team` — sumar a alguien al equipo de la actividad. */
data class AddTeamMemberRequest(
    val userId: Long,
    /** LEAD | TECNICO | APOYO */
    val rol: String,
    val indicaciones: String? = null,
    /** Tiempo estimado en horas (contrato B); el API viejo lo ignora. */
    val horasPlan: Double? = null,
)

/** Cliente del padrón (`GET ventas/clientes?sector=`). */
data class SalesClientOwnerDto(
    val id: Long? = null,
    val nombre: String? = null,
    val email: String? = null,
)

data class SalesClientDto(
    val id: Long,
    val name: String? = null,
    val legalName: String? = null,
    val taxId: String? = null,
    val fiscalAddress: String? = null,
    val fiscalZipCode: String? = null,
    val fiscalRegime: String? = null,
    val billingEmail: String? = null,
    val billingPhone: String? = null,
    val notes: String? = null,
    val status: String? = null,
    /** Puente al cliente de servicio: es el id que usan actividades y proyectos. */
    val serviceClientId: Long? = null,
    /** `[{sector}]` o `["PROYECTO"]`: se lee con [sectorNames]. */
    val sectors: List<Any?>? = null,
    val owner: SalesClientOwnerDto? = null,
) {
    val sectorNames: List<String>
        get() = sectors.orEmpty().mapNotNull { s ->
            when (s) {
                is String -> s
                is Map<*, *> -> s["sector"]?.toString()
                else -> null
            }
        }
}

// ── Celebraciones del día (GET me/celebraciones/hoy) ────────────────────────

/** Cumpleaños o aniversario de ingreso. La edad nunca viaja: `anios` solo en aniversarios. */
data class CelebracionDto(
    val userId: Long? = null,
    val nombre: String? = null,
    val avatarUrl: String? = null,
    /** cumpleanos | aniversario */
    val tipo: String? = null,
    val anios: Int? = null,
    /** Es quien pregunta: el aviso lo felicita a él. */
    val soyYo: Boolean? = null,
)

data class CelebracionesHoyDto(
    /** AAAA-MM-DD en la zona de la empresa. */
    val fecha: String? = null,
    val celebraciones: List<CelebracionDto>? = null,
)

interface CoreActivitiesApi {
    @GET("me/activities")
    suspend fun myActivities(): MyActivitiesResponseDto

    @GET("me/celebraciones/hoy")
    suspend fun celebracionesHoy(): CelebracionesHoyDto

    /** Asignar a otra persona (mismo cuerpo que `me/activities`). */
    @POST("activities")
    suspend fun createActivity(@Body body: CreateActivityRequest): ResponseBody

    @POST("activities/{id}/team")
    suspend fun addTeamMember(
        @Path("id") activityId: Long,
        @Body body: AddTeamMemberRequest,
    ): ResponseBody

    @GET("ventas/clientes")
    suspend fun salesClients(@retrofit2.http.Query("sector") sector: String): List<SalesClientDto>

    @GET("operational-projects")
    suspend fun operationalProjects(): List<OperationalProjectDto>

    /** AN sugerido del alta (`{ next }`). */
    @GET("activities/next-an")
    suspend fun nextAnNumber(): ResponseBody

    @PATCH("me/activities/order")
    suspend fun reorderMyActivities(@Body body: ReorderMyActivitiesRequest): MyActivitiesResponseDto

    /** Encargados de área: actividad a su propio nombre (mismo cuerpo que POST activities). */
    @POST("me/activities")
    suspend fun selfAssign(@Body body: CreateActivityRequest): ResponseBody

    /** Contrato B: quien la recibe acepta… */
    @POST("me/activities/{id}/aceptar")
    suspend fun aceptarActividad(@Path("id") activityId: Long): ResponseBody

    /** …o la rechaza con motivo; sigue asignada hasta que un superior la mueva. */
    @POST("me/activities/{id}/rechazar")
    suspend fun rechazarActividad(
        @Path("id") activityId: Long,
        @Body body: RechazarActividadRequest,
    ): ResponseBody

    @POST("me/activities/{id}/despacho")
    suspend fun dispatch(
        @Path("id") activityId: Long,
        @Body body: DispatchMyActivityRequest,
    ): ResponseBody

    @PATCH("me/activities/{id}/reprogramar")
    suspend fun reprogramar(
        @Path("id") activityId: Long,
        @Body body: ReprogramarDespachoRequest,
    ): ResponseBody

    @GET("me/board")
    suspend fun board(): TeamBoardResponseDto

    @GET("me/board/{userId}")
    suspend fun boardUser(@Path("userId") userId: Long): TeamBoardUserDto

    @GET("me/board/{userId}/history")
    suspend fun boardUserHistory(@Path("userId") userId: Long): List<TeamBoardHistoryItemDto>

    @GET("me/activities/{id}/evidencias")
    suspend fun teamEvidence(@Path("id") activityId: Long): TeamEvidenceResponseDto

    @POST("me/activities/{id}/evidencias/{userId}/revision")
    suspend fun reviewTeamEvidence(
        @Path("id") activityId: Long,
        @Path("userId") userId: Long,
        @Body body: RevisarEvidenciaRequest,
    ): TeamEvidenceResponseDto

    @GET("activity-evidence/{id}")
    suspend fun evidenceFlow(@Path("id") activityId: Long): EvidenceFlowDto

    @POST("activity-evidence/{id}/entry-photo")
    suspend fun entryPhoto(
        @Path("id") activityId: Long,
        @Body body: ActivityEvidencePhotoStepRequest,
    ): EvidenceFlowDto

    @POST("activity-evidence/{id}/evidence-photos")
    suspend fun evidencePhotos(
        @Path("id") activityId: Long,
        @Body body: EvidencePhotosWithGeoRequest,
    ): EvidenceFlowDto

    @POST("activity-evidence/{id}/service-sheet-pdf")
    suspend fun serviceSheetPdf(
        @Path("id") activityId: Long,
        @Body body: ActivityEvidencePdfStepRequest,
    ): EvidenceFlowDto

    /** El cuerpo ES el formulario (claves según coreKind). */
    @POST("activity-evidence/{id}/service-sheet-data")
    suspend fun serviceSheetData(
        @Path("id") activityId: Long,
        @Body body: Any,
    ): EvidenceFlowDto

    @GET("activity-evidence/{id}/geocerca")
    suspend fun geocerca(@Path("id") activityId: Long): GeocercaDto

    @POST("activity-evidence/{id}/geocerca/alertas/{alertId}/justificacion")
    suspend fun justificarZona(
        @Path("id") activityId: Long,
        @Path("alertId") alertId: Long,
        @Body body: JustificarZonaRequest,
    ): GeocercaAlertaDto

    @POST("activity-evidence/{id}/exit-photo")
    suspend fun exitPhoto(
        @Path("id") activityId: Long,
        @Body body: ActivityEvidencePhotoStepRequest,
    ): EvidenceFlowDto

    @POST("activity-evidence/{id}/resubmit")
    suspend fun resubmit(
        @Path("id") activityId: Long,
        @Body body: EvidenceResubmitRequest,
    ): EvidenceFlowDto
}
