package mx.nexara.mobile.nativeapp.data.api

import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Superficie HTTP de INTEGRA para el móvil.
 *
 * Dos avisos del contrato de la API que condicionan todo lo de abajo:
 *
 *  1. `ValidationPipe` global va con `forbidNonWhitelisted: true`. En los
 *     endpoints que tienen DTO de clase (`doors/:id/control`, `alarms/:id/ack`,
 *     `people`, `visitors/recurring`), **un campo de más devuelve 400**. Por eso
 *     los cuerpos de aquí llevan exactamente los campos del DTO del servidor y
 *     ni uno más. Moshi omite los `null`, así que los opcionales no viajan.
 *  2. `siteId` es un parámetro de consulta en casi todo. Sin él, el servidor
 *     resuelve el sitio marcado como predeterminado. En una empresa con dos
 *     instalaciones eso significa abrir la puerta equivocada, así que el
 *     repositorio lo manda siempre de forma explícita.
 */

/** Cuerpo de `POST integra/doors/:id/open`. El servidor exige `reason` ≥ 3. */
data class IntegraOpenDoorRequest(
    val reason: String,
)

/**
 * Cuerpo de `POST integra/doors/:id/control`.
 *
 * `controlType` viaja como **cadena**: `"0"` quedar abierta, `"1"` cerrar,
 * `"2"` abrir momentáneo, `"3"` quedar cerrada.
 */
data class IntegraDoorControlRequest(
    val controlType: String,
    val reason: String,
)

/** Nota opcional al atender o cerrar alarma (`AlarmAckDto`). */
data class IntegraAlarmActionRequest(
    val note: String? = null,
)

/** Cuerpo de `POST integra/alarms/:id/ticket` (sin DTO de clase, passthrough). */
data class IntegraAlarmTicketRequest(
    val title: String,
    val description: String,
    val severity: String? = null,
)

data class IntegraAddPersonRequest(
    val personName: String,
    val orgIndexCode: String? = null,
    val personCode: String? = null,
    val employeeNo: String? = null,
    val autoCode: Boolean? = null,
    val gender: String? = null,
    val userType: String? = null,
    val validFrom: String? = null,
    val validTo: String? = null,
    val validEnable: Boolean? = null,
    val doorRight: String? = null,
    val rightPlan: String? = null,
)

data class IntegraUpdatePersonRequest(
    val personName: String? = null,
    val gender: String? = null,
    val userType: String? = null,
    val validFrom: String? = null,
    val validTo: String? = null,
    val validEnable: Boolean? = null,
    val doorRight: String? = null,
    val rightPlan: String? = null,
)

data class IntegraFaceUploadRequest(
    val imageBase64: String,
)

/**
 * Alta de visita recurrente (`RecurringVisitorCreateDto`).
 *
 * Es el camino que funciona en este parque: `visitors/register` y
 * `visitors/search` son passthrough de Artemis y devuelven 400 en los sitios
 * ISAPI, que es lo que hay instalado en Oficinas.
 */
data class IntegraRecurringVisitorRequest(
    val visitorName: String,
    val weekdays: List<String>,
    val timeFrom: String,
    val timeTo: String,
    val validFrom: String,
    val validTo: String,
    val phone: String? = null,
    val hostName: String? = null,
    val doorIndexCodes: List<String>? = null,
    val notes: String? = null,
)

interface IntegraApi {

    // ── Panorama ──────────────────────────────────────────────────────────────

    /** Conteos del espejo + salud del sitio + capacidades del usuario. */
    @GET("integra/dashboard")
    suspend fun dashboard(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @GET("integra/sync/last")
    suspend fun lastSync(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    // ── Puertas ───────────────────────────────────────────────────────────────

    @GET("integra/doors")
    suspend fun listDoors(
        @Query("live") live: String? = null,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @POST("integra/doors/{id}/open")
    suspend fun openDoor(
        @Path("id") doorId: String,
        @Body body: IntegraOpenDoorRequest,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /** Las cuatro órdenes reales: abrir, cerrar, quedar abierta, quedar cerrada. */
    @POST("integra/doors/{id}/control")
    suspend fun controlDoor(
        @Path("id") doorId: String,
        @Body body: IntegraDoorControlRequest,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    // ── Eventos ───────────────────────────────────────────────────────────────

    @GET("integra/events")
    suspend fun listEvents(
        @Query("limit") limit: Int? = null,
        @Query("pageNo") pageNo: Int? = null,
        @Query("doorId") doorId: String? = null,
        @Query("personId") personId: String? = null,
        @Query("personName") personName: String? = null,
        @Query("eventType") eventType: Int? = null,
        @Query("startTime") startTime: String? = null,
        @Query("endTime") endTime: String? = null,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /**
     * Bitácora en vivo del empuje ACS. Es la que usa la web, y la única que trae
     * `label` (etiqueta ya traducida por la tabla única de códigos), `outcome`
     * (`granted`/`denied` decidido en el servidor) y `eventState`
     * (`active`/`inactive`, que llega en el evento y no hay que adivinar).
     *
     * Pagina de verdad: `hasMore`, `nextBeforeId` hacia atrás y `newestId` para
     * el sondeo incremental.
     */
    @GET("integra/push/events")
    suspend fun pushEvents(
        @Query("limit") limit: Int? = null,
        @Query("scope") scope: String? = null,
        @Query("outcome") outcome: String? = null,
        @Query("eventState") eventState: String? = null,
        @Query("deviceIp") deviceIp: String? = null,
        @Query("personId") personId: String? = null,
        @Query("personName") personName: String? = null,
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("beforeId") beforeId: Long? = null,
        @Query("afterId") afterId: Long? = null,
        @Query("live") live: String? = null,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /** KPI del día: entradas, denegados, personas únicas, en sitio. */
    @GET("integra/push/events/stats")
    suspend fun pushEventStats(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    // ── Personas ──────────────────────────────────────────────────────────────

    @GET("integra/people")
    suspend fun listPeople(
        @Query("live") live: String? = null,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @GET("integra/people/{id}")
    suspend fun getPerson(
        @Path("id") personId: String,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @POST("integra/people")
    suspend fun addPerson(
        @Body body: IntegraAddPersonRequest,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @PATCH("integra/people/{id}")
    suspend fun updatePerson(
        @Path("id") personId: String,
        @Body body: IntegraUpdatePersonRequest,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @DELETE("integra/people/{id}")
    suspend fun deletePerson(
        @Path("id") personId: String,
        @Query("siteId") siteId: Int? = null,
        @Query("force") force: String? = null,
    ): ResponseBody

    @POST("integra/people/{id}/face")
    suspend fun uploadPersonFace(
        @Path("id") personId: String,
        @Body body: IntegraFaceUploadRequest,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @DELETE("integra/people/{id}/face")
    suspend fun deletePersonFace(
        @Path("id") personId: String,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    // ── Asistencia y presencia ────────────────────────────────────────────────

    @GET("integra/attendance")
    suspend fun attendance(
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("personId") personId: String? = null,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @GET("integra/occupancy")
    suspend fun occupancy(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /** Ficha de quien está en sitio: puertas de hoy, actividades abiertas y CRM. */
    @GET("integra/presence/{personId}")
    suspend fun presence(
        @Path("personId") personId: String,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    // ── Visitantes ────────────────────────────────────────────────────────────

    @POST("integra/visitors/search")
    suspend fun searchVisitors(
        @Body body: Map<String, @JvmSuppressWildcards Any?>,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @POST("integra/visitors/register")
    suspend fun registerVisitor(
        @Body body: Map<String, @JvmSuppressWildcards Any?>,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @GET("integra/visitors/recurring")
    suspend fun listRecurringVisitors(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @POST("integra/visitors/recurring")
    suspend fun createRecurringVisitor(
        @Body body: IntegraRecurringVisitorRequest,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @POST("integra/visitors/recurring/{id}/cancel")
    suspend fun cancelRecurringVisitor(
        @Path("id") id: String,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    // ── Alarmas SOC ───────────────────────────────────────────────────────────

    @GET("integra/alarms/queue")
    suspend fun alarmQueue(
        @Query("siteId") siteId: Int? = null,
        @Query("hours") hours: Int? = null,
    ): ResponseBody

    @POST("integra/alarms/{id}/ack")
    suspend fun ackAlarm(
        @Path("id") alarmId: String,
        @Body body: IntegraAlarmActionRequest = IntegraAlarmActionRequest(),
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @POST("integra/alarms/{id}/clear")
    suspend fun clearAlarm(
        @Path("id") alarmId: String,
        @Body body: IntegraAlarmActionRequest = IntegraAlarmActionRequest(),
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /** Escala la alarma a ticket OPS. Exige `serviceClientId` en el sitio. */
    @POST("integra/alarms/{id}/ticket")
    suspend fun ticketAlarm(
        @Path("id") alarmId: String,
        @Body body: IntegraAlarmTicketRequest,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    // ── Inventario ────────────────────────────────────────────────────────────

    @GET("integra/devices")
    suspend fun listDevices(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @GET("integra/sites")
    suspend fun listSites(): ResponseBody
}
