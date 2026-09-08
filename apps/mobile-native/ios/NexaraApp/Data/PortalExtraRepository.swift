import Foundation

/// Endpoints del portal de cliente/sucursales y de su alrededor de consola que
/// Android ya consumía y iOS no, más un puñado que sólo tenía la web.
///
/// Vive aparte de `TicketsRepository` y de `ExtraRepository` a propósito: esos
/// dos ficheros los tocan otros agentes en la misma rama, y meter aquí lo nuevo
/// evita que dos turnos se pisen el mismo bloque.
///
/// Convención de errores, igual que en el resto del árbol: los `GET` de listado
/// devuelven vacío ante fallo (la pantalla ya muestra "sin datos"), y las
/// mutaciones propagan el error para que la vista lo enseñe en rojo.
final class PortalExtraRepository {
    static let shared = PortalExtraRepository()
    private let api = ApiClient.shared
    private init() {}

    // MARK: - Proyectos del portal cliente

    /// GET `client-portal/projects`.
    func clientProjects() async -> [PortalClientProject] {
        guard let data = try? await api.get("client-portal/projects") else { return [] }
        return ApiClient.decodeMapList(data).map { PortalClientProject(raw: $0) }
    }

    // MARK: - Inventarios de consola

    /// GET `inventories` — con los mismos filtros que expone el controlador.
    func consoleInventories(
        clientId: Int64? = nil,
        branchId: Int64? = nil,
        status: String? = nil,
        createdByType: String? = nil
    ) async -> [PortalConsoleInventory] {
        var query: [String: String] = [:]
        if let clientId { query["clientId"] = String(clientId) }
        if let branchId { query["branchId"] = String(branchId) }
        if let status, !status.isEmpty { query["status"] = status }
        if let createdByType, !createdByType.isEmpty { query["createdByType"] = createdByType }
        guard let data = try? await api.get("inventories", query: query) else { return [] }
        return ApiClient.decodeMapList(data).map { PortalConsoleInventory(raw: $0) }
    }

    /// PATCH `inventories/{id}/status` — PENDING | COMPLETED | APPROVED | REJECTED.
    /// Son los cuatro botones que Android pinta en `ConsoleClientsScreen`.
    @discardableResult
    func updateInventoryStatus(id: Int64, status: String) async throws -> PortalConsoleInventory {
        struct Body: Encodable { let status: String }
        let data = try await api.patchJSON("inventories/\(id)/status", body: Body(status: status))
        return PortalConsoleInventory(raw: ConsoleHelpers.decodeMap(data))
    }

    /// GET `inventories/{id}/report` — PDF.
    func consoleInventoryReportPdf(id: Int64) async throws -> Data {
        try await api.getBinary("inventories/\(id)/report")
    }

    /// POST `inventories/sync` — levantar/actualizar un inventario desde consola.
    /// Sólo lo tenía la web; el técnico que está en la sucursal lleva el móvil.
    @discardableResult
    func syncConsoleInventory(
        clientId: Int64,
        branchId: Int64,
        title: String?,
        notes: String?,
        completed: Bool
    ) async throws -> PortalConsoleInventory {
        struct Body: Encodable {
            let clientId: Int64
            let branchId: Int64
            let title: String?
            let notes: String?
            let completed: Bool
        }
        let data = try await api.postJSON("inventories/sync", body: Body(
            clientId: clientId, branchId: branchId,
            title: title, notes: notes, completed: completed
        ))
        return PortalConsoleInventory(raw: ConsoleHelpers.decodeMap(data))
    }

    // MARK: - Solicitudes de ticket (lado consola)

    /// PATCH `client-ticket-requests/{id}` con `{ notes }` — la nota interna que
    /// el operador deja sobre la solicitud del cliente. Android lo tiene en
    /// `OpsRepository.patchClientTicketNotes`; iOS sólo tenía status y assign.
    func updateClientTicketNotes(id: Int64, notes: String) async throws {
        struct Body: Encodable { let notes: String }
        _ = try await api.patchJSON(
            "client-ticket-requests/\(id)",
            body: Body(notes: notes.trimmingCharacters(in: .whitespacesAndNewlines))
        )
    }

    // MARK: - Inventario de herramienta

    /// GET `tool-requests/inventory/search?q=` — autocompletado por nombre,
    /// modelo o número de serie.
    func searchToolInventory(q: String) async -> [PortalToolInventoryOption] {
        let term = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else { return [] }
        guard let data = try? await api.get("tool-requests/inventory/search", query: ["q": term]) else { return [] }
        return ApiClient.decodeMapList(data).map { PortalToolInventoryOption(raw: $0) }
    }

    // MARK: - Ficha 360 del cliente de servicio

    /// GET `service-clients/{id}/snapshot`.
    func serviceClientSnapshot(id: Int64) async -> PortalServiceClientSnapshot? {
        guard let data = try? await api.get("service-clients/\(id)/snapshot") else { return nil }
        let map = ConsoleHelpers.decodeMap(data)
        return map.isEmpty ? nil : PortalServiceClientSnapshot(raw: map)
    }

    /// POST `service-clients/{id}/ticket-requests` — levantar una solicitud en
    /// nombre del cliente, que es lo que hace soporte cuando el cliente llama
    /// por teléfono en vez de entrar al portal.
    func createServiceClientTicketRequest(
        serviceClientId: Int64,
        description: String,
        branchId: Int64?,
        urgency: String,
        requestType: String
    ) async throws {
        struct Body: Encodable {
            let description: String
            let branchId: Int64?
            let urgency: String
            let requestType: String
        }
        _ = try await api.postJSON("service-clients/\(serviceClientId)/ticket-requests", body: Body(
            description: description.trimmingCharacters(in: .whitespacesAndNewlines),
            branchId: branchId,
            urgency: urgency,
            requestType: requestType
        ))
    }

    // MARK: - Base de conocimiento

    /// GET `kb/categories` — sólo lo tenía la web.
    func kbCategories(visibility: String? = nil) async -> [PortalKbCategory] {
        var query: [String: String] = [:]
        if let visibility, !visibility.isEmpty { query["visibility"] = visibility }
        guard let data = try? await api.get("kb/categories", query: query) else { return [] }
        return ApiClient.decodeMapList(data).map { PortalKbCategory(raw: $0) }
    }

    /// GET `kb/articles?categoryId=` — el listado ya existía en `ExtraRepository`
    /// pero sin filtro por categoría, que es lo que hace útil el buscador.
    func kbArticlesByCategory(categoryId: Int64?, q: String? = nil) async -> [KbArticle] {
        var query: [String: String] = [:]
        if let categoryId { query["categoryId"] = String(categoryId) }
        if let q, !q.isEmpty { query["q"] = q }
        guard let data = try? await api.get("kb/articles", query: query) else { return [] }
        return ApiClient.decodeMapList(data).map { KbArticle(raw: $0) }
    }

    // MARK: - Cumplimiento de SLA

    /// GET `sla/insights?from=` — `from` en ISO-8601. Por defecto, 30 días,
    /// que es la ventana que usa la web.
    func slaInsights(daysBack: Int = 30) async -> PortalSlaInsights? {
        let from = ISO8601DateFormatter().string(
            from: Date().addingTimeInterval(-Double(daysBack) * 86400)
        )
        guard let data = try? await api.get("sla/insights", query: ["from": from]) else { return nil }
        let map = ConsoleHelpers.decodeMap(data)
        return map.isEmpty ? nil : PortalSlaInsights(raw: map)
    }

    // MARK: - Acceso heredado del portal

    /// POST `client-auth/login`. La ruta unificada es `portal/login`, que
    /// `AuthRepository` ya usa; estos dos son el respaldo que Android intenta
    /// cuando la API desplegada es antigua y aún no expone la unificada.
    ///
    /// Devuelve el `SessionUser` ya guardado en el llavero, igual que hace
    /// `AuthRepository.portalLogin`.
    @discardableResult
    func clientLoginLegacy(email: String, password: String) async throws -> SessionUser {
        struct Body: Encodable { let email: String; let password: String }
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let data = try await api.postJSON("client-auth/login", body: Body(email: trimmed, password: password))
        let raw = ConsoleHelpers.decodeMap(data)
        let token = ConsoleHelpers.mapStr(raw, "access_token", "token")
        guard !token.isEmpty else { throw ApiError.http(401, "Sin token") }
        let client = raw["client"] as? [String: Any] ?? [:]
        let clientId = ConsoleHelpers.mapStr(client, "id")
        let name = ConsoleHelpers.mapStr(client, "name", "nombre")
        let user = SessionUser(
            id: clientId.isEmpty ? trimmed : clientId,
            nombre: name.isEmpty ? trimmed : name,
            email: trimmed,
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
        return user
    }

    /// POST `branch-auth/login` — mismo respaldo, para usuario de sucursal.
    @discardableResult
    func branchLoginLegacy(email: String, password: String) async throws -> SessionUser {
        struct Body: Encodable { let email: String; let password: String }
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let data = try await api.postJSON("branch-auth/login", body: Body(email: trimmed, password: password))
        let raw = ConsoleHelpers.decodeMap(data)
        let token = ConsoleHelpers.mapStr(raw, "access_token", "token")
        guard !token.isEmpty else { throw ApiError.http(401, "Sin token") }
        let branch = raw["branch"] as? [String: Any] ?? [:]
        let branchId = ConsoleHelpers.mapStr(branch, "id")
        let clientId = ConsoleHelpers.mapStr(branch, "clientId")
        let name = ConsoleHelpers.mapStr(branch, "name", "nombre")
        let user = SessionUser(
            id: branchId.isEmpty ? trimmed : branchId,
            nombre: name.isEmpty ? trimmed : name,
            email: trimmed,
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
        return user
    }

    /// Cadena de respaldo tal cual la hace Android: cliente y, si falla, sucursal.
    /// Pensada para que `AuthRepository.portalLogin` la llame en su `catch`.
    @discardableResult
    func portalLoginLegacyFallback(email: String, password: String) async throws -> SessionUser {
        do {
            return try await clientLoginLegacy(email: email, password: password)
        } catch {
            return try await branchLoginLegacy(email: email, password: password)
        }
    }
}
