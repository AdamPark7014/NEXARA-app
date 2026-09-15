package mx.nexara.mobile.nativeapp.data.console

import android.content.Context
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.ComidaEquipoDto
import mx.nexara.mobile.nativeapp.data.api.ComidaMiDiaDto
import mx.nexara.mobile.nativeapp.data.api.ComidaRegresoRequest
import mx.nexara.mobile.nativeapp.data.api.ComidaRevisionRequest
import mx.nexara.mobile.nativeapp.data.api.ComidaSalidaRequest
import mx.nexara.mobile.nativeapp.data.api.ComidasApi
import okhttp3.ResponseBody

/** Hora de comida: mi día, registro con foto, comidas del equipo y su aprobación. */
class ComidasRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: ComidasApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(ComidasApi::class.java)

    suspend fun miDia(): ComidaMiDiaDto = api.miDia()

    /** @param fecha `yyyy-MM-dd` (día de México); null = hoy. */
    suspend fun equipo(fecha: String? = null): ComidaEquipoDto = api.equipo(fecha)

    /** @return false si quedó en la cola sin conexión (se envía al volver la red). */
    suspend fun registrarSalida(horaIso: String, fotoDataUrl: String, justificacion: String?): Boolean =
        !api.salida(
            ComidaSalidaRequest(
                checkinTime = horaIso,
                checkinPhotoUrl = fotoDataUrl,
                justificacion = justificacion?.trim()?.takeIf { it.isNotEmpty() },
            ),
        ).isQueued()

    /** @return false si quedó en la cola sin conexión. */
    suspend fun registrarRegreso(horaIso: String, fotoDataUrl: String, justificacion: String?): Boolean =
        !api.regreso(
            ComidaRegresoRequest(
                checkoutTime = horaIso,
                checkoutPhotoUrl = fotoDataUrl,
                justificacion = justificacion?.trim()?.takeIf { it.isNotEmpty() },
            ),
        ).isQueued()

    suspend fun revisar(id: Long, aprobar: Boolean, notas: String?) {
        api.revisar(
            id,
            ComidaRevisionRequest(
                decision = if (aprobar) "aprobar" else "rechazar",
                notas = notas?.trim()?.takeIf { it.isNotEmpty() },
            ),
        ).close()
    }

    /** El interceptor offline contesta `{"queued":true}` a las mutaciones sin red. */
    private fun ResponseBody.isQueued(): Boolean = use { body ->
        body.string().contains("\"queued\":true")
    }
}
