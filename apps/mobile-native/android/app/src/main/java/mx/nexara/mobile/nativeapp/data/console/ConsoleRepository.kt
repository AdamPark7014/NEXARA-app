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

    suspend fun createActivity(body: mx.nexara.mobile.nativeapp.data.api.CreateActivityRequest): Long {
        val res = api.createActivity(body)
        return res.id ?: throw IllegalStateException("OT sin ID")
    }

    suspend fun nextAnNumber(): String {
        val raw = api.getNextAnNumberRaw().string().trim()
        if (!raw.startsWith("{")) return ""
        val obj = org.json.JSONObject(raw)
        return obj.optString("next", "")
    }

    suspend fun dispatchBoard(): Map<String, Any?> =
        parseJsonObject(api.getDispatchBoardRaw().string())

    suspend fun activityFeed(limit: Int = 40): List<Map<String, Any?>> {
        val raw = api.getActivityFeedRaw(limit).string().trim()
        if (!raw.startsWith("{")) return emptyList()
        val obj = org.json.JSONObject(raw)
        val arr = obj.optJSONArray("items") ?: return emptyList()
        return (0 until arr.length()).mapNotNull { idx ->
            val item = arr.opt(idx)
            if (item is org.json.JSONObject) jsonObjectToMap(item) else null
        }
    }

    suspend fun activityById(id: Long) = api.getActivity(id)

    suspend fun activityTimelineEvents(activityId: Long): List<Map<String, Any?>> {
        val raw = api.getActivityTimeline(activityId).string().trim()
        if (!raw.startsWith("{")) return emptyList()
        val obj = org.json.JSONObject(raw)
        val arr = obj.optJSONArray("events") ?: return emptyList()
        return (0 until arr.length()).mapNotNull { idx ->
            val item = arr.opt(idx)
            if (item is org.json.JSONObject) jsonObjectToMap(item) else null
        }
    }

    suspend fun activityMaterials(activityId: Long): List<Map<String, Any?>> =
        parseJsonArray(api.getActivityMaterials(activityId).string())

    suspend fun activityTeam(activityId: Long): List<Map<String, Any?>> =
        parseJsonArray(api.getActivityTeam(activityId).string())

    suspend fun activityReassignments(activityId: Long): List<Map<String, Any?>> =
        parseJsonArray(api.getActivityReassignments(activityId).string())

    private fun parseJsonArray(raw: String): List<Map<String, Any?>> {
        val trimmed = raw.trim()
        if (!trimmed.startsWith("[")) return emptyList()
        val arr = org.json.JSONArray(trimmed)
        return (0 until arr.length()).mapNotNull { idx ->
            val item = arr.opt(idx)
            if (item is org.json.JSONObject) jsonObjectToMap(item) else null
        }
    }

    private fun parseJsonObject(raw: String): Map<String, Any?> {
        val trimmed = raw.trim()
        if (!trimmed.startsWith("{")) return emptyMap()
        return jsonObjectToMap(org.json.JSONObject(trimmed))
    }

    private fun jsonObjectToMap(obj: org.json.JSONObject): Map<String, Any?> =
        obj.keys().asSequence().associateWith { key -> jsonValue(obj.get(key)) }

    private fun jsonValue(value: Any?): Any? = when (value) {
        null, org.json.JSONObject.NULL -> null
        is org.json.JSONObject -> value.keys().asSequence().associateWith { jsonValue(value.get(it)) }
        is org.json.JSONArray -> (0 until value.length()).map { jsonValue(value.get(it)) }
        else -> value
    }

    suspend fun updateActivity(
        id: Long,
        estatus: String? = null,
        prioridad: String? = null,
        descripcion: String? = null,
        indicaciones: String? = null,
        fechaInicio: String? = null,
        fechaEntregaEsperada: String? = null,
        fechaFinalizacion: String? = null,
    ) = api.patchActivity(
        id = id,
        body = mx.nexara.mobile.nativeapp.data.api.UpdateActivityRequest(
            estatus = estatus,
            prioridad = prioridad,
            descripcion = descripcion,
            indicaciones = indicaciones,
            fechaInicio = fechaInicio,
            fechaEntregaEsperada = fechaEntregaEsperada,
            fechaFinalizacion = fechaFinalizacion,
        ),
    )

    suspend fun executeActivity(
        id: Long,
        estatus: String? = null,
        fechaInicio: String? = null,
        fechaFinalizacion: String? = null,
    ) = api.patchActivityExecute(
        id = id,
        body = mx.nexara.mobile.nativeapp.data.api.ExecuteActivityRequest(
            estatus = estatus,
            fechaInicio = fechaInicio,
            fechaFinalizacion = fechaFinalizacion,
        ),
    )

    suspend fun reassignActivity(activityId: Long, toUserId: Long, motivo: String? = null) =
        api.reassignActivity(
            id = activityId,
            body = mx.nexara.mobile.nativeapp.data.api.ReassignActivityRequest(
                aUsuarioId = toUserId,
                motivo = motivo,
            ),
        )

    suspend fun activityIncidents(activityId: Long) = api.getActivityIncidents(activityId)

    suspend fun addActivityIncident(
        activityId: Long,
        tipo: String,
        descripcion: String,
        severidad: String? = null,
        accionTomada: String? = null,
        horasPerdidas: Double? = null,
    ) = api.addActivityIncident(
        activityId = activityId,
        body = mx.nexara.mobile.nativeapp.data.api.AddActivityIncidentRequest(
            tipo = tipo,
            severidad = severidad,
            descripcion = descripcion,
            accionTomada = accionTomada,
            horasPerdidas = horasPerdidas,
        ),
    )

    suspend fun resolveActivityIncident(
        activityId: Long,
        incidentId: Long,
        accionTomada: String? = null,
    ) = api.resolveActivityIncident(
        activityId = activityId,
        incidentId = incidentId,
        body = mx.nexara.mobile.nativeapp.data.api.ResolveActivityIncidentRequest(accionTomada = accionTomada),
    )

    suspend fun reopenActivityIncident(activityId: Long, incidentId: Long) =
        api.reopenActivityIncident(activityId = activityId, incidentId = incidentId)

    suspend fun activityRecommendations(activityId: Long) = api.getActivityRecommendations(activityId)

    suspend fun addActivityRecommendation(
        activityId: Long,
        tipo: String,
        descripcion: String,
        prioridad: String? = null,
        costoEstimado: Double? = null,
    ) = api.addActivityRecommendation(
        activityId = activityId,
        body = mx.nexara.mobile.nativeapp.data.api.AddActivityRecommendationRequest(
            tipo = tipo,
            prioridad = prioridad,
            descripcion = descripcion,
            costoEstimado = costoEstimado,
        ),
    )

    suspend fun updateActivityRecommendation(
        activityId: Long,
        recommendationId: Long,
        estado: String? = null,
        prioridad: String? = null,
        cotizacionId: Long? = null,
        costoEstimado: Double? = null,
    ) = api.updateActivityRecommendation(
        activityId = activityId,
        recommendationId = recommendationId,
        body = mx.nexara.mobile.nativeapp.data.api.UpdateActivityRecommendationRequest(
            estado = estado,
            prioridad = prioridad,
            cotizacionId = cotizacionId,
            costoEstimado = costoEstimado,
        ),
    )

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

    suspend fun assignViatic(
        usuarioId: Long,
        amount: Double,
        motivo: String,
        categoria: String? = null,
        activityId: Long? = null,
        projectId: Long? = null,
        vehicleId: Long? = null,
    ) = api.assignViatic(
        mx.nexara.mobile.nativeapp.data.api.AssignViaticJsonRequest(
            usuarioId = usuarioId,
            montoSolicitado = amount,
            motivo = motivo,
            categoria = categoria,
            actividadId = activityId,
            projectId = projectId,
            vehicleId = vehicleId,
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

    suspend fun gpsTrajectory(date: String? = null, userId: Long? = null) =
        api.getGpsTrajectory(date = date, userId = userId)

    suspend fun gpsPost(lat: Double, lng: Double, speedKmh: Double?) =
        api.postGpsLocation(
            mx.nexara.mobile.nativeapp.data.api.PostGpsLocationRequest(
                latitud = lat,
                longitud = lng,
                velocidadKmh = speedKmh,
                ultimaActualizacion = java.time.Instant.now().toString(),
            )
        )

    suspend fun gpsUpdateConsent(enabled: Boolean) =
        api.patchGpsConsent(mx.nexara.mobile.nativeapp.data.api.GpsConsentRequest(enabled = enabled))

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

    suspend fun myProfile() = api.getMyProfile()

    suspend fun updateMyProfile(body: mx.nexara.mobile.nativeapp.data.api.UpdateUserProfileBody) =
        api.updateMyProfile(body)

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

