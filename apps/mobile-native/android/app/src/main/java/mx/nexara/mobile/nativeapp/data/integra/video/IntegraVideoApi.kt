package mx.nexara.mobile.nativeapp.data.integra.video

import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Endpoints de cámaras de INTEGRA. Espejo exacto de `apps/api/src/integra/integra.controller.ts`
 * (sección «Cameras / video» y «PTZ»); todos cuelgan del prefijo global `/api`.
 *
 * Va aparte de [mx.nexara.mobile.nativeapp.data.api.IntegraApi] a propósito: el
 * bloque de video tiene dueño propio y no debe obligar a tocar el fichero que
 * comparten acceso, personas, alarmas y sitios.
 *
 * Todas las respuestas se reciben como [ResponseBody] y se parsean a mano en
 * [IntegraVideoRepository]. No es pereza: la API devuelve `null` en casi
 * cualquier campo (`hls`, `region`, `note`, `error`…) y un `data class` de Moshi
 * con un campo no nulable que recibe `null` revienta la deserialización entera y
 * deja la pantalla vacía sin decir por qué. Parseando a mano, un `null` es un
 * `null` y la celda puede explicar qué le falta.
 */
interface IntegraVideoApi {

    /** `GET integra/cameras` — inventario (espejo local salvo `live=1`). */
    @GET("integra/cameras")
    suspend fun listCameras(
        @Query("live") live: String? = null,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /**
     * `POST integra/cameras/streams/batch` — abre varias cámaras en un viaje.
     *
     * Los fallos vienen DENTRO de la respuesta, cámara por cámara (`ok`/`error`):
     * que la séptima no esté en el espejo no deja sin imagen a las otras doce.
     * Tope del servidor: 40 ids por petición.
     */
    @POST("integra/cameras/streams/batch")
    suspend fun streamsBatch(
        @Body body: IntegraStreamsBatchRequest,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /** `POST integra/cameras/:id/stream` — una sola cámara (reintento de una celda). */
    @POST("integra/cameras/{id}/stream")
    suspend fun stream(
        @Path("id") cameraId: String,
        @Query("siteId") siteId: Int? = null,
        @Query("audio") audio: String? = null,
        @Query("quality") quality: String? = null,
    ): ResponseBody

    /**
     * `POST integra/cameras/:id/preview` — RTSP crudo del equipo.
     *
     * OJO: devuelve `{ url: "rtsp://…", protocol: "rtsp_s" }`, **no una imagen**.
     * Android no reproduce RTSP sin un motor de video que la app no lleva; se
     * expone solo como dato técnico en la pantalla de detalle.
     */
    @POST("integra/cameras/{id}/preview")
    suspend fun preview(
        @Path("id") cameraId: String,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /** `POST integra/cameras/:id/capture` — el equipo guarda una captura. */
    @POST("integra/cameras/{id}/capture")
    suspend fun capture(
        @Path("id") cameraId: String,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /** `GET integra/cameras/:id/ptz/presets` — posiciones memorizadas (solo ISAPI). */
    @GET("integra/cameras/{id}/ptz/presets")
    suspend fun ptzPresets(
        @Path("id") cameraId: String,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody

    /** `POST integra/cameras/:id/ptz` — mover, ir a preset o parar. */
    @POST("integra/cameras/{id}/ptz")
    suspend fun ptz(
        @Path("id") cameraId: String,
        @Body body: IntegraPtzRequest,
        @Query("siteId") siteId: Int? = null,
    ): ResponseBody
}

/**
 * Cuerpo de `POST integra/cameras/streams/batch`.
 *
 * `quality` se manda siempre `"sub"`: el canal principal abre una segunda sesión
 * RTSP contra un NVR con sesiones contadas, y una rejilla en un teléfono no
 * justifica eso. `audio` va en `false` porque el muro es mudo.
 */
data class IntegraStreamsBatchRequest(
    val cameraIds: List<String>,
    val quality: String = "sub",
    val audio: Boolean = false,
)

/**
 * Cuerpo de `POST integra/cameras/:id/ptz`.
 *
 * El controlador ramifica por presencia: `stop` primero, luego `preset`, y si no
 * hay ninguno mueve con pan/tilt/zoom. Los campos nulos no se serializan (Moshi
 * omite nulos), así que cada constructor de abajo produce exactamente una rama.
 */
data class IntegraPtzRequest(
    val pan: Int? = null,
    val tilt: Int? = null,
    val zoom: Int? = null,
    val durationMs: Int? = null,
    val continuous: Boolean? = null,
    val preset: Int? = null,
    val stop: Boolean? = null,
) {
    companion object {
        /**
         * Movimiento discreto. Se prefiere a «mantener pulsado» a propósito: si
         * el evento de soltar se pierde (dedo fuera del botón, app al fondo, red
         * cortada) una orden continua deja la domo girando sola. Con duración
         * fija el propio equipo la para.
         */
        fun move(pan: Int = 0, tilt: Int = 0, zoom: Int = 0, durationMs: Int = 500) =
            IntegraPtzRequest(
                pan = pan.coerceIn(-100, 100),
                tilt = tilt.coerceIn(-100, 100),
                zoom = zoom.coerceIn(-100, 100),
                // El servidor exige 80..5000; nada más largo que un toque.
                durationMs = durationMs.coerceIn(80, 5000),
                continuous = false,
            )

        /** Ir a una posición memorizada (el servidor la audita). */
        fun goToPreset(preset: Int) = IntegraPtzRequest(preset = preset.coerceIn(1, 300))

        /** Parada de emergencia. */
        fun stop() = IntegraPtzRequest(stop = true)
    }
}
