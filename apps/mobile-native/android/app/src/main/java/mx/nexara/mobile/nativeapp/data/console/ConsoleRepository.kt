package mx.nexara.mobile.nativeapp.data.console

import android.content.Context
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.ConsoleApi

class ConsoleRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: ConsoleApi = ApiClient.authed { authRepo.token() }.create(ConsoleApi::class.java)
    private val textMedia = "text/plain".toMediaType()

    suspend fun dashboardFetch(): DashboardPayload = DashboardPayload(
        viatics = api.getViatics(),
        activities = api.getActivities(),
    )

    suspend fun activitiesFetch(scope: String? = null) = api.getActivities(scope = scope)

    suspend fun usersFetch(preferAssignable: Boolean = true): List<mx.nexara.mobile.nativeapp.data.api.VisibleUserDto> {
        if (!preferAssignable) return api.getUsers()
        return try {
            api.getAssignableUsers()
        } catch (_: Exception) {
            api.getUsers()
        }
    }

    suspend fun attendanceRange(from: String, to: String, tryHierarchyFirst: Boolean = true) =
        if (tryHierarchyFirst) {
            try {
                api.getAttendanceHierarchyRange(from = from, to = to)
            } catch (_: Exception) {
                api.getAttendanceRange(from = from, to = to)
            }
        } else {
            api.getAttendanceRange(from = from, to = to)
        }

    suspend fun attendanceCurrent() = api.getAttendanceCurrent()

    suspend fun attendanceCheckIn(type: String, lat: Double? = null, lng: Double? = null) =
        api.postAttendance(
            mx.nexara.mobile.nativeapp.data.api.AttendanceRegisterRequest(
                type = type,
                timestamp = java.time.Instant.now().toString(),
                latitude = lat,
                longitude = lng,
            )
        )

    suspend fun evidencesMyHistory() = api.getMyEvidenceHistory()

    suspend fun evidencesReviewHistory() = api.getEvidenceReviewHistory()

    suspend fun evidenceByActivity(activityId: Long) = api.getActivityEvidence(activityId)

    suspend fun approveEvidence(activityId: Long, reviewerId: Long, notes: String? = null) =
        api.approveEvidence(
            activityId = activityId,
            body = mx.nexara.mobile.nativeapp.data.api.EvidenceReviewRequest(
                reviewerId = reviewerId,
                notes = notes,
            ),
        )

    suspend fun rejectEvidence(
        activityId: Long,
        reviewerId: Long,
        notes: String,
        rejectedStep: String = "EVIDENCE_PHOTOS",
    ) = api.rejectEvidence(
        activityId = activityId,
        body = mx.nexara.mobile.nativeapp.data.api.EvidenceRejectRequest(
            reviewerId = reviewerId,
            rejectedStep = rejectedStep,
            notes = notes,
        ),
    )

    suspend fun evidenceEntryPhoto(activityId: Long, photoUrl: String, lat: Double, lng: Double) =
        api.postEvidenceEntryPhoto(
            activityId = activityId,
            body = mx.nexara.mobile.nativeapp.data.api.ActivityEvidencePhotoStepRequest(
                photoUrl = photoUrl,
                latitude = lat,
                longitude = lng,
            ),
        )

    suspend fun evidencePhotos(activityId: Long, photoUrls: List<String>) =
        api.postEvidencePhotos(
            activityId = activityId,
            body = mx.nexara.mobile.nativeapp.data.api.ActivityEvidencePhotosStepRequest(photoUrls = photoUrls),
        )

    suspend fun evidenceServiceSheetPdf(activityId: Long, pdfUrl: String) =
        api.postEvidenceServiceSheetPdf(
            activityId = activityId,
            body = mx.nexara.mobile.nativeapp.data.api.ActivityEvidencePdfStepRequest(pdfUrl = pdfUrl),
        )

    suspend fun evidenceServiceSheetData(activityId: Long, data: Any) =
        api.postEvidenceServiceSheetData(activityId = activityId, body = data)

    suspend fun evidenceExitPhoto(activityId: Long, photoUrl: String, lat: Double, lng: Double) =
        api.postEvidenceExitPhoto(
            activityId = activityId,
            body = mx.nexara.mobile.nativeapp.data.api.ActivityEvidencePhotoStepRequest(
                photoUrl = photoUrl,
                latitude = lat,
                longitude = lng,
            ),
        )

    suspend fun viaticsFetch() = api.getViatics()

    suspend fun createViatic(
        amount: Double,
        motivo: String,
        categoria: String?,
        activityId: Long?,
        ticketEvidenciaUrl: String,
    ) = api.createViatic(
        mx.nexara.mobile.nativeapp.data.api.CreateViaticJsonRequest(
            montoSolicitado = amount,
            motivo = motivo,
            categoria = categoria,
            actividadId = activityId,
            ticketEvidenciaUrl = ticketEvidenciaUrl,
        ),
    )

    suspend fun approveViatic(id: Long, approve: Boolean, note: String? = null) =
        api.approveViatic(
            id = id,
            body = mx.nexara.mobile.nativeapp.data.api.ViaticApproveRequest(
                action = if (approve) "approve" else "reject",
                note = note,
            ),
        )

    suspend fun vehiclesFetch() = api.getVehicleControls()

    suspend fun vehicleInventoryFetch() = api.getVehicleInventory()

    suspend fun gpsMe() = api.getGpsMe()

    suspend fun gpsTeam() = api.getGpsTeam()

    suspend fun gpsPost(lat: Double, lng: Double, speedKmh: Double?) =
        api.postGpsLocation(
            mx.nexara.mobile.nativeapp.data.api.PostGpsLocationRequest(
                latitud = lat,
                longitud = lng,
                velocidadKmh = speedKmh,
                ultimaActualizacion = java.time.Instant.now().toString(),
            )
        )

    suspend fun myToolRequests() = api.getMyToolRequests()

    suspend fun toolRequests(status: String? = null) = api.getToolRequests(status = status)

    suspend fun requestToolRenewal(requestId: Long, isoNewReturnDate: String, reason: String?) =
        api.postToolRenewalRequest(
            requestId = requestId,
            body = mx.nexara.mobile.nativeapp.data.api.ToolRenewalRequest(
                newReturnDate = isoNewReturnDate,
                renewalReason = reason,
            ),
        )

    suspend fun toolInventory(q: String? = null, includeRetired: Boolean = false) =
        api.getToolInventory(q = q, includeRetired = if (includeRetired) "true" else null)

    suspend fun toolInventorySearch(q: String) = api.searchToolInventory(q = q)

    suspend fun myToolKit() = api.getMyToolKit()

    suspend fun toolKitsUsers() = api.getToolKitsUsers()

    suspend fun reportKitIncident(assignmentId: Long, description: String) =
        api.reportToolKitIncident(assignmentId = assignmentId, body = mx.nexara.mobile.nativeapp.data.api.ToolKitIncidentRequest(description = description))

    suspend fun resolveKitEvent(eventId: Long, resolution: String, notes: String?, fineAmount: Double?) =
        api.resolveToolKitEvent(
            eventId = eventId,
            body = mx.nexara.mobile.nativeapp.data.api.ToolKitResolveRequest(
                resolution = resolution,
                notes = notes,
                fineAmount = fineAmount,
            ),
        )

    suspend fun assignKit(userId: Long, inventoryItemId: Long, assignmentType: String) =
        api.assignToolKit(
            body = mx.nexara.mobile.nativeapp.data.api.ToolKitAssignRequest(
                userId = userId,
                inventoryItemId = inventoryItemId,
                assignmentType = assignmentType,
            )
        )

    suspend fun toolRenewalsPending() = api.getToolRenewalsPending()

    suspend fun approveToolRenewal(renewalId: Long) = api.approveToolRenewal(renewalId = renewalId)

    suspend fun rejectToolRenewal(renewalId: Long, reason: String) =
        api.rejectToolRenewal(renewalId = renewalId, body = mx.nexara.mobile.nativeapp.data.api.ToolRenewalRejectRequest(reason = reason))

    // ── Clients ──────────────────────────────────────────────────────────────

    suspend fun serviceClients() = api.getServiceClients()

    suspend fun serviceClientReportPdf(clientId: Long) = api.getServiceClientReport(clientId = clientId)

    suspend fun createServiceClient(
        name: String,
        contactName: String?,
        contactEmail: String?,
        contactPhone: String?,
        address: String?,
        city: String?,
        state: String?,
        country: String?,
        accountCode: String?,
        portalEmail: String?,
        portalPassword: String?,
        isActive: Boolean,
        logoBytes: ByteArray?,
        logoFilename: String?,
    ) = api.createServiceClient(
        name = name.toRequestBody(textMedia),
        contactName = contactName?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
        contactEmail = contactEmail?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
        contactPhone = contactPhone?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
        address = address?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
        city = city?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
        state = state?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
        country = country?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
        accountCode = accountCode?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
        portalEmail = portalEmail?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
        portalPassword = portalPassword?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
        isActive = (if (isActive) "true" else "false").toRequestBody(textMedia),
        logo = logoBytes?.let { bytes ->
            val body = bytes.toRequestBody("image/*".toMediaType())
            MultipartBody.Part.createFormData("logo", logoFilename ?: "logo.jpg", body)
        },
    )

    suspend fun updateServiceClient(
        clientId: Long,
        name: String,
        contactName: String?,
        contactEmail: String?,
        contactPhone: String?,
        address: String?,
        city: String?,
        state: String?,
        country: String?,
        accountCode: String?,
        portalEmail: String?,
        portalPassword: String?,
        isActive: Boolean,
        logoBytes: ByteArray?,
        logoFilename: String?,
    ) = if (logoBytes != null) {
        api.updateServiceClientMultipart(
            clientId = clientId,
            name = name.toRequestBody(textMedia),
            contactName = contactName?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
            contactEmail = contactEmail?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
            contactPhone = contactPhone?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
            address = address?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
            city = city?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
            state = state?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
            country = country?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
            accountCode = accountCode?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
            portalEmail = portalEmail?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
            portalPassword = portalPassword?.takeIf { it.isNotBlank() }?.toRequestBody(textMedia),
            isActive = (if (isActive) "true" else "false").toRequestBody(textMedia),
            logo = run {
                val body = logoBytes.toRequestBody("image/*".toMediaType())
                MultipartBody.Part.createFormData("logo", logoFilename ?: "logo.jpg", body)
            },
        )
    } else {
        api.updateServiceClientJson(
            clientId = clientId,
            body = mx.nexara.mobile.nativeapp.data.api.UpdateServiceClientRequest(
                name = name,
                contactName = contactName?.takeIf { it.isNotBlank() },
                contactEmail = contactEmail?.takeIf { it.isNotBlank() },
                contactPhone = contactPhone?.takeIf { it.isNotBlank() },
                address = address?.takeIf { it.isNotBlank() },
                city = city?.takeIf { it.isNotBlank() },
                state = state?.takeIf { it.isNotBlank() },
                country = country?.takeIf { it.isNotBlank() },
                accountCode = accountCode?.takeIf { it.isNotBlank() },
                portalEmail = portalEmail?.takeIf { it.isNotBlank() },
                portalPassword = portalPassword?.takeIf { it.isNotBlank() },
                isActive = isActive,
            ),
        )
    }

    suspend fun activitiesDetailed() = api.getActivitiesDetailed()

    suspend fun inventories() = api.getInventories()

    suspend fun inventoryReportPdf(inventoryId: Long) = api.getInventoryReport(inventoryId = inventoryId)

    suspend fun inventoryPatchStatus(inventoryId: Long, status: String) =
        api.patchInventoryStatus(inventoryId = inventoryId, body = mx.nexara.mobile.nativeapp.data.api.InventoryStatusPatchRequest(status = status))

    suspend fun adminTicketReportPdf(activityId: Long) = api.getAdminTicketReport(activityId = activityId)

    suspend fun myTicketReportPdf(activityId: Long) = api.getMyTicketReport(activityId = activityId)

    suspend fun evidenceHistoryReportPdf(from: String? = null, to: String? = null) =
        api.getMyEvidenceHistoryReport(from = from, to = to)

    // ── Projects ─────────────────────────────────────────────────────────────

    suspend fun operationalProjects() = api.getOperationalProjects()

    suspend fun createOperationalProject(
        title: String,
        description: String?,
        vendorId: Long,
        clientId: Long,
        startIso: String,
        endIso: String?,
    ) = api.createOperationalProject(
        body = mx.nexara.mobile.nativeapp.data.api.CreateOperationalProjectRequest(
            title = title,
            description = description?.takeIf { it.isNotBlank() },
            vendorId = vendorId,
            clientId = clientId,
            startDate = startIso,
            endDate = endIso,
        )
    )

    suspend fun patchProjectStatus(projectId: Long, status: String) =
        api.patchOperationalProjectStatus(
            projectId = projectId,
            body = mx.nexara.mobile.nativeapp.data.api.OperationalProjectStatusPatchRequest(status = status),
        )

    suspend fun addProjectEngineer(projectId: Long, engineerId: Long) =
        api.addOperationalProjectEngineer(
            projectId = projectId,
            body = mx.nexara.mobile.nativeapp.data.api.OperationalProjectEngineerAddRequest(engineerId = engineerId),
        )

    suspend fun removeProjectEngineer(projectId: Long, engineerId: Long) =
        api.removeOperationalProjectEngineer(projectId = projectId, engineerId = engineerId)

    suspend fun settingsList() = api.getSettings()

    suspend fun settingsUpsert(key: String, value: String, category: String, label: String?) =
        api.upsertSetting(
            mx.nexara.mobile.nativeapp.data.api.UpsertSettingBody(
                key = key,
                value = value,
                category = category,
                label = label?.takeIf { it.isNotBlank() },
            ),
        )

    suspend fun settingsDelete(key: String) {
        api.deleteSetting(key)
    }
}

