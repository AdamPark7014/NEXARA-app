import Foundation
import CoreLocation
import Combine

struct DeviceCoords {
    let latitude: Double
    let longitude: Double
    let accuracyM: Double?

    /// Sufijo para mensajes de UI: " · GPS ±12m" / " · GPS ok".
    var messageSuffix: String {
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

private extension CLLocation {
    func toCoords() -> DeviceCoords {
        DeviceCoords(
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
            accuracyM: horizontalAccuracy >= 0 ? horizontalAccuracy : nil
        )
    }
}
