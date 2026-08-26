package mx.nexara.mobile.nativeapp.data.crm

import android.content.Context
import android.net.Uri
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.CalendarEventDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionDetailDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionDto
import mx.nexara.mobile.nativeapp.data.api.CrmActivityDto
import mx.nexara.mobile.nativeapp.data.api.CrmAgendaDto
import mx.nexara.mobile.nativeapp.data.api.ProcParse
import mx.nexara.mobile.nativeapp.data.api.CrmApi
import mx.nexara.mobile.nativeapp.data.api.CrmClientDto
import mx.nexara.mobile.nativeapp.data.api.CrmLeadDto
import mx.nexara.mobile.nativeapp.data.api.CrmOpportunityDetailDto
import mx.nexara.mobile.nativeapp.data.api.CrmOpportunityDto
import mx.nexara.mobile.nativeapp.data.api.CrmProductDto
import mx.nexara.mobile.nativeapp.data.api.CrmSalesProjectDto
import mx.nexara.mobile.nativeapp.data.api.ExtraApi
import mx.nexara.mobile.nativeapp.data.api.OrderTemplateDto
import mx.nexara.mobile.nativeapp.data.api.SalesTargetDto
import mx.nexara.mobile.nativeapp.data.api.SalesTeamMemberDto
import mx.nexara.mobile.nativeapp.data.api.TenderDto
import mx.nexara.mobile.nativeapp.data.api.toAbsoluteAssetUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.lang.reflect.ParameterizedType

class CrmRepository(private val context: Context) {
    private val appContext = context.applicationContext
    private val authRepo = AuthRepository(appContext)
    private val crmApi: CrmApi = ApiClient.authed { authRepo.token() }.create(CrmApi::class.java)
    private val extraApi: ExtraApi = ApiClient.authed { authRepo.token() }.create(ExtraApi::class.java)

    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    private inline fun <reified T> parseList(raw: String): List<T> {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return emptyList()
        val listType: ParameterizedType = Types.newParameterizedType(List::class.java, T::class.java)
        if (trimmed.startsWith("[")) {
            return moshi.adapter<List<T>>(listType).fromJson(trimmed) ?: emptyList()
        }
        if (trimmed.startsWith("{")) {
            val mapType = Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java)
            val map = moshi.adapter<Map<String, Any?>>(mapType).fromJson(trimmed) ?: return emptyList()
            for (k in listOf("items", "data", "results", "rows")) {
                val v = map[k]
                if (v is List<*>) {
                    val reJson = moshi.adapter(Any::class.java).toJson(v)
                    return moshi.adapter<List<T>>(listType).fromJson(reJson) ?: emptyList()
                }
            }
        }
        return emptyList()
    }

    private suspend inline fun <reified T> parseListResponse(body: okhttp3.ResponseBody): List<T> =
        parseList(body.string())

    suspend fun cotizaciones(status: String? = null, clientName: String? = null): List<CotizacionDto> {
        val rows = try {
            parseMaps(crmApi.listCotizacionesRaw(clientName = clientName, status = status).string())
        } catch (_: Exception) {
            parseMaps(extraApi.getCotizacionesRaw().string())
        }
        return rows.map { CotizacionDto.fromRaw(it) }
    }

    suspend fun oportunidades(): List<Map<String, Any?>> = opportunityDtos().map { it.toFlatMap() }
    suspend fun opportunityDtos(): List<CrmOpportunityDto> =
        parseMaps(crmApi.listOportunidadesRaw().string()).map { CrmOpportunityDto.fromRaw(it) }

    suspend fun getOpportunity(id: Long): Map<String, Any?> =
        opportunityDetail(id).raw

    suspend fun opportunityDetail(id: Long): CrmOpportunityDetailDto =
        CrmOpportunityDetailDto.fromRaw(parseObject(crmApi.getOpportunityRaw(id).string()))

    suspend fun addOpportunityNote(id: Long, message: String): Map<String, Any?> =
        parseObject(crmApi.addOpportunityNoteRaw(id, mapOf("message" to message)).string())

    suspend fun addOpportunityEvidences(id: Long, uris: List<Uri>): List<Map<String, Any?>> {
        val parts = uris.mapNotNull { filePart(it) }
        if (parts.isEmpty()) return emptyList()
        return parseMaps(crmApi.addOpportunityEvidencesRaw(id, parts).string())
    }

    suspend fun createOpportunity(fields: Map<String, Any?>): Map<String, Any?> =
        parseObject(crmApi.createOpportunityRaw(fields).string())

    suspend fun updateOpportunity(id: Long, fields: Map<String, Any?>): Map<String, Any?> =
        parseObject(crmApi.updateOpportunityRaw(id, fields).string())

    suspend fun deleteOpportunity(id: Long) {
        crmApi.deleteOpportunityRaw(id)
    }

    suspend fun downloadAssetBytes(relativeOrAbsoluteUrl: String): ByteArray {
        val url = toAbsoluteAssetUrl(relativeOrAbsoluteUrl)
        val token = authRepo.token()
        val client = OkHttpClient()
        val req = Request.Builder().url(url).apply {
            if (!token.isNullOrBlank()) header("Authorization", "Bearer $token")
        }.build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw IllegalStateException("HTTP ${resp.code}")
            return resp.body?.bytes() ?: throw IllegalStateException("Respuesta vacía")
        }
    }

    private fun filePart(uri: Uri): MultipartBody.Part? {
        val resolver = appContext.contentResolver
        val mime = resolver.getType(uri) ?: "application/octet-stream"
        val name = uri.lastPathSegment?.substringAfterLast('/') ?: "file"
        val tmp = File.createTempFile("nexara_opp_", "_$name", appContext.cacheDir)
        resolver.openInputStream(uri)?.use { input ->
            tmp.outputStream().use { output -> input.copyTo(output) }
        } ?: return null
        val body = tmp.asRequestBody(mime.toMediaType())
        return MultipartBody.Part.createFormData("files", name, body)
    }

    suspend fun clientes(): List<Map<String, Any?>> = clientDtos().map { it.toFlatMap() }
    suspend fun clientDtos(): List<CrmClientDto> =
        parseMaps(crmApi.listClientesRaw().string()).map { CrmClientDto.fromRaw(it) }

    suspend fun getClientDetail(id: Long): Map<String, Any?> =
        parseObject(crmApi.getClientRaw(id).string())

    suspend fun getClientSnapshot(id: Long): Map<String, Any?> =
        parseObject(crmApi.getClientSnapshotRaw(id).string())

    suspend fun leads(): List<Map<String, Any?>> = leadDtos().map { it.raw }
    suspend fun leadDtos(): List<CrmLeadDto> =
        parseMaps(crmApi.listLeadsRaw().string()).map { CrmLeadDto.fromRaw(it) }

    suspend fun getLead(id: Long): CrmLeadDto =
        CrmLeadDto.fromRaw(parseObject(crmApi.getLeadRaw(id).string()))

    suspend fun createLead(fields: Map<String, Any?>): CrmLeadDto =
        CrmLeadDto.fromRaw(parseObject(crmApi.createLeadRaw(fields).string()))

    suspend fun updateLead(id: Long, fields: Map<String, Any?>): CrmLeadDto =
        CrmLeadDto.fromRaw(parseObject(crmApi.updateLeadRaw(id, fields).string()))

    suspend fun deleteLead(id: Long) {
        crmApi.deleteLeadRaw(id)
    }

    suspend fun createClient(fields: Map<String, Any?>): Map<String, Any?> =
        parseObject(crmApi.createClientRaw(fields).string())

    suspend fun updateClient(id: Long, fields: Map<String, Any?>): Map<String, Any?> =
        parseObject(crmApi.updateClientRaw(id, fields).string())

    suspend fun provisionServiceClient(id: Long): Map<String, Any?> {
        val result = parseObject(crmApi.provisionServiceClientRaw(id).string())
        @Suppress("UNCHECKED_CAST")
        val salesClient = result["salesClient"] as? Map<String, Any?>
        return salesClient ?: getClientDetail(id)
    }

    suspend fun convertLeadToOpportunity(
        lead: CrmLeadDto,
        value: Double,
        stage: String = "DISCOVERY",
    ): Map<String, Any?> {
        val leadId = lead.numericId ?: throw IllegalStateException("Lead sin ID")
        val clientLabel = lead.clientName.ifBlank { lead.displayTitle }
        val client = createClient(
            mapOf(
                "legalName" to clientLabel,
                "billingEmail" to ProcParse.str(lead.raw["email"]),
                "billingPhone" to ProcParse.str(lead.raw["phone"]),
                "notes" to "Cliente desde lead #$leadId",
            ),
        )
        val clientId = ProcParse.lng(client["id"])
        updateLead(leadId, mapOf("status" to "CONVERTED", "clientId" to clientId))
        return createOpportunity(
            mapOf(
                "title" to clientLabel,
                "value" to value,
                "stage" to stage,
                "probability" to 30,
                "leadId" to leadId,
                "clientId" to clientId,
                "clientName" to clientLabel,
            ),
        )
    }

    suspend fun proyectos(): List<Map<String, Any?>> = projectDtos().map { it.toFlatMap() }
    suspend fun projectDtos(): List<CrmSalesProjectDto> =
        parseMaps(crmApi.listProyectosRaw().string()).map { CrmSalesProjectDto.fromRaw(it) }

    suspend fun getProjectSummary(id: Long): Map<String, Any?> =
        parseObject(crmApi.getProjectSummaryRaw(id).string())

    suspend fun products(search: String? = null): List<Map<String, Any?>> =
        productDtos(search).map { it.toFlatMap() }
    suspend fun productDtos(search: String? = null): List<CrmProductDto> =
        parseMaps(crmApi.listProductsRaw(search).string()).map { CrmProductDto.fromRaw(it) }

    suspend fun calendarEvents(): List<Map<String, Any?>> =
        calendarEventDtos().map { it.raw }

    suspend fun calendarEventDtos(): List<CalendarEventDto> =
        parseMaps(crmApi.listCalendarEventsRaw().string()).map { CalendarEventDto.fromRaw(it) }

    suspend fun tenders(): List<Map<String, Any?>> = tenderDtos().map { it.raw }
    suspend fun tenderDtos(): List<TenderDto> =
        parseMaps(crmApi.listTendersRaw().string()).map { TenderDto.fromRaw(it) }

    suspend fun salesTargets(): List<Map<String, Any?>> = salesTargetDtos().map { it.raw }
    suspend fun salesTargetDtos(): List<SalesTargetDto> =
        parseMaps(crmApi.listSalesTargetsRaw().string()).map { SalesTargetDto.fromRaw(it) }

    suspend fun salesTeam(period: String = "month"): List<Map<String, Any?>> =
        salesTeamMemberDtos(period).map { it.raw }
    suspend fun salesTeamMemberDtos(period: String = "month"): List<SalesTeamMemberDto> =
        parseMaps(crmApi.listSalesTeamRaw(period).string()).map { SalesTeamMemberDto.fromRaw(it) }

    suspend fun salesMetrics(period: String = "month"): Map<String, Any?> =
        parseObject(crmApi.getSalesMetricsRaw(period).string())

    suspend fun vendorStats(period: String = "month"): List<Map<String, Any?>> =
        parseMaps(crmApi.listSalesTeamRaw(period).string())

    suspend fun orderTemplates(): List<Map<String, Any?>> =
        orderTemplateDtos().map { it.raw }

    suspend fun orderTemplateDtos(): List<OrderTemplateDto> =
        parseMaps(crmApi.listOrderTemplatesRaw().string()).map { OrderTemplateDto.fromRaw(it) }

    suspend fun createOrderTemplate(fields: Map<String, String>): Map<String, Any?> =
        parseObject(crmApi.createOrderTemplateRaw(fields).string())

    suspend fun setOrderTemplateDefault(id: Long): Map<String, Any?> =
        parseObject(crmApi.setOrderTemplateDefaultRaw(id).string())

    suspend fun cotizacionDetail(id: Long): CotizacionDetailDto =
        CotizacionDetailDto.fromRaw(parseObject(crmApi.getCotizacionDetailRaw(id).string()))

    suspend fun downloadCotizacionPdf(id: Long, internal: Boolean = false): ByteArray {
        val body = if (internal) crmApi.downloadCotizacionInternalPdfRaw(id) else crmApi.downloadCotizacionPdfRaw(id)
        return body.bytes()
    }

    suspend fun sendCotizacion(id: Long, email: String, message: String? = null): Map<String, Any?> {
        val payload = buildMap {
            put("email", email)
            if (!message.isNullOrBlank()) put("message", message)
        }
        return parseObject(crmApi.sendCotizacionRaw(id, payload).string())
    }

    suspend fun updateOpportunityStage(id: Long, stage: String): Map<String, Any?> =
        updateOpportunity(id, mapOf("stage" to stage))

    suspend fun crmActivitiesForOpportunity(opportunityId: Long): List<CrmActivityDto> =
        parseMaps(crmApi.listCrmActivitiesRaw(opportunityId = opportunityId).string())
            .map { CrmActivityDto.fromRaw(it) }

    suspend fun crmAgenda(): CrmAgendaDto {
        val raw = parseObject(crmApi.myAgendaRaw().string())
        fun parseList(key: String): List<CrmActivityDto> {
            @Suppress("UNCHECKED_CAST")
            val list = raw[key] as? List<Map<String, Any?>> ?: return emptyList()
            return list.map { CrmActivityDto.fromRaw(it) }
        }
        return CrmAgendaDto(
            pendingToday = parseList("pendingToday"),
            overdue = parseList("overdue"),
            upcoming = parseList("upcoming"),
            recentlyCompleted = parseList("recentlyCompleted"),
        )
    }

    suspend fun completeCrmActivity(id: Long, outcome: String? = null) {
        crmApi.completeCrmActivityRaw(id, mapOf("outcome" to outcome))
    }

    suspend fun deleteOrderTemplate(id: Long) {
        crmApi.deleteOrderTemplateRaw(id)
    }

    private fun parseObject(raw: String): Map<String, Any?> {
        val trimmed = raw.trim()
        if (trimmed.isEmpty() || !trimmed.startsWith("{")) return emptyMap()
        val mapType = Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java)
        return moshi.adapter<Map<String, Any?>>(mapType).fromJson(trimmed) ?: emptyMap()
    }

    private fun parseMaps(raw: String): List<Map<String, Any?>> {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return emptyList()
        val mapListType: ParameterizedType = Types.newParameterizedType(
            List::class.java,
            Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java),
        )
        if (trimmed.startsWith("[")) {
            return moshi.adapter<List<Map<String, Any?>>>(mapListType).fromJson(trimmed) ?: emptyList()
        }
        if (trimmed.startsWith("{")) {
            val mapType = Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java)
            val obj = moshi.adapter<Map<String, Any?>>(mapType).fromJson(trimmed) ?: return emptyList()
            for (k in listOf("items", "data", "results", "rows")) {
                val v = obj[k]
                if (v is List<*>) {
                    val reJson = moshi.adapter(Any::class.java).toJson(v)
                    return moshi.adapter<List<Map<String, Any?>>>(mapListType).fromJson(reJson) ?: emptyList()
                }
            }
        }
        return emptyList()
    }
}
