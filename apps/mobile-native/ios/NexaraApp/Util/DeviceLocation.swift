import Foundation
import CoreLocation
import Combine

/// Una lectura del GPS, con lo que hace falta para poder creerle.
///
/// `mock` y `fixAgeMs` existen por lo mismo que en Android: el servidor no puede aceptar
/// un punto solo porque llegó. `mock` dice si lo produjo una app de ubicación simulada y
/// `fixAgeMs` de cuándo es la medición — una posición guardada de hace media hora no dice
/// dónde está su dueño. El servidor decide: 422 en la checada, marca en el resto.
struct DeviceCoords {
    let latitude: Double
    let longitude: Double
    let accuracyM: Double?
    /// La produjo software, no el GPS (`CLLocation.sourceInformation.isSimulatedBySoftware`).
    let mock: Bool
    /// Antigüedad de la medición en milisegundos; `nil` si no se pudo saber.
    let fixAgeMs: Int?

    init(
        latitude: Double,
        longitude: Double,
        accuracyM: Double? = nil,
        mock: Bool = false,
        fixAgeMs: Int? = nil
    ) {
        self.latitude = latitude
        self.longitude = longitude
        self.accuracyM = accuracyM
        self.mock = mock
        self.fixAgeMs = fixAgeMs
    }

    /// Sufijo para mensajes de UI: " · GPS ±12m" / " · GPS ok".
    var messageSuffix: String {
        if mock {
            return " · ubicación simulada detectada"
        }
        if let acc = accuracyM {
            return String(format: " · GPS ±%.0fm", acc)
        }
        return " · GPS ok"
    }

    /// Línea para persistir en notas de campo.
    var noteLine: String {
        let acc = accuracyM.map { String(format: " ±%.0fm", $0) } ?? ""
        return String(format: "[GPS: %.5f,%.5f%@]", latitude, longitude, acc)
    }
}

extension Optional where Wrapped == DeviceCoords {
    var messageSuffixOrNone: String {
        self?.messageSuffix ?? " (sin GPS)"
    }

    func mergeIntoNotes(_ notes: String?) -> String {
        let trimmed = notes?.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = [trimmed.flatMap { $0.isEmpty ? nil : $0 }, self?.noteLine].compactMap { $0 }
        return parts.joined(separator: "\n")
    }
}

/// Ubicación actual para compliance de campo (asistencia / evidencias / GPS).
@MainActor
final class DeviceLocation: NSObject, ObservableObject, CLLocationManagerDelegate {
    static let shared = DeviceLocation()

    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<DeviceCoords?, Never>?

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    var hasPermission: Bool {
        let s = manager.authorizationStatus
        return s == .authorizedWhenInUse || s == .authorizedAlways
    }

    func current() async -> DeviceCoords? {
        if !hasPermission {
            manager.requestWhenInUseAuthorization()
        }
        return await withCheckedContinuation { cont in
            continuation?.resume(returning: nil)
            continuation = cont
            manager.requestLocation()
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 8_000_000_000)
                if let c = self.continuation {
                    self.continuation = nil
                    // `manager.location` es la última que el sistema guardó: puede ser vieja.
                    // No se descarta aquí — su `fixAgeMs` viaja y el servidor decide.
                    c.resume(returning: self.manager.location.map { $0.toCoords() })
                }
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            continuation?.resume(returning: locations.last?.toCoords())
            continuation = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            continuation?.resume(returning: manager.location.map { $0.toCoords() })
            continuation = nil
        }
    }
}

extension CLLocation {
    /// ¿La produjo una app de ubicación simulada?
    ///
    /// `sourceInformation` existe desde iOS 15 y el objetivo de despliegue es 17, así que
    /// no hace falta guarda de disponibilidad. Es el equivalente del `isMock` de Android:
    /// la señal que faltaba en iPhone, donde hasta ahora una ubicación falsa entraba a la
    /// nómina sin que nadie pudiera notarlo.
    ///
    /// Se mira también `isProducedByAccessory`: un punto que llega por un accesorio
    /// externo tampoco lo midió el GPS del teléfono, y el servidor merece saberlo. Igual
    /// que en Android, ante la duda se marca y decide el servidor.
    var isSimulatedLocation: Bool {
        guard let source = sourceInformation else { return false }
        return source.isSimulatedBySoftware || source.isProducedByAccessory
    }

    /// Antigüedad de la medición en milisegundos, nunca negativa.
    ///
    /// iOS no expone un sello monótono en `CLLocation`, así que se compara contra el reloj
    /// de pared. Es algo más débil que el `elapsedRealtime` de Android —mover la hora del
    /// sistema después de la medición altera la cuenta— pero sirve para lo que importa:
    /// una posición realmente vieja, la que devuelve `manager.location` cuando no hay
    /// señal, sale vieja igual.
    var fixAgeMilliseconds: Int {
        max(0, Int(Date().timeIntervalSince(timestamp) * 1000))
    }

    func toCoords() -> DeviceCoords {
        DeviceCoords(
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
            accuracyM: horizontalAccuracy >= 0 ? horizontalAccuracy : nil,
            mock: isSimulatedLocation,
            fixAgeMs: fixAgeMilliseconds
        )
    }
}
