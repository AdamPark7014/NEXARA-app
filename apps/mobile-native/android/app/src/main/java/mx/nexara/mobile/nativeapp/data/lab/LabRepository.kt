package mx.nexara.mobile.nativeapp.data.lab

import android.content.Context
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.LabApi
import mx.nexara.mobile.nativeapp.data.api.LabAiRequest
import mx.nexara.mobile.nativeapp.data.api.SetFlagRequest

class LabRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: LabApi = ApiClient.authed { authRepo.token() }.create(LabApi::class.java)
    private val healthApi = ApiClient.healthApi { authRepo.token() }

    suspend fun basicHealth() = healthApi.health()

    suspend fun healthSummary() = api.healthSummary()

    suspend fun flags(scope: String? = null) = api.listFlags(scope)

    suspend fun setFlag(key: String, enabled: Boolean) = api.setFlag(key, SetFlagRequest(enabled))

    suspend fun runAi(model: String, prompt: String, systemPrompt: String?) =
        api.runAi(LabAiRequest(model = model, prompt = prompt, systemPrompt = systemPrompt?.takeIf { it.isNotBlank() }))
}
