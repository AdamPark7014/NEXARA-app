package mx.nexara.mobile.nativeapp.data.meetings

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.CloseMeetingBody
import mx.nexara.mobile.nativeapp.data.api.CreateAgreementBody
import mx.nexara.mobile.nativeapp.data.api.CreateMeetingBody
import mx.nexara.mobile.nativeapp.data.api.MeetingAgreementDto
import mx.nexara.mobile.nativeapp.data.api.MeetingAttendanceBody
import mx.nexara.mobile.nativeapp.data.api.MeetingAttendeeMark
import mx.nexara.mobile.nativeapp.data.api.MeetingDetailDto
import mx.nexara.mobile.nativeapp.data.api.MeetingDto
import mx.nexara.mobile.nativeapp.data.api.MeetingsApi
import mx.nexara.mobile.nativeapp.data.api.MyAgreementsDto
import mx.nexara.mobile.nativeapp.data.api.UpdateAgreementBody
import mx.nexara.mobile.nativeapp.data.api.UpdateMeetingBody
import mx.nexara.mobile.nativeapp.data.api.UpdateMyAgreementBody

/**
 * Ritmo operativo: reuniones, acuerdos y lecciones aprendidas.
 *
 * Todas las respuestas se leen como mapas y se convierten con los `fromRaw` de
 * los DTO. El `include` de Prisma devuelve `facilitador`, `responsable` y
 * `activity` anidados y **pueden venir en `null`** — un `data class` con campo
 * no nulable revienta la deserialización de Moshi y deja la pantalla vacía sin
 * decir por qué. Ese patrón ya nos costó varias pantallas en blanco aquí.
 */
class MeetingsRepository(context: Context) {

    private val authRepo = AuthRepository(context)
    private val api: MeetingsApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(MeetingsApi::class.java)

    private val moshi: Moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    // ── Reuniones ─────────────────────────────────────────────────────────

    suspend fun meetings(
        tipo: String? = null,
        estado: String? = null,
        desde: String? = null,
        hasta: String? = null,
    ): List<MeetingDto> =
        rows(api.listMeetingsRaw(tipo.orNullIfBlank(), estado.orNullIfBlank(), desde.orNullIfBlank(), hasta.orNullIfBlank()))
            .map { MeetingDto.fromRaw(it) }

    suspend fun meeting(id: Long): MeetingDetailDto =
        MeetingDetailDto.fromRaw(obj(api.getMeetingRaw(id)))

    suspend fun createMeeting(
        tipo: String,
        fecha: String,
        titulo: String? = null,
        horaInicio: String? = null,
        agenda: String? = null,
        asistentes: List<Long> = emptyList(),
    ): MeetingDetailDto = MeetingDetailDto.fromRaw(
        obj(
            api.createMeeting(
                CreateMeetingBody(
                    tipo = tipo,
                    fecha = fecha,
                    titulo = titulo.orNullIfBlank(),
                    horaInicio = horaInicio.orNullIfBlank(),
                    agenda = agenda.orNullIfBlank(),
                    // El servidor valida que cada id exista, esté activo y sea
                    // de la misma empresa; mandar la lista vacía como `null`
                    // evita que interprete «convoca a nadie» como un borrado.
                    asistentes = asistentes.takeIf { it.isNotEmpty() },
                ),
            ),
        ),
    )

    suspend fun updateMeeting(
        id: Long,
        titulo: String? = null,
        fecha: String? = null,
        horaInicio: String? = null,
        agenda: String? = null,
        notas: String? = null,
        estado: String? = null,
    ): MeetingDetailDto = MeetingDetailDto.fromRaw(
        obj(
            api.updateMeeting(
                id,
                UpdateMeetingBody(
                    titulo = titulo.orNullIfBlank(),
                    fecha = fecha.orNullIfBlank(),
                    horaInicio = horaInicio.orNullIfBlank(),
                    agenda = agenda.orNullIfBlank(),
                    notas = notas.orNullIfBlank(),
                    estado = estado.orNullIfBlank(),
                ),
            ),
        ),
    )

    /** Cierra la junta y guarda la minuta. */
    suspend fun closeMeeting(id: Long, notas: String?): MeetingDetailDto =
        MeetingDetailDto.fromRaw(obj(api.closeMeeting(id, CloseMeetingBody(notas.orNullIfBlank()))))

    /**
     * Pasa lista.
     *
     * El servidor **reemplaza** la lista completa, así que hay que mandar a
     * todos los convocados —los que vinieron y los que no—, no sólo las casillas
     * marcadas. Mandar únicamente los presentes borraba del acta a los ausentes,
     * que es justo la parte que se quiere poder demostrar después.
     */
    suspend fun setAttendance(id: Long, marks: List<MeetingAttendeeMark>): MeetingDetailDto =
        MeetingDetailDto.fromRaw(obj(api.setAttendance(id, MeetingAttendanceBody(marks))))

    // ── Acuerdos, lecciones y riesgos ─────────────────────────────────────

    suspend fun addAgreement(
        meetingId: Long,
        tipo: String,
        descripcion: String,
        responsableId: Long? = null,
        fechaCompromiso: String? = null,
        activityId: Long? = null,
    ): MeetingDetailDto = MeetingDetailDto.fromRaw(
        obj(
            api.addAgreement(
                meetingId,
                CreateAgreementBody(
                    tipo = tipo,
                    descripcion = descripcion.trim(),
                    responsableId = responsableId,
                    fechaCompromiso = fechaCompromiso.orNullIfBlank(),
                    activityId = activityId,
                ),
            ),
        ),
    )

    suspend fun updateAgreement(
        meetingId: Long,
        agreementId: Long,
        estado: String? = null,
        descripcion: String? = null,
        responsableId: Long? = null,
        fechaCompromiso: String? = null,
    ): MeetingDetailDto = MeetingDetailDto.fromRaw(
        obj(
            api.updateAgreement(
                meetingId,
                agreementId,
                UpdateAgreementBody(
                    estado = estado.orNullIfBlank(),
                    descripcion = descripcion.orNullIfBlank(),
                    responsableId = responsableId,
                    fechaCompromiso = fechaCompromiso.orNullIfBlank(),
                ),
            ),
        ),
    )

    // ── Lo que me toca a mí ───────────────────────────────────────────────

    suspend fun myAgreements(): MyAgreementsDto {
        val body = obj(api.myAgreementsRaw())
        val acuerdos = listUnder(body, "acuerdos").map { MeetingAgreementDto.fromRaw(it) }
        return MyAgreementsDto(
            total = intOf(body["total"]) ?: acuerdos.size,
            // Si el servidor deja de mandar el conteo, se cuenta aquí en vez de
            // enseñar un cero que contradice a la lista de abajo.
            vencidos = intOf(body["vencidos"]) ?: acuerdos.count { it.vencido },
            acuerdos = acuerdos,
        )
    }

    /** Avanza un acuerdo propio. El API rechaza mover el de otra persona. */
    suspend fun updateMyAgreement(agreementId: Long, estado: String) {
        api.updateMyAgreement(agreementId, UpdateMyAgreementBody(estado))
    }

    /** Acuerdos abiertos fuera de fecha: el tablero de la junta de cierre. */
    suspend fun overdueAgreements(): List<MeetingAgreementDto> {
        val body = obj(api.overdueAgreementsRaw())
        return listUnder(body, "acuerdos").map { MeetingAgreementDto.fromRaw(it) }
    }

    suspend fun lessons(query: String? = null): List<MeetingAgreementDto> =
        rows(api.lessonsRaw(query.orNullIfBlank())).map { MeetingAgreementDto.fromRaw(it) }

    // ── Lectura cruda ─────────────────────────────────────────────────────

    private fun String?.orNullIfBlank(): String? = this?.trim()?.takeIf { it.isNotBlank() }

    private val mapType = Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java)
    private val listType = Types.newParameterizedType(List::class.java, mapType)

    /** Lista de filas; acepta el arreglo directo y las envolturas paginadas. */
    private fun rows(body: okhttp3.ResponseBody): List<Map<String, Any?>> {
        val raw = body.string().trim()
        if (raw.isEmpty()) return emptyList()
        if (raw.startsWith("[")) {
            return moshi.adapter<List<Map<String, Any?>>>(listType).fromJson(raw).orEmpty()
        }
        if (raw.startsWith("{")) {
            val map = moshi.adapter<Map<String, Any?>>(mapType).fromJson(raw) ?: return emptyList()
            for (key in listOf("items", "data", "acuerdos", "results", "rows")) {
                listUnder(map, key).takeIf { it.isNotEmpty() }?.let { return it }
            }
        }
        return emptyList()
    }

    private fun obj(body: okhttp3.ResponseBody): Map<String, Any?> {
        val raw = body.string().trim()
        if (!raw.startsWith("{")) return emptyMap()
        return moshi.adapter<Map<String, Any?>>(mapType).fromJson(raw).orEmpty()
    }

    private fun listUnder(map: Map<String, Any?>, key: String): List<Map<String, Any?>> =
        (map[key] as? List<*>).orEmpty().filterIsInstance<Map<String, Any?>>()

    private fun intOf(value: Any?): Int? = when (value) {
        is Number -> value.toInt()
        is String -> value.toIntOrNull()
        else -> null
    }
}
