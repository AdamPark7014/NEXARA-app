package mx.nexara.mobile.nativeapp.data.session

import android.content.Context
import android.util.Log
import mx.nexara.mobile.nativeapp.data.SessionStore
import mx.nexara.mobile.nativeapp.data.SessionUser
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.realtime.RealtimeBus
import mx.nexara.mobile.nativeapp.data.session.SessionRefreshPolicy.InFlight
import mx.nexara.mobile.nativeapp.data.session.SessionRefreshPolicy.RefreshHttp

/**
 * Renovación single-flight del token (`POST auth/session/refresh`).
 *
 * Un solo candado para TODOS los caminos: el interceptor de OkHttp (401), la
 * renovación proactiva del ciclo de vida y el socket de realtime. Si llegan
 * diez 401 a la vez, uno renueva y los demás esperan y reutilizan el token nuevo
 * (el guardado ya no coincide con el que falló → [InFlight.ReuseStored]).
 *
 * Bloqueante a propósito: se llama desde hilos de OkHttp o desde `Dispatchers.IO`.
 */
object SessionRefresher {
    private const val TAG = "SessionRefresher"

    sealed interface Result {
        data class Refreshed(val token: String) : Result

        /** El servidor confirmó que la sesión ya no vale (401 en refresh). */
        data object Revoked : Result

        /** Red, timeout, 5xx…: la sesión se conserva y se reintenta después. */
        data object Transient : Result

        data object NoSession : Result

        /** Cuentas de portal (cliente/sucursal): sin renovación. */
        data object NotSupported : Result
    }

    @Volatile
    private var appContext: Context? = null

    @Volatile
    private var storeInstance: SessionStore? = null

    private val lock = Any()

    // Protegidos por [lock].
    private var lastRevokedToken: String? = null
    private var lastTransientToken: String? = null
    private var lastTransientAtMs: Long = 0L

    /** Idempotente; lo llaman `AuthRepository` y `MainActivity`. */
    fun install(context: Context) {
        if (appContext == null) appContext = context.applicationContext
    }

    private fun store(): SessionStore? {
        storeInstance?.let { return it }
        val ctx = appContext ?: return null
        synchronized(this) {
            storeInstance?.let { return it }
            return SessionStore(ctx).also { storeInstance = it }
        }
    }

    fun storedSession(): SessionUser? = runCatching { store()?.load() }.getOrNull()

    /**
     * Renueva si hace falta. [observedToken] es el token con el que el llamador
     * vio el problema (el que recibió 401, o el guardado al decidir renovar): si
     * al entrar al candado el guardado ya es otro, se reutiliza sin ir a la red.
     */
    fun refreshBlocking(observedToken: String?): Result = synchronized(lock) {
        val s = store() ?: return Result.NoSession
        val current = runCatching { s.load() }.getOrNull() ?: return Result.NoSession
        if (current.isClient || current.isBranchUser) return Result.NotSupported

        val decision = SessionRefreshPolicy.decideInFlight(
            observedToken = observedToken,
            storedToken = current.token,
            lastRevokedToken = lastRevokedToken,
            lastTransientToken = lastTransientToken,
            lastTransientAtMs = lastTransientAtMs,
            nowMs = System.currentTimeMillis(),
        )
        when (decision) {
            InFlight.NoSession -> Result.NoSession
            is InFlight.ReuseStored -> Result.Refreshed(decision.token)
            InFlight.AlreadyRevoked -> Result.Revoked
            InFlight.RecentlyFailed -> Result.Transient
            InFlight.CallServer -> callServer(s, current)
        }
    }

    private fun callServer(s: SessionStore, current: SessionUser): Result {
        val bearer = "Bearer ${current.token}"
        var newToken: String? = null
        var newExpiresAt: String? = null

        val outcome = try {
            val api = ApiClient.sessionApi
            val res = api.refreshSession(bearer, emptyMap()).execute()
            val body = res.body()
            res.errorBody()?.close()
            var kind = SessionRefreshPolicy.classifyRefresh(res.code(), body?.access_token)
            if (kind == RefreshHttp.Success) {
                newToken = body?.access_token
                newExpiresAt = body?.expiresAt
            } else if (kind == RefreshHttp.EndpointMissing) {
                // API desplegada sin `refresh` todavía: la ruta vieja solo sirve
                // con token vigente, pero mantiene vivo el caso común.
                val legacy = api.extendSessionCall(bearer).execute()
                val legacyBody = legacy.body()
                legacy.errorBody()?.close()
                kind = SessionRefreshPolicy.classifyLegacyExtend(legacy.code(), legacyBody?.access_token)
                if (kind == RefreshHttp.Success) {
                    newToken = legacyBody?.access_token
                    newExpiresAt = legacyBody?.expiresAt
                }
            }
            kind
        } catch (e: Exception) {
            Log.w(TAG, "refresh falló (se conserva la sesión): ${e.javaClass.simpleName}")
            RefreshHttp.Transient
        }

        return when (outcome) {
            RefreshHttp.Success -> {
                val token = newToken.orEmpty()
                lastRevokedToken = null
                lastTransientToken = null
                val latest = runCatching { s.load() }.getOrNull()
                    ?: return Result.NoSession // se cerró sesión mientras viajaba
                if (latest.token != current.token) {
                    // Otro login pisó la sesión entretanto: no sobrescribirla.
                    return Result.Refreshed(latest.token)
                }
                s.save(
                    latest.copy(
                        token = token,
                        expiresAt = newExpiresAt?.takeIf { it.isNotBlank() },
                    ),
                )
                RealtimeBus.onTokenRefreshed(token)
                Result.Refreshed(token)
            }
            RefreshHttp.Revoked -> {
                Log.i(TAG, "el servidor confirmó sesión revocada")
                lastRevokedToken = current.token
                Result.Revoked
            }
            RefreshHttp.EndpointMissing, RefreshHttp.Transient -> {
                lastTransientToken = current.token
                lastTransientAtMs = System.currentTimeMillis()
                Result.Transient
            }
        }
    }
}
