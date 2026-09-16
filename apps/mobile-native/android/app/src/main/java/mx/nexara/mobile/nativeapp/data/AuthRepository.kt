package mx.nexara.mobile.nativeapp.data

import android.content.Context
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.LoginRequest
import mx.nexara.mobile.nativeapp.data.api.PortalLoginRequest
import mx.nexara.mobile.nativeapp.data.offline.NexaraOffline
import mx.nexara.mobile.nativeapp.data.realtime.RealtimeBus
import mx.nexara.mobile.nativeapp.data.session.SessionEvents
import mx.nexara.mobile.nativeapp.data.session.SessionRefreshPolicy
import mx.nexara.mobile.nativeapp.data.session.SessionRefresher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

class AuthRepository(
    context: Context,
) {
    private val appContext = context.applicationContext
    private val deviceIdentityProvider = DeviceIdentityProvider(context)
    private val sessionStore = SessionStore(context)

    init {
        // Todo cliente autenticado nace de un AuthRepository: así el interceptor
        // de 401 siempre tiene acceso a la sesión guardada para renovarla.
        SessionRefresher.install(context)
    }

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
            user = saveEnriched(enrichSession(user)) ?: user
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

    /**
     * Guarda la navegación/empresa enriquecida SOBRE la sesión más reciente.
     *
     * `enrichSession` hace llamadas de red; si mientras tanto un 401 renovó el
     * token, guardar la copia vieja pisaría el token nuevo con el anterior. Y si
     * la sesión se cerró en medio, no hay que resucitarla. Devuelve null en ese caso.
     */
    private fun saveEnriched(enriched: SessionUser): SessionUser? {
        val latest = sessionStore.load() ?: return null
        if (latest.id != enriched.id || !latest.email.equals(enriched.email, ignoreCase = true)) {
            return null
        }
        val merged = enriched.copy(token = latest.token, expiresAt = latest.expiresAt)
        sessionStore.save(merged)
        return merged
    }

    /** Refresca paneles/módulos desde /me/navigation (login o resume). */
    suspend fun refreshNavigation() {
        val current = sessionStore.load() ?: return
        if (current.isClient || current.isBranchUser) return
        saveEnriched(enrichSession(current))
    }

    /**
     * Renueva el token con `POST auth/session/refresh` (acepta token vencido).
     * Single-flight compartido con el interceptor de 401 y el socket; guarda
     * token + expiresAt y reconecta realtime con el token nuevo.
     */
    suspend fun refreshSession(): SessionRefresher.Result = withContext(Dispatchers.IO) {
        val observed = sessionStore.load()?.token ?: return@withContext SessionRefresher.Result.NoSession
        SessionRefresher.refreshBlocking(observedToken = observed)
    }

    /**
     * Renovación proactiva (arranque, cada vuelta a primer plano y cada 30 min en
     * primer plano): si expiresAt es desconocido o faltan < 60 min, renueva en
     * segundo plano. Además arranca realtime con la sesión guardada, para que
     * funcione sin volver a iniciar sesión tras un arranque en frío.
     *
     * Solo un 401 del servidor en la renovación avisa de sesión expirada; sin red
     * o con 5xx la sesión sigue intacta y se reintenta en la próxima revisión.
     */
    suspend fun ensureSessionFresh() = withContext(Dispatchers.IO) {
        val current = sessionStore.load() ?: return@withContext
        val isPortal = current.isClient || current.isBranchUser
        if (!isPortal &&
            SessionRefreshPolicy.shouldRefreshProactively(current.expiresAt, System.currentTimeMillis())
        ) {
            if (refreshSession() == SessionRefresher.Result.Revoked) {
                SessionEvents.notifyExpired()
                return@withContext
            }
        }
        val token = sessionStore.load()?.token ?: return@withContext
        RealtimeBus.ensureStarted(token)
    }

    /**
     * Compatibilidad: antes pedía `auth/session/extend` solo con < 20 min. Ahora
     * refresca la navegación RBAC y delega en [ensureSessionFresh].
     */
    suspend fun maybeExtendSession() {
        val current = sessionStore.load() ?: return
        if (!(current.isClient || current.isBranchUser)) {
            runCatching { refreshNavigation() }
        }
        ensureSessionFresh()
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
        // En un teléfono compartido, quien entre después no debe ver los chats ni avisos del anterior.
        runCatching { mx.nexara.mobile.nativeapp.push.NexaraPushRenderer.clearAll(appContext) }
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
