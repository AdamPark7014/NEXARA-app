package mx.nexara.mobile.nativeapp.data.console

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.ArrancadaDto
import mx.nexara.mobile.nativeapp.data.api.EmpezarSugerenciaRequest
import mx.nexara.mobile.nativeapp.data.api.NuevoPendienteRequest
import mx.nexara.mobile.nativeapp.data.api.PendienteDto
import mx.nexara.mobile.nativeapp.data.api.QueSigueApi
import mx.nexara.mobile.nativeapp.data.api.QueSigueDto
import mx.nexara.mobile.nativeapp.data.AuthRepository

class QueSigueRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: QueSigueApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(QueSigueApi::class.java)

    suspend fun queSigue(): QueSigueDto = withContext(Dispatchers.IO) { api.queSigue() }

    suspend fun empezar(clave: String): ArrancadaDto = withContext(Dispatchers.IO) { api.empezar(EmpezarSugerenciaRequest(clave)) }

    suspend fun pendientes(): List<PendienteDto> = withContext(Dispatchers.IO) { api.pendientes().pendientes }

    suspend fun agregar(texto: String): PendienteDto = withContext(Dispatchers.IO) { api.agregar(NuevoPendienteRequest(texto)) }

    suspend fun palomear(id: Long) {
        withContext(Dispatchers.IO) { api.palomear(id).close() }
    }

    suspend fun empezarPendiente(id: Long): ArrancadaDto = withContext(Dispatchers.IO) { api.empezarPendiente(id) }

    suspend fun borrar(id: Long) {
        withContext(Dispatchers.IO) { api.borrar(id).close() }
    }
}
