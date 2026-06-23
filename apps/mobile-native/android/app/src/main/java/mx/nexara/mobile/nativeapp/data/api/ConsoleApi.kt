package mx.nexara.mobile.nativeapp.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

data class ViaticDto(
    val id: Long,
    val usuarioId: Long? = null,
    val montoSolicitado: Double? = null,
    val estatusPago: String? = null,
    val razonGasto: String? = null,
    val createdAt: String? = null,
    val usuario: SimpleUserDto? = null,
    val actividad: ActivityShortDto? = null,
    val ticketEvidenciaUrl: String? = null,
)

data class ActivityShortDto(
    val anNumber: String,
)

data class ActivityDto(
    val id: Long,
    val estatus: String,
    val titulo: String? = null,
    val fechaAsignacion: String? = null,
    val fechaInicio: String? = null,
    val fechaFinalizacion: String? = null,
    val creador: SimpleUserDto? = null,
    val responsableId: Long? = null,
    val responsable: SimpleUserDto? = null,
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

data class AttendanceEventDto(
    val type: String,
    val timestamp: String,
)

data class AttendanceRangeUserDto(
    val userId: Long,
    val userName: String? = null,
    val totalMinutes: Int? = null,
    val days: List<AttendanceDayDto>? = null,
    val attendances: List<AttendanceEventDto>? = null,
)

data class AttendanceRangeDto(
    val rangeStart: String? = null,
    val rangeEnd: String? = null,
    val totalMinutesAll: Int? = null,
    val totalUsers: Int? = null,
    val users: List<AttendanceRangeUserDto>? = null,
)

data class AttendanceCurrentDto(
    val id: Long? = null,
    val userId: Long? = null,
    val date: String? = null,
    val checkIn: String? = null,
    val checkOut: String? = null,
    val totalMinutes: Int? = null,
    val isOpen: Boolean? = null,
)

data class AttendanceRegisterRequest(
    val type: String, // "entrada" | "salida"
    val timestamp: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
)

data class AttendanceRegisterResponse(
    val id: Long? = null,
    val type: String? = null,
    val timestamp: String? = null,
    val message: String? = null,
)

/**
 * Endpoints usados por Console/Dashboard en apps/mobile.
 * BaseURL ya incluye /api.
 */
interface ConsoleApi {
    @GET("viatics")
    suspend fun getViatics(): List<ViaticDto>

    @GET("activities")
    suspend fun getActivities(
        @Query("scope") scope: String? = null,
    ): List<ActivityDto>

    @GET("users/assignable")
    suspend fun getAssignableUsers(): List<VisibleUserDto>

    @GET("users")
    suspend fun getUsers(): List<VisibleUserDto>

    @GET("attendance/hierarchy/range")
    suspend fun getAttendanceHierarchyRange(
        @Query("from") from: String,
        @Query("to") to: String,
    ): AttendanceRangeDto

    @GET("attendance/range")
    suspend fun getAttendanceRange(
        @Query("from") from: String,
        @Query("to") to: String,
    ): AttendanceRangeDto

    @GET("attendance/current")
    suspend fun getAttendanceCurrent(): AttendanceCurrentDto

    @GET("attendance/day")
    suspend fun getAttendanceDay(
        @Query("date") date: String? = null,
    ): AttendanceDayDto

    @retrofit2.http.POST("attendance")
    suspend fun postAttendance(
        @retrofit2.http.Body body: AttendanceRegisterRequest,
    ): AttendanceRegisterResponse

    // ── Evidences (Activity Evidence) ─────────────────────────────────────────

    @GET("activity-evidence/history")
    suspend fun getMyEvidenceHistory(): List<ActivityEvidenceRowDto>

    @GET("activity-evidence/review-history")
    suspend fun getEvidenceReviewHistory(): List<ActivityEvidenceRowDto>

    @GET("activity-evidence/history/report")
    suspend fun getMyEvidenceHistoryReport(
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
    ): okhttp3.ResponseBody

    @GET("activity-evidence/{activityId}/report")
    suspend fun getMyTicketReport(
        @retrofit2.http.Path("activityId") activityId: Long,
    ): okhttp3.ResponseBody

    @GET("activity-evidence/{activityId}")
    suspend fun getActivityEvidence(
        @retrofit2.http.Path("activityId") activityId: Long,
    ): ActivityEvidenceDetailDto

    @retrofit2.http.POST("activity-evidence/{activityId}/entry-photo")
    suspend fun postEvidenceEntryPhoto(
        @retrofit2.http.Path("activityId") activityId: Long,
        @retrofit2.http.Body body: ActivityEvidencePhotoStepRequest,
    ): ActivityEvidenceDetailDto

    @retrofit2.http.POST("activity-evidence/{activityId}/evidence-photos")
    suspend fun postEvidencePhotos(
        @retrofit2.http.Path("activityId") activityId: Long,
        @retrofit2.http.Body body: ActivityEvidencePhotosStepRequest,
    ): ActivityEvidenceDetailDto

    @retrofit2.http.POST("activity-evidence/{activityId}/service-sheet-pdf")
    suspend fun postEvidenceServiceSheetPdf(
        @retrofit2.http.Path("activityId") activityId: Long,
        @retrofit2.http.Body body: ActivityEvidencePdfStepRequest,
    ): ActivityEvidenceDetailDto

    @retrofit2.http.POST("activity-evidence/{activityId}/service-sheet-data")
    suspend fun postEvidenceServiceSheetData(
        @retrofit2.http.Path("activityId") activityId: Long,
        @retrofit2.http.Body body: Any,
    ): ActivityEvidenceDetailDto

    @retrofit2.http.POST("activity-evidence/{activityId}/exit-photo")
    suspend fun postEvidenceExitPhoto(
        @retrofit2.http.Path("activityId") activityId: Long,
        @retrofit2.http.Body body: ActivityEvidencePhotoStepRequest,
    ): ActivityEvidenceDetailDto

    @GET("activities/{activityId}/report")
    suspend fun getAdminTicketReport(
        @retrofit2.http.Path("activityId") activityId: Long,
    ): okhttp3.ResponseBody

    @retrofit2.http.POST("activity-evidence/{activityId}/approve")
    suspend fun approveEvidence(
        @retrofit2.http.Path("activityId") activityId: Long,
        @retrofit2.http.Body body: EvidenceReviewRequest,
    ): okhttp3.ResponseBody

    @retrofit2.http.POST("activity-evidence/{activityId}/reject")
    suspend fun rejectEvidence(
        @retrofit2.http.Path("activityId") activityId: Long,
        @retrofit2.http.Body body: EvidenceRejectRequest,
    ): okhttp3.ResponseBody

    // ── Vehicles ─────────────────────────────────────────────────────────────

    @GET("vehicles")
    suspend fun getVehicleControls(): List<VehicleControlDto>

    @GET("vehicles/inventory")
    suspend fun getVehicleInventory(): List<VehicleAssetDto>

    // ── GPS ─────────────────────────────────────────────────────────────────

    @GET("gps/me")
    suspend fun getGpsMe(): GpsMeResponse

    @GET("gps/team")
    suspend fun getGpsTeam(): List<GpsLocationDto>

    @retrofit2.http.POST("gps")
    suspend fun postGpsLocation(
        @retrofit2.http.Body body: PostGpsLocationRequest,
    ): okhttp3.ResponseBody

    // ── Tools ────────────────────────────────────────────────────────────────

    @GET("tool-requests/my-requests")
    suspend fun getMyToolRequests(): List<ToolRequestDto>

    @GET("tool-requests")
    suspend fun getToolRequests(
        @Query("status") status: String? = null,
    ): List<ToolRequestDto>

    @retrofit2.http.POST("tool-requests/{requestId}/renewal-request")
    suspend fun postToolRenewalRequest(
        @retrofit2.http.Path("requestId") requestId: Long,
        @retrofit2.http.Body body: ToolRenewalRequest,
    ): okhttp3.ResponseBody

    @GET("tool-requests/inventory")
    suspend fun getToolInventory(
        @Query("q") q: String? = null,
        @Query("includeRetired") includeRetired: String? = null,
    ): List<ToolInventoryItemDto>

    @GET("tool-requests/inventory/search")
    suspend fun searchToolInventory(
        @Query("q") q: String,
    ): List<ToolInventorySearchOptionDto>

    @GET("tool-requests/kits/my")
    suspend fun getMyToolKit(): List<ToolKitAssignmentDto>

    @GET("tool-requests/kits/users")
    suspend fun getToolKitsUsers(): List<ToolKitUserRowDto>

    @retrofit2.http.POST("tool-requests/kits/{assignmentId}/report")
    suspend fun reportToolKitIncident(
        @retrofit2.http.Path("assignmentId") assignmentId: Long,
        @retrofit2.http.Body body: ToolKitIncidentRequest,
    ): okhttp3.ResponseBody

    @retrofit2.http.POST("tool-requests/kits/events/{eventId}/resolve")
    suspend fun resolveToolKitEvent(
        @retrofit2.http.Path("eventId") eventId: Long,
        @retrofit2.http.Body body: ToolKitResolveRequest,
    ): okhttp3.ResponseBody

    @retrofit2.http.POST("tool-requests/kits/assign")
    suspend fun assignToolKit(
        @retrofit2.http.Body body: ToolKitAssignRequest,
    ): okhttp3.ResponseBody

    @GET("tool-requests/renewals/pending")
    suspend fun getToolRenewalsPending(): List<ToolRenewalDto>

    @retrofit2.http.POST("tool-requests/renewals/{renewalId}/approve")
    suspend fun approveToolRenewal(
        @retrofit2.http.Path("renewalId") renewalId: Long,
    ): okhttp3.ResponseBody

    @retrofit2.http.POST("tool-requests/renewals/{renewalId}/reject")
    suspend fun rejectToolRenewal(
        @retrofit2.http.Path("renewalId") renewalId: Long,
        @retrofit2.http.Body body: ToolRenewalRejectRequest,
    ): okhttp3.ResponseBody

    // ── Clients / Service Clients / Tickets ─────────────────────────────────

    @GET("service-clients")
    suspend fun getServiceClients(): List<ServiceClientDto>

    @GET("service-clients/{id}/report")
    suspend fun getServiceClientReport(
        @Path("id") clientId: Long,
    ): okhttp3.ResponseBody

    @Multipart
    @retrofit2.http.POST("service-clients")
    suspend fun createServiceClient(
        @Part("name") name: RequestBody,
        @Part("contactName") contactName: RequestBody?,
        @Part("contactEmail") contactEmail: RequestBody?,
        @Part("contactPhone") contactPhone: RequestBody?,
        @Part("address") address: RequestBody?,
        @Part("city") city: RequestBody?,
        @Part("state") state: RequestBody?,
        @Part("country") country: RequestBody?,
        @Part("accountCode") accountCode: RequestBody?,
        @Part("portalEmail") portalEmail: RequestBody?,
        @Part("portalPassword") portalPassword: RequestBody?,
        @Part("isActive") isActive: RequestBody,
        @Part logo: MultipartBody.Part?,
    ): CreateServiceClientResponse

    @Multipart
    @retrofit2.http.PUT("service-clients/{id}")
    suspend fun updateServiceClientMultipart(
        @Path("id") clientId: Long,
        @Part("name") name: RequestBody,
        @Part("contactName") contactName: RequestBody?,
        @Part("contactEmail") contactEmail: RequestBody?,
        @Part("contactPhone") contactPhone: RequestBody?,
        @Part("address") address: RequestBody?,
        @Part("city") city: RequestBody?,
        @Part("state") state: RequestBody?,
        @Part("country") country: RequestBody?,
        @Part("accountCode") accountCode: RequestBody?,
        @Part("portalEmail") portalEmail: RequestBody?,
        @Part("portalPassword") portalPassword: RequestBody?,
        @Part("isActive") isActive: RequestBody,
        @Part logo: MultipartBody.Part?,
    ): ServiceClientDto

    @retrofit2.http.PUT("service-clients/{id}")
    suspend fun updateServiceClientJson(
        @Path("id") clientId: Long,
        @retrofit2.http.Body body: UpdateServiceClientRequest,
    ): ServiceClientDto

    @GET("activities/detailed")
    suspend fun getActivitiesDetailed(): List<ActivityDetailedDto>

    @GET("inventories")
    suspend fun getInventories(): List<InventorySnapshotDto>

    @GET("inventories/{id}/report")
    suspend fun getInventoryReport(
        @Path("id") inventoryId: Long,
    ): okhttp3.ResponseBody

    @PATCH("inventories/{id}/status")
    suspend fun patchInventoryStatus(
        @Path("id") inventoryId: Long,
        @retrofit2.http.Body body: InventoryStatusPatchRequest,
    ): InventorySnapshotDto

    // ── Operational projects ────────────────────────────────────────────────

    @GET("operational-projects")
    suspend fun getOperationalProjects(): List<OperationalProjectDto>

    @retrofit2.http.POST("operational-projects")
    suspend fun createOperationalProject(
        @retrofit2.http.Body body: CreateOperationalProjectRequest,
    ): OperationalProjectDto

    @PATCH("operational-projects/{id}/status")
    suspend fun patchOperationalProjectStatus(
        @Path("id") projectId: Long,
        @retrofit2.http.Body body: OperationalProjectStatusPatchRequest,
    ): OperationalProjectDto

    @retrofit2.http.POST("operational-projects/{id}/engineers")
    suspend fun addOperationalProjectEngineer(
        @Path("id") projectId: Long,
        @retrofit2.http.Body body: OperationalProjectEngineerAddRequest,
    ): okhttp3.ResponseBody

    @retrofit2.http.DELETE("operational-projects/{id}/engineers/{engineerId}")
    suspend fun removeOperationalProjectEngineer(
        @Path("id") projectId: Long,
        @Path("engineerId") engineerId: Long,
    ): okhttp3.ResponseBody

    // ── System settings (console.admin) ─────────────────────────────────────

    @GET("settings")
    suspend fun getSettings(): List<SystemSettingDto>

    @retrofit2.http.PUT("settings")
    suspend fun upsertSetting(
        @retrofit2.http.Body body: UpsertSettingBody,
    ): SystemSettingDto

    @retrofit2.http.DELETE("settings/{key}")
    suspend fun deleteSetting(
        @Path("key") key: String,
    ): okhttp3.ResponseBody
}

data class CreateOperationalProjectRequest(
    val title: String,
    val description: String? = null,
    val vendorId: Long,
    val clientId: Long,
    val startDate: String,
    val endDate: String? = null,
)

data class OperationalProjectStatusPatchRequest(
    val status: String, // ACTIVE | ON_HOLD | COMPLETED
)

data class OperationalProjectEngineerAddRequest(
    val engineerId: Long,
)

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

data class CreateServiceClientResponse(
    val client: ServiceClientDto? = null,
    val credentials: PortalCredentialsDto? = null,
)

data class PortalCredentialsDto(
    val email: String? = null,
    val password: String? = null,
)

data class UpdateServiceClientRequest(
    val name: String,
    val contactName: String? = null,
    val contactEmail: String? = null,
    val contactPhone: String? = null,
    val address: String? = null,
    val city: String? = null,
    val state: String? = null,
    val country: String? = null,
    val accountCode: String? = null,
    val portalEmail: String? = null,
    val portalPassword: String? = null,
    val isActive: Boolean = true,
)

data class ActivityDetailedDto(
    val id: Long,
    val anNumber: String? = null,
    val titulo: String? = null,
    val estatus: String? = null,
    val prioridad: String? = null,
    val ticketType: String? = null,
    val fechaAsignacion: String? = null,
    val fechaInicio: String? = null,
    val fechaFinalizacion: String? = null,
    val branchName: String? = null,
    val branchCity: String? = null,
    val branchState: String? = null,
    val responsable: SimpleUserDto? = null,
    val evidencias: List<ActivityTicketEvidenceDto>? = null,
    val serviceSheet: ServiceSheetDto? = null,
    val client: ActivityClientRefDto? = null,
    val clientFeedback: ClientFeedbackDto? = null,
)

data class ActivityClientRefDto(
    val id: Long,
    val name: String? = null,
    val logoUrl: String? = null,
)

data class ActivityTicketEvidenceDto(
    val id: Long,
    val archivoUrl: String,
    val tipoEvidencia: String? = null,
    val calificacionEficiencia: String? = null,
    val latitud: Double? = null,
    val longitud: Double? = null,
)

data class ServiceSheetDto(
    val pdfUrl: String? = null,
)

data class ClientFeedbackDto(
    val rating: Int? = null,
    val wasOnTime: Boolean? = null,
    val wasFriendly: Boolean? = null,
    val wasSolved: Boolean? = null,
    val comments: String? = null,
    val createdAt: String? = null,
)

data class InventorySnapshotDto(
    val id: Long,
    val status: String? = null,
    val previousCount: Int? = null,
    val currentCount: Int? = null,
    val deltaCount: Int? = null,
    val updatedAt: String? = null,
    val branch: InventoryBranchRefDto? = null,
    val client: InventoryClientRefDto? = null,
    val activity: InventoryActivityRefDto? = null,
)

data class InventoryBranchRefDto(
    val id: Long? = null,
    val name: String? = null,
    val branchNumber: String? = null,
)

data class InventoryClientRefDto(
    val id: Long? = null,
    val name: String? = null,
)

data class InventoryActivityRefDto(
    val id: Long? = null,
    val anNumber: String? = null,
    val titulo: String? = null,
    val workType: String? = null,
)

data class InventoryStatusPatchRequest(
    val status: String,
)

data class EvidenceReviewRequest(
    val reviewerId: Long,
    val notes: String? = null,
)

data class EvidenceRejectRequest(
    val reviewerId: Long,
    val rejectedStep: String = "EVIDENCE_PHOTOS",
    val notes: String,
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

data class ActivityEvidenceRowDto(
    val id: Long,
    val tipoEvidencia: String? = null,
    val archivoUrl: String? = null,
    val archivos: Any? = null,
    val aprobada: Boolean? = null,
    val estatus: String? = null,
    val comentarios: String? = null,
    val observacionesRevision: String? = null,
    val calificacionEficiencia: String? = null,
    val fechaEvidencia: String? = null,
    val revisadoEn: String? = null,
    val latitud: Double? = null,
    val longitud: Double? = null,
    val entryPhotoUrl: String? = null,
    val entryPhotoUploadedAt: String? = null,
    val entryLatitude: Double? = null,
    val entryLongitude: Double? = null,
    val evidencePhotos: List<String>? = null,
    val evidencePhotosUploadedAt: String? = null,
    val serviceSheetPdfUrl: String? = null,
    val serviceSheetUploadedAt: String? = null,
    val serviceSheetData: Any? = null,
    val serviceSheetCompletedAt: String? = null,
    val exitPhotoUrl: String? = null,
    val exitPhotoUploadedAt: String? = null,
    val exitLatitude: Double? = null,
    val exitLongitude: Double? = null,
    val completedAt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val actividad: ActivityEvidenceActivityDto? = null,
    val user: SimpleUserDto? = null,
    val aprobadoPor: SimpleUserDto? = null,
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

data class ActivityEvidencePhotosStepRequest(
    val photoUrls: List<String>,
)

data class ActivityEvidencePdfStepRequest(
    val pdfUrl: String,
)

data class VehicleControlDto(
    val id: Long,
    val nombreVehiculo: String? = null,
    val placasVehiculo: String? = null,
    val estatusAprobacion: String,
    val fechaSolicitud: String? = null,
    val fechaInicioSolicitada: String? = null,
    val fechaFinSolicitada: String? = null,
    val fechaInicioAprobada: String? = null,
    val fechaFinAprobada: String? = null,
    val solicitante: SimpleUserDto? = null,
    val evidenciaEntregaUrl: String? = null,
    val evidenciaDevolucionUrl: String? = null,
    val entregaFotos: List<String>? = null,
    val entregaEstatus: String? = null,
    val entregaObservaciones: String? = null,
    val entregaAprobada: Boolean? = null,
    val renovacionEstatus: String? = null,
    val renovacionSolicitadaInicio: String? = null,
    val renovacionSolicitadaFin: String? = null,
    val penalizacionMonto: Double? = null,
    val penalizacionNotas: String? = null,
    val vehiculo: VehicleAssetDto? = null,
    val fechaInicio: String? = null,
    val fechaFin: String? = null,
)

data class VehicleAssetDto(
    val id: Long,
    val nombre: String,
    val placas: String? = null,
    val estatus: String? = null,
    val activo: Boolean? = null,
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
)

data class ToolUserRefDto(
    val nombre: String,
    val email: String? = null,
)

data class ToolApproverDto(
    val nombre: String,
)

data class ToolRequestDto(
    val id: Long,
    val requestedBy: ToolUserRefDto? = null,
    val toolName: String,
    val model: String,
    val serialNumber: String,
    val reason: String,
    val startDate: String,
    val expectedReturnDate: String,
    val status: String,
    val requestDate: String,
    val approvalDate: String? = null,
    val approvedBy: ToolApproverDto? = null,
    val returnDate: String? = null,
    val renewalCount: Int? = null,
)

data class ToolRenewalRequest(
    val newReturnDate: String,
    val renewalReason: String? = null,
)

data class ToolInventoryItemDto(
    val id: Long,
    val toolName: String,
    val model: String,
    val serialNumber: String,
    val panoramicPhotoUrl: String? = null,
    val serialPhotoUrl: String? = null,
    val status: String,
)

data class ToolInventorySearchOptionDto(
    val id: Long,
    val toolName: String,
    val model: String,
    val serialNumber: String,
    val status: String? = null,
)

data class ToolKitEventDto(
    val id: Long,
    val description: String,
    val resolution: String,
    val reportedAt: String,
)

data class ToolKitInventoryItemDto(
    val id: Long,
    val toolName: String,
    val model: String,
    val serialNumber: String,
    val status: String,
)

data class ToolKitAssignmentDto(
    val id: Long,
    val assignmentType: String,
    val assignedAt: String,
    val dueReturnDate: String? = null,
    val replacementCount: Int? = null,
    val inventoryItem: ToolKitInventoryItemDto,
    val events: List<ToolKitEventDto> = emptyList(),
)

data class ToolKitUserDto(
    val id: Long,
    val nombre: String,
    val email: String,
)

data class ToolKitUserRowDto(
    val id: Long,
    val assignmentType: String,
    val isActive: Boolean? = null,
    val assignedAt: String,
    val dueReturnDate: String? = null,
    val replacementCount: Int? = null,
    val user: ToolKitUserDto,
    val inventoryItem: ToolKitInventoryItemDto,
    val events: List<ToolKitEventDto>? = null,
)

data class ToolKitIncidentRequest(
    val description: String,
)

data class ToolKitResolveRequest(
    val resolution: String,
    val notes: String? = null,
    val fineAmount: Double? = null,
)

data class ToolKitAssignRequest(
    val userId: Long,
    val inventoryItemId: Long,
    val assignmentType: String, // KIT | LOAN
)

data class ToolRenewalUserDto(
    val id: Long,
    val nombre: String,
    val email: String,
)

data class ToolRenewalToolRequestDto(
    val id: Long,
    val toolName: String,
    val usuario: ToolRenewalUserDto,
)

data class ToolRenewalDto(
    val id: Long,
    val toolRequestId: Long,
    val previousReturnDate: String,
    val newReturnDate: String,
    val renewalReason: String? = null,
    val status: String,
    val requestDate: String,
    val approvalDate: String? = null,
    val toolRequest: ToolRenewalToolRequestDto,
)

data class ToolRenewalRejectRequest(
    val reason: String,
)

data class SystemSettingDto(
    val id: Int,
    val key: String,
    val value: String,
    val category: String,
    val label: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

data class UpsertSettingBody(
    val key: String,
    val value: String,
    val category: String,
    val label: String? = null,
)

