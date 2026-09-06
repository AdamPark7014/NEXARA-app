package mx.nexara.mobile.nativeapp.data

import android.content.Context
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.LoginRequest
import mx.nexara.mobile.nativeapp.data.api.PortalLoginRequest
import mx.nexara.mobile.nativeapp.data.offline.NexaraOffline
import mx.nexara.mobile.nativeapp.data.realtime.RealtimeBus
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.time.Instant

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
            var user = SessionUser(
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
                roleKey = dto.roleKey,
                orgRoleKey = dto.orgRoleKey,
                expiresAt = response.expiresAt,
            )

            sessionStore.save(user)
            RealtimeBus.start(user.token)
            user = enrichSession(user)
            sessionStore.save(user)
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

    /** companyId + navegación RBAC desde API (best-effort). */
    private suspend fun enrichSession(user: SessionUser): SessionUser {
        if (user.isClient || user.isBranchUser) return user
        val api = ApiClient.authed(
            tokenProvider = { sessionStore.load()?.token ?: user.token },
            companyIdProvider = { sessionStore.load()?.companyId },
        ).create(mx.nexara.mobile.nativeapp.data.api.AuthApi::class.java)

        val companyId = runCatching {
            val companies = api.companyMine()
            companies.firstOrNull { it.isPrimary == true }?.id
                ?: companies.firstOrNull()?.id
        }.getOrNull()?.takeIf { it > 0L } ?: user.companyId

        val nav = runCatching { api.meNavigation() }.getOrNull()

        return user.copy(
            companyId = companyId,
            roleKey = nav?.roleKey ?: user.roleKey,
            orgRoleKey = nav?.orgRoleKey ?: user.orgRoleKey,
            navModuleKeys = nav?.moduleKeys?.takeIf { it.isNotEmpty() },
            navPanels = nav?.panels?.takeIf { it.isNotEmpty() },
            navPaths = nav?.paths?.takeIf { it.isNotEmpty() },
        )
    }

    /** Refresca paneles/módulos desde /me/navigation (login o resume). */
    suspend fun refreshNavigation() {
        val current = sessionStore.load() ?: return
        if (current.isClient || current.isBranchUser) return
        val enriched = enrichSession(current)
        sessionStore.save(enriched)
    }

    /**
     * Sliding session: si faltan < 20 min para expiresAt, pide token nuevo.
     * También refresca navegación RBAC en cada llamada (integración, no solo login).
     */
    suspend fun maybeExtendSession() {
        val current = sessionStore.load() ?: return
        if (current.isClient || current.isBranchUser) return

        runCatching { refreshNavigation() }

        val expiresRaw = sessionStore.load()?.expiresAt ?: current.expiresAt ?: return
        val expires = runCatching { Instant.parse(expiresRaw) }.getOrNull() ?: return
        val remainingMs = expires.toEpochMilli() - System.currentTimeMillis()
        if (remainingMs > 20L * 60_000L) return

        val api = ApiClient.authed(
            tokenProvider = { sessionStore.load()?.token },
            companyIdProvider = { sessionStore.load()?.companyId },
        ).create(mx.nexara.mobile.nativeapp.data.api.AuthApi::class.java)

        runCatching {
            val res = api.extendSession()
            val latest = sessionStore.load() ?: current
            sessionStore.save(
                latest.copy(
                    token = res.access_token,
                    expiresAt = res.expiresAt ?: latest.expiresAt,
                ),
            )
            RealtimeBus.start(res.access_token)
        }
    }

    fun loadSession(): SessionUser? = sessionStore.load()

    fun quickProfiles(): List<QuickProfile> = sessionStore.loadQuickProfiles()

    fun token(): String? = sessionStore.load()?.token

    fun companyId(): Long? = sessionStore.load()?.companyId

    fun logout() {
        val bearer = sessionStore.load()?.token
        sessionStore.clear()
        RealtimeBus.stop()
        runCatching { NexaraOffline.apiCache().clear() }
        if (!bearer.isNullOrBlank()) {
            kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                runCatching {
                    val fcm = runCatching {
                        com.google.firebase.messaging.FirebaseMessaging.getInstance().token.await()
                    }.getOrNull()
                    val api = ApiClient.authed(tokenProvider = { bearer }).create(
                        mx.nexara.mobile.nativeapp.data.api.DevicesApi::class.java,
                    )
                    api.revokePushToken(fcm)
                }
            }
        }
    }
}
