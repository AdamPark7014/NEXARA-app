package mx.nexara.mobile.nativeapp.data.api

import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Streaming

/**
 * Archivos de evidencia de una actividad (Excel, Word, PDF, imágenes…) — espejo de
 * `apps/api/src/activities/attachments`:
 *
 * | Qué                     | Endpoint                                                  |
 * |-------------------------|-----------------------------------------------------------|
 * | Lista                   | `GET    activities/:id/adjuntos`                          |
 * | Adjuntar (1 a 10)       | `POST   activities/:id/adjuntos` multipart `files`        |
 * | Quitar                  | `DELETE activities/:id/adjuntos/:adjuntoId`               |
 * | El archivo              | `GET    activities/:id/adjuntos/:adjuntoId/archivo`       |
 * | Vista previa (HTML)     | `GET    activities/:id/adjuntos/:adjuntoId/vista-previa` |
 *
 * `url` del DTO es la ruta en /uploads: no se usa para bajar, se baja por `/archivo`.
 */
interface ActividadAdjuntosApi {

    /** Lo más reciente primero. */
    @GET("activities/{id}/adjuntos")
    suspend fun lista(@Path("id") activityId: Long): List<AdjuntoDto>

    /** 400 con mensaje legible si el tipo no se acepta; 403 si no es del equipo. */
    @Multipart
    @POST("activities/{id}/adjuntos")
    suspend fun subir(
        @Path("id") activityId: Long,
        @Part files: List<MultipartBody.Part>,
    ): List<AdjuntoDto>

    /** `{ok:true}`; 403 si quien lo pide no puede quitarlo. */
    @DELETE("activities/{id}/adjuntos/{adjuntoId}")
    suspend fun quitar(
        @Path("id") activityId: Long,
        @Path("adjuntoId") adjuntoId: Long,
    ): ResponseBody

    @Streaming
    @GET("activities/{id}/adjuntos/{adjuntoId}/archivo")
    suspend fun archivo(
        @Path("id") activityId: Long,
        @Path("adjuntoId") adjuntoId: Long,
    ): ResponseBody

    /** `text/html` autocontenido y sin scripts (Excel, CSV, Word). 404 si ese tipo no la tiene. */
    @GET("activities/{id}/adjuntos/{adjuntoId}/vista-previa")
    suspend fun vistaPrevia(
        @Path("id") activityId: Long,
        @Path("adjuntoId") adjuntoId: Long,
    ): ResponseBody
}

/** Quien subió el archivo. */
data class AdjuntoAutorDto(
    val id: Long? = null,
    val nombre: String? = null,
)

/**
 * Un archivo adjunto. Todo anulable con valor por omisión, como el resto del árbol:
 * un campo que el servidor deje de mandar no tumba la sección.
 */
data class AdjuntoDto(
    val id: Long = 0L,
    val activityId: Long? = null,
    /** Nombre original con extensión, acentos incluidos («Propuesta Toks.xlsx»). */
    val nombre: String? = null,
    val url: String? = null,
    val mimeType: String? = null,
    val sizeBytes: Long? = null,
    /** `pdf` · `imagen` · `excel` · `csv` · `word` · `otro`. */
    val tipo: String? = null,
    /** Hay HTML en `/vista-previa`. */
    val vistaPrevia: Boolean = false,
    val createdAt: String? = null,
    val subidoPor: AdjuntoAutorDto? = null,
    val puedeQuitar: Boolean = false,
)
