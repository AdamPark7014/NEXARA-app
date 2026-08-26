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
        let user: UserPayload?
    }

    struct UserPayload: Decodable {
        let id: String?
        let nombre: String?
        let name: String?
        let email: String?
        let role: String?
        let rol: String?
        let department: String?
        let departamento: String?
        let permissions: [String]?
        let isSuperAdmin: Bool?
        let isClient: Bool?
        let isBranchUser: Bool?
        let clientId: String?
        let branchId: String?
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
        let user = SessionUser(
            id: u?.id ?? "",
            nombre: u?.nombre ?? u?.name ?? email,
            email: u?.email ?? email,
            role: u?.role ?? u?.rol,
            department: u?.department ?? u?.departamento,
            token: token,
            permissions: u?.permissions ?? [],
            isSuperAdmin: u?.isSuperAdmin ?? false,
            isClient: u?.isClient ?? false,
            isBranchUser: u?.isBranchUser ?? false,
            clientId: u?.clientId,
            branchId: u?.branchId
        )
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

    func logout() {
        SessionStore.shared.clear()
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
