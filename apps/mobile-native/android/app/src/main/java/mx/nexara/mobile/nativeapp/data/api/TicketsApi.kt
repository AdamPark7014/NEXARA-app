package mx.nexara.mobile.nativeapp.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PUT
import retrofit2.http.Body
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.POST
import retrofit2.http.Query

data class ClientBranchDto(
    val id: Long,
    val name: String,
    val branchNumber: String? = null,
    val address: String? = null,
    val city: String? = null,
    val state: String? = null,
    val country: String? = null,
    val placeId: String? = null,
    val latitud: Double? = null,
    val longitud: Double? = null,
    val portalEmail: String? = null,
    val logoUrl: String? = null,
    val isActive: Boolean? = null,
)

data class ClientProfileDto(
    val id: Long,
    val name: String,
    val logoUrl: String? = null,
    val contactName: String? = null,
    val contactEmail: String? = null,
    val contactPhone: String? = null,
    val address: String? = null,
    val city: String? = null,
    val state: String? = null,
    val country: String? = null,
    val branches: List<ClientBranchDto> = emptyList(),
)

data class ClientProfileUpdateBody(
    val contactName: String? = null,
    val contactEmail: String? = null,
    val contactPhone: String? = null,
    val address: String? = null,
    val city: String? = null,
    val state: String? = null,
    val country: String? = null,
)

data class ClientTicketRequestDto(
    val id: Long,
    val description: String,
    val urgency: String? = null,
    val status: String? = null,
    val requestType: String? = null,
    val dueAt: String? = null,
    val branchName: String? = null,
    val branchNumber: String? = null,
    val address: String? = null,
    val city: String? = null,
    val state: String? = null,
    val country: String? = null,
    val placeId: String? = null,
    val latitud: Double? = null,
    val longitud: Double? = null,
    val createdAt: String? = null,
)

data class CreateClientTicketRequestBody(
    val description: String,
    val urgency: String? = null, // LOW | MEDIUM | HIGH
    val requestType: String? = null, // ISSUE | PREVENTIVE_INVENTORY
    val dueAt: String? = null,
    val branchId: Long? = null,
    val branchName: String? = null,
    val branchNumber: String? = null,
    val address: String? = null,
    val city: String? = null,
    val state: String? = null,
    val country: String? = null,
    val placeId: String? = null,
    val latitud: Double? = null,
    val longitud: Double? = null,
)

data class ClientPortalTicketDto(
    val id: Long,
    val anNumber: String? = null,
    val titulo: String? = null,
    val estatus: String? = null,
    val prioridad: String? = null,
    val urgency: String? = null,
    val ticketType: String? = null,
    val fechaAsignacion: String? = null,
    val fechaInicio: String? = null,
    val fechaFinalizacion: String? = null,
    val dueAt: String? = null,
    val slaDueAt: String? = null,
    val branchName: String? = null,
    val branchCity: String? = null,
    val branchState: String? = null,
    val responsable: Any? = null,
    val evidencias: Any? = null,
    val serviceSheet: Any? = null,
    val activityEvidence: Any? = null,
) {
    fun displayPriority(): String = prioridad ?: urgency ?: "—"

    fun isOpen(): Boolean {
        val s = (estatus ?: "").lowercase()
        return !s.contains("finaliz") && !s.contains("cerrad") && !s.contains("complet") && !s.contains("cancel")
    }

    fun isHighPriority(): Boolean {
        val p = displayPriority().lowercase()
        return p.contains("alta") || p.contains("high") || p.contains("urgent") || p == "high"
    }
}

data class PendingFeedbackTicketDto(
    val id: Long,
    val anNumber: String? = null,
    val titulo: String? = null,
    val fechaFinalizacion: String? = null,
    val responsable: Any? = null,
)

data class CreateFeedbackBody(
    val activityId: Long,
    val rating: Int? = null,
    val wasOnTime: String? = null,
    val wasFriendly: String? = null,
    val wasSolved: String? = null,
    val comments: String? = null,
)

data class ClientPortalInventoryBranchRefDto(
    val id: Long? = null,
    val name: String? = null,
    val branchNumber: String? = null,
)

data class ClientPortalInventorySnapshotRefActivityDto(
    val id: Long? = null,
    val anNumber: String? = null,
    val titulo: String? = null,
    val workType: String? = null,
    val estatus: String? = null,
)

data class ClientPortalInventorySnapshotRefRequestDto(
    val id: Long? = null,
    val requestType: String? = null,
    val status: String? = null,
)

data class ClientPortalInventoryItemDto(
    val id: Long? = null,
    val groupName: String? = null,
    val itemName: String? = null,
    val brand: String? = null,
    val modelBefore: String? = null,
    val modelAfter: String? = null,
    val serialNumber: String? = null,
    val beforePanoramicPhotoUrl: String? = null,
    val beforeCloseupPhotoUrl: String? = null,
    val afterPanoramicPhotoUrl: String? = null,
    val afterCloseupPhotoUrl: String? = null,
    val maintenanceStickerPhotoUrl: String? = null,
    val maintenanceActions: String? = null,
    val maintenanceComments: String? = null,
    val itemStatus: String? = null,
    val compareState: String? = null,
    val notes: String? = null,
    val sortOrder: Int? = null,
)

data class ClientPortalInventorySnapshotDto(
    val id: Long,
    val title: String? = null,
    val notes: String? = null,
    val status: String? = null,
    val previousCount: Int? = null,
    val currentCount: Int? = null,
    val deltaCount: Int? = null,
    val createdByType: String? = null,
    val createdById: Long? = null,
    val reportUrl: String? = null,
    val approvedAt: String? = null,
    val completedAt: String? = null,
    val updatedAt: String? = null,
    val createdAt: String? = null,
    val branch: ClientPortalInventoryBranchRefDto? = null,
    val activity: ClientPortalInventorySnapshotRefActivityDto? = null,
    val request: ClientPortalInventorySnapshotRefRequestDto? = null,
    val items: List<ClientPortalInventoryItemDto>? = null,
)

data class SyncInventoryInputDto(
    val branchId: Long,
    val snapshotId: Long? = null,
    val title: String? = null,
    val notes: String? = null,
    val completed: Boolean? = null,
    val confirmDifference: Boolean? = null,
    val items: List<ClientPortalInventoryItemDto>? = null,
)

data class DecideInventoryBody(
    val decision: String,
)

data class UploadUrlsResponse(
    val urls: List<String> = emptyList(),
)

/**
 * Endpoints para el portal de Tickets (cliente/sucursal).
 * BaseURL ya incluye /api.
 */
interface TicketsApi {
    @GET("client-portal/profile")
    suspend fun getProfile(): ClientProfileDto?

    @PUT("client-portal/profile")
    suspend fun updateProfile(
        @Body body: ClientProfileUpdateBody,
    ): ClientProfileDto

    @GET("client-portal/branches")
    suspend fun getBranches(): List<ClientBranchDto>

    @Multipart
    @POST("client-portal/branches")
    suspend fun createBranch(
        @Part("name") name: RequestBody,
        @Part("branchNumber") branchNumber: RequestBody,
        @Part("address") address: RequestBody?,
        @Part("city") city: RequestBody?,
        @Part("state") state: RequestBody?,
        @Part("country") country: RequestBody?,
        @Part("placeId") placeId: RequestBody?,
        @Part("latitud") latitud: RequestBody?,
        @Part("longitud") longitud: RequestBody?,
        @Part("portalEmail") portalEmail: RequestBody,
        @Part("portalPassword") portalPassword: RequestBody,
        @Part("isActive") isActive: RequestBody?,
        @Part logo: MultipartBody.Part?,
    ): ClientBranchDto

    @Multipart
    @PUT("client-portal/branches/{id}")
    suspend fun updateBranch(
        @Path("id") id: Long,
        @Part("name") name: RequestBody?,
        @Part("branchNumber") branchNumber: RequestBody?,
        @Part("address") address: RequestBody?,
        @Part("city") city: RequestBody?,
        @Part("state") state: RequestBody?,
        @Part("country") country: RequestBody?,
        @Part("placeId") placeId: RequestBody?,
        @Part("latitud") latitud: RequestBody?,
        @Part("longitud") longitud: RequestBody?,
        @Part("portalEmail") portalEmail: RequestBody?,
        @Part("portalPassword") portalPassword: RequestBody?,
        @Part("isActive") isActive: RequestBody?,
        @Part logo: MultipartBody.Part?,
    ): ClientBranchDto

    @GET("client-portal/requests")
    suspend fun getRequests(): List<ClientTicketRequestDto>

    @retrofit2.http.POST("client-portal/requests")
    suspend fun createRequest(
        @Body body: CreateClientTicketRequestBody,
    ): ClientTicketRequestDto

    @PUT("client-portal/requests/{id}/close")
    suspend fun closeRequest(
        @Path("id") id: Long,
    ): ClientTicketRequestDto

    @GET("client-portal/feedback/pending")
    suspend fun getPendingFeedback(): List<PendingFeedbackTicketDto>

    @POST("client-portal/feedback")
    suspend fun submitFeedback(
        @Body body: CreateFeedbackBody,
    ): okhttp3.ResponseBody

    // Inventories (portal)
    @GET("client-portal/inventories")
    suspend fun getInventories(
        @Query("branchId") branchId: Long? = null,
        @Query("status") status: String? = null,
        @Query("origin") origin: String? = null,
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("search") search: String? = null,
    ): List<ClientPortalInventorySnapshotDto>

    @GET("client-portal/inventories/{id}")
    suspend fun getInventoryDetail(@Path("id") id: Long): ClientPortalInventorySnapshotDto

    @GET("client-portal/inventories/{id}/report")
    suspend fun getInventoryReportPdf(@Path("id") id: Long): okhttp3.ResponseBody

    @Multipart
    @POST("client-portal/inventories/upload")
    suspend fun uploadInventoryMedia(
        @Part files: List<MultipartBody.Part>,
    ): UploadUrlsResponse

    @POST("client-portal/inventories/sync")
    suspend fun syncInventory(
        @Body body: SyncInventoryInputDto,
    ): ClientPortalInventorySnapshotDto

    @PUT("client-portal/inventories/{id}/decision")
    suspend fun decideInventory(
        @Path("id") id: Long,
        @Body body: DecideInventoryBody,
    ): ClientPortalInventorySnapshotDto

    @GET("client-portal/report")
    suspend fun getPortalReportPdf(
        @Query("start") start: String? = null,
        @Query("end") end: String? = null,
    ): okhttp3.ResponseBody

    @GET("client-portal/tickets")
    suspend fun getTickets(
        @Query("start") start: String? = null,
        @Query("end") end: String? = null,
        @Query("branchId") branchId: Long? = null,
    ): List<ClientPortalTicketDto>

    @GET("client-portal/tickets/{id}")
    suspend fun getTicket(
        @Path("id") id: Long,
    ): ClientPortalTicketDto?

    @GET("client-portal/tickets/{id}/report")
    suspend fun getTicketReportPdf(
        @Path("id") id: Long,
    ): okhttp3.ResponseBody
}

