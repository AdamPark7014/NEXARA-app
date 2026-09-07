package mx.nexara.mobile.nativeapp.data.integra.schedules

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.integra.IntegraRepository
import okhttp3.ResponseBody
import java.lang.reflect.ParameterizedType

/**
 * Acceso a datos de HORARIOS y ESPACIOS.
 *
 * Todas las funciones son `suspend` y no cambian de dispatcher por su cuenta:
 * quien llama (los ViewModels) las envuelve en `Dispatchers.IO`, igual que hace
 * `IntegraRepository`. Así no queda ningún parseo de JSON en el hilo principal
 * y el punto donde se decide el hilo es visible en un solo sitio.
 */
class SchedulesRepository(context: Context) {

    private val authRepo = AuthRepository(context)
    private val api: IntegraSchedulesApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(IntegraSchedulesApi::class.java)

    /** Reutiliza el listado de personas ya existente en vez de duplicar la ruta. */
    private val integraRepo = IntegraRepository(context)

    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    private val mapType: ParameterizedType = Types.newParameterizedType(
        Map::class.java,
        String::class.java,
        Any::class.java,
    )

    private fun parseMap(body: ResponseBody): Map<String, Any?> {
        val raw = body.string().trim()
        if (raw.isEmpty()) return emptyMap()
        return moshi.adapter<Map<String, Any?>>(mapType).fromJson(raw) ?: emptyMap()
    }

    // ── Horarios ─────────────────────────────────────────────────────────────

    suspend fun catalog(siteId: Int? = null): SchedulesCatalog =
        SchedulesMapper.catalog(parseMap(api.schedulesCatalog(siteId)))

    suspend fun personSchedule(
        personId: String,
        catalog: SchedulesCatalog,
        siteId: Int? = null,
    ): PersonSchedule = SchedulesMapper.personSchedule(
        personId = personId,
        root = parseMap(api.personSchedule(personId, siteId)),
        catalog = catalog,
    )

    suspend fun doorAccess(
        doorId: String,
        catalog: SchedulesCatalog,
        siteId: Int? = null,
    ): DoorAccess = SchedulesMapper.doorAccess(
        doorId = doorId,
        root = parseMap(api.doorAccess(doorId, siteId)),
        catalog = catalog,
    )

    suspend fun peopleBrief(): List<PersonBrief> =
        SchedulesMapper.peopleBrief(integraRepo.people())

    /**
     * Empuja vigencia y plantilla por puerta.
     *
     * `beginTime` / `endTime` van como el **reloj de pared ISAPI** que el
     * usuario editó (`"2026-09-30T23:59:59"`), sin ninguna conversión de zona:
     * el terminal los guarda literalmente y convertirlos aquí adelantaría o
     * atrasaría la vigencia seis horas.
     *
     * `preset` es la clave del API (`always`, `office_hours`, …) y sólo se
     * manda cuando el usuario tocó un preset en esta edición; en cuanto edita
     * una puerta a mano mandan los `doorPlans`.
     */
    suspend fun savePersonSchedule(
        draft: PersonSchedule,
        apiPreset: String? = null,
        contractorDays: Int? = null,
        siteId: Int? = null,
    ): SaveScheduleResult {
        val doorPlans = draft.doorPlans.map { plan ->
            val disable = !plan.hasAccess || !draft.validEnable
            buildMap<String, Any?> {
                put("deviceIp", plan.deviceIp)
                put("doorNo", plan.doorNo)
                if (!disable) put("planTemplateNo", plan.planTemplateNo)
                put("disable", disable)
            }
        }
        val body = buildMap<String, Any?> {
            put(
                "validMode",
                when {
                    !draft.validEnable -> "disabled"
                    draft.indefinite -> "indefinite"
                    else -> "window"
                },
            )
            put("beginTime", draft.validFrom.ifBlank { AcsTime.ISAPI_DEFAULT_BEGIN })
            put(
                "endTime",
                if (draft.indefinite) AcsTime.ISAPI_INDEFINITE_END else draft.validTo,
            )
            put("doorPlans", doorPlans)
            put("ensurePresetsOnDevices", true)
            if (apiPreset != null) {
                put("preset", apiPreset)
                if (apiPreset == "contractor" && contractorDays != null) {
                    put("contractorDays", contractorDays)
                }
            }
        }
        return SchedulesMapper.saveResult(
            parseMap(api.savePersonSchedule(draft.personId, body, siteId)),
        )
    }

    // ── Espacios ─────────────────────────────────────────────────────────────

    suspend fun spacesOverview(siteId: Int? = null): SpacesOverview =
        SchedulesMapper.spacesOverview(parseMap(api.spacesOverview(siteId)))

    suspend fun spaceDetail(doorId: String, siteId: Int? = null): SpaceDetail =
        SchedulesMapper.spaceDetail(parseMap(api.spaceDetail(doorId, siteId)), doorId)

    suspend fun saveSpacePolicy(
        doorId: String,
        templateKey: String,
        siteId: Int? = null,
    ) {
        api.saveSpacePolicy(doorId, mapOf("templateKey" to templateKey), siteId)
    }

    /**
     * Crea una ventana de uso.
     *
     * [startsAtUtc] / [endsAtUtc] deben venir ya en UTC (`AcsTime.toIsoUtc`).
     * El servidor hace `new Date(...)` y guarda un instante, así que mandarle un
     * reloj de pared sin zona lo dejaría a merced de la zona del proceso Node.
     */
    suspend fun createBooking(
        doorId: String,
        title: String,
        startsAtUtc: String,
        endsAtUtc: String,
        hostPersonId: String? = null,
        notes: String? = null,
        siteId: Int? = null,
    ) {
        val body = buildMap<String, Any?> {
            put("doorIndexCode", doorId)
            put("title", title)
            put("startsAt", startsAtUtc)
            put("endsAt", endsAtUtc)
            hostPersonId?.trim()?.takeIf { it.isNotEmpty() }?.let { put("hostPersonId", it) }
            notes?.trim()?.takeIf { it.isNotEmpty() }?.let { put("notes", it) }
        }
        api.createBooking(body, siteId)
    }

    suspend fun cancelBooking(bookingId: Long) {
        api.cancelBooking(bookingId)
    }

    // ── Permisos ─────────────────────────────────────────────────────────────

    /**
     * Permisos del usuario. Si la llamada falla se asume permitido y manda el
     * servidor: esconder botones por un fallo de red haría creer al operador que
     * no tiene permiso cuando sí lo tiene.
     */
    suspend fun capabilities(siteId: Int? = null): IntegraCaps = try {
        SchedulesMapper.caps(parseMap(api.capabilities(siteId)))
    } catch (e: Exception) {
        IntegraCaps()
    }
}
