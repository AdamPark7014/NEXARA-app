package mx.nexara.mobile.nativeapp.data.api

import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Guardias de fin de semana — `GET/POST/DELETE /guardias`.
 *
 * Quién se puede programar lo decide el API (`personas`, `puedeProgramar`).
 * La app no vuelve a aplicar el organigrama.
 */
data class PersonaGuardiaDto(
    val id: Long = 0,
    val nombre: String? = null,
    val puesto: String? = null,
    val avatarUrl: String? = null,
)

data class GuardiaDto(
    val id: Long = 0,
    val userId: Long = 0,
    val fecha: String = "",
    val nota: String? = null,
    val persona: PersonaGuardiaDto? = null,
    val puedeQuitar: Boolean = false,
)

data class GuardiasRangoDto(
    val desde: String = "",
    val hasta: String = "",
    val hoy: String = "",
    val puedeProgramar: Boolean = false,
    val personas: List<PersonaGuardiaDto> = emptyList(),
    val items: List<GuardiaDto> = emptyList(),
)

data class ProgramarGuardiaBody(
    val userId: Long,
    val fecha: String,
    val nota: String? = null,
)

interface GuardiasApi {
    @GET("guardias")
    suspend fun listar(): GuardiasRangoDto

    /** El cuerpo se lee a mano: sin red la cola contesta `{"queued":true}`. */
    @POST("guardias")
    suspend fun programar(@Body body: ProgramarGuardiaBody): ResponseBody

    @DELETE("guardias/{id}")
    suspend fun quitar(@Path("id") id: Long): ResponseBody
}
