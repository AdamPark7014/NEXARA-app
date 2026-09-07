package mx.nexara.mobile.nativeapp.data.integra.schedules

import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Endpoints de HORARIOS y ESPACIOS de INTEGRA.
 *
 * Vive en `data/integra/schedules/` y no en `data/api/` porque `IntegraApi.kt`
 * es propiedad de otro turno y no se puede tocar; el cableado final puede
 * fusionar las dos interfaces si interesa. Todas las rutas cuelgan del prefijo
 * global `/api` que ya pone `ApiClient`.
 *
 * `doorId` viaja como `"10.0.0.5|1"`: Retrofit codifica el `|` a `%7C` y el
 * controlador hace `decodeURIComponent`, así que se pasa sin codificar a mano.
 */
interface IntegraSchedulesApi {

    // ── Horarios ─────────────────────────────────────────────────────────────

    /** Catálogo: puertas, plantillas, presets y el detalle por terminal. */
    @GET("integra/schedules")
    suspend fun schedulesCatalog(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @GET("integra/schedules/people/{id}")
    suspend fun personSchedule(
        @Path("id") personId: String,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @PATCH("integra/schedules/people/{id}")
    suspend fun savePersonSchedule(
        @Path("id") personId: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @GET("integra/schedules/doors/{doorId}")
    suspend fun doorAccess(
        @Path("doorId") doorId: String,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    // ── Espacios ─────────────────────────────────────────────────────────────

    @GET("integra/spaces")
    suspend fun spacesOverview(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @GET("integra/spaces/{doorId}")
    suspend fun spaceDetail(
        @Path("doorId") doorId: String,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @PUT("integra/spaces/{doorId}/policy")
    suspend fun saveSpacePolicy(
        @Path("doorId") doorId: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @POST("integra/spaces-bookings")
    suspend fun createBooking(
        @Body body: Map<String, @JvmSuppressWildcards Any?>,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    @DELETE("integra/spaces-bookings/{id}")
    suspend fun cancelBooking(
        @Path("id") bookingId: Long,
    ): ResponseBody

    // ── Permisos ─────────────────────────────────────────────────────────────

    @GET("integra/capabilities")
    suspend fun capabilities(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody
}
