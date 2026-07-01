package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

data class FeatureFlagDto(
    val key: String,
    val scope: String? = null,
    val description: String? = null,
    val enabled: Boolean? = null,
)

data class LabHealthSummaryDto(
    val timestamp: String? = null,
    val uptime: Double? = null,
    val memoryMB: Int? = null,
    val counts: LabHealthCountsDto? = null,
)

data class LabHealthCountsDto(
    val users: Int? = null,
    val projects: Int? = null,
    val openTickets: Int? = null,
)

data class LabAiRequest(
    val model: String,
    val prompt: String,
    val systemPrompt: String? = null,
)

data class LabAiResponse(
    val output: String? = null,
    val model: String? = null,
    val provider: String? = null,
    val elapsedMs: Long? = null,
    val isMock: Boolean? = null,
)

data class SetFlagRequest(
    val enabled: Boolean,
)

interface LabApi {
    @GET("lab/health-summary")
    suspend fun healthSummary(): LabHealthSummaryDto

    @GET("lab/flags")
    suspend fun listFlags(@Query("scope") scope: String? = null): List<FeatureFlagDto>

    @PATCH("lab/flags/{key}")
    suspend fun setFlag(@Path("key") key: String, @Body body: SetFlagRequest): FeatureFlagDto

    @POST("lab/ai")
    suspend fun runAi(@Body body: LabAiRequest): LabAiResponse
}
