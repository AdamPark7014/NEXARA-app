package mx.nexara.mobile.nativeapp.data

import com.squareup.moshi.Moshi
import retrofit2.HttpException
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

object AuthErrorMapper {
    /**
     * Mensajes que el servidor manda cuando la contraseña no coincide. Son
     * correctos pero fríos: preferimos nuestra copia. Cualquier otro mensaje
     * del servidor (cuenta bloqueada, usuario inactivo) sí se muestra, porque
     * dice algo que el usuario no puede adivinar.
     */
    private val GENERICOS = setOf(
        "credenciales inválidas",
        "credenciales invalidas",
        "invalid credentials",
        "unauthorized",
    )

    fun loginMessage(throwable: Throwable): String = when (throwable) {
        is HttpException -> when (throwable.code()) {
            401 -> mensajeDelServidor(throwable)
                ?: "Correo o contraseña incorrectos. Verifica tus datos e intenta de nuevo."
            // 404 no es «contraseña mal»: es que ese correo no existe en la
            // tabla que se consultó. Decirlo aparte evita que un endpoint
            // ausente se disfrace de credencial incorrecta.
            404 -> "No encontramos ninguna cuenta con ese correo."
            403 -> mensajeDelServidor(throwable)
                ?: "Tu cuenta no tiene acceso a esta aplicación."
            429 -> "Demasiados intentos. Espera ${esperaLegible(throwable)} e intenta de nuevo."
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

    // Moshi y no `org.json`: en los tests de JVM `org.json` es un stub de Android
    // que devuelve nulos, así que este camino no se podría probar.
    private val cuerpoJson = Moshi.Builder().build().adapter(Any::class.java)

    private fun mensajeDelServidor(e: HttpException): String? = runCatching {
        val crudo = e.response()?.errorBody()?.string().orEmpty()
        if (crudo.isBlank()) return@runCatching null
        val raiz = cuerpoJson.fromJson(crudo) as? Map<*, *> ?: return@runCatching null
        // Nest manda `message` como texto, o como lista cuando es un DTO inválido.
        val mensaje = when (val valor = raiz["message"]) {
            is String -> valor
            is List<*> -> valor.filterIsInstance<String>()
                .filter { it.isNotBlank() }
                .joinToString(" ")
            else -> null
        }?.trim()
        mensaje?.takeIf { it.isNotBlank() && it.lowercase() !in GENERICOS }
    }.getOrNull()

    /** El servidor manda `Retry-After` en segundos; el usuario piensa en minutos. */
    private fun esperaLegible(e: HttpException): String {
        val segundos = e.response()?.headers()?.get("Retry-After")?.trim()?.toIntOrNull()
            ?: return "un momento"
        if (segundos <= 60) return "un minuto"
        val minutos = (segundos + 59) / 60
        return "$minutos minutos"
    }
}
