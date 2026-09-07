package mx.nexara.mobile.nativeapp.data.integra.map

import okhttp3.ResponseBody
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Endpoints del PLANO y del PANORAMA de INTEGRA.
 *
 * Interfaz propia y no `data/api/IntegraApi.kt` porque ese fichero es propiedad
 * de otro turno y este paquete no lo puede tocar. Todo devuelve `ResponseBody`
 * y se parsea a mapas, igual que hacen `IntegraRepository` y los paquetes de
 * detección y vídeo: **casi todo el contrato de INTEGRA puede venir nulo o
 * simplemente ausente**, y un `data class` de Moshi con un campo no-nulable que
 * recibe `null` revienta la deserialización y deja la pantalla vacía sin decir
 * por qué. Es un patrón ya detectado varias veces en este repositorio.
 *
 * El prefijo global `/api` lo pone `BuildConfig.API_BASE_URL`; aquí las rutas
 * van sin él.
 *
 * **Solo lectura a propósito.** `POST integra/floorplans`,
 * `POST integra/floorplans/:id/pins` y `DELETE integra/map-pins/:id` existen en
 * el servidor y NO se declaran aquí: colocar, mover y quitar pines se queda en
 * la consola web. Ver la nota de [IntegraMapRepository] y el contrato de rutas.
 */
interface IntegraMapApi {

    /** Planos del sitio con sus pines ya incrustados (`items[].pins[]`). */
    @GET("integra/floorplans")
    suspend fun listFloorplans(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /** Inventario de puertas: de aquí sale el estado vivo de cada pin DOOR. */
    @GET("integra/doors")
    suspend fun listDoors(
        @Query("siteId") siteId: Int? = null,
        @Query("live") live: String? = null,
    ): ResponseBody

    /** Inventario de cámaras: estado vivo de cada pin CAMERA. */
    @GET("integra/cameras")
    suspend fun listCameras(
        @Query("siteId") siteId: Int? = null,
        @Query("live") live: String? = null,
    ): ResponseBody
}

/**
 * Endpoints del panorama: los cuatro que responden «¿cómo está el sistema
 * ahora?». Cada uno se pide por separado y **el fallo de uno no tumba el
 * resto**: un sitio sin empuje ACS no tiene `push/events/stats` y eso no puede
 * dejar en blanco los conteos de puertas.
 */
interface IntegraPanoramaApi {

    /** Salud del enlace + conteos del espejo + capacidades del usuario. */
    @GET("integra/dashboard")
    suspend fun dashboard(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /** Cola SOC. `openCount` es lo que se pinta en grande. */
    @GET("integra/alarms/queue")
    suspend fun alarmQueue(
        @Query("siteId") siteId: Int? = null,
        @Query("hours") hours: Int? = null,
    ): ResponseBody

    /** Ocupación deducida del día; trae su propio aviso de que es deducida. */
    @GET("integra/occupancy")
    suspend fun occupancy(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /** KPI del día: concedidos, denegados, personas únicas y en sitio. */
    @GET("integra/push/events/stats")
    suspend fun pushEventStats(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /**
     * Cámaras del espejo. El `dashboard` da el total pero **no** cuántas están
     * en línea, así que el desglose se cuenta aquí y no se inventa.
     */
    @GET("integra/cameras")
    suspend fun listCameras(
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody
}
