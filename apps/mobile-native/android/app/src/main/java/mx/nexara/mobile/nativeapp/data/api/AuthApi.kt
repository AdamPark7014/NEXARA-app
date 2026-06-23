package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.Body
import retrofit2.http.HeaderMap
import retrofit2.http.POST

data class LoginRequest(
    val email: String,
    val password: String,
    val panel: String? = null,
)

data class LoginUserDto(
    val id: Long,
    val nombre: String,
    val email: String,
    val role: String? = null,
    val roleId: Long? = null,
    val department: String? = null,
    val departmentId: Long? = null,
    val avatarUrl: String? = null,
    val permissions: List<String>? = null,
    val isSuperAdmin: Boolean? = null,
    val loginDevice: String? = null,
)

data class LoginResponse(
    val access_token: String,
    val user: LoginUserDto,
    val loginGreeting: String? = null,
    val loginDevice: String? = null,
)

interface AuthApi {
    @POST("auth/login")
    suspend fun login(
        @HeaderMap headers: Map<String, String>,
        @Body body: LoginRequest,
    ): LoginResponse
}

