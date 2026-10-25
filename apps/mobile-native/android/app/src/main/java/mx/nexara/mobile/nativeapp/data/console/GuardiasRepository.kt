package mx.nexara.mobile.nativeapp.data.console

import android.content.Context
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.GuardiasApi
import mx.nexara.mobile.nativeapp.data.api.GuardiasRangoDto
import mx.nexara.mobile.nativeapp.data.api.ProgramarGuardiaBody

/** Calendario de guardias. El alcance (a quién) llega en [listar]. */
class GuardiasRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: GuardiasApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(GuardiasApi::class.java)

    suspend fun listar(): GuardiasRangoDto = api.listar()

    /** @return true si quedó en la cola sin conexión. */
    suspend fun programar(userId: Long, fecha: String, nota: String?): Boolean {
        val limpia = nota?.trim()?.takeIf { it.isNotEmpty() }
        return api.programar(ProgramarGuardiaBody(userId = userId, fecha = fecha, nota = limpia)).use { cuerpo ->
            cuerpo.string().contains("\"queued\":true")
        }
    }

    /** @return true si quedó en la cola sin conexión. */
    suspend fun quitar(id: Long): Boolean =
        api.quitar(id).use { cuerpo -> cuerpo.string().contains("\"queued\":true") }
}
