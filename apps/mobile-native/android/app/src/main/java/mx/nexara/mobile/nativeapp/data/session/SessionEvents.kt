package mx.nexara.mobile.nativeapp.data.session

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Global session-expiry signal. Solo se emite con expiración CONFIRMADA por el
 * servidor: `POST auth/session/refresh` contestó 401 (sesión revocada, usuario
 * inactivo o > 30 días sin uso). Un 401 suelto de otro endpoint, un fallo de red
 * o un 5xx ya no la disparan (ver `ApiClient.recoverFrom401` y `SessionRefresher`).
 * Excepción: cuentas de portal (sin renovación) conservan el 401 → expirada.
 */
object SessionEvents {
    private val _expired = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val expired: SharedFlow<Unit> = _expired.asSharedFlow()

    fun notifyExpired() {
        _expired.tryEmit(Unit)
    }
}
