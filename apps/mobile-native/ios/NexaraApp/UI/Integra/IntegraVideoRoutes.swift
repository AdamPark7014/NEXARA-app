import Foundation

/// Contrato de cableado del bloque de video.
///
/// Este fichero no navega: solo declara. `IntegraRootView` / `ModuleRouter` son
/// propiedad de otro turno. Cableado esperado vía `integraAdvancedDestination`.
enum IntegraVideoRoutes {
    static let argCameraId = "cameraId"

    /// Rejilla de cámaras (fotogramas JPEG, no MSE).
    static let wall = "integra/video"

    /// Detalle de una cámara.
    static let cameraDetail = "integra/video/\(argCameraId)"

    static let moduleKey = "integra-video"
    static let titleWall = "Cámaras"
    static let titleDetail = "Cámara"

    static func cameraDetail(_ cameraId: String) -> String {
        let encoded = cameraId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? cameraId
        return "integra/video/\(encoded)"
    }

    static func title(for route: String?) -> String? {
        guard let route else { return nil }
        if route == wall { return titleWall }
        if route.hasPrefix("integra/video/") { return titleDetail }
        return nil
    }

    static func route(forModuleKey key: String) -> String? {
        switch key.lowercased() {
        case moduleKey, "video", "cameras", "camaras", "cámaras", "videowall":
            return wall
        default:
            return nil
        }
    }
}
