package mx.nexara.mobile.nativeapp.data.integra

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.IntegraApi
import mx.nexara.mobile.nativeapp.data.api.IntegraOpenDoorRequest
import okhttp3.ResponseBody
import java.lang.reflect.ParameterizedType
import java.time.Instant
import java.time.temporal.ChronoUnit

class IntegraRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: IntegraApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(IntegraApi::class.java)

    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    private fun parseMap(body: ResponseBody): Map<String, Any?> {
        val raw = body.string().trim()
        if (raw.isEmpty()) return emptyMap()
        val mapType: ParameterizedType = Types.newParameterizedType(
            Map::class.java,
            String::class.java,
            Any::class.java,
        )
        return moshi.adapter<Map<String, Any?>>(mapType).fromJson(raw) ?: emptyMap()
    }

    private fun parseItems(body: ResponseBody): List<Map<String, Any?>> {
        val root = parseMap(body)
        val direct = root["items"]
        if (direct is List<*>) {
            @Suppress("UNCHECKED_CAST")
            return direct.filterIsInstance<Map<String, Any?>>()
        }
        for (key in listOf("list", "data", "results", "rows")) {
            val nested = root[key]
            when (nested) {
                is List<*> -> {
                    @Suppress("UNCHECKED_CAST")
                    return nested.filterIsInstance<Map<String, Any?>>()
                }
                is Map<*, *> -> {
                    @Suppress("UNCHECKED_CAST")
                    val map = nested as Map<String, Any?>
                    val inner = map["list"] ?: map["items"]
                    if (inner is List<*>) {
                        @Suppress("UNCHECKED_CAST")
                        return inner.filterIsInstance<Map<String, Any?>>()
                    }
                }
            }
        }
        return emptyList()
    }

    suspend fun doors(live: Boolean = false): List<Map<String, Any?>> =
        parseItems(api.listDoors(live = if (live) "1" else null))

    suspend fun openDoor(doorId: String, reason: String) {
        api.openDoor(doorId, IntegraOpenDoorRequest(reason = reason))
    }

    suspend fun events(limit: Int = 60): List<Map<String, Any?>> {
        val end = Instant.now()
        val start = end.minus(24, ChronoUnit.HOURS)
        return parseItems(
            api.listEvents(
                limit = limit,
                pageNo = 1,
                startTime = start.toString(),
                endTime = end.toString(),
            ),
        )
    }

    suspend fun people(live: Boolean = false): List<Map<String, Any?>> =
        parseItems(api.listPeople(live = if (live) "1" else null))

    suspend fun personDetail(personId: String): Map<String, Any?> =
        parseMap(api.getPerson(personId))

    suspend fun attendance(days: Int = 7): List<Map<String, Any?>> {
        val end = Instant.now()
        val start = end.minus(days.toLong(), ChronoUnit.DAYS)
        return parseItems(
            api.attendance(
                from = start.toString(),
                to = end.toString(),
            ),
        )
    }

    suspend fun visitorAppointments(pageSize: Int = 40): List<Map<String, Any?>> {
        val end = Instant.now()
        val start = end.minus(8, ChronoUnit.HOURS)
        return parseItems(
            api.searchVisitors(
                mapOf(
                    "pageNo" to 1,
                    "pageSize" to pageSize,
                    "visitStartTime" to start.toString(),
                    "visitEndTime" to end.toString(),
                ),
            ),
        )
    }

    suspend fun registerVisitor(body: Map<String, Any?>): Map<String, Any?> =
        parseMap(api.registerVisitor(body))

    suspend fun recurringVisitors(): List<Map<String, Any?>> =
        parseItems(api.listRecurringVisitors())
}
