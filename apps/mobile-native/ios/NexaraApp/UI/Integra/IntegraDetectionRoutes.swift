import Foundation

/// Contrato de cableado de DETECCIÓN y AJUSTES (sitios).
enum IntegraDetectionRoutes {
    static let argCameraId = "cameraId"
    static let argSiteId = "siteId"

    static let detection = "integra/detection"
    static let camera = "integra/detection/camera/\(argCameraId)"
    static let capabilities = "integra/detection/capabilities"

    static let settings = "integra/settings"
    static let settingsNew = "integra/settings/new"
    static let settingsSite = "integra/settings/site/\(argSiteId)"

    static func cameraRoute(_ cameraId: String) -> String {
        "integra/detection/camera/\(cameraId)"
    }

    static func siteRoute(_ siteId: Int) -> String {
        "integra/settings/site/\(siteId)"
    }

    static let moduleKeys = ["integra-detection", "integra-sites"]

    static let routeByKey: [String: String] = [
        "integra-detection": detection,
        "detection": detection,
        "deteccion": detection,
        "integra-sites": settings,
        "integra-settings": settings,
        "settings": settings,
        "sitios": settings,
        "ajustes": settings,
    ]

    static func title(for route: String?) -> String? {
        guard let route else { return nil }
        switch route {
        case detection: return "Detección"
        case capabilities: return "Capacidades del parque"
        case settings: return "Ajustes INTEGRA"
        case settingsNew: return "Nuevo sitio"
        default:
            if route.hasPrefix("integra/detection/camera/") { return "Sintonizar cámara" }
            if route.hasPrefix("integra/settings/site/") { return "Sitio" }
            return nil
        }
    }

    static func route(forModuleKey key: String) -> String? {
        routeByKey[key.lowercased()]
    }
}
