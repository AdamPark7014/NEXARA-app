package mx.nexara.mobile.nativeapp.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Query

/**
 * Pago semanal (`employee-payments/control-semanal`). Lo sugerido lo calcula el servidor con el total del
 * Control semanal; registrar es solo de dirección y el servidor no deja pagar más del saldo.
 */
interface PagoSemanalApi {
    @GET("employee-payments/control-semanal/pago")
    suspend fun semana(@Query("semana") semana: String): PagoSemanaDto

    @GET("employee-payments/control-semanal/como-se-calculo")
    suspend fun detalle(@Query("semana") semana: String, @Query("userId") userId: Long): PagoDetalleDto

    @Multipart
    @POST("employee-payments/control-semanal/registrar-pago")
    suspend fun registrar(
        @Part("semana") semana: RequestBody,
        @Part("userId") userId: RequestBody,
        @Part("monto") monto: RequestBody,
        @Part("forma") forma: RequestBody,
        @Part("fecha") fecha: RequestBody,
        @Part comprobante: MultipartBody.Part?,
    ): PagoRegistradoDto
}

data class SaldoPagoDto(
    val sugerido: Double? = null,
    val ajustes: Double? = null,
    val final: Double? = null,
    val pagado: Double? = null,
    val saldo: Double? = null,
)

data class PagoFilaDto(
    val userId: Long? = null,
    val nombre: String? = null,
    val area: String? = null,
    val saldo: SaldoPagoDto? = null,
    /** `sin_monto` · `por_pagar` · `parcial` · `pagado`. */
    val estado: String? = null,
)

data class PagoSemanaInfoDto(val inicio: String? = null, val fin: String? = null, val estado: String? = null)

data class PagoSemanaDto(
    val semana: PagoSemanaInfoDto? = null,
    val montosOcultos: Boolean? = null,
    val puedeRegistrar: Boolean? = null,
    val filas: List<PagoFilaDto>? = null,
    val totales: SaldoPagoDto? = null,
)

data class RenglonPagoDto(val titulo: String? = null, val monto: Double? = null, val detalle: String? = null)

data class MovimientoPagoDto(
    val id: String? = null,
    /** `ajuste` · `pago`. */
    val tipo: String? = null,
    val monto: Double? = null,
    val motivo: String? = null,
    val forma: String? = null,
    val fecha: String? = null,
    val autorNombre: String? = null,
)

data class PagoDetalleDto(
    val userId: Long? = null,
    val nombre: String? = null,
    val puedeRegistrar: Boolean? = null,
    val saldo: SaldoPagoDto? = null,
    val extraPendienteMin: Int? = null,
    val comoSeCalculo: List<RenglonPagoDto>? = null,
    val movimientos: List<MovimientoPagoDto>? = null,
)

data class PagoRegistradoDto(val ok: Boolean? = null, val id: Long? = null, val aviso: String? = null)
