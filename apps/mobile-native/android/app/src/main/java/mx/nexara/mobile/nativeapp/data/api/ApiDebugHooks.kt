package mx.nexara.mobile.nativeapp.data.api

import okhttp3.Interceptor

/**
 * Interceptores extra que solo instala la variante debug (datos ficticios para las capturas
 * de Google Play, ver `src/debug/.../storedemo`). En release queda vacío.
 */
object ApiDebugHooks {
    @Volatile
    var interceptors: List<Interceptor> = emptyList()
}
