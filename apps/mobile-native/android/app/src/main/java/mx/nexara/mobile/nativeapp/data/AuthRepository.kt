package mx.nexara.mobile.nativeapp.data

import android.content.Context
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.LoginRequest

class AuthRepository(
    context: Context,
) {
    private val deviceIdentityProvider = DeviceIdentityProvider(context)
    private val sessionStore = SessionStore(context)

    suspend fun login(email: String, password: String): SessionUser {
        val headers = deviceIdentityProvider.headers().asHeaders()
        val response = ApiClient.auth.login(
            headers = headers,
            body = LoginRequest(email = email, password = password),
        )

        val dto = response.user
        val user = SessionUser(
            id = dto.id,
            nombre = dto.nombre,
            email = dto.email,
            role = dto.role ?: "",
            department = dto.department ?: "",
            token = response.access_token,
            permissions = dto.permissions ?: emptyList(),
            isSuperAdmin = dto.isSuperAdmin ?: false,
        )

        sessionStore.save(user)
        return user
    }

    fun loadSession(): SessionUser? = sessionStore.load()

    fun token(): String? = sessionStore.load()?.token

    fun logout() = sessionStore.clear()
}

