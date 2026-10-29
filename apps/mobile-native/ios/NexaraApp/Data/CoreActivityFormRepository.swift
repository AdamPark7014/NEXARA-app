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
    /// Día + «Entregar a más tardar» si es válida; si no, día + hora de inicio (fin del día).
    let fechaEntregaEsperada: String?
    let fechaMaxima: String?
    let evidencePhotoRequired: Int
    let coreKind: String
    let assignmentCharge: String?
    /// `BASICA`…`CRITICA`. Al crear solo viajan si hay valor (los nil no se codifican).
    let complejidad: String?
    let complejidadSugerida: String?
    let estatus: String
    let creadoPorId: Int
}

extension CoreTiemposTipicos {
    /// Respuesta de `GET ai/complejidad/tiempos`; lo que falte cuenta como «sin anteriores».
    init(map: [String: Any]) {
        func tipico(_ value: Any?) -> CoreTipico {
            let row = value as? [String: Any] ?? [:]
            let mediana: Int? = ActivityParse.double(row["medianaMin"]).flatMap { $0.isFinite && $0 >= 0 ? Int($0.rounded()) : nil }
            return CoreTipico(muestras: ActivityParse.int(row["muestras"]) ?? 0, medianaMin: mediana)
        }
        let niveles = map["porComplejidad"] as? [String: Any] ?? [:]
        var porComplejidad: [CoreComplejidad: CoreTipico] = [:]
        for nivel in CoreComplejidad.allCases {
            porComplejidad[nivel] = tipico(niveles[nivel.rawValue])
        }
        let clave = ActivityParse.str(map["clave"])
        self.init(clave: clave.isEmpty ? nil : clave, total: tipico(map["total"]), porComplejidad: porComplejidad)
    }
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

    /// `GET ai/complejidad/tiempos?coreKind=&tipo=`: lo típico de ese tipo de trabajo.
    func tiemposTipicos(coreKind: String, tipo: String?) async throws -> CoreTiemposTipicos {
        var query = ["coreKind": coreKind]
        if let tipo, !tipo.isEmpty { query["tipo"] = tipo }
        let data = try await ApiClient.shared.get("ai/complejidad/tiempos", query: query)
        return CoreTiemposTipicos(map: ConsoleHelpers.decodeMap(data))
    }

    /// `POST ai/complejidad/sugerir`: la complejidad que sugiere la IA, o nil si no hay
    /// sugerencia (sin IA, título corto o sin conexión: elegir nunca depende de que responda).
    func sugerirComplejidad(
        coreKind: String,
        tipo: String?,
        titulo: String,
        indicaciones: String?
    ) async throws -> CoreSugerenciaComplejidad? {
        struct Body: Encodable {
            let coreKind: String
            let tipo: String?
            let titulo: String
            let indicaciones: String?
        }
        let notas = (indicaciones ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let data = try await ApiClient.shared.postJSON(
            "ai/complejidad/sugerir",
            body: Body(
                coreKind: coreKind,
                tipo: (tipo ?? "").isEmpty ? nil : tipo,
                titulo: titulo,
                indicaciones: notas.isEmpty ? nil : notas
            )
        )
        if CoreRepository.isQueuedOffline(data) { return nil }
        guard let row = ConsoleHelpers.decodeMap(data)["sugerencia"] as? [String: Any],
              let nivel = CoreComplejidad.de(ActivityParse.str(row["complejidad"])) else { return nil }
        return CoreSugerenciaComplejidad(complejidad: nivel, motivo: ActivityParse.str(row["motivo"]))
    }

    /// `POST activities/:id/team` — suma a alguien al equipo con su rol e indicaciones.
    /// `horasPlan` (contrato B): el «tiempo estimado» del alta, en horas; sin valor no se manda.
    func addTeamMember(
        activityId: Int,
        userId: Int,
        rol: String,
        indicaciones: String?,
        horasPlan: Double? = nil
    ) async throws {
        struct Body: Encodable {
            let userId: Int
            let rol: String
            let indicaciones: String?
            let horasPlan: Double?
        }
        let notes = (indicaciones ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let data = try await ApiClient.shared.postJSON(
            "activities/\(activityId)/team",
            body: Body(userId: userId, rol: rol, indicaciones: notes.isEmpty ? nil : notes, horasPlan: horasPlan)
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }
}
