import Foundation

/// Identidad y acceso — consulta de usuarios, sesiones, actividad y catálogo de
/// roles. Es el equivalente móvil de `/erp/users` de la web.
///
/// **Alcance deliberadamente de solo lectura.** Las escrituras de esa pantalla
/// —alta de usuario, cambio de rol, alta de rol, activación masiva, revocar la
/// sesión de otro, desbloquear una cuenta, borrar datos personales— están
/// pendientes de autorización del dueño y NO se implementan aquí. Lo único que
/// escribe este repositorio es el segundo factor de la **propia** cuenta, que
/// es autoservicio y no toca la cuenta de nadie más.
final class UsersAdminRepository {
    static let shared = UsersAdminRepository()
    private let api = ApiClient.shared
    private init() {}

    // MARK: Directorio

    /// `GET users/:id` — ficha completa. Exige `users.manage`.
    func user(id: Int64) async throws -> UserAdminDetail {
        let data = try await api.get("users/\(id)")
        return UserAdminDetail(raw: ConsoleHelpers.decodeMap(data))
    }

    /// `GET users/roles` — catálogo para el desplegable de filtro.
    func rolePicker() async throws -> [UserPickerOption] {
        let data = try await api.get("users/roles")
        return ApiClient.decodeMapList(data).map { UserPickerOption(raw: $0) }
    }

    /// `GET users/departments` — catálogo para el desplegable de filtro.
    func departmentPicker() async throws -> [UserPickerOption] {
        let data = try await api.get("users/departments")
        return ApiClient.decodeMapList(data).map { UserPickerOption(raw: $0) }
    }

    // MARK: Roles (consulta)

    /// `GET roles` — el catálogo completo con sus banderas de acceso.
    ///
    /// La web no usa este GET (allí el desplegable sale de `users/roles` y la
    /// matriz de `roles/access-matrix`), pero es la lectura que hace falta en el
    /// teléfono para responder «¿qué alcanza este rol?» sin poder cambiarlo.
    func roleCatalog() async throws -> [RoleSummary] {
        let data = try await api.get("roles")
        return ApiClient.decodeMapList(data).map { RoleSummary(raw: $0) }
    }

    /// `GET roles/org-templates` — plantillas organizativas, solo lectura.
    func orgRoleTemplates() async throws -> [OrgRoleTemplate] {
        let data = try await api.get("roles/org-templates")
        return ApiClient.decodeMapList(data).map { OrgRoleTemplate(raw: $0) }
    }

    // MARK: Seguridad de la cuenta ajena (consulta)

    /// `GET users/iam/insights` — cifras, tendencias y riesgo del padrón.
    func iamInsights() async throws -> IamInsights {
        let data = try await api.get("users/iam/insights")
        return IamInsights(raw: ConsoleHelpers.decodeMap(data))
    }

    /// `GET users/:id/sessions` — sesiones del usuario. Solo mirar: revocar la
    /// sesión de otro requiere autorización del dueño y no está implementado.
    func sessions(userId: Int64) async throws -> [UserSessionInfo] {
        let data = try await api.get("users/\(userId)/sessions")
        return ApiClient.decodeMapList(data).map { UserSessionInfo(raw: $0) }
    }

    /// `GET users/:id/auth-activity` — entradas, fallos y bloqueos recientes.
    func authActivity(userId: Int64, limit: Int = 40) async throws -> [UserAuthActivity] {
        let data = try await api.get("users/\(userId)/auth-activity", query: ["limit": String(limit)])
        return ApiClient.decodeMapList(data).map { UserAuthActivity(raw: $0) }
    }

    /// `GET users/:id/integra-access-schedule` — vista previa del horario ACS
    /// que el rol le concede. El API lo calcula; aquí no se edita.
    func integraAccessSchedule(userId: Int64) async throws -> UserAccessSchedule {
        let data = try await api.get("users/\(userId)/integra-access-schedule")
        return UserAccessSchedule(raw: ConsoleHelpers.decodeMap(data))
    }

    /// `GET audit` filtrado por usuario — qué ha tocado esta persona.
    ///
    /// La bitácora ya se leía en la app, pero sin filtro: para saber qué hizo
    /// alguien había que buscar su nombre a ojo en la lista global.
    func auditTrail(userId: Int64, limit: Int = 40) async throws -> [AuditEntry] {
        let data = try await api.get("audit", query: [
            "userId": String(userId),
            "limit": String(limit),
        ])
        return ApiClient.decodeMapList(data).map { AuditEntry(raw: $0) }
    }

    // MARK: Segundo factor de la propia cuenta

    /// `GET users/mfa/status`. Siempre habla de quien tiene la sesión abierta:
    /// el API resuelve el usuario desde el token, no acepta un id.
    func myMfaStatus() async throws -> UserMfaStatus {
        let data = try await api.get("users/mfa/status")
        return UserMfaStatus(raw: ConsoleHelpers.decodeMap(data))
    }

    /// `POST users/mfa/setup` — genera el secreto TOTP. Se enseña una sola vez.
    func beginMyMfaSetup() async throws -> UserMfaSetup {
        let data = try await api.postJSON("users/mfa/setup", body: EmptyBody())
        return UserMfaSetup(raw: ConsoleHelpers.decodeMap(data))
    }

    /// `POST users/mfa/confirm` — cierra el alta con el código de 6 dígitos.
    func confirmMyMfa(token: String) async throws {
        struct Body: Encodable { let token: String }
        _ = try await api.postJSON("users/mfa/confirm", body: Body(token: token))
    }

    /// `POST users/mfa/disable` — baja del segundo factor de la propia cuenta.
    func disableMyMfa(token: String?) async throws {
        struct Body: Encodable { let token: String? }
        _ = try await api.postJSON("users/mfa/disable", body: Body(token: token?.nilIfEmpty))
    }
}

/// Cuerpo vacío para los POST sin datos. Privado: cada repositorio tiene el suyo.
private struct EmptyBody: Encodable {}
