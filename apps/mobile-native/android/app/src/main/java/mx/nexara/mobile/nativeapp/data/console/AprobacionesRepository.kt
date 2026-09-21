package mx.nexara.mobile.nativeapp.data.console

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.AprobacionPendienteDto
import mx.nexara.mobile.nativeapp.data.api.AprobacionesApi
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.DecisionRequestDto
import mx.nexara.mobile.nativeapp.data.api.DecisionRespuestaDto

/**
 * Aprobaciones (workflow) de Core.
 *
 * Es el único módulo de «Más» que **escribe** desde el teléfono, y a propósito:
 * lo que se decide aquí no es capturar un dato, es desbloquear a alguien. Todo
 * lo demás del flujo —definir los pasos, elegir aprobadores— sigue en la
 * computadora.
 *
 * No hay cola offline: una decisión que sale tarde puede llegar cuando otro ya
 * decidió, y guardarla para «cuando vuelva la señal» haría creer que está
 * firmada cuando no lo está. Sin red, falla y se ve que falló.
 */
class AprobacionesRepository(context: Context) {

    private val authRepo = AuthRepository(context)
    private val api: AprobacionesApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(AprobacionesApi::class.java)

    /**
     * Lo que espera tu firma.
     *
     * Sin paginar ni filtrar contra el servidor: una bandeja de aprobaciones
     * que no cabe en memoria es una empresa con un problema mayor que el de
     * esta pantalla. El orden y las cifras los pone [AprobacionesRules].
     */
    suspend fun pendientes(): List<AprobacionPendienteDto> =
        withContext(Dispatchers.IO) { api.pendientes() }

    /**
     * Aprobar o rechazar.
     *
     * El motivo se manda solo si trae algo: el servidor lo normaliza a `null`
     * de todas formas, y una cadena vacía ensucia el historial del flujo y la
     * notificación que le llega al solicitante.
     */
    suspend fun decidir(
        aprobacionId: Long,
        aprobar: Boolean,
        motivo: String? = null,
    ): DecisionRespuestaDto = withContext(Dispatchers.IO) {
        api.decidir(
            aprobacionId,
            DecisionRequestDto(
                decision = if (aprobar) DECISION_APROBAR else DECISION_RECHAZAR,
                comments = motivo?.trim()?.takeIf { it.isNotEmpty() },
            ),
        )
    }

    private companion object {
        /** Los dos únicos valores que acepta el controlador. */
        const val DECISION_APROBAR = "APPROVED"
        const val DECISION_RECHAZAR = "REJECTED"
    }
}
