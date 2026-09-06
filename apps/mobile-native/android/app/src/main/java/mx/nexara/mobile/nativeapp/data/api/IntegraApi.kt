package mx.nexara.mobile.nativeapp.data.api

import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** Cuerpo mínimo para abrir puerta (`POST integra/doors/:id/open`). */
data class IntegraOpenDoorRequest(
    val reason: String,
)

/** Nota opcional al atender o cerrar alarma (`POST integra/alarms/:id/ack|clear`). */
data class IntegraAlarmActionRequest(
    val note: String? = null,
)

interface IntegraApi {
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

    @GET("integra/events")
    suspend fun listEvents(
        @Query("limit") limit: Int? = null,
        @Query("pageNo") pageNo: Int? = null,
        @Query("doorId") doorId: String? = null,
        @Query("personId") personId: String? = null,
        @Query("personName") personName: String? = null,
        @Query("startTime") startTime: String? = null,
        @Query("endTime") endTime: String? = null,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

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

    @GET("integra/attendance")
    suspend fun attendance(
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("personId") personId: String? = null,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

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

    @GET("integra/occupancy")
    suspend fun occupancy(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @GET("integra/devices")
    suspend fun listDevices(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @GET("integra/sites")
    suspend fun listSites(): ResponseBody
}
