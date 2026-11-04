package mx.nexara.mobile.nativeapp.data.api

import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * «¿Qué sigue?» y Mis pendientes (Velocidad Core, Ola 6). Espejo de `me/que-sigue.controller.ts`: las
 * sugerencias las arma la API, y «Empezar» manda solo la clave.
 */
data class SugerenciaDto(
    val clave: String = "",
    /** abierta | pendiente | cotizacion | contacto | revisar | obra | banco | seguir | fija */
    val tipo: String? = null,
    val titulo: String = "",
    val detalle: String? = null,
    /** abrir | empezar */
    val accion: String? = null,
    val href: String? = null,
)

data class QueSigueDto(
    val aplica: Boolean = false,
    val area: String? = null,
    val sugerencias: List<SugerenciaDto> = emptyList(),
    val resumen: String? = null,
)

data class ArrancadaDto(val activityId: Long = 0, val iniciada: Boolean = false)

data class PendienteDto(val id: Long = 0, val texto: String = "")

data class PendientesDto(val pendientes: List<PendienteDto> = emptyList())

data class EmpezarSugerenciaRequest(val clave: String)

data class NuevoPendienteRequest(val texto: String)

interface QueSigueApi {
    @GET("me/que-sigue")
    suspend fun queSigue(): QueSigueDto

    @POST("me/que-sigue/empezar")
    suspend fun empezar(@Body body: EmpezarSugerenciaRequest): ArrancadaDto

    @GET("me/pendientes")
    suspend fun pendientes(): PendientesDto

    @POST("me/pendientes")
    suspend fun agregar(@Body body: NuevoPendienteRequest): PendienteDto

    @POST("me/pendientes/{id}/hecho")
    suspend fun palomear(@Path("id") id: Long): ResponseBody

    @POST("me/pendientes/{id}/empezar")
    suspend fun empezarPendiente(@Path("id") id: Long): ArrancadaDto

    @DELETE("me/pendientes/{id}")
    suspend fun borrar(@Path("id") id: Long): ResponseBody
}
