package mx.nexara.mobile.nativeapp.data.crm

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.CotizacionDto
import mx.nexara.mobile.nativeapp.data.api.CrmApi
import mx.nexara.mobile.nativeapp.data.api.ExtraApi
import java.lang.reflect.ParameterizedType

class CrmRepository(context: Context) {
    private val authRepo = AuthRepository(context)
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

    suspend fun cotizaciones(): List<CotizacionDto> {
        return try {
            parseListResponse(crmApi.listCotizacionesRaw())
        } catch (_: Exception) {
            parseListResponse(extraApi.getCotizacionesRaw())
        }
    }

    suspend fun oportunidades(): List<Map<String, Any?>> = parseMaps(crmApi.listOportunidadesRaw().string())

    suspend fun clientes(): List<Map<String, Any?>> = parseMaps(crmApi.listClientesRaw().string())

    suspend fun leads(): List<Map<String, Any?>> = parseMaps(crmApi.listLeadsRaw().string())

    suspend fun proyectos(): List<Map<String, Any?>> = parseMaps(crmApi.listProyectosRaw().string())

    suspend fun products(search: String? = null): List<Map<String, Any?>> =
        parseMaps(crmApi.listProductsRaw(search).string())

    suspend fun calendarEvents(): List<Map<String, Any?>> =
        parseMaps(crmApi.listCalendarEventsRaw().string())

    suspend fun tenders(): List<Map<String, Any?>> =
        parseMaps(crmApi.listTendersRaw().string())

    suspend fun salesTargets(): List<Map<String, Any?>> =
        parseMaps(crmApi.listSalesTargetsRaw().string())

    suspend fun salesTeam(): List<Map<String, Any?>> =
        parseMaps(crmApi.listSalesTeamRaw().string())

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
