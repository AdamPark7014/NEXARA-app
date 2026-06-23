package mx.nexara.mobile.nativeapp.data.tickets

import android.content.Context
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.BranchPortalApi
import mx.nexara.mobile.nativeapp.data.api.TicketsApi
import mx.nexara.mobile.nativeapp.data.api.ClientPortalTicketDto
import mx.nexara.mobile.nativeapp.data.api.PendingFeedbackTicketDto
import mx.nexara.mobile.nativeapp.data.api.ClientPortalInventorySnapshotDto
import mx.nexara.mobile.nativeapp.data.api.SyncInventoryInputDto
import mx.nexara.mobile.nativeapp.data.api.DecideInventoryBody
import mx.nexara.mobile.nativeapp.data.api.ClientPortalInventoryItemDto
import mx.nexara.mobile.nativeapp.data.api.UploadUrlsResponse

class TicketsRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: TicketsApi = ApiClient.authed { authRepo.token() }.create(TicketsApi::class.java)
    private val branchApi: BranchPortalApi = ApiClient.authed { authRepo.token() }.create(BranchPortalApi::class.java)
    private val textMedia = "text/plain".toMediaType()

    private fun isBranchUser(): Boolean = authRepo.loadSession()?.isBranchUser == true

    suspend fun profile(): PortalProfile? {
        return if (isBranchUser()) {
            val branch = branchApi.profile() ?: return null
            PortalProfile(
                kind = PortalProfile.Kind.BRANCH,
                id = branch.id,
                name = branch.name ?: "",
                logoUrl = branch.logoUrl,
                address = branch.address,
                city = branch.city,
                state = branch.state,
                country = branch.country,
                branchNumber = branch.branchNumber,
            )
        } else {
            val client = api.getProfile() ?: return null
            PortalProfile(
                kind = PortalProfile.Kind.CLIENT,
                id = client.id,
                name = client.name ?: "",
                logoUrl = client.logoUrl,
                contactName = client.contactName,
                contactEmail = client.contactEmail,
                contactPhone = client.contactPhone,
                address = client.address,
                city = client.city,
                state = client.state,
                country = client.country,
                branchNumber = null,
            )
        }
    }

    suspend fun updateProfile(
        contactName: String?,
        contactEmail: String?,
        contactPhone: String?,
        address: String?,
        city: String?,
        state: String?,
        country: String?,
    ) = api.updateProfile(
        mx.nexara.mobile.nativeapp.data.api.ClientProfileUpdateBody(
            contactName = contactName?.trim().takeIf { !it.isNullOrBlank() },
            contactEmail = contactEmail?.trim().takeIf { !it.isNullOrBlank() },
            contactPhone = contactPhone?.trim().takeIf { !it.isNullOrBlank() },
            address = address?.trim().takeIf { !it.isNullOrBlank() },
            city = city?.trim().takeIf { !it.isNullOrBlank() },
            state = state?.trim().takeIf { !it.isNullOrBlank() },
            country = country?.trim().takeIf { !it.isNullOrBlank() },
        )
    )

    suspend fun branches() = api.getBranches()

    suspend fun createBranch(
        name: String,
        branchNumber: String,
        address: String?,
        city: String?,
        state: String?,
        country: String?,
        placeId: String?,
        latitud: Double?,
        longitud: Double?,
        portalEmail: String,
        portalPassword: String,
        isActive: Boolean?,
        logoBytes: ByteArray?,
        logoFilename: String?,
    ) = api.createBranch(
        name = name.trim().toRequestBody(textMedia),
        branchNumber = branchNumber.trim().toRequestBody(textMedia),
        address = address?.trim().takeIf { !it.isNullOrBlank() }?.toRequestBody(textMedia),
        city = city?.trim().takeIf { !it.isNullOrBlank() }?.toRequestBody(textMedia),
        state = state?.trim().takeIf { !it.isNullOrBlank() }?.toRequestBody(textMedia),
        country = country?.trim().takeIf { !it.isNullOrBlank() }?.toRequestBody(textMedia),
        placeId = placeId?.trim().takeIf { !it.isNullOrBlank() }?.toRequestBody(textMedia),
        latitud = latitud?.toString()?.toRequestBody(textMedia),
        longitud = longitud?.toString()?.toRequestBody(textMedia),
        portalEmail = portalEmail.trim().lowercase().toRequestBody(textMedia),
        portalPassword = portalPassword.toRequestBody(textMedia),
        isActive = isActive?.let { (if (it) "true" else "false").toRequestBody(textMedia) },
        logo = logoBytes?.let { bytes ->
            val body = bytes.toRequestBody("image/*".toMediaType())
            MultipartBody.Part.createFormData("logo", logoFilename ?: "logo.jpg", body)
        },
    )

    suspend fun updateBranch(
        id: Long,
        name: String?,
        branchNumber: String?,
        address: String?,
        city: String?,
        state: String?,
        country: String?,
        placeId: String?,
        latitud: Double?,
        longitud: Double?,
        portalEmail: String?,
        portalPassword: String?,
        isActive: Boolean?,
        logoBytes: ByteArray?,
        logoFilename: String?,
    ) = api.updateBranch(
        id = id,
        name = name?.trim().takeIf { !it.isNullOrBlank() }?.toRequestBody(textMedia),
        branchNumber = branchNumber?.trim().takeIf { !it.isNullOrBlank() }?.toRequestBody(textMedia),
        address = address?.trim().takeIf { !it.isNullOrBlank() }?.toRequestBody(textMedia),
        city = city?.trim().takeIf { !it.isNullOrBlank() }?.toRequestBody(textMedia),
        state = state?.trim().takeIf { !it.isNullOrBlank() }?.toRequestBody(textMedia),
        country = country?.trim().takeIf { !it.isNullOrBlank() }?.toRequestBody(textMedia),
        placeId = placeId?.trim().takeIf { !it.isNullOrBlank() }?.toRequestBody(textMedia),
        latitud = latitud?.toString()?.toRequestBody(textMedia),
        longitud = longitud?.toString()?.toRequestBody(textMedia),
        portalEmail = portalEmail?.trim()?.lowercase()?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
        portalPassword = portalPassword?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
        isActive = isActive?.let { (if (it) "true" else "false").toRequestBody(textMedia) },
        logo = logoBytes?.let { bytes ->
            val body = bytes.toRequestBody("image/*".toMediaType())
            MultipartBody.Part.createFormData("logo", logoFilename ?: "logo.jpg", body)
        },
    )

    suspend fun requests() = if (isBranchUser()) branchApi.requests() else api.getRequests()

    suspend fun createRequest(
        description: String,
        urgency: String,
        requestType: String,
        dueAtIso: String?,
        branchId: Long?,
        evidenceFiles: List<Pair<String, ByteArray>>? = null,
    ) = if (isBranchUser()) {
        val parts = (evidenceFiles ?: emptyList()).map { (filename, bytes) ->
            val body = bytes.toRequestBody("image/*".toMediaType())
            MultipartBody.Part.createFormData("files", filename, body)
        }
        branchApi.createRequest(
            description = description.trim().toRequestBody(textMedia),
            urgency = urgency.toRequestBody(textMedia),
            requestType = requestType.toRequestBody(textMedia),
            dueAt = dueAtIso?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
            placeId = null,
            latitud = null,
            longitud = null,
            files = parts,
        )
    } else {
        api.createRequest(
            mx.nexara.mobile.nativeapp.data.api.CreateClientTicketRequestBody(
                description = description.trim(),
                urgency = urgency,
                requestType = requestType,
                dueAt = dueAtIso,
                branchId = branchId,
            )
        )
    }

    suspend fun closeRequest(id: Long) = api.closeRequest(id = id)

    suspend fun pendingFeedback(): List<PendingFeedbackTicketDto> = api.getPendingFeedback()

    suspend fun submitFeedback(
        activityId: Long,
        rating: Int?,
        wasOnTime: String?,
        wasFriendly: String?,
        wasSolved: String?,
        comments: String?,
    ) = api.submitFeedback(
        mx.nexara.mobile.nativeapp.data.api.CreateFeedbackBody(
            activityId = activityId,
            rating = rating,
            wasOnTime = wasOnTime,
            wasFriendly = wasFriendly,
            wasSolved = wasSolved,
            comments = comments?.trim().takeIf { !it.isNullOrBlank() },
        )
    )

    suspend fun tickets(start: String? = null, end: String? = null, branchId: Long? = null): List<ClientPortalTicketDto> =
        if (isBranchUser()) branchApi.tickets(start = start, end = end) else api.getTickets(start = start, end = end, branchId = branchId)

    suspend fun ticket(id: Long): ClientPortalTicketDto? =
        if (isBranchUser()) branchApi.ticket(id = id) else api.getTicket(id = id)

    suspend fun ticketReportPdfBytes(id: Long): ByteArray {
        if (isBranchUser()) {
            val res = branchApi.ticketReportPdf(id = id)
            if (!res.isSuccessful) throw Exception("No se pudo descargar el PDF")
            val body = res.body() ?: throw Exception("PDF vacío")
            return body.bytes()
        }
        return api.getTicketReportPdf(id = id).bytes()
    }

    suspend fun portalReportPdfBytes(start: String? = null, end: String? = null): ByteArray {
        if (isBranchUser()) {
            val res = branchApi.branchReportPdf(start = start, end = end)
            if (!res.isSuccessful) throw Exception("No se pudo descargar el reporte")
            val body = res.body() ?: throw Exception("Reporte vacío")
            return body.bytes()
        }
        return api.getPortalReportPdf(start = start, end = end).bytes()
    }

    suspend fun inventories(
        branchId: Long? = null,
        status: String? = null,
        origin: String? = null,
        from: String? = null,
        to: String? = null,
        search: String? = null,
    ): List<ClientPortalInventorySnapshotDto> = if (isBranchUser()) {
        branchApi.inventories(
            status = status,
            origin = origin,
            from = from,
            to = to,
            search = search,
        )
    } else {
        api.getInventories(
            branchId = branchId,
            status = status,
            origin = origin,
            from = from,
            to = to,
            search = search,
        )
    }

    suspend fun inventoryDetail(id: Long): ClientPortalInventorySnapshotDto =
        if (isBranchUser()) branchApi.inventoryDetail(id = id) else api.getInventoryDetail(id = id)

    suspend fun inventoryReportPdfBytes(id: Long): ByteArray {
        if (isBranchUser()) {
            val res = branchApi.inventoryReportPdf(id = id)
            if (!res.isSuccessful) throw Exception("No se pudo descargar PDF")
            val body = res.body() ?: throw Exception("PDF vacío")
            return body.bytes()
        }
        return api.getInventoryReportPdf(id = id).bytes()
    }

    suspend fun uploadInventoryMedia(files: List<Pair<String, ByteArray>>): UploadUrlsResponse {
        val parts = files.map { (filename, bytes) ->
            val body = bytes.toRequestBody("image/*".toMediaType())
            MultipartBody.Part.createFormData("files", filename, body)
        }
        return api.uploadInventoryMedia(files = parts)
    }

    suspend fun syncInventory(
        branchId: Long,
        snapshotId: Long?,
        title: String?,
        notes: String?,
        completed: Boolean,
        confirmDifference: Boolean,
        items: List<ClientPortalInventoryItemDto>?,
    ) = api.syncInventory(
        SyncInventoryInputDto(
            branchId = branchId,
            snapshotId = snapshotId,
            title = title?.trim().takeIf { !it.isNullOrBlank() },
            notes = notes?.trim().takeIf { !it.isNullOrBlank() },
            completed = completed,
            confirmDifference = confirmDifference,
            items = items,
        )
    )

    suspend fun decideInventory(id: Long, decision: String) =
        api.decideInventory(id = id, body = DecideInventoryBody(decision = decision))
}

