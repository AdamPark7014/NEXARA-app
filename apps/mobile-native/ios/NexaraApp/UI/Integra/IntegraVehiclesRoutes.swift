import Foundation

/// Contrato de cableado de VEHÍCULOS y ANPR.
enum IntegraVehiclesRoutes {
    static let vehicles = "integra/vehicles"
    static let anpr = "integra/anpr"

    static let keyVehicles = "integra-vehicles"
    static let keyAnpr = "integra-anpr"

    static let titleVehicles = "Vehículos y placas"
    static let titleAnpr = "ANPR / lectura de placas"

    static func title(for route: String?) -> String? {
        switch route {
        case vehicles: return titleVehicles
        case anpr: return titleAnpr
        default: return nil
        }
    }

    static func route(forModuleKey key: String) -> String? {
        switch key.lowercased() {
        case keyVehicles, "vehicles", "vehiculos", "vehículos", "placas":
            return vehicles
        case keyAnpr, "anpr", "lpr", "cross-records":
            return anpr
        default:
            return nil
        }
    }
}
