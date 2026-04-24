package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.POST
import retrofit2.http.Query

data class RegisterFcmTokenRequest(
    val token: String,
    val platform: String = "android",
)

data class RegisterFcmTokenResponse(
    val ok: Boolean? = null,
    val id: Long? = null,
)

/**
 * Endpoints de /api/devices para registrar y revocar tokens push.
 */
interface DevicesApi {
    @POST("devices/push-token")
    suspend fun registerPushToken(@Body body: RegisterFcmTokenRequest): RegisterFcmTokenResponse

    @DELETE("devices/push-token")
    suspend fun revokePushToken(@Query("token") token: String): RegisterFcmTokenResponse
}
