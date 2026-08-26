package mx.nexara.mobile.nativeapp.data.api

import retrofit2.HttpException
import java.io.IOException

fun Throwable.toUserMessage(fallback: String = "No se pudo completar la operación"): String {
    when (this) {
        is HttpException -> when (code()) {
            401 -> return "Sesión expirada. Inicia sesión de nuevo."
            403 -> return "Sin permisos para esta acción."
            404 -> return "Recurso no encontrado."
            in 500..599 -> return "Error del servidor. Intenta más tarde."
        }
        is IOException -> return "Sin conexión. Revisa tu red e intenta de nuevo."
    }
    return message?.takeIf { it.isNotBlank() } ?: fallback
}

fun Throwable.isSessionExpired(): Boolean = (this as? HttpException)?.code() == 401
