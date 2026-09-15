import Foundation

/// Proyecto operativo para el selector del formulario (`GET operational-projects`).
struct CoreProjectOption: Identifiable, Hashable {
    let id: Int
    let title: String
    let status: String
    let clientId: Int?
    let clientName: String
}

/// Cliente del padrón por sector (`GET ventas/clientes?sector=`). La actividad
/// guarda el cliente de servicio ligado (`serviceClientId`).
struct CoreSectorClientOption: Identifiable, Hashable {
    let salesClientId: Int
    let serviceClientId: Int
    let name: String

    var id: Int { salesClientId }
}

/// Alta de actividad con los mismos campos que `buildActivityPayload` de la web.
struct CoreActivityCreateBody: Encodable {
    let titulo: String
    let indicaciones: String?
    let prioridad: String
    let activityType: String
    let ticketType: String
    let ticketTypeCustom: String?
    let workType: String
    let projectId: Int?
    let clientId: Int?
    let responsableId: Int
    let tiempoEstimadoMin: Int?
    let tiempoMaximoMin: Int?
    let fechaInicio: String?
    let fechaEntregaEsperada: String?
    let fechaMaxima: String?
    let evidencePhotoRequired: Int
    let coreKind: String
    let assignmentCharge: String?
    let estatus: String
    let creadoPorId: Int
}

extension CoreRepository {
    /// AN sugerido; vacío si no se pudo calcular (el API lo asigna al guardar).
    func nextActivityNumber() async -> String {
        guard let data = try? await ApiClient.shared.get("activities/next-an") else { return "" }
        return ConsoleHelpers.mapStr(ConsoleHelpers.decodeMap(data), "next")
    }

    func operationalProjects() async throws -> [CoreProjectOption] {
        let rows = ApiClient.decodeMapList(try await ApiClient.shared.get("operational-projects"))
        return rows.compactMap { row in
            guard let id = ActivityParse.int(row["id"]) else { return nil }
            let client = row["client"] as? [String: Any] ?? [:]
            return CoreProjectOption(
                id: id,
                title: ActivityParse.str(row["title"]),
                status: ActivityParse.str(row["status"]),
                clientId: ActivityParse.int(client["id"]),
                clientName: ActivityParse.str(client["name"])
            )
        }
    }

    /// Clientes de los sectores dados, sin repetir y solo los que ya tienen cliente de servicio.
    func sectorClients(_ sectors: [ClientSector]) async -> [CoreSectorClientOption] {
        var byId: [Int: CoreSectorClientOption] = [:]
        var order: [Int] = []
        for sector in sectors {
            guard let data = try? await ApiClient.shared.get("ventas/clientes", query: ["sector": sector.rawValue]) else {
                continue
            }
            for row in ApiClient.decodeMapList(data) {
                guard let salesId = ActivityParse.int(row["id"]),
                      let serviceId = ActivityParse.int(row["serviceClientId"]), serviceId > 0 else { continue }
                let legal = ActivityParse.str(row["legalName"])
                let option = CoreSectorClientOption(
                    salesClientId: salesId,
                    serviceClientId: serviceId,
                    name: legal.isEmpty ? ActivityParse.str(row["name"]) : legal
                )
                if byId[salesId] == nil { order.append(salesId) }
                byId[salesId] = option
            }
        }
        return order.compactMap { byId[$0] }
    }

    /// `POST me/activities` (auto-asignación de encargados) o `POST activities`.
    func createCoreActivity(_ body: CoreActivityCreateBody, selfAssign: Bool) async throws -> Int {
        let data: Data
        if selfAssign {
            data = try await ApiClient.shared.postJSON("me/activities", body: body)
        } else {
            data = try await ApiClient.shared.postJSON("activities", body: body)
        }
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
        let id = ConsoleHelpers.mapInt(ConsoleHelpers.decodeMap(data), "id")
        guard id > 0 else { throw CoreError.message("El servidor no devolvió la actividad creada") }
        return id
    }

    /// `POST activities/:id/team` — suma a alguien al equipo con su rol e indicaciones.
    func addTeamMember(activityId: Int, userId: Int, rol: String, indicaciones: String?) async throws {
        struct Body: Encodable {
            let userId: Int
            let rol: String
            let indicaciones: String?
        }
        let notes = (indicaciones ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let data = try await ApiClient.shared.postJSON(
            "activities/\(activityId)/team",
            body: Body(userId: userId, rol: rol, indicaciones: notes.isEmpty ? nil : notes)
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }
}
