import Foundation

/// Repositorio de autenticación. Llama a `/auth/login`, `/auth/login-client`,
/// `/auth/login-branch` y `/auth/me` — paridad exacta con Android.
final class AuthRepository {
    static let shared = AuthRepository()
    private init() {}

    struct LoginBody: Encodable { let email: String; let password: String }

    struct LoginResponse: Decodable {
        let access_token: String?
        let token: String?
        let expiresAt: String?
        let user: UserPayload?
    }

    struct SessionExtendResponse: Decodable {
        let access_token: String
        let expiresAt: String?
    }

    struct UserPayload: Decodable {
        let id: FlexibleId?
        let nombre: String?
        let name: String?
        let email: String?
        let role: String?
        let rol: String?
        let roleKey: String?
        let orgRoleKey: String?
        let department: String?
        let departamento: String?
        let permissions: [String]?
        let isSuperAdmin: Bool?
        let isClient: Bool?
        let isBranchUser: Bool?
        let clientId: FlexibleId?
        let branchId: FlexibleId?
    }

    /// id puede venir como número o string en el JSON de login.
    struct FlexibleId: Decodable {
        let value: String
        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if let i = try? c.decode(Int64.self) { value = String(i); return }
            if let s = try? c.decode(String.self) { value = s; return }
            value = ""
        }
    }

    enum Kind { case user, client, branch }

    func login(email: String, password: String, kind: Kind) async throws -> SessionUser {
        switch kind {
        case .user:
            return try await staffLogin(email: email, password: password)
        case .client, .branch:
            return try await portalLogin(email: email, password: password)
        }
    }

    private func staffLogin(email: String, password: String) async throws -> SessionUser {
        let data = try await ApiClient.shared.postJSON("auth/login", body: LoginBody(email: email, password: password))
        let resp = try JSONDecoder().decode(LoginResponse.self, from: data)
        let token = resp.access_token ?? resp.token ?? ""
        guard !token.isEmpty else { throw ApiError.http(401, "Sin token") }
        let u = resp.user
        var user = SessionUser(
            id: u?.id?.value ?? "",
            nombre: u?.nombre ?? u?.name ?? email,
            email: u?.email ?? email,
            role: u?.role ?? u?.rol,
            department: u?.department ?? u?.departamento,
            token: token,
            permissions: u?.permissions ?? [],
            isSuperAdmin: u?.isSuperAdmin ?? false,
            isClient: u?.isClient ?? false,
            isBranchUser: u?.isBranchUser ?? false,
            clientId: u?.clientId?.value.nilIfEmpty,
            branchId: u?.branchId?.value.nilIfEmpty,
            roleKey: u?.roleKey,
            orgRoleKey: u?.orgRoleKey,
            navPanels: nil,
            companyId: nil,
            expiresAt: resp.expiresAt
        )
        SessionStore.shared.save(user)
        user = await enrichSession(user)
        SessionStore.shared.save(user)
        QuickProfileStore.remember(user)
        return user
    }

    private func portalLogin(email: String, password: String) async throws -> SessionUser {
        let data = try await ApiClient.shared.postJSON("portal/login", body: LoginBody(email: email, password: password))
        let raw = ConsoleHelpers.decodeMap(data)
        let token = ConsoleHelpers.mapStr(raw, "access_token")
        guard !token.isEmpty else { throw ApiError.http(401, "Sin token") }

        if let client = raw["client"] as? [String: Any] {
            let clientId = ConsoleHelpers.mapStr(client, "id")
            let name = ConsoleHelpers.mapStr(client, "name", "nombre")
            let user = SessionUser(
                id: clientId.isEmpty ? email : clientId,
                nombre: name.isEmpty ? email : name,
                email: email,
                role: "CLIENT_PORTAL",
                department: nil,
                token: token,
                permissions: [],
                isSuperAdmin: false,
                isClient: true,
                isBranchUser: false,
                clientId: clientId.nilIfEmpty,
                branchId: nil
            )
            SessionStore.shared.save(user)
            QuickProfileStore.remember(user)
            return user
        }

        if let branch = raw["branch"] as? [String: Any] {
            let branchId = ConsoleHelpers.mapStr(branch, "id")
            let name = ConsoleHelpers.mapStr(branch, "name", "nombre")
            let clientId = ConsoleHelpers.mapStr(branch, "clientId")
            let user = SessionUser(
                id: branchId.isEmpty ? email : branchId,
                nombre: name.isEmpty ? email : name,
                email: email,
                role: "BRANCH_PORTAL",
                department: nil,
                token: token,
                permissions: [],
                isSuperAdmin: false,
                isClient: false,
                isBranchUser: true,
                clientId: clientId.nilIfEmpty,
                branchId: branchId.nilIfEmpty
            )
            SessionStore.shared.save(user)
            QuickProfileStore.remember(user)
            return user
        }

        throw ApiError.http(401, "Credenciales inválidas")
    }

    /// companyId + navegación RBAC desde API (best-effort). Paridad Android `enrichSession`.
    func enrichSession(_ user: SessionUser) async -> SessionUser {
        if user.isClient || user.isBranchUser { return user }
        var next = user

        if let data = try? await ApiClient.shared.get("company/mine") {
            let list = ApiClient.decodeMapList(data)
            let primary = list.first { ($0["isPrimary"] as? Bool) == true } ?? list.first
            if let id = primary.flatMap({ ConsoleHelpers.mapInt64($0, "id") }), id > 0 {
                next.companyId = id
            }
        }

        if let data = try? await ApiClient.shared.get("me/navigation") {
            let map = ConsoleHelpers.decodeMap(data)
            if let rk = ConsoleHelpers.mapStr(map, "roleKey").nilIfEmpty { next.roleKey = rk }
            if let ok = ConsoleHelpers.mapStr(map, "orgRoleKey").nilIfEmpty { next.orgRoleKey = ok }
            if let panels = map["panels"] as? [String], !panels.isEmpty { next.navPanels = panels }
            let moduleKeys = (map["moduleKeys"] as? [String] ?? []) + (map["webModuleIds"] as? [String] ?? [])
            if !moduleKeys.isEmpty { next.navModules = Array(Set(moduleKeys)).sorted() }
        }

        return next
    }

    /// `GET auth/profile` — quién soy según el token, no según lo que se
    /// guardó al iniciar sesión.
    ///
    /// Android lo tiene desde siempre (`AuthApi.profile`) y iOS no lo llamaba
    /// nunca: los permisos de la sesión eran los del momento del login y no se
    /// refrescaban jamás. Si a alguien le daban o le quitaban un permiso, en el
    /// teléfono seguía viendo (o sin ver) módulos hasta el siguiente login.
    ///
    /// Devuelve el usuario ya guardado en la sesión. Best-effort: si el API
    /// falla, se conserva lo que había y no se tumba la sesión.
    @discardableResult
    func refreshProfile() async -> SessionUser? {
        guard var current = SessionStore.shared.currentUser else { return nil }
        guard !current.isClient, !current.isBranchUser else { return current }
        guard let data = try? await ApiClient.shared.get("auth/profile") else { return current }
        let map = ConsoleHelpers.decodeMap(data)
        guard !map.isEmpty else { return current }

        if let nombre = ConsoleHelpers.mapStr(map, "nombre", "name").nilIfEmpty { current.nombre = nombre }
        if let email = ConsoleHelpers.mapStr(map, "email").nilIfEmpty { current.email = email }
        if let role = ConsoleHelpers.mapStr(map, "role", "rol").nilIfEmpty { current.role = role }
        if let roleKey = ConsoleHelpers.mapStr(map, "roleKey").nilIfEmpty { current.roleKey = roleKey }
        if let orgRoleKey = ConsoleHelpers.mapStr(map, "orgRoleKey").nilIfEmpty { current.orgRoleKey = orgRoleKey }
        if let dept = ConsoleHelpers.mapStr(map, "department", "departamento").nilIfEmpty {
            current.department = dept
        }
        // La lista de permisos se sustituye entera, nunca se fusiona: fusionar
        // dejaría vivo un permiso que el servidor acaba de retirar.
        if let permissions = map["permissions"] as? [String] {
            current.permissions = permissions
        }
        if let superAdmin = map["isSuperAdmin"] as? Bool { current.isSuperAdmin = superAdmin }

        // Mientras viajaba la petición la sesión pudo renovarse (token nuevo) o
        // cerrarse: se conserva el token vigente y nunca se resucita una sesión cerrada.
        guard let now = SessionStore.shared.currentUser, now.id == current.id else {
            return SessionStore.shared.currentUser
        }
        current.token = now.token
        current.expiresAt = now.expiresAt
        SessionStore.shared.save(current)
        return current
    }

    /// Renovación de la sesión al volver a primer plano: si el token vence en
    /// menos de 60 min (o no se sabe cuándo vence, o ya venció) se pide uno nuevo
    /// con `POST auth/session/refresh`. Después se refrescan permisos y navegación.
    /// La sesión solo se cierra si el servidor responde 401 a la renovación.
    func maybeExtendSession() async {
        guard let current = SessionStore.shared.currentUser else { return }
        if current.isClient || current.isBranchUser { return }

        if Self.needsRefresh(expiresAt: current.expiresAt) {
            // Revocada: `SessionRefresher` ya cerró sesión y ya avisó. Seguir
            // pidiendo permisos y navegación con un token muerto solo suma 401 a la
            // bitácora (Android corta igual en `refreshSessionIfNeeded`).
            if case .revoked = await refreshSession() { return }
        }

        // Los permisos se refrescan aquí y no sólo al iniciar sesión: es el
        // único punto que la app vuelve a pisar de forma periódica
        // (`NexaraApp.swift` lo llama al volver a primer plano).
        guard let latest = SessionStore.shared.currentUser, latest.id == current.id else { return }
        var enriched = await enrichSession(latest)
        if let now = SessionStore.shared.currentUser, now.id == enriched.id {
            enriched.token = now.token
            enriched.expiresAt = now.expiresAt
            SessionStore.shared.save(enriched)
        }
        _ = await refreshProfile()
    }

    /// `POST auth/session/refresh`. Una sola renovación a la vez para toda la app.
    @discardableResult
    func refreshSession() async -> SessionRefreshOutcome {
        await SessionRefresher.shared.refresh()
    }

    /// `true` si `expiresAt` no se conoce, no se entiende, ya pasó o faltan < 60 min.
    static func needsRefresh(expiresAt raw: String?) -> Bool {
        guard let raw, !raw.isEmpty,
              let expires = ISO8601DateFormatter().date(from: raw)
                ?? ISO8601DateFormatter.withFractional.date(from: raw)
        else { return true }
        return expires.timeIntervalSinceNow < 60 * 60
    }

    func logout() {
        SessionStore.shared.clear()
    }
}

/// Resultado de `POST auth/session/refresh`.
enum SessionRefreshOutcome: Sendable {
    /// 200: token nuevo ya guardado en `SessionStore`.
    case refreshed(String)
    /// 401: sesión revocada, usuario inactivo o sin uso > 30 días. Ya se cerró sesión.
    case revoked
    /// Red, 5xx, respuesta rara o sesión que no aplica: la sesión se conserva.
    case failed
}

/// Single-flight de la renovación: si varias peticiones reciben 401 a la vez,
/// todas esperan la MISMA llamada a `auth/session/refresh`.
actor SessionRefresher {
    static let shared = SessionRefresher()

    private var inFlight: Task<SessionRefreshOutcome, Never>?

    private init() {}

    func refresh() async -> SessionRefreshOutcome {
        if let inFlight {
            return await inFlight.value
        }
        let task = Task<SessionRefreshOutcome, Never> {
            await SessionRefresher.performRefresh()
        }
        inFlight = task
        let outcome = await task.value
        inFlight = nil
        return outcome
    }

    private static func performRefresh() async -> SessionRefreshOutcome {
        guard let user = SessionStore.shared.currentUser, !user.token.isEmpty else {
            return .failed
        }
        // El API rechaza los tokens de portal (cliente/sucursal) con 401: pedirle
        // la renovación cerraría una sesión que nadie revocó.
        guard !user.isClient, !user.isBranchUser else {
            return .failed
        }
        let userId = user.id
        let usedToken = user.token

        let data: Data
        do {
            data = try await ApiClient.shared.refreshSessionToken(usedToken)
        } catch let error as ApiError {
            if case .http(let code, _) = error, code == 401 {
                // Revocación confirmada por el servidor: único cierre automático.
                // Solo si la sesión sigue siendo la que se intentó renovar.
                await MainActor.run {
                    if let now = SessionStore.shared.currentUser, now.id == userId, now.token == usedToken {
                        AuthRepository.shared.logout()
                        // Y se dice por qué. Sin esto, quien está en campo aparece
                        // de golpe en el login sin saber si fue la red o un error
                        // suyo (paridad con `SessionEvents` de Android).
                        SessionExpiredNotice.shared.notify()
                    }
                }
                return .revoked
            }
            return .failed
        } catch {
            return .failed
        }

        guard let resp = try? JSONDecoder().decode(AuthRepository.SessionExtendResponse.self, from: data),
              !resp.access_token.isEmpty else {
            return .failed
        }
        let newToken = resp.access_token
        let newExpiresAt = resp.expiresAt
        let applied = await MainActor.run { () -> Bool in
            // Si mientras tanto se cerró sesión o entró otra cuenta, no se toca nada.
            guard var latest = SessionStore.shared.currentUser,
                  latest.id == userId, latest.token == usedToken else {
                return false
            }
            latest.token = newToken
            if let newExpiresAt { latest.expiresAt = newExpiresAt }
            // `save` también reconecta el socket con el token nuevo.
            SessionStore.shared.save(latest)
            return true
        }
        return applied ? .refreshed(newToken) : .failed
    }
}

// String.nilIfEmpty is provided globally in Support/String+NilIfEmpty.swift

private extension ISO8601DateFormatter {
    static let withFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
