package mx.nexara.mobile.nativeapp.data

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

class AuthErrorMapperTest {

    @Test
    fun loginMessage_http401_returnsInvalidCredentials() {
        val msg = AuthErrorMapper.loginMessage(httpError(401))
        assertEquals(
            "Correo o contraseña incorrectos. Verifica tus datos e intenta de nuevo.",
            msg,
        )
    }

    @Test
    fun loginMessage_http403_returnsNoAccess() {
        val msg = AuthErrorMapper.loginMessage(httpError(403))
        assertEquals("Tu cuenta no tiene acceso a esta aplicación.", msg)
    }

    @Test
    fun loginMessage_http429_returnsRateLimited() {
        val msg = AuthErrorMapper.loginMessage(httpError(429))
        assertEquals("Demasiados intentos. Espera un momento e intenta de nuevo.", msg)
    }

    @Test
    fun loginMessage_http500_returnsServerUnavailable() {
        val msg = AuthErrorMapper.loginMessage(httpError(503))
        assertEquals("El servidor no está disponible en este momento. Intenta más tarde.", msg)
    }

    @Test
    fun loginMessage_unknownHost_returnsNoConnection() {
        val msg = AuthErrorMapper.loginMessage(UnknownHostException("offline"))
        assertEquals("Sin conexión a internet. Revisa tu red e intenta de nuevo.", msg)
    }

    @Test
    fun loginMessage_sslException_returnsNoConnection() {
        val msg = AuthErrorMapper.loginMessage(SSLException("cert"))
        assertEquals("Sin conexión a internet. Revisa tu red e intenta de nuevo.", msg)
    }

    @Test
    fun loginMessage_socketTimeout_returnsTimeoutMessage() {
        val msg = AuthErrorMapper.loginMessage(SocketTimeoutException("timeout"))
        assertEquals("La conexión tardó demasiado. Comprueba tu internet e intenta de nuevo.", msg)
    }

    @Test
    fun loginMessage_ioException_returnsConnectionProblem() {
        val msg = AuthErrorMapper.loginMessage(IOException("broken pipe"))
        assertEquals("Problema de conexión. Revisa tu internet e intenta de nuevo.", msg)
    }

    @Test
    fun loginMessage_genericThrowable_usesMessageWhenSafe() {
        val msg = AuthErrorMapper.loginMessage(IllegalStateException("Cuenta bloqueada"))
        assertEquals("Cuenta bloqueada", msg)
    }

    @Test
    fun loginMessage_httpMessage_isFiltered() {
        val msg = AuthErrorMapper.loginMessage(IllegalStateException("HTTP 400 Bad Request"))
        assertEquals("No se pudo iniciar sesión. Intenta de nuevo.", msg)
    }

    @Test
    fun loginMessage_http404_noSeConfundeConPasswordMal() {
        val msg = AuthErrorMapper.loginMessage(httpError(404))
        assertEquals("No encontramos ninguna cuenta con ese correo.", msg)
    }

    @Test
    fun loginMessage_http401_conMotivoDelServidor_loMuestra() {
        val msg = AuthErrorMapper.loginMessage(
            httpErrorConCuerpo(401, """{"message":"Cuenta bloqueada temporalmente. Reintenta en 12 min."}"""),
        )
        assertEquals("Cuenta bloqueada temporalmente. Reintenta en 12 min.", msg)
    }

    @Test
    fun loginMessage_http401_motivoGenerico_usaLaCopiaAmable() {
        val msg = AuthErrorMapper.loginMessage(
            httpErrorConCuerpo(401, """{"message":"Credenciales inválidas"}"""),
        )
        assertEquals(
            "Correo o contraseña incorrectos. Verifica tus datos e intenta de nuevo.",
            msg,
        )
    }

    @Test
    fun loginMessage_http429_diceCuantoEsperar() {
        val msg = AuthErrorMapper.loginMessage(
            httpErrorConCuerpo(429, """{"message":"Too many requests"}""", retryAfter = "619"),
        )
        assertEquals("Demasiados intentos. Espera 11 minutos e intenta de nuevo.", msg)
    }

    private fun httpErrorConCuerpo(
        code: Int,
        body: String,
        retryAfter: String? = null,
    ): HttpException {
        val raw = okhttp3.Response.Builder()
            .code(code)
            .message("error")
            .protocol(Protocol.HTTP_1_1)
            .request(Request.Builder().url("https://api.nexara.com.mx/api/auth/login").build())
            .apply { if (retryAfter != null) addHeader("Retry-After", retryAfter) }
            .build()
        return HttpException(
            Response.error<Any>(body.toResponseBody("application/json".toMediaType()), raw),
        )
    }

    private fun httpError(code: Int): HttpException {
        return HttpException(
            Response.error<Any>(
                code,
                "".toResponseBody("application/json".toMediaType()),
            ),
        )
    }
}
