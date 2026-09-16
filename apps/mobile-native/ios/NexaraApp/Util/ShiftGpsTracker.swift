import Foundation
import CoreLocation
import UIKit

/// GPS de jornada: mientras la jornada esté abierta, el teléfono manda su
/// posición al API (`POST gps`) como hace `GpsBackgroundTracker` en la web.
///
/// Se enciende al marcar **entrada** (junto con `PATCH gps/consent {enabled:true}`)
/// y se apaga al marcar **salida**. No sigue a nadie fuera de su jornada: el
/// propio API cruza el consentimiento con `AttendanceDay.isOpen`, así que un
/// punto enviado con la jornada cerrada no lo ve ningún encargado.
@MainActor
final class ShiftGpsTracker: NSObject, ObservableObject, CLLocationManagerDelegate {
    static let shared = ShiftGpsTracker()

    /// Se recuerda para poder reanudar el seguimiento cuando la app vuelve a
    /// abrirse con la jornada todavía abierta.
    private static let activeKey = "nexara.shiftGps.active"

    /// Ni un punto por segundo (gasta batería y llena la tabla) ni uno por hora
    /// (el recorrido deja de ser un recorrido): 100 m o 45 s, lo que llegue.
    private static let minSeconds: TimeInterval = 45
    private static let minMeters: CLLocationDistance = 100

    private let manager = CLLocationManager()
    private var lastSent: Date?
    private var lastPoint: CLLocation?
    private var sending = false

    @Published private(set) var isTracking = false
    @Published private(set) var authorization: CLAuthorizationStatus
    @Published private(set) var lastError: String?
    @Published private(set) var lastSentAt: Date?

    private override init() {
        authorization = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = ShiftGpsTracker.minMeters
        manager.activityType = .automotiveNavigation
        manager.pausesLocationUpdatesAutomatically = false
        isTracking = UserDefaults.standard.bool(forKey: ShiftGpsTracker.activeKey)
    }

    var isAlways: Bool { authorization == .authorizedAlways }
    var isDenied: Bool { authorization == .denied || authorization == .restricted }

    /// Texto para explicar el permiso antes de pedirlo (lo pinta la pantalla).
    var authorizationLabel: String {
        switch authorization {
        case .authorizedAlways: return "Permitido siempre"
        case .authorizedWhenInUse: return "Solo con la app abierta"
        case .denied, .restricted: return "Ubicación bloqueada"
        default: return "Sin permiso todavía"
        }
    }

    /// Pide «Permitir siempre». En iOS el salto se hace en dos pasos: primero
    /// «mientras la app esté abierta» y después la ampliación; pedirlo así es lo
    /// que hace que el sistema enseñe el segundo aviso.
    func requestAlwaysAuthorization() {
        switch authorization {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse:
            manager.requestAlwaysAuthorization()
        default:
            break
        }
    }

    /// Arranca el seguimiento de la jornada.
    func start() {
        UserDefaults.standard.set(true, forKey: ShiftGpsTracker.activeKey)
        isTracking = true
        lastError = nil
        requestAlwaysAuthorization()
        guard !isDenied else { return }
        if authorization == .authorizedAlways {
            // Solo con «Siempre» es legal (y útil) seguir en segundo plano.
            manager.allowsBackgroundLocationUpdates = true
            manager.showsBackgroundLocationIndicator = true
            manager.startMonitoringSignificantLocationChanges()
        }
        manager.startUpdatingLocation()
    }

    /// Detiene el seguimiento (salida marcada, permiso retirado o sesión cerrada).
    func stop() {
        UserDefaults.standard.set(false, forKey: ShiftGpsTracker.activeKey)
        isTracking = false
        manager.stopUpdatingLocation()
        manager.stopMonitoringSignificantLocationChanges()
        manager.allowsBackgroundLocationUpdates = false
        lastPoint = nil
        lastSent = nil
    }

    /// Reanuda al volver a abrir la app: manda la verdad el servidor
    /// (`GET gps/me` ya cruza consentimiento con jornada abierta), no la
    /// bandera local, que podría haber quedado encendida de ayer.
    func resumeIfNeeded() async {
        guard SessionStore.shared.currentUser != nil else {
            if isTracking { stop() }
            return
        }
        let consent = (try? await AsistenciasRepository.shared.gpsConsentIsOn()) ?? false
        if consent {
            if !isTracking || authorization == .authorizedAlways { start() }
        } else if isTracking {
            stop()
        }
    }

    // MARK: Delegado

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.authorization = status
            guard self.isTracking else { return }
            if status == .authorizedAlways || status == .authorizedWhenInUse {
                self.start()
            } else if status == .denied || status == .restricted {
                self.lastError = "La ubicación está bloqueada: el recorrido de tu jornada no se está enviando."
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in self.send(location) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            // Un fallo suelto es normal en interiores; no se apaga nada por él.
            self.lastError = error.localizedDescription
        }
    }

    // MARK: Envío

    private func send(_ location: CLLocation) {
        guard isTracking, !sending else { return }
        guard location.horizontalAccuracy >= 0 else { return }
        let coordinate = location.coordinate
        // El (0,0) de un teléfono sin señal no es una lectura: el API lo tira.
        guard coordinate.latitude != 0 || coordinate.longitude != 0 else { return }

        if let lastSent, Date().timeIntervalSince(lastSent) < ShiftGpsTracker.minSeconds {
            let moved = lastPoint.map { location.distance(from: $0) } ?? .greatestFiniteMagnitude
            if moved < ShiftGpsTracker.minMeters { return }
        }

        sending = true
        Task { @MainActor in
            defer { self.sending = false }
            // Sin red no se encola: un día entero de pings en la cola sin
            // conexión se convertiría en cientos de peticiones al reconectar.
            guard NetworkMonitor.shared.isOnline else { return }
            do {
                try await ConsoleRepository.shared.gpsPost(
                    lat: coordinate.latitude,
                    lng: coordinate.longitude,
                    speedKmh: location.speed >= 0 ? location.speed * 3.6 : nil
                )
                self.lastSent = Date()
                self.lastSentAt = self.lastSent
                self.lastPoint = location
                self.lastError = nil
            } catch {
                if let api = error as? ApiError, case .http(let code, _) = api, code == 401 || code == 403 {
                    // Sesión vencida o sin permiso de GPS: se apaga en vez de
                    // insistir cada 100 m contra un 403.
                    self.stop()
                }
                self.lastError = error.toUserMessage(fallback: "No se pudo enviar tu ubicación")
            }
        }
    }
}
