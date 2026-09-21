package mx.nexara.mobile.nativeapp.data.console

import android.content.Context
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import mx.nexara.mobile.nativeapp.access.PlatformAccounts
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ActivityAccionesDto
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.AttendanceJustificacionDto
import mx.nexara.mobile.nativeapp.data.api.CancelActivityRequest
import mx.nexara.mobile.nativeapp.data.api.ConsoleApi
import mx.nexara.mobile.nativeapp.data.api.JustificarFaltaRequest
import mx.nexara.mobile.nativeapp.data.api.ReassignActivityRequest

class ConsoleRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: ConsoleApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(ConsoleApi::class.java)
    private val textMedia = "text/plain".toMediaType()

    suspend fun activitiesFetch(scope: String? = null) = api.getActivities(scope = scope)

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

    /** Qué puede hacer un superior: cancelar y a quién puede reemplazar. */
    suspend fun activityActions(activityId: Long): ActivityAccionesDto = api.getActivityActions(activityId)

    suspend fun cancelActivity(activityId: Long, motivo: String) {
        api.cancelActivity(activityId, CancelActivityRequest(motivo.trim())).close()
    }

    /** «Pasar a otro compañero»: [deUsuarioId] la deja y [aUsuarioId] continúa donde se quedó. */
    suspend fun reassignActivity(activityId: Long, deUsuarioId: Long, aUsuarioId: Long, motivo: String) {
        api.reassignActivity(
            activityId,
            ReassignActivityRequest(aUsuarioId = aUsuarioId, deUsuarioId = deUsuarioId, motivo = motivo.trim()),
        ).close()
    }

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

    /** Safety net: Christian/Adam/Claudia/cuenta demo no deben aparecer como responsable asignable. */
    suspend fun usersFetch(preferAssignable: Boolean = true): List<mx.nexara.mobile.nativeapp.data.api.VisibleUserDto> {
        val users = if (!preferAssignable) {
            api.getUsers()
        } else {
            try {
                api.getAssignableUsers()
            } catch (_: Exception) {
                api.getUsers()
            }
        }
        return users.filter { !PlatformAccounts.isNonEmployeeEmail(it.email) }
    }

    /**
     * @param scope `subtree` para ver solo el organigrama propio. La web solo lo
     * omite para el dueño de la plataforma y el super admin; sin él cualquier
     * `attendance.manage` recibía la asistencia de toda la empresa.
     *
     * Safety net: filtra del resultado a Christian/Adam/Claudia/cuenta demo —
     * no son empleados y no deben verse como "sin checada".
     */
    suspend fun attendanceRange(
        from: String,
        to: String,
        tryHierarchyFirst: Boolean = true,
        scope: String? = null,
    ): mx.nexara.mobile.nativeapp.data.api.AttendanceRangeDto {
        val raw = if (tryHierarchyFirst) {
            try {
                api.getAttendanceHierarchyRange(from = from, to = to, scope = scope)
            } catch (_: Exception) {
                api.getAttendanceRange(from = from, to = to)
            }
        } else {
            api.getAttendanceRange(from = from, to = to)
        }
        return raw.copy(users = raw.users?.filter { !PlatformAccounts.isNonEmployeeEmail(it.email) })
    }

    suspend fun attendanceCurrent() = api.getAttendanceCurrent()

    /** Checadas propias del día (`yyyy-MM-dd`); null = hoy. */
    suspend fun attendanceHistory(date: String? = null) = api.getAttendanceHistory(date = date)

    /** Faltas justificadas propias en el rango (`attendance/range`, sin jerarquía). */
    suspend fun myAttendanceJustifications(from: String, to: String): List<AttendanceJustificacionDto> =
        api.getAttendanceRange(from = from, to = to).justificaciones.orEmpty()

    /** Solo Christian: el día queda «Falta justificada · motivo». */
    suspend fun justificarFalta(userId: Long, fecha: String, motivo: String) {
        api.justificarFalta(JustificarFaltaRequest(userId = userId, fecha = fecha, motivo = motivo.trim())).close()
    }

    /**
     * Checada (contrato A): la hora que vale es la del servidor, así que ya no
     * se manda `timestamp`. `capturedAt` viaja como referencia y solo se usa
     * cuando la checada salió de la cola sin conexión — ahí es la cola quien
     * agrega `offline: true` (ver `OfflineQueueBody`), nunca esta llamada.
     */
    suspend fun attendanceCheckIn(
        type: String,
        lat: Double? = null,
        lng: Double? = null,
        accuracyM: Float? = null,
        mockLocation: Boolean = false,
        fixAgeMs: Long? = null,
        photoBase64: String,
        capturedAt: String = java.time.Instant.now().toString(),
    ) =
        api.postAttendance(
            mx.nexara.mobile.nativeapp.data.api.AttendanceRegisterRequest(
                type = type,
                capturedAt = capturedAt,
                latitude = lat,
                longitude = lng,
                accuracyM = accuracyM?.takeIf { it.isFinite() && it >= 0f }?.toDouble(),
                mockLocation = mockLocation,
                fixAgeMs = fixAgeMs?.takeIf { it >= 0L },
                photoBase64 = photoBase64,
            )
        )

    suspend fun gpsMe() = api.getGpsMe()

    suspend fun gpsTeam() = api.getGpsTeam()

    suspend fun gpsTrajectory(date: String? = null, userId: Long? = null) =
        api.getGpsTrajectory(date = date, userId = userId)

    /**
     * @param mockLocation el punto viene de una app de GPS falso. Se manda igual: el
     * servidor lo guarda marcado en vez de tirarlo, para que el recorrido no tenga huecos
     * que nadie sepa leer.
     */
    suspend fun gpsPost(
        lat: Double,
        lng: Double,
        speedKmh: Double?,
        activityId: Long? = null,
        mockLocation: Boolean? = null,
    ) =
        api.postGpsLocation(
            mx.nexara.mobile.nativeapp.data.api.PostGpsLocationRequest(
                latitud = lat,
                longitud = lng,
                velocidadKmh = speedKmh,
                ultimaActualizacion = java.time.Instant.now().toString(),
                actividadId = activityId,
                mockLocation = mockLocation,
            )
        )

    suspend fun gpsUpdateConsent(enabled: Boolean) =
        api.patchGpsConsent(mx.nexara.mobile.nativeapp.data.api.GpsConsentRequest(enabled = enabled))

    suspend fun myProfile() = api.getMyProfile()

    suspend fun updateMyProfile(body: mx.nexara.mobile.nativeapp.data.api.UpdateUserProfileBody) =
        api.updateMyProfile(body)

}
