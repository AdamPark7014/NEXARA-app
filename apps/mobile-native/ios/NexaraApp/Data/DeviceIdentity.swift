import Foundation
import UIKit

/// Identidad del dispositivo para el servidor: con esto el aviso dice «Iniciaste sesión desde
/// iPhone 16 Pro Max (iOS 18.1)» en lugar de un genérico. Paridad con las cabeceras de Android.
enum DeviceIdentity {
    /// Identificador interno del modelo («iPhone17,2»). En el simulador lo da la variable de entorno.
    static var modelIdentifier: String {
        if let sim = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"], !sim.isEmpty {
            return sim
        }
        var info = utsname()
        uname(&info)
        return withUnsafePointer(to: &info.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) }
        }
    }

    /// Nombre comercial («iPhone 16 Pro Max»); si el modelo no está en la tabla, el genérico del equipo.
    static var marketingName: String {
        if let name = marketingNames[modelIdentifier] { return name }
        return UIDevice.current.model
    }

    /// «iOS 18.1» (o «iPadOS 18.1» en iPad).
    static var osDescription: String {
        let system = UIDevice.current.userInterfaceIdiom == .pad ? "iPadOS" : "iOS"
        return "\(system) \(UIDevice.current.systemVersion)"
    }

    static var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
    }

    /// Cabeceras que la API usa para describir el dispositivo (solo ASCII: los nombres de la tabla lo son).
    static var headers: [String: String] {
        [
            "User-Agent": "NexaraApp/\(appVersion) (\(osDescription); \(marketingName))",
            "X-Device-Model": marketingName,
            "X-Device-OS": osDescription,
            "X-Device-Browser": "NEXARA App",
        ]
    }

    private static let marketingNames: [String: String] = [
        "iPhone12,1": "iPhone 11", "iPhone12,3": "iPhone 11 Pro", "iPhone12,5": "iPhone 11 Pro Max",
        "iPhone12,8": "iPhone SE (2nd gen)",
        "iPhone13,1": "iPhone 12 mini", "iPhone13,2": "iPhone 12", "iPhone13,3": "iPhone 12 Pro",
        "iPhone13,4": "iPhone 12 Pro Max",
        "iPhone14,4": "iPhone 13 mini", "iPhone14,5": "iPhone 13", "iPhone14,2": "iPhone 13 Pro",
        "iPhone14,3": "iPhone 13 Pro Max", "iPhone14,6": "iPhone SE (3rd gen)",
        "iPhone14,7": "iPhone 14", "iPhone14,8": "iPhone 14 Plus", "iPhone15,2": "iPhone 14 Pro",
        "iPhone15,3": "iPhone 14 Pro Max",
        "iPhone15,4": "iPhone 15", "iPhone15,5": "iPhone 15 Plus", "iPhone16,1": "iPhone 15 Pro",
        "iPhone16,2": "iPhone 15 Pro Max",
        "iPhone17,3": "iPhone 16", "iPhone17,4": "iPhone 16 Plus", "iPhone17,1": "iPhone 16 Pro",
        "iPhone17,2": "iPhone 16 Pro Max", "iPhone17,5": "iPhone 16e",
    ]
}
