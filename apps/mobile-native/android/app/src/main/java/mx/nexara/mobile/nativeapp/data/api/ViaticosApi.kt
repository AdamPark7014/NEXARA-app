package mx.nexara.mobile.nativeapp.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path

/**
 * Viáticos de Core — espejo de `apps/api/src/viaticos/viaticos.controller.ts`.
 *
 * El API ya viene filtrado por persona y por jefe: `GET viatics` devuelve lo
 * propio a quien solo pide viáticos y, a quien los administra, lo de su gente.
 * La app no decide quién ve qué; solo pinta lo que llega.
 *
 * El alta y la comprobación viajan en `multipart` porque llevan la foto del
 * ticket. Por eso el reparto entre actividades va aparte
 * (`PUT viatics/:id/reparto`): una lista anidada no sobrevive a un `FormData`.
 *
 * Todo campo que el API pueda mandar nulo se declara anulable con valor por
 * omisión: un registro raro deja la tarjeta incompleta, nunca tumba la pantalla.
 */

/** Una parte del reparto tal como la devuelve el API. */
data class ViaticoRepartoDto(
    val id: Long? = null,
    val actividadId: Long? = null,
    val monto: Double? = null,
    val nota: String? = null,
    /** Solo en el detalle (`GET viatics/:id`). */
    val actividad: ViaticoActividadRefDto? = null,
)

data class ViaticoActividadRefDto(
    val id: Long? = null,
    val anNumber: String? = null,
    val titulo: String? = null,
)

/**
 * Estado del anticipo (`resumenLiquidacion` del servidor): qué se entregó, qué
 * se comprobó y quién le debe a quién.
 *
 * [estado] es `SIN_COMPROBAR` | `CUADRADO` | `POR_DEVOLVER` (sobró dinero) |
 * `POR_REEMBOLSAR` (se gastó de más).
 */
data class ViaticoLiquidacionDto(
    val entregado: Double? = null,
    val comprobado: Double? = null,
    val saldo: Double? = null,
    val estado: String? = null,
)

data class ViaticoProyectoRefDto(
    val id: Long? = null,
    val name: String? = null,
)

data class ViaticoVehiculoRefDto(
    val id: Long? = null,
    val nombre: String? = null,
    val placas: String? = null,
)

/**
 * Un viático. `Pendiente` | `Aprobado` | `Rechazado` | `Pagado`.
 *
 * `montoAprobado` se sella al autorizar (el jefe puede recortar la cifra) y es
 * contra eso —no contra lo solicitado— que se comprueban los tickets.
 */
data class ViaticoDto(
    val id: Long,
    val usuarioId: Long? = null,
    val estatus: String? = null,
    val categoria: String? = null,
    val motivo: String? = null,
    val montoSolicitado: Double? = null,
    val montoAprobado: Double? = null,
    val montoComprobado: Double? = null,
    val fechaSolicitud: String? = null,
    val fechaComprobacion: String? = null,
    val ticketEvidenciaUrl: String? = null,
    val contabilidadRef: String? = null,
    val actividadId: Long? = null,
    val actividad: ActivityShortDto? = null,
    val usuario: SimpleUserDto? = null,
    val project: ViaticoProyectoRefDto? = null,
    val vehicle: ViaticoVehiculoRefDto? = null,
    val repartos: List<ViaticoRepartoDto>? = null,
    val liquidacion: ViaticoLiquidacionDto? = null,
) {
    /** Lo entregado: lo autorizado si ya lo hay; si no, lo solicitado. */
    fun montoVigente(): Double = montoAprobado ?: montoSolicitado ?: 0.0

    /** Un viático pagado ya salió en una póliza: su reparto no se vuelve a tocar. */
    fun estaPagado(): Boolean = estatus.equals("Pagado", ignoreCase = true)

    fun estaAprobado(): Boolean = estatus.equals("Aprobado", ignoreCase = true)

    fun estaRechazado(): Boolean = estatus.equals("Rechazado", ignoreCase = true)

    /** Pendiente de autorización: el único estado en el que el jefe decide. */
    fun estaPendiente(): Boolean = estatus.equals("Pendiente", ignoreCase = true)
}

/** Una parte del reparto, tal como la espera `ViaticoParteDto` del servidor. */
data class ViaticoParteBody(
    val actividadId: Long,
    val monto: Double,
    val nota: String? = null,
)

/** `PUT viatics/:id/reparto` — reemplaza el reparto completo. Lista vacía: lo deshace. */
data class SetRepartoBody(val partes: List<ViaticoParteBody>)

/** `PATCH viatics/:id/approve` — autoriza (con recorte opcional) o rechaza. */
data class ResolverViaticoBody(
    /** `approve` | `reject`. */
    val action: String,
    val note: String? = null,
    /** Recorte: nunca más de lo solicitado. `null` autoriza la cifra completa. */
    val montoAprobado: Double? = null,
)

/**
 * Las mutaciones devuelven [ResponseBody] crudo, no [ViaticoDto], a propósito:
 * sin red el interceptor offline contesta `{"queued":true,"offline":true}` con
 * un 202, y ese cuerpo no es un viático. Pedirle a Moshi que lo decodifique
 * reventaría con «Required value 'id' missing» y la persona vería un error de
 * programador en vez de «quedó en la cola». El repositorio mira el cuerpo y la
 * pantalla recarga del servidor después de cada acción.
 *
 * `POST viatics/assign` —el jefe asigna un anticipo a alguien, sin ticket
 * previo— no se declara aquí: ninguna de las cinco pantallas lo usa todavía, y
 * este módulo nació precisamente de limpiar tres métodos de viáticos que nadie
 * llamaba. Se añade el día que haya pantalla que lo pida.
 */
interface ViaticosApi {

    /**
     * `GET viatics` — sin `limit`, el API devuelve el arreglo completo (tope de
     * 200 del lado del servidor). Trae ya los repartos y la liquidación.
     */
    @GET("viatics")
    suspend fun lista(): List<ViaticoDto>

    /** `GET viatics/:id` — el detalle trae además el nombre de cada actividad del reparto. */
    @GET("viatics/{id}")
    suspend fun detalle(@Path("id") id: Long): ViaticoDto

    /**
     * `POST viatics` — alta con la foto del ticket.
     *
     * El servidor exige evidencia: sin `ticketEvidencia` ni `ticketEvidenciaUrl`
     * contesta 400 («Debes adjuntar el ticket o comprobante»).
     *
     * Las partes opcionales se mandan nulas cuando no aplican: una cadena vacía
     * se convertiría en `NaN` y `@IsInt()` la rechazaría.
     */
    @Multipart
    @POST("viatics")
    suspend fun crear(
        @Part("montoSolicitado") montoSolicitado: RequestBody,
        @Part("motivo") motivo: RequestBody,
        @Part("categoria") categoria: RequestBody?,
        @Part("actividadId") actividadId: RequestBody?,
        @Part("projectId") projectId: RequestBody?,
        @Part("vehicleId") vehicleId: RequestBody?,
        @Part ticketEvidencia: MultipartBody.Part,
    ): ResponseBody

    /** `PUT viatics/:id/reparto` — la suma tiene que ser el total, al centavo. */
    @PUT("viatics/{id}/reparto")
    suspend fun guardarReparto(
        @Path("id") id: Long,
        @Body body: SetRepartoBody,
    ): ResponseBody

    /**
     * `PATCH viatics/:id/comprobar` — tickets contra el anticipo.
     *
     * Solo con el viático en `Aprobado` o `Pagado`: antes de eso no se ha
     * entregado dinero que comprobar.
     */
    @Multipart
    @PATCH("viatics/{id}/comprobar")
    suspend fun comprobar(
        @Path("id") id: Long,
        @Part("montoComprobado") montoComprobado: RequestBody,
        @Part("nota") nota: RequestBody?,
        @Part ticketEvidencia: MultipartBody.Part?,
    ): ResponseBody

    /** `PATCH viatics/:id/approve` — autoriza o rechaza. */
    @PATCH("viatics/{id}/approve")
    suspend fun resolver(
        @Path("id") id: Long,
        @Body body: ResolverViaticoBody,
    ): ResponseBody

    /**
     * `PATCH viatics/:id/pagado` — marca el pago y levanta la póliza.
     *
     * Sin cuerpo: el controlador no lee ninguno.
     */
    @PATCH("viatics/{id}/pagado")
    suspend fun marcarPagado(@Path("id") id: Long): ResponseBody
}
