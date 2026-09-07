import Foundation

/// Contrato de cableado de HORARIOS y ESPACIOS.
enum SchedulesRoutes {
    static let schedules = "integra/schedules"
    static let espacios = "integra/espacios"
    static let argDoorId = "doorId"
    static let schedulesForDoorPattern = "integra/schedules/door/\(argDoorId)"

    static let titleSchedules = "Horarios de acceso"
    static let titleEspacios = "Espacios y puertas"

    static func schedulesForDoor(_ doorId: String) -> String {
        let encoded = doorId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? doorId
        return "integra/schedules/door/\(encoded)"
    }

    static func decodeDoorId(_ raw: String?) -> String? {
        guard let raw, !raw.isEmpty else { return nil }
        return raw.removingPercentEncoding ?? raw
    }

    static func title(for route: String?) -> String? {
        guard let route else { return nil }
        if route == schedules { return titleSchedules }
        if route == espacios { return titleEspacios }
        if route.hasPrefix("integra/schedules/door/") { return titleSchedules }
        return nil
    }

    static func route(forModuleKey key: String) -> String? {
        switch key.lowercased() {
        case "integra-schedules", "schedules", "horarios":
            return schedules
        case "integra-espacios", "espacios", "spaces":
            return espacios
        default:
            return nil
        }
    }
}
