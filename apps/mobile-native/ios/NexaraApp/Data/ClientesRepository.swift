import Foundation

/// Cliente del padrón Core (`GET ventas/clientes`) — espejo de `SalesClient`
/// en `apps/web/lib/sales-api.ts`.
struct CoreSalesClient: Decodable, Identifiable, Hashable {
    struct Owner: Decodable, Hashable {
        let id: Int?
        let nombre: String?
        let email: String?
    }

    struct SectorRow: Decodable, Hashable {
        let id: Int?
        let sector: String
    }

    let id: Int
    let name: String
    let legalName: String?
    let taxId: String?
    let fiscalAddress: String?
    let fiscalZipCode: String?
    let fiscalRegime: String?
    let billingEmail: String?
    let billingPhone: String?
    let status: String?
    let notes: String?
    let owner: Owner?
    let sectors: [SectorRow]?
    let serviceClientId: Int?

    /// Sectores Core del cliente, en el orden de `ALL_CLIENT_SECTORS`.
    var clientSectors: [ClientSector] {
        let raw = Set((sectors ?? []).map { $0.sector.uppercased() })
        return ClientSector.allCases.filter { raw.contains($0.rawValue) }
    }
}

/// `GET ventas/clientes/fiscal-lookup?rfc=` — `FiscalLookupResult` de la web.
struct CoreFiscalLookup: Decodable {
    struct Validation: Decodable {
        let rfc: String?
        let valid: Bool?
        let type: String?
        let errors: [String]?
    }

    struct Regime: Decodable, Hashable {
        let code: String
        let name: String
    }

    let validation: Validation?
    let regimes: [Regime]?
    let suggestedRegime: String?
    let legalName: String?
    let fiscalZipCode: String?
    let source: String?
    let message: String?
}

/// Proyecto operativo (`GET operational-projects`) — `OperationalProject` de la web.
struct CoreOperationalProject: Decodable, Identifiable {
    struct ClientRef: Decodable {
        let id: Int?
        let name: String?
    }

    let id: Int
    let title: String
    let status: String?
    let startDate: String?
    let client: ClientRef?

    /// `formatOperationalProjectStatus`.
    var statusLabel: String {
        switch (status ?? "").uppercased() {
        case "": return "—"
        case "ACTIVE": return "Activo"
        case "ON_HOLD": return "En pausa"
        case "COMPLETED": return "Completado"
        default: return (status ?? "").replacingOccurrences(of: "_", with: " ")
        }
    }
}

/// Cuerpo de `POST ventas/clientes` como lo arma `/erp/clientes/nuevo`.
struct CoreSalesClientCreateBody: Encodable {
    var name: String
    var legalName: String
    var taxId: String
    var fiscalAddress: String
    var fiscalZipCode: String
    var fiscalRegime: String
    var billingEmail: String
    var billingPhone: String
    var notes: String
    var sectors: [String]
    var status: String = "Activo"
}

/// Clientes de Core — mismas rutas que `apps/web/app/(panels)/erp/clientes`
/// (`ventas-clientes.controller.ts` y `operational-projects`).
final class ClientesRepository {
    static let shared = ClientesRepository()
    private let api = ApiClient.shared
    private init() {}

    /// Decodifica fila por fila: un registro raro no vacía la lista entera.
    private func decodeEach<T: Decodable>(_ data: Data) -> [T] {
        ApiClient.decodeMapList(data).compactMap { row in
            guard let rowData = try? JSONSerialization.data(withJSONObject: row) else { return nil }
            return try? JSONDecoder().decode(T.self, from: rowData)
        }
    }

    /// `GET ventas/clientes?sector=PROYECTO|CORPORATIVO|COMERCIAL`.
    func list(sector: ClientSector) async throws -> [CoreSalesClient] {
        let data = try await api.get("ventas/clientes", query: ["sector": sector.rawValue])
        return decodeEach(data)
    }

    /// `GET ventas/clientes/:id`.
    func detail(id: Int) async throws -> CoreSalesClient {
        let data = try await api.get("ventas/clientes/\(id)")
        return try JSONDecoder().decode(CoreSalesClient.self, from: data)
    }

    /// `POST ventas/clientes`. `nil` = sin red: quedó en la cola offline.
    func create(_ body: CoreSalesClientCreateBody) async throws -> CoreSalesClient? {
        let data = try await api.postJSON("ventas/clientes", body: body)
        if CoreRepository.isQueuedOffline(data) { return nil }
        return try JSONDecoder().decode(CoreSalesClient.self, from: data)
    }

    /// `POST ventas/clientes/:id/sectors` `{ sector }`. `nil` = en cola offline.
    func addSector(clientId: Int, sector: ClientSector) async throws -> CoreSalesClient? {
        struct Body: Encodable { let sector: String }
        let data = try await api.postJSON("ventas/clientes/\(clientId)/sectors", body: Body(sector: sector.rawValue))
        if CoreRepository.isQueuedOffline(data) { return nil }
        return try JSONDecoder().decode(CoreSalesClient.self, from: data)
    }

    /// `GET ventas/clientes/fiscal-lookup?rfc=`.
    func fiscalLookup(rfc: String) async throws -> CoreFiscalLookup {
        let clean = rfc.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let data = try await api.get("ventas/clientes/fiscal-lookup", query: ["rfc": clean])
        return try JSONDecoder().decode(CoreFiscalLookup.self, from: data)
    }

    /// Proyectos del cliente de servicio: la web pide todos y filtra por `client.id`.
    func projects(serviceClientId: Int) async throws -> [CoreOperationalProject] {
        let data = try await api.get("operational-projects")
        let all: [CoreOperationalProject] = decodeEach(data)
        return all.filter { $0.client?.id == serviceClientId }
    }

    /// `POST operational-projects` con `projectType: "OTRO"`, como el detalle web.
    func createProject(title: String, serviceClientId: Int, vendorId: Int, startDate: String) async throws {
        struct Body: Encodable {
            let title: String
            let clientId: Int
            let vendorId: Int
            let startDate: String
            let projectType: String
        }
        _ = try await api.postJSON("operational-projects", body: Body(
            title: title,
            clientId: serviceClientId,
            vendorId: vendorId,
            startDate: startDate,
            projectType: "OTRO"
        ))
    }
}
