package mx.nexara.mobile.nativeapp.data.api

import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/*
 * Hora de comida con justificación y aprobación del superior — espejo de
 * apps/web/components/asistencias/ComidasPanel.tsx contra
 * apps/api/src/attendance/lunch/lunch-breaks.controller.ts.
 *
 * Ventana 15:00–16:00 (México), regreso hasta 16:05. Fuera de la ventana el API
 * contesta 400 salvo que venga `justificacion` (≥5 letras); entonces el
 * registro queda `revisionEstado = PENDIENTE` hasta que un superior decida.
 */

data class ComidaVentanaDto(
    val inicio: String? = null,
    val fin: String? = null,
    val regresoLimite: String? = null,
    val texto: String? = null,
)

data class ComidaRegistroDto(
    val id: Long,
    val userId: Long? = null,
    val status: String? = null,
    val checkinTime: String? = null,
    val checkoutTime: String? = null,
    val checkinPhotoUrl: String? = null,
    val checkoutPhotoUrl: String? = null,
    val isCheckinLate: Boolean? = null,
    val isCheckoutLate: Boolean? = null,
    val checkinJustificacion: String? = null,
    val checkoutJustificacion: String? = null,
    /** null = a tiempo · PENDIENTE | APROBADA | RECHAZADA cuando fue a destiempo. */
    val revisionEstado: String? = null,
    val revisionNotas: String? = null,
    val revisadoPor: String? = null,
    val revisadoAt: String? = null,
    val minutos: Double? = null,
)

data class ComidaMiDiaDto(
    val debeRegistrar: Boolean? = null,
    /** Hora del servidor: la ventana se evalúa con ella, no con el reloj del teléfono. */
    val ahora: String? = null,
    val ventana: ComidaVentanaDto? = null,
    val salidaADestiempo: Boolean? = null,
    val regresoADestiempo: Boolean? = null,
    /** salida | regreso | listo | no_aplica */
    val siguiente: String? = null,
    val registro: ComidaRegistroDto? = null,
)

data class ComidaFilaDto(
    val userId: Long,
    val nombre: String? = null,
    val puesto: String? = null,
    val avatarUrl: String? = null,
    val registro: ComidaRegistroDto? = null,
    val puedoRevisar: Boolean? = null,
)

data class ComidaResumenDto(
    val total: Int? = null,
    val registraron: Int? = null,
    val enComida: Int? = null,
    val aDestiempo: Int? = null,
    val pendientes: Int? = null,
)

data class ComidaEquipoDto(
    val fecha: String? = null,
    /** todo (dirección) | equipo (organigrama) | propio */
    val alcance: String? = null,
    val filas: List<ComidaFilaDto>? = null,
    val resumen: ComidaResumenDto? = null,
)

data class ComidaSalidaRequest(
    val checkinTime: String,
    val checkinPhotoUrl: String,
    val justificacion: String? = null,
)

data class ComidaRegresoRequest(
    val checkoutTime: String,
    val checkoutPhotoUrl: String,
    val justificacion: String? = null,
)

data class ComidaRevisionRequest(
    /** aprobar | rechazar */
    val decision: String,
    /** Obligatorias (≥5 letras) al rechazar. */
    val notas: String? = null,
)

interface ComidasApi {
    @GET("lunch-breaks/mi-dia")
    suspend fun miDia(): ComidaMiDiaDto

    @GET("lunch-breaks/equipo")
    suspend fun equipo(@Query("fecha") fecha: String?): ComidaEquipoDto

    @POST("lunch-breaks/checkin")
    suspend fun salida(@Body body: ComidaSalidaRequest): ResponseBody

    @PUT("lunch-breaks/checkout")
    suspend fun regreso(@Body body: ComidaRegresoRequest): ResponseBody

    @PATCH("lunch-breaks/{id}/revision")
    suspend fun revisar(
        @Path("id") id: Long,
        @Body body: ComidaRevisionRequest,
    ): ResponseBody
}
