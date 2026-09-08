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
            let list: [[String: Any]]
            if let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                list = arr
            } else {
                list = IntegraJSON.decodeList(data)
            }
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
        }

        return next
    }

    /// Sliding session: si faltan < 20 min, pide token nuevo. Paridad Android `maybeExtendSession`.
    func maybeExtendSession() async {
        guard var current = SessionStore.shared.currentUser else { return }
        if current.isClient || current.isBranchUser { return }

        current = await enrichSession(current)
        SessionStore.shared.save(current)

        guard let expiresRaw = current.expiresAt,
              let expires = ISO8601DateFormatter().date(from: expiresRaw)
                ?? ISO8601DateFormatter.withFractional.date(from: expiresRaw)
        else { return }

        let remaining = expires.timeIntervalSinceNow
        guard remaining <= 20 * 60 else { return }

        do {
            let data = try await ApiClient.shared.postJSON("auth/session/extend", body: EmptyBody())
            let resp = try JSONDecoder().decode(SessionExtendResponse.self, from: data)
            var latest = SessionStore.shared.currentUser ?? current
            latest.token = resp.access_token
            if let exp = resp.expiresAt { latest.expiresAt = exp }
            SessionStore.shared.save(latest)
        } catch {
            // Best-effort: no tumbar la sesión si el extend falla.
        }
    }

    func logout() {
        SessionStore.shared.clear()
    }
}

private struct EmptyBody: Encodable {}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

private extension ISO8601DateFormatter {
    static let withFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
