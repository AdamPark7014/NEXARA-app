package mx.nexara.mobile.nativeapp.data.integra.detection

import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Endpoints de DETECCIÓN y AJUSTES de INTEGRA.
 *
 * Interfaz aparte de `data/api/IntegraApi.kt` a propósito: estos módulos son
 * propiedad de este paquete y el cableado final lo decide quien integre. Todas
 * las respuestas se devuelven como `ResponseBody` y se parsean a mapas — igual
 * que hace `IntegraRepository` — porque **casi todos los campos del contrato
 * pueden venir nulos**, y un `data class` con un no-nulable que recibe `null`
 * revienta la deserialización y deja la pantalla vacía sin decir por qué.
 *
 * Prefijo global `/api`: ya lo pone `BuildConfig.API_BASE_URL`.
 */
interface IntegraDetectionApi {

    /** Inventario de cámaras del sitio; de aquí sale el selector. */
    @GET("integra/cameras")
    suspend fun listCameras(
        @Query("siteId") siteId: Int? = null,
        @Query("live") live: String? = null,
    ): ResponseBody

    /** Perfil de la cámara: guardado + efectivo + capacidades + límites. */
    @GET("integra/cameras/{id}/detection")
    suspend fun getDetectionProfile(
        @Path("id") cameraId: String,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /** Edita el perfil. **No** escribe en el equipo: eso es [applyDetection]. */
    @PATCH("integra/cameras/{id}/detection")
    suspend fun patchDetectionProfile(
        @Path("id") cameraId: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /** Escribe el perfil guardado en la cámara. Esto sí toca el equipo. */
    @POST("integra/cameras/{id}/detection/apply")
    suspend fun applyDetection(
        @Path("id") cameraId: String,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /** Pregunta a UNA cámara qué detecciones admite y lo persiste. */
    @POST("integra/cameras/{id}/detection/capabilities")
    suspend fun probeCameraCapabilities(
        @Path("id") cameraId: String,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /** Lo que cada cámara del sitio declara soportar (ya sondeado). */
    @GET("integra/detection/capabilities")
    suspend fun listDetectionCapabilities(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /** Sondea todas las cámaras del sitio, una a una. Tarda. */
    @POST("integra/detection/capabilities/probe")
    suspend fun probeSiteCapabilities(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody
}

/** Endpoints de AJUSTES: sitios, sincronización y salud del abanico ACS. */
interface IntegraSettingsApi {

    @GET("integra/sites")
    suspend fun listSites(): ResponseBody

    @POST("integra/sites")
    suspend fun createSite(
        @Body body: Map<String, @JvmSuppressWildcards Any?>,
    ): ResponseBody

    @PATCH("integra/sites/{id}")
    suspend fun updateSite(
        @Path("id") siteId: Int,
        @Body body: Map<String, @JvmSuppressWildcards Any?>,
    ): ResponseBody

    /** Destructivo: arrastra el inventario espejo del sitio. */
    @DELETE("integra/sites/{id}")
    suspend fun deleteSite(@Path("id") siteId: Int): ResponseBody

    @GET("integra/capabilities")
    suspend fun capabilities(@Query("siteId") siteId: Int? = null): ResponseBody

    @GET("integra/regions")
    suspend fun regions(@Query("siteId") siteId: Int? = null): ResponseBody

    @GET("integra/tree")
    suspend fun tree(@Query("siteId") siteId: Int? = null): ResponseBody

    /** Reconstruye el espejo contra los equipos. Tarda y carga el parque. */
    @POST("integra/sync")
    suspend fun runSync(@Query("siteId") siteId: Int? = null): ResponseBody

    @GET("integra/sync/last")
    suspend fun lastSync(@Query("siteId") siteId: Int? = null): ResponseBody

    @GET("integra/acs-fanout/status")
    suspend fun acsFanoutStatus(@Query("siteId") siteId: Int? = null): ResponseBody
}
