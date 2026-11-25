package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * Horarios por día (`apps/api/src/attendance/horario`). Quién ve y quién cambia a quién lo decide el
 * servidor por jerarquía; aquí solo se ofrece lo que él dice (`puedeProgramar`).
 *
 * Todo anulable con valor por omisión: un campo que el servidor deje de mandar no tumba la pantalla.
 */
interface HorariosApi {
    @GET("attendance/horarios/mio")
    suspend fun mio(@Query("from") from: String, @Query("to") to: String): MiHorarioDto

    @GET("attendance/horarios")
    suspend fun equipo(@Query("from") from: String, @Query("to") to: String): HorariosEquipoDto

    @POST("attendance/horarios/extender")
    suspend fun extender(@Body body: AjusteHorarioRequest): AjusteHorarioRespuesta

    @POST("attendance/horarios/recortar")
    suspend fun recortar(@Body body: AjusteHorarioRequest): AjusteHorarioRespuesta
}

data class HorarioCitadoDto(
    val horaEntrada: String? = null,
    val horaSalida: String? = null,
    val cruzaMedianoche: Boolean? = null,
    val motivo: String? = null,
)

data class DiaHorarioDto(
    /** `AAAA-MM-DD`. */
    val fecha: String? = null,
    val horario: HorarioCitadoDto? = null,
    val programado: Boolean? = null,
    val trabaja: Boolean? = null,
    val extraMin: Int? = null,
    val loPuso: String? = null,
    /** `programar` · `extender` · `recortar`. */
    val ajuste: String? = null,
)

data class MiHorarioDto(
    val hoy: String? = null,
    val entradaHoyAt: String? = null,
    val jornadaAbierta: Boolean? = null,
    val dias: List<DiaHorarioDto>? = null,
)

data class PersonaHorarioDto(
    val id: Long? = null,
    val nombre: String? = null,
    val puesto: String? = null,
    val puedeProgramar: Boolean? = null,
    val entradaHoyAt: String? = null,
    val jornadaAbierta: Boolean? = null,
    val extraMin: Int? = null,
    val dias: List<DiaHorarioDto>? = null,
)

data class HorariosEquipoDto(
    val hoy: String? = null,
    val personas: List<PersonaHorarioDto>? = null,
)

data class AjusteHorarioRequest(
    val userId: Long,
    val fecha: String,
    /** `HH:MM`, la nueva salida. */
    val hasta: String,
    val motivo: String? = null,
)

data class AjusteHorarioRespuesta(val ok: Boolean? = null)
