package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.Body
import retrofit2.http.GET
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
    val roleKey: String? = null,
    val orgRoleKey: String? = null,
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
    val expiresAt: String? = null,
    val loginGreeting: String? = null,
    val loginDevice: String? = null,
)

data class SessionExtendResponse(
    val access_token: String,
    val expiresAt: String? = null,
)

data class MeNavigationDto(
    val roleKey: String? = null,
    val orgRoleKey: String? = null,
    val panels: List<String>? = null,
    val paths: List<String>? = null,
    val moduleKeys: List<String>? = null,
)

data class CompanyMineItemDto(
    val id: Long? = null,
    val tradeName: String? = null,
    val isPrimary: Boolean? = null,
)

interface AuthApi {
    @POST("auth/login")
    suspend fun login(
        @HeaderMap headers: Map<String, String>,
        @Body body: LoginRequest,
    ): LoginResponse

    @POST("auth/session/extend")
    suspend fun extendSession(): SessionExtendResponse

    @GET("auth/profile")
    suspend fun profile(): LoginUserDto

    @GET("me/navigation")
    suspend fun meNavigation(): MeNavigationDto

    @GET("company/mine")
    suspend fun companyMine(): List<CompanyMineItemDto>
}
