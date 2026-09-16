package mx.nexara.mobile.nativeapp.data.profile

import android.content.Context
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.HybridDayDto
import mx.nexara.mobile.nativeapp.data.api.MyIdentityDto
import mx.nexara.mobile.nativeapp.data.api.ProfileIdentityApi

/**
 * Identidad ACS y asistencia híbrida de hoy para «Mi perfil».
 *
 * La web las pide con `.catch(() => null)`: si Integra no contesta o el rol no
 * alcanza, el perfil se muestra igual y esas tarjetas quedan en blanco.
 */
class ProfileIdentityRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: ProfileIdentityApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(ProfileIdentityApi::class.java)

    suspend fun myIdentityOrNull(): MyIdentityDto? = runCatching { api.myIdentity() }.getOrNull()

    suspend fun hybridDayOrNull(date: String): HybridDayDto? =
        runCatching { api.hybridDay(date) }.getOrNull()
}
