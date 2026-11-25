package mx.nexara.mobile.nativeapp.data.console

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.AjusteHorarioRequest
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.HorariosApi
import mx.nexara.mobile.nativeapp.data.api.HorariosEquipoDto
import mx.nexara.mobile.nativeapp.data.api.MiHorarioDto

/**
 * Horarios: leer va con la caché sin señal de la app (se ve lo último guardado); cambiar el horario de
 * alguien **no se encola**, porque llegaría tarde y ya no sería lo que el jefe decidió.
 */
class HorariosRepository(context: Context) {
    private val authRepo = AuthRepository(context)

    private fun api(sinSenal: Boolean): HorariosApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
        withOffline = sinSenal,
    ).create(HorariosApi::class.java)

    private val lectura = api(sinSenal = true)
    private val escritura = api(sinSenal = false)

    suspend fun mio(desde: String, hasta: String): MiHorarioDto = withContext(Dispatchers.IO) { lectura.mio(desde, hasta) }

    suspend fun equipo(desde: String, hasta: String): HorariosEquipoDto =
        withContext(Dispatchers.IO) { lectura.equipo(desde, hasta) }

    suspend fun cambiarSalida(userId: Long, fecha: String, hasta: String, motivo: String, extender: Boolean) =
        withContext(Dispatchers.IO) {
            val body = AjusteHorarioRequest(userId, fecha, hasta, motivo.trim().ifEmpty { null })
            if (extender) escritura.extender(body) else escritura.recortar(body)
            Unit
        }
}
