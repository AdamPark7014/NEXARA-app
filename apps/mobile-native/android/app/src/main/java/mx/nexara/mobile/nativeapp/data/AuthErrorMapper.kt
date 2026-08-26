package mx.nexara.mobile.nativeapp.data

import retrofit2.HttpException
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

object AuthErrorMapper {
    fun loginMessage(throwable: Throwable): String = when (throwable) {
        is HttpException -> when (throwable.code()) {
            401, 404 -> "Correo o contraseña incorrectos. Verifica tus datos e intenta de nuevo."
            403 -> "Tu cuenta no tiene acceso a esta aplicación."
            429 -> "Demasiados intentos. Espera un momento e intenta de nuevo."
            in 500..599 -> "El servidor no está disponible en este momento. Intenta más tarde."
            else -> "No se pudo iniciar sesión. Intenta de nuevo."
        }
        is UnknownHostException, is SSLException ->
            "Sin conexión a internet. Revisa tu red e intenta de nuevo."
        is SocketTimeoutException ->
            "La conexión tardó demasiado. Comprueba tu internet e intenta de nuevo."
        is IOException ->
            "Problema de conexión. Revisa tu internet e intenta de nuevo."
        else -> throwable.message
            ?.takeIf { it.isNotBlank() && !it.contains("HTTP", ignoreCase = true) }
            ?: "No se pudo iniciar sesión. Intenta de nuevo."
    }
}
