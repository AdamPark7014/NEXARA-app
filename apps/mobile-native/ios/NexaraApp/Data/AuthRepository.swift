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
        let path: String
        switch kind {
        case .user:   path = "auth/login"
        case .client: path = "auth/login-client"
        case .branch: path = "auth/login-branch"
        }
        let data = try await ApiClient.shared.postJSON(path, body: LoginBody(email: email, password: password))
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
            isClient: (u?.isClient ?? (kind == .client)),
            isBranchUser: (u?.isBranchUser ?? (kind == .branch)),
            clientId: u?.clientId,
            branchId: u?.branchId
        )
        SessionStore.shared.save(user)
        return user
    }

    func logout() {
        SessionStore.shared.clear()
    }
}
