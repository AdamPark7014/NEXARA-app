package mx.nexara.mobile.nativeapp.data

import android.content.Context
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.LoginRequest
import mx.nexara.mobile.nativeapp.data.api.PortalLoginRequest
import mx.nexara.mobile.nativeapp.data.realtime.RealtimeBus

class AuthRepository(
    context: Context,
) {
    private val deviceIdentityProvider = DeviceIdentityProvider(context)
    private val sessionStore = SessionStore(context)

    suspend fun login(email: String, password: String): SessionUser {
        val headers = deviceIdentityProvider.headers().asHeaders()
        val trimmedEmail = email.trim()
        var lastError: Exception? = null

        // 1) Internal users (`auth/login`)
        try {
            val response = ApiClient.auth.login(
                headers = headers,
                body = LoginRequest(email = trimmedEmail, password = password),
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
                isClient = false,
                isBranchUser = false,
                clientId = null,
                branchId = null,
                avatarUrl = dto.avatarUrl,
            )

            sessionStore.save(user)
            RealtimeBus.start(user.token)
            return user
        } catch (e: Exception) {
            lastError = e
        }

        // 2) Portal unificado (`portal/login` — cliente o sucursal)
        try {
            val response = ApiClient.portalAuth.portalLogin(
                headers = headers,
                body = PortalLoginRequest(email = trimmedEmail, password = password),
            )
            val user = when {
                response.client != null -> {
                    val client = response.client!!
                    SessionUser(
                        id = client.id,
                        nombre = client.name,
                        email = trimmedEmail,
                        role = "CLIENT_PORTAL",
                        department = "",
                        token = response.access_token,
                        permissions = emptyList(),
                        isSuperAdmin = false,
                        isClient = true,
                        isBranchUser = false,
                        clientId = client.id,
                        branchId = null,
                    )
                }
                response.branch != null -> {
                    val branch = response.branch!!
                    SessionUser(
                        id = branch.id,
                        nombre = branch.name,
                        email = trimmedEmail,
                        role = "BRANCH_PORTAL",
                        department = "",
                        token = response.access_token,
                        permissions = emptyList(),
                        isSuperAdmin = false,
                        isClient = false,
                        isBranchUser = true,
                        clientId = branch.clientId,
                        branchId = branch.id,
                    )
                }
                else -> throw IllegalStateException("Respuesta portal inválida")
            }
            sessionStore.save(user)
            RealtimeBus.start(user.token)
            return user
        } catch (e: Exception) {
            lastError = e
        }

        // 3) Legacy client portal (`client-auth/login`)
        try {
            val response = ApiClient.portalAuth.clientLogin(
                headers = headers,
                body = PortalLoginRequest(email = trimmedEmail, password = password),
            )

            val user = SessionUser(
                id = response.client.id,
                nombre = response.client.name,
                email = trimmedEmail,
                role = "CLIENT_PORTAL",
                department = "",
                token = response.access_token,
                permissions = emptyList(),
                isSuperAdmin = false,
                isClient = true,
                isBranchUser = false,
                clientId = response.client.id,
                branchId = null,
            )
            sessionStore.save(user)
            RealtimeBus.start(user.token)
            return user
        } catch (e: Exception) {
            lastError = e
        }

        // 4) Legacy branch portal (`branch-auth/login`)
        try {
            val response = ApiClient.portalAuth.branchLogin(
                headers = headers,
                body = PortalLoginRequest(email = trimmedEmail, password = password),
            )
            val user = SessionUser(
                id = response.branch.id,
                nombre = response.branch.name,
                email = trimmedEmail,
                role = "BRANCH_PORTAL",
                department = "",
                token = response.access_token,
                permissions = emptyList(),
                isSuperAdmin = false,
                isClient = false,
                isBranchUser = true,
                clientId = response.branch.clientId,
                branchId = response.branch.id,
            )
            sessionStore.save(user)
            RealtimeBus.start(user.token)
            return user
        } catch (e: Exception) {
            throw lastError ?: e
        }
    }

    fun loadSession(): SessionUser? = sessionStore.load()

    fun quickProfiles(): List<QuickProfile> = sessionStore.loadQuickProfiles()

    fun token(): String? = sessionStore.load()?.token

    fun logout() {
        sessionStore.clear()
        RealtimeBus.stop()
    }
}

