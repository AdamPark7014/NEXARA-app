package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.Body
import retrofit2.http.HeaderMap
import retrofit2.http.POST

data class PortalLoginRequest(
    val email: String,
    val password: String,
)

data class ClientPortalLoginClientDto(
    val id: Long,
    val name: String,
    val logoUrl: String? = null,
)

data class ClientPortalLoginResponse(
    val access_token: String,
    val client: ClientPortalLoginClientDto,
)

data class BranchPortalLoginBranchDto(
    val id: Long,
    val name: String,
    val branchNumber: String? = null,
    val clientId: Long,
    val clientName: String? = null,
    val logoUrl: String? = null,
)

data class BranchPortalLoginResponse(
    val access_token: String,
    val branch: BranchPortalLoginBranchDto,
)

interface PortalAuthApi {
    @POST("client-auth/login")
    suspend fun clientLogin(
        @HeaderMap headers: Map<String, String>,
        @Body body: PortalLoginRequest,
    ): ClientPortalLoginResponse

    @POST("branch-auth/login")
    suspend fun branchLogin(
        @HeaderMap headers: Map<String, String>,
        @Body body: PortalLoginRequest,
    ): BranchPortalLoginResponse
}

