package mx.nexara.mobile.nativeapp.data.console

import android.content.Context
import mx.nexara.mobile.nativeapp.access.PlatformAccounts
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ActivityEvidencePdfStepRequest
import mx.nexara.mobile.nativeapp.data.api.AddTeamMemberRequest
import mx.nexara.mobile.nativeapp.data.api.GeocercaAlertaDto
import mx.nexara.mobile.nativeapp.data.api.GeocercaDto
import mx.nexara.mobile.nativeapp.data.api.HerramientasChecklistDto
import mx.nexara.mobile.nativeapp.data.api.PalomearHerramientaRequest
import mx.nexara.mobile.nativeapp.data.api.JustificarZonaRequest
import mx.nexara.mobile.nativeapp.data.api.OperationalProjectDto
import mx.nexara.mobile.nativeapp.data.api.SalesClientDto
import mx.nexara.mobile.nativeapp.data.api.ActivityEvidencePhotoStepRequest
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.BoardAsignadaPorMiDto
import mx.nexara.mobile.nativeapp.data.api.CelebracionesHoyDto
import mx.nexara.mobile.nativeapp.data.api.CoreActivitiesApi
import mx.nexara.mobile.nativeapp.data.api.CreateActivityRequest
import mx.nexara.mobile.nativeapp.data.api.DispatchMyActivityRequest
import mx.nexara.mobile.nativeapp.data.api.EvidenceCampoDto
import mx.nexara.mobile.nativeapp.data.api.EvidenceCampoFotoRequest
import mx.nexara.mobile.nativeapp.data.api.EvidenceCamposJson
import mx.nexara.mobile.nativeapp.data.api.EvidenceFlowDto
import mx.nexara.mobile.nativeapp.data.api.EvidencePhotoGeoRequest
import mx.nexara.mobile.nativeapp.data.api.EvidencePhotosWithGeoRequest
import mx.nexara.mobile.nativeapp.data.api.EvidenceResubmitRequest
import mx.nexara.mobile.nativeapp.data.api.MyActivitiesResponseDto
import mx.nexara.mobile.nativeapp.data.api.ReorderMyActivitiesRequest
import mx.nexara.mobile.nativeapp.data.api.ReprogramarDespachoRequest
import mx.nexara.mobile.nativeapp.data.api.RevisarEvidenciaRequest
import mx.nexara.mobile.nativeapp.data.api.TeamBoardHistoryItemDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardResponseDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import mx.nexara.mobile.nativeapp.data.api.TeamEvidenceResponseDto
import retrofit2.HttpException

/** Core (/erp): Mis actividades, pizarra, evidencias del equipo y captura. */
class CoreActivitiesRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: CoreActivitiesApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(CoreActivitiesApi::class.java)

    // ── Mis actividades ─────────────────────────────────────────────────────

    suspend fun myActivities(): MyActivitiesResponseDto = api.myActivities()

    /** Cumpleaños y aniversarios de hoy en la empresa (aviso arriba de Actividades). */
    suspend fun celebracionesHoy(): CelebracionesHoyDto = api.celebracionesHoy()

    suspend fun reorder(
        activityIds: List<Long>,
        movedActivityId: Long,
        justificacion: String,
    ): MyActivitiesResponseDto = api.reorderMyActivities(
        ReorderMyActivitiesRequest(
            activityIds = activityIds,
            movedActivityId = movedActivityId,
            justificacion = justificacion,
        ),
    )

    /** Devuelve el id creado; null si quedó en la cola sin conexión. */
    suspend fun selfAssign(body: CreateActivityRequest): Long? = createdId(api.selfAssign(body).string())

    /** Asignar a otra persona (`POST activities`); null si quedó en la cola sin conexión. */
    suspend fun createActivity(body: CreateActivityRequest): Long? = createdId(api.createActivity(body).string())

    private fun createdId(raw: String): Long? {
        val trimmed = raw.trim()
        if (!trimmed.startsWith("{")) return null
        return runCatching { org.json.JSONObject(trimmed).optLong("id", 0L) }
            .getOrNull()
            ?.takeIf { it > 0L }
    }

    /** @param horasPlan «Tiempo estimado» de quien asigna (contrato B). */
    suspend fun addTeamMember(
        activityId: Long,
        userId: Long,
        rol: String,
        indicaciones: String?,
        horasPlan: Double? = null,
    ) {
        api.addTeamMember(
            activityId,
            AddTeamMemberRequest(
                userId = userId,
                rol = rol,
                indicaciones = indicaciones?.trim()?.takeIf { it.isNotEmpty() },
                horasPlan = horasPlan?.takeIf { it > 0 },
            ),
        ).close()
    }

    suspend fun salesClients(sector: String): List<SalesClientDto> = api.salesClients(sector)

    suspend fun operationalProjects(): List<OperationalProjectDto> = api.operationalProjects()

    /** «AN sugerido» del formulario web; vacío si el API no lo da. */
    suspend fun nextAnNumber(): String {
        val raw = api.nextAnNumber().string().trim()
        if (!raw.startsWith("{")) return ""
        return runCatching { org.json.JSONObject(raw).optString("next", "") }.getOrDefault("")
    }

    /**
     * «Iniciar actividad»: guarda la hora real de inicio y avisa a quien la asignó.
     * No hay aceptar ni rechazar (regla del 18-09). Solo en línea: encolada, la hora
     * sería la de cuando regrese la señal.
     */
    suspend fun iniciarActividad(activityId: Long) {
        api.iniciarActividad(activityId).close()
    }

    /**
     * Checklist de herramientas de la OT: qué hay que llevar y qué ya se palomeó.
     * Solo de quien la tiene asignada (a los demás el API contesta 403).
     */
    suspend fun herramientasChecklist(activityId: Long): HerramientasChecklistDto =
        api.herramientasChecklist(activityId)

    /**
     * Palomear un renglón del checklist. Devuelve el checklist completo, así que
     * la pantalla no vuelve a pedirlo.
     *
     * @param ok true = «lo traigo y sirve»; false = «falta o está dañado» (sigue pendiente).
     */
    suspend fun palomearHerramienta(
        activityId: Long,
        requirementId: Long,
        ok: Boolean,
        nota: String? = null,
        fotoUrl: String? = null,
    ): HerramientasChecklistDto = api.palomearHerramienta(
        activityId,
        requirementId,
        PalomearHerramientaRequest(
            ok = ok,
            nota = nota?.trim()?.takeIf { it.isNotEmpty() },
            fotoUrl = fotoUrl?.trim()?.takeIf { it.isNotEmpty() },
        ),
    )

    /** @param horasPlan «Tiempo estimado» de quien reparte (contrato B). */
    suspend fun dispatch(activityId: Long, userIds: List<Long>, indicaciones: String?, horasPlan: Double? = null) {
        api.dispatch(
            activityId,
            DispatchMyActivityRequest(
                userIds = userIds,
                indicaciones = indicaciones?.trim()?.takeIf { it.isNotEmpty() },
                horasPlan = horasPlan?.takeIf { it > 0 },
            ),
        ).close()
    }

    suspend fun reprogramar(activityId: Long, fechaIso: String, motivo: String?) {
        api.reprogramar(
            activityId,
            ReprogramarDespachoRequest(
                fecha = fechaIso,
                motivo = motivo?.trim()?.takeIf { it.isNotEmpty() },
            ),
        ).close()
    }

    // ── Pizarra ─────────────────────────────────────────────────────────────

    /**
     * Safety net: Christian/Adam/Claudia/cuenta demo no deben verse como equipo/empleados.
     *
     * @param desde/@param hasta rango `AAAA-MM-DD` (contrato C); sin ellos, hoy.
     */
    suspend fun board(desde: String? = null, hasta: String? = null): TeamBoardResponseDto {
        val raw = api.board(desde = desde, hasta = hasta)
        return raw.copy(users = raw.users?.filter { !PlatformAccounts.isNonEmployeeEmail(it.email) })
    }

    suspend fun boardUser(userId: Long, desde: String? = null, hasta: String? = null): TeamBoardUserDto =
        api.boardUser(userId, desde = desde, hasta = hasta)

    suspend fun boardUserHistory(
        userId: Long,
        desde: String? = null,
        hasta: String? = null,
    ): List<TeamBoardHistoryItemDto> = api.boardUserHistory(userId, desde = desde, hasta = hasta)

    /**
     * «Asignadas por mí» en el rango.
     *
     * Se lee crudo y se aceptan las dos formas que puede tomar el API mientras
     * se construye: un arreglo suelto o `{ items: [...] }`. Si todavía no
     * existe el endpoint, la lista sale vacía y la pantalla lo dice.
     */
    suspend fun boardAsignadasPorMi(desde: String? = null, hasta: String? = null): List<BoardAsignadaPorMiDto> {
        val raw = api.boardAsignadasPorMi(desde = desde, hasta = hasta).string().trim()
        if (raw.isEmpty()) return emptyList()
        val moshi = com.squareup.moshi.Moshi.Builder()
            .add(com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory())
            .build()
        val listType = com.squareup.moshi.Types.newParameterizedType(
            List::class.java,
            BoardAsignadaPorMiDto::class.java,
        )
        if (raw.startsWith("[")) {
            return runCatching { moshi.adapter<List<BoardAsignadaPorMiDto>>(listType).fromJson(raw) }
                .getOrNull()
                .orEmpty()
        }
        val wrapperType = com.squareup.moshi.Types.newParameterizedType(
            Map::class.java,
            String::class.java,
            listType,
        )
        val wrapper = runCatching {
            moshi.adapter<Map<String, List<BoardAsignadaPorMiDto>>>(wrapperType).fromJson(raw)
        }.getOrNull()
        return wrapper?.get("items") ?: wrapper?.get("actividades") ?: emptyList()
    }

    // ── Evidencias del equipo ───────────────────────────────────────────────

    suspend fun teamEvidence(activityId: Long): TeamEvidenceResponseDto = api.teamEvidence(activityId)

    suspend fun reviewTeamEvidence(
        activityId: Long,
        userId: Long,
        request: RevisarEvidenciaRequest,
    ): TeamEvidenceResponseDto = api.reviewTeamEvidence(activityId, userId, request)

    // ── Captura de quien ejecuta ────────────────────────────────────────────

    /**
     * El flujo no existe hasta la foto de entrada: la API contesta 404
     * «Evidencias no encontradas». Eso no es un error, es el paso 1.
     */
    suspend fun evidenceFlowOrNull(activityId: Long): EvidenceFlowDto? = try {
        api.evidenceFlow(activityId)
    } catch (e: HttpException) {
        if (e.code() == 404) null else throw e
    }

    /** @param justificacionOrden por qué empezó esta y no la de más prioridad (contrato B). */
    suspend fun entryPhoto(
        activityId: Long,
        photoUrl: String,
        lat: Double,
        lng: Double,
        justificacionOrden: String? = null,
        mockLocation: Boolean? = null,
    ): EvidenceFlowDto = api.entryPhoto(
        activityId,
        ActivityEvidencePhotoStepRequest(
            photoUrl = photoUrl,
            latitude = lat,
            longitude = lng,
            justificacionOrden = justificacionOrden?.trim()?.takeIf { it.isNotEmpty() },
            mockLocation = mockLocation,
        ),
    )

    suspend fun evidencePhotos(
        activityId: Long,
        photoUrls: List<String>,
        photoGeo: List<EvidencePhotoGeoRequest?>,
    ): EvidenceFlowDto = api.evidencePhotos(activityId, EvidencePhotosWithGeoRequest(photoUrls, photoGeo))

    /**
     * Evidencia por campos: una foto de un campo en un momento
     * (`ANTES | EN_PROGRESO | DESPUES`). La imagen viaja como data URL en
     * `photoUrl`, igual que la foto de entrada.
     *
     * @return la lista COMPLETA de campos que devuelve el API, o `null` si sin
     *   conexión la petición quedó en la cola (el interceptor responde 202
     *   `{"queued":true}`).
     */
    suspend fun campoFoto(
        activityId: Long,
        campoId: Long,
        momento: String,
        photoUrl: String,
        lat: Double? = null,
        lng: Double? = null,
        capturedAt: String? = null,
    ): List<EvidenceCampoDto>? {
        val body = api.evidenceCampoFoto(
            activityId,
            campoId,
            EvidenceCampoFotoRequest(
                momento = momento,
                photoUrl = photoUrl,
                latitude = lat,
                longitude = lng,
                capturedAt = capturedAt?.trim()?.takeIf { it.isNotEmpty() },
            ),
        )
        return EvidenceCamposJson.lista(body.use { it.string() })
    }

    suspend fun serviceSheetPdf(activityId: Long, pdfDataUrl: String): EvidenceFlowDto =
        api.serviceSheetPdf(activityId, ActivityEvidencePdfStepRequest(pdfDataUrl))

    suspend fun serviceSheetData(activityId: Long, form: Map<String, String>): EvidenceFlowDto =
        api.serviceSheetData(activityId, form)

    suspend fun exitPhoto(
        activityId: Long,
        photoUrl: String,
        lat: Double,
        lng: Double,
        mockLocation: Boolean? = null,
    ): EvidenceFlowDto =
        api.exitPhoto(
            activityId,
            ActivityEvidencePhotoStepRequest(
                photoUrl = photoUrl,
                latitude = lat,
                longitude = lng,
                mockLocation = mockLocation,
            ),
        )

    suspend fun resubmit(activityId: Long, step: String, data: Any): EvidenceFlowDto =
        api.resubmit(activityId, EvidenceResubmitRequest(step = step, data = data))

    /** Punto de inicio, recorrido y salidas de zona de quien ejecuta la actividad. */
    suspend fun geocerca(activityId: Long): GeocercaDto = api.geocerca(activityId)

    suspend fun justificarZona(activityId: Long, alertId: Long, motivo: String, fotoBase64: String?): GeocercaAlertaDto =
        api.justificarZona(activityId, alertId, JustificarZonaRequest(motivo = motivo, fotoBase64 = fotoBase64))
}
