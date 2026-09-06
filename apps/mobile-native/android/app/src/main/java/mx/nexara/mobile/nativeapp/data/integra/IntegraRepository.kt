package mx.nexara.mobile.nativeapp.data.integra

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.IntegraAddPersonRequest
import mx.nexara.mobile.nativeapp.data.api.IntegraAlarmActionRequest
import mx.nexara.mobile.nativeapp.data.api.IntegraApi
import mx.nexara.mobile.nativeapp.data.api.IntegraFaceUploadRequest
import mx.nexara.mobile.nativeapp.data.api.IntegraOpenDoorRequest
import mx.nexara.mobile.nativeapp.data.api.IntegraUpdatePersonRequest
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

    private fun parseFlexibleList(body: ResponseBody): List<Map<String, Any?>> {
        val raw = body.string().trim()
        if (raw.isEmpty()) return emptyList()
        if (raw.startsWith("[")) {
            val listType = Types.newParameterizedType(
                List::class.java,
                Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java),
            )
            return moshi.adapter<List<Map<String, Any?>>>(listType).fromJson(raw) ?: emptyList()
        }
        return parseItemsFromMap(raw)
    }

    private fun parseItemsFromMap(raw: String): List<Map<String, Any?>> {
        val mapType: ParameterizedType = Types.newParameterizedType(
            Map::class.java,
            String::class.java,
            Any::class.java,
        )
        val root = moshi.adapter<Map<String, Any?>>(mapType).fromJson(raw) ?: emptyMap()
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

    suspend fun addPerson(
        personName: String,
        gender: String? = null,
        userType: String? = null,
        autoCode: Boolean = true,
    ): Map<String, Any?> = parseMap(
        api.addPerson(
            IntegraAddPersonRequest(
                personName = personName.trim(),
                gender = gender,
                userType = userType,
                autoCode = autoCode,
                validEnable = true,
            ),
        ),
    )

    suspend fun updatePerson(
        personId: String,
        personName: String? = null,
        gender: String? = null,
        validEnable: Boolean? = null,
    ): Map<String, Any?> = parseMap(
        api.updatePerson(
            personId = personId,
            body = IntegraUpdatePersonRequest(
                personName = personName?.trim()?.ifBlank { null },
                gender = gender,
                validEnable = validEnable,
            ),
        ),
    )

    suspend fun deletePerson(personId: String, force: Boolean = false): Map<String, Any?> =
        parseMap(api.deletePerson(personId = personId, force = if (force) "1" else null))

    suspend fun uploadPersonFace(personId: String, imageBase64: String): Map<String, Any?> {
        val raw = imageBase64.trim().let { s ->
            val idx = s.indexOf("base64,")
            if (idx >= 0) s.substring(idx + "base64,".length) else s
        }
        return parseMap(api.uploadPersonFace(personId, IntegraFaceUploadRequest(imageBase64 = raw)))
    }

    suspend fun deletePersonFace(personId: String): Map<String, Any?> =
        parseMap(api.deletePersonFace(personId))

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

    data class AlarmQueueResult(
        val items: List<Map<String, Any?>>,
        val openCount: Int,
    )

    suspend fun alarmQueue(hours: Int = 24): AlarmQueueResult {
        val root = parseMap(api.alarmQueue(hours = hours))
        val items = (root["items"] as? List<*>)?.filterIsInstance<Map<String, Any?>>() ?: emptyList()
        val openCount = (root["openCount"] as? Number)?.toInt() ?: 0
        return AlarmQueueResult(items = items, openCount = openCount)
    }

    suspend fun ackAlarm(alarmId: String, note: String? = null) {
        api.ackAlarm(alarmId, IntegraAlarmActionRequest(note = note?.trim()?.ifBlank { null }))
    }

    suspend fun clearAlarm(alarmId: String, note: String? = null) {
        api.clearAlarm(alarmId, IntegraAlarmActionRequest(note = note?.trim()?.ifBlank { null }))
    }

    suspend fun occupancy(): Pair<List<Map<String, Any?>>, Int> {
        val root = parseMap(api.occupancy())
        val items = (root["items"] as? List<*>)?.filterIsInstance<Map<String, Any?>>() ?: emptyList()
        val total = (root["total"] as? Number)?.toInt() ?: items.size
        return items to total
    }

    suspend fun devices(): List<Map<String, Any?>> =
        parseItems(api.listDevices())

    suspend fun sites(): List<Map<String, Any?>> =
        parseFlexibleList(api.listSites())
}
