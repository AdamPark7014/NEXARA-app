package mx.nexara.mobile.nativeapp.data.integra

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.IntegraAddPersonRequest
import mx.nexara.mobile.nativeapp.data.api.IntegraAlarmActionRequest
import mx.nexara.mobile.nativeapp.data.api.IntegraAlarmTicketRequest
import mx.nexara.mobile.nativeapp.data.api.IntegraApi
import mx.nexara.mobile.nativeapp.data.api.IntegraDoorControlRequest
import mx.nexara.mobile.nativeapp.data.api.IntegraFaceUploadRequest
import mx.nexara.mobile.nativeapp.data.api.IntegraOpenDoorRequest
import mx.nexara.mobile.nativeapp.data.api.IntegraRecurringVisitorRequest
import mx.nexara.mobile.nativeapp.data.api.IntegraUpdatePersonRequest
import okhttp3.ResponseBody
import java.lang.reflect.ParameterizedType
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Sitio INTEGRA activo.
 *
 * La API acepta `siteId` en casi todos sus endpoints y, cuando no llega,
 * resuelve el sitio marcado como predeterminado. En una empresa con dos
 * instalaciones eso significa abrir la puerta equivocada, así que el móvil elige
 * explícitamente igual que hace la web con `localStorage`.
 *
 * Es un objeto de proceso con respaldo en `SharedPreferences`: hay que
 * inicializarlo con [load] antes de la primera petición, cosa que hace el propio
 * repositorio en su constructor.
 */
object IntegraSiteScope {
    private const val PREFS = "nexara_integra"
    private const val KEY_SITE = "site_id"

    private val _selected = MutableStateFlow<Int?>(null)

    /** `null` = «el predeterminado del servidor», que es un estado válido. */
    val selected: StateFlow<Int?> = _selected

    private var loaded = false

    @Synchronized
    fun load(context: Context) {
        if (loaded) return
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val stored = prefs.getInt(KEY_SITE, -1)
        _selected.value = if (stored > 0) stored else null
        loaded = true
    }

    fun select(context: Context, siteId: Int?) {
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit().apply {
            if (siteId == null || siteId <= 0) remove(KEY_SITE) else putInt(KEY_SITE, siteId)
        }.apply()
        loaded = true
        _selected.value = siteId?.takeIf { it > 0 }
    }

    fun current(): Int? = _selected.value
}

/** Página de resultados con la información real de si hay más. */
data class IntegraPage(
    val items: List<Map<String, Any?>>,
    val total: Int,
    val hasMore: Boolean,
    /** Cursor hacia atrás de `integra/push/events`. */
    val nextBeforeId: Long? = null,
    /** Id más alto recibido, para el sondeo incremental. */
    val newestId: Long? = null,
    /** `pageNo` servido, en los endpoints que paginan por número de página. */
    val pageNo: Int = 1,
)

class IntegraRepository(context: Context) {
    private val appContext = context.applicationContext
    private val authRepo = AuthRepository(appContext)
    private val api: IntegraApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(IntegraApi::class.java)

    init {
        IntegraSiteScope.load(appContext)
    }

    private fun site(): Int? = IntegraSiteScope.current()

    fun selectSite(siteId: Int?) = IntegraSiteScope.select(appContext, siteId)

    // ── Parseo ────────────────────────────────────────────────────────────────

    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    private val mapType: ParameterizedType = Types.newParameterizedType(
        Map::class.java,
        String::class.java,
        Any::class.java,
    )

    private fun parseMap(body: ResponseBody): Map<String, Any?> {
        val raw = body.string().trim()
        if (raw.isEmpty()) return emptyMap()
        if (raw.startsWith("[")) return mapOf("items" to parseRootList(raw))
        return moshi.adapter<Map<String, Any?>>(mapType).fromJson(raw) ?: emptyMap()
    }

    private fun parseRootList(raw: String): List<Map<String, Any?>> {
        val listType = Types.newParameterizedType(List::class.java, mapType)
        return moshi.adapter<List<Map<String, Any?>>>(listType).fromJson(raw) ?: emptyList()
    }

    /**
     * Saca el array de resultados. Cada familia de endpoint lo envuelve distinto:
     * `items` (espejo), `list` (crudo del fabricante), o directamente un array de
     * nivel superior (`integra/sites`).
     */
    private fun itemsOf(root: Map<String, Any?>): List<Map<String, Any?>> {
        val direct = root["items"]
        if (direct is List<*>) return direct.filterIsInstance<Map<*, *>>().map { castMap(it) }
        for (key in listOf("list", "data", "results", "rows")) {
            when (val nested = root[key]) {
                is List<*> -> return nested.filterIsInstance<Map<*, *>>().map { castMap(it) }
                is Map<*, *> -> {
                    val inner = castMap(nested)["list"] ?: castMap(nested)["items"]
                    if (inner is List<*>) {
                        return inner.filterIsInstance<Map<*, *>>().map { castMap(it) }
                    }
                }
            }
        }
        return emptyList()
    }

    @Suppress("UNCHECKED_CAST")
    private fun castMap(v: Map<*, *>): Map<String, Any?> = v as Map<String, Any?>

    private fun parseItems(body: ResponseBody): List<Map<String, Any?>> = itemsOf(parseMap(body))

    private fun num(root: Map<String, Any?>, key: String): Long? = (root[key] as? Number)?.toLong()

    // ── Panorama ──────────────────────────────────────────────────────────────

    suspend fun dashboard(): Map<String, Any?> = parseMap(api.dashboard(siteId = site()))

    suspend fun lastSync(): Map<String, Any?> = parseMap(api.lastSync(siteId = site()))

    // ── Puertas ───────────────────────────────────────────────────────────────

    data class DoorsResult(
        val items: List<Map<String, Any?>>,
        /** `mirror` = espejo sincronizado · `live` = estado consultado al ACS. */
        val source: String,
    )

    suspend fun doors(live: Boolean = false): DoorsResult {
        val root = parseMap(api.listDoors(live = if (live) "1" else null, siteId = site()))
        return DoorsResult(
            items = itemsOf(root),
            source = (root["source"] as? String).orEmpty(),
        )
    }

    /** Apertura momentánea. Se conserva para el atajo de una sola pulsación. */
    suspend fun openDoor(doorId: String, reason: String): Map<String, Any?> =
        parseMap(api.openDoor(doorId, IntegraOpenDoorRequest(reason = reason.trim()), siteId = site()))

    /**
     * Las cuatro órdenes de puerta. `reason` va sin recortar la validación: el
     * servidor rechaza con 400 cualquier motivo de menos de tres caracteres, y
     * dejar que lo rechace allí daría un mensaje que no se entiende.
     */
    suspend fun controlDoor(doorId: String, controlType: String, reason: String): Map<String, Any?> =
        parseMap(
            api.controlDoor(
                doorId = doorId,
                body = IntegraDoorControlRequest(controlType = controlType, reason = reason.trim()),
                siteId = site(),
            ),
        )

    // ── Eventos ───────────────────────────────────────────────────────────────

    /**
     * Bitácora del empuje ACS, que es la que usa la web.
     *
     * Trae `label` (etiqueta ya traducida por la tabla única de códigos),
     * `outcome` y `eventState`. Aquí no se clasifica nada: la tabla `major`/`minor`
     * vive sólo en `apps/api/src/hikvision-isapi/acs-codes.ts`.
     */
    suspend fun pushEvents(
        limit: Int = 60,
        scope: String? = "acs",
        outcome: String? = null,
        eventState: String? = null,
        deviceIp: String? = null,
        personName: String? = null,
        personId: String? = null,
        from: Instant? = null,
        to: Instant? = null,
        beforeId: Long? = null,
        afterId: Long? = null,
    ): IntegraPage {
        val root = parseMap(
            api.pushEvents(
                limit = limit,
                scope = scope,
                outcome = outcome,
                eventState = eventState,
                deviceIp = deviceIp?.trim()?.ifBlank { null },
                personId = personId?.trim()?.ifBlank { null },
                personName = personName?.trim()?.ifBlank { null },
                from = from?.toString(),
                to = to?.toString(),
                beforeId = beforeId,
                afterId = afterId,
                live = if (afterId != null) "1" else null,
                siteId = site(),
            ),
        )
        val items = itemsOf(root)
        return IntegraPage(
            items = items,
            total = num(root, "total")?.toInt() ?: items.size,
            hasMore = (root["hasMore"] as? Boolean) ?: false,
            nextBeforeId = num(root, "nextBeforeId"),
            newestId = num(root, "newestId"),
        )
    }

    suspend fun pushEventStats(): Map<String, Any?> = parseMap(api.pushEventStats(siteId = site()))

    /**
     * Bitácora del fabricante (Artemis / ISAPI en vivo). Se usa como respaldo
     * cuando el sitio no empuja eventos: pagina por `pageNo`, no por cursor.
     */
    suspend fun providerEvents(
        pageNo: Int = 1,
        limit: Int = 60,
        doorId: String? = null,
        personName: String? = null,
        from: Instant? = null,
        to: Instant? = null,
    ): IntegraPage {
        val end = to ?: Instant.now()
        val start = from ?: end.minus(24, ChronoUnit.HOURS)
        val root = parseMap(
            api.listEvents(
                limit = limit,
                pageNo = pageNo,
                doorId = doorId?.trim()?.ifBlank { null },
                personName = personName?.trim()?.ifBlank { null },
                startTime = start.toString(),
                endTime = end.toString(),
                siteId = site(),
            ),
        )
        val items = itemsOf(root)
        val total = num(root, "total")?.toInt() ?: items.size
        val pageSize = num(root, "pageSize")?.toInt() ?: limit
        return IntegraPage(
            items = items,
            total = total,
            hasMore = pageNo * pageSize < total,
            pageNo = pageNo,
        )
    }

    // ── Personas ──────────────────────────────────────────────────────────────

    suspend fun people(live: Boolean = false): List<Map<String, Any?>> =
        parseItems(api.listPeople(live = if (live) "1" else null, siteId = site()))

    suspend fun personDetail(personId: String): Map<String, Any?> =
        parseMap(api.getPerson(personId, siteId = site()))

    suspend fun addPerson(
        personName: String,
        personCode: String? = null,
        employeeNo: String? = null,
        autoCode: Boolean = true,
        gender: String? = null,
        userType: String? = null,
        validFrom: String? = null,
        validTo: String? = null,
    ): Map<String, Any?> = parseMap(
        api.addPerson(
            IntegraAddPersonRequest(
                personName = personName.trim(),
                personCode = personCode?.trim()?.ifBlank { null },
                employeeNo = employeeNo?.trim()?.ifBlank { null },
                autoCode = autoCode,
                gender = gender?.ifBlank { null },
                userType = userType?.ifBlank { null },
                validFrom = validFrom?.trim()?.ifBlank { null },
                validTo = validTo?.trim()?.ifBlank { null },
                validEnable = true,
            ),
            siteId = site(),
        ),
    )

    suspend fun updatePerson(
        personId: String,
        personName: String? = null,
        gender: String? = null,
        userType: String? = null,
        validFrom: String? = null,
        validTo: String? = null,
        validEnable: Boolean? = null,
    ): Map<String, Any?> = parseMap(
        api.updatePerson(
            personId = personId,
            body = IntegraUpdatePersonRequest(
                personName = personName?.trim()?.ifBlank { null },
                gender = gender?.ifBlank { null },
                userType = userType?.ifBlank { null },
                validFrom = validFrom?.trim()?.ifBlank { null },
                validTo = validTo?.trim()?.ifBlank { null },
                validEnable = validEnable,
            ),
            siteId = site(),
        ),
    )

    suspend fun deletePerson(personId: String, force: Boolean = false): Map<String, Any?> =
        parseMap(
            api.deletePerson(
                personId = personId,
                siteId = site(),
                force = if (force) "1" else null,
            ),
        )

    suspend fun uploadPersonFace(personId: String, imageBase64: String): Map<String, Any?> {
        val raw = imageBase64.trim().let { s ->
            val idx = s.indexOf("base64,")
            if (idx >= 0) s.substring(idx + "base64,".length) else s
        }
        return parseMap(
            api.uploadPersonFace(personId, IntegraFaceUploadRequest(imageBase64 = raw), siteId = site()),
        )
    }

    suspend fun deletePersonFace(personId: String): Map<String, Any?> =
        parseMap(api.deletePersonFace(personId, siteId = site()))

    // ── Asistencia y presencia ────────────────────────────────────────────────

    suspend fun attendance(
        from: Instant,
        to: Instant,
        personId: String? = null,
    ): List<Map<String, Any?>> = parseItems(
        api.attendance(
            from = from.toString(),
            to = to.toString(),
            personId = personId?.trim()?.ifBlank { null },
            siteId = site(),
        ),
    )

    data class OccupancyResult(
        val items: List<Map<String, Any?>>,
        val total: Int,
        val day: String,
        /** Aviso del servidor: es ocupación deducida, no conteo óptico. */
        val note: String,
    )

    suspend fun occupancy(): OccupancyResult {
        val root = parseMap(api.occupancy(siteId = site()))
        val items = itemsOf(root)
        return OccupancyResult(
            items = items,
            total = num(root, "total")?.toInt() ?: items.size,
            day = (root["day"] as? String).orEmpty(),
            note = (root["note"] as? String).orEmpty(),
        )
    }

    suspend fun presence(personId: String): Map<String, Any?> =
        parseMap(api.presence(personId, siteId = site()))

    // ── Visitantes ────────────────────────────────────────────────────────────

    suspend fun visitorAppointments(hoursBack: Long = 8, pageSize: Int = 40): List<Map<String, Any?>> {
        val end = Instant.now()
        val start = end.minus(hoursBack, ChronoUnit.HOURS)
        return parseItems(
            api.searchVisitors(
                mapOf(
                    "pageNo" to 1,
                    "pageSize" to pageSize,
                    "visitStartTime" to start.toString(),
                    "visitEndTime" to end.toString(),
                ),
                siteId = site(),
            ),
        )
    }

    suspend fun registerVisitor(body: Map<String, Any?>): Map<String, Any?> =
        parseMap(api.registerVisitor(body, siteId = site()))

    data class RecurringResult(
        val items: List<Map<String, Any?>>,
        val note: String,
    )

    suspend fun recurringVisitors(): RecurringResult {
        val root = parseMap(api.listRecurringVisitors(siteId = site()))
        return RecurringResult(
            items = itemsOf(root),
            note = (root["note"] as? String).orEmpty(),
        )
    }

    /**
     * Alta de visita recurrente.
     *
     * `doorIds` y `doorIndexCodes` son el mismo array; el servicio lee los dos y
     * la web manda ambos. `timeFrom`/`timeTo` se normalizan a `HH:MM:SS`, que es
     * lo que espera el plan semanal del terminal.
     */
    suspend fun createRecurringVisitor(
        visitorName: String,
        weekdays: List<String>,
        timeFrom: String,
        timeTo: String,
        validFrom: String,
        validTo: String,
        phone: String? = null,
        hostName: String? = null,
        doorIndexCodes: List<String> = emptyList(),
        notes: String? = null,
    ): Map<String, Any?> = parseMap(
        api.createRecurringVisitor(
            IntegraRecurringVisitorRequest(
                visitorName = visitorName.trim(),
                weekdays = weekdays,
                timeFrom = conSegundos(timeFrom),
                timeTo = conSegundos(timeTo),
                validFrom = validFrom.trim(),
                validTo = validTo.trim(),
                phone = phone?.trim()?.ifBlank { null },
                hostName = hostName?.trim()?.ifBlank { null },
                doorIndexCodes = doorIndexCodes.ifEmpty { null },
                notes = notes?.trim()?.ifBlank { null },
            ),
            siteId = site(),
        ),
    )

    private fun conSegundos(hhmm: String): String {
        val t = hhmm.trim()
        return if (Regex("^\\d{2}:\\d{2}$").matches(t)) "$t:00" else t
    }

    suspend fun cancelRecurringVisitor(id: String): Map<String, Any?> =
        parseMap(api.cancelRecurringVisitor(id, siteId = site()))

    // ── Alarmas SOC ───────────────────────────────────────────────────────────

    data class AlarmQueueResult(
        val items: List<Map<String, Any?>>,
        val openCount: Int,
        /** `push` · `artemis` · `mixed` · `hct` · `none` · `empty`. */
        val source: String,
    )

    suspend fun alarmQueue(hours: Int = 24): AlarmQueueResult {
        val root = parseMap(api.alarmQueue(siteId = site(), hours = hours))
        val items = itemsOf(root)
        return AlarmQueueResult(
            items = items,
            openCount = num(root, "openCount")?.toInt() ?: 0,
            source = (root["source"] as? String).orEmpty(),
        )
    }

    suspend fun ackAlarm(alarmId: String, note: String? = null): Map<String, Any?> =
        parseMap(
            api.ackAlarm(
                alarmId,
                IntegraAlarmActionRequest(note = note?.trim()?.ifBlank { null }),
                siteId = site(),
            ),
        )

    suspend fun clearAlarm(alarmId: String, note: String? = null): Map<String, Any?> =
        parseMap(
            api.clearAlarm(
                alarmId,
                IntegraAlarmActionRequest(note = note?.trim()?.ifBlank { null }),
                siteId = site(),
            ),
        )

    suspend fun ticketAlarm(
        alarmId: String,
        title: String,
        description: String,
        severity: String? = null,
    ): Map<String, Any?> = parseMap(
        api.ticketAlarm(
            alarmId,
            IntegraAlarmTicketRequest(
                title = title.trim(),
                description = description.trim(),
                severity = severity?.trim()?.ifBlank { null },
            ),
            siteId = site(),
        ),
    )

    // ── Inventario ────────────────────────────────────────────────────────────

    suspend fun devices(): List<Map<String, Any?>> = parseItems(api.listDevices(siteId = site()))

    /** `integra/sites` devuelve un array pelado, sin envolver en `items`. */
    suspend fun sites(): List<Map<String, Any?>> = parseItems(api.listSites())
}
