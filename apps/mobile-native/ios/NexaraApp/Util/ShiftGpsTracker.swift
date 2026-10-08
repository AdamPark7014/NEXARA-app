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
///
/// **Solo en primer plano** (permiso «Mientras se usa la app»), igual que la web.
/// Apple rechazó 1.0.0 (9) el 07-10-2026 por la guía 2.5.4: el modo de fondo
/// `location` no se acepta cuando su único uso es seguir a empleados. Por eso
/// NO hay `UIBackgroundModes: location`, ni permiso «Siempre», ni
/// `allowsBackgroundLocationUpdates` (con `true` y sin ese modo, CoreLocation
/// tumba la app), ni cambios significativos de ubicación. Al pasar a segundo
/// plano iOS suspende la app y deja de entregar puntos; al volver a abrirla,
/// `resumeIfNeeded()` reanuda si la jornada sigue abierta.
@MainActor
final class ShiftGpsTracker: NSObject, ObservableObject, CLLocationManagerDelegate {
    static let shared = ShiftGpsTracker()

    /// Se recuerda para poder reanudar el seguimiento cuando la app vuelve a
    /// abrirse con la jornada todavía abierta.
    private static let activeKey = "nexara.shiftGps.active"

    /// Trayecto de jornada: un punto cada ~30 min o al moverse 500 m (cuida datos y batería).
    private static let minSeconds: TimeInterval = 30 * 60
    private static let minMeters: CLLocationDistance = 500
    /// Con actividad en curso: cada ~10 min o al moverse 100 m, para la geocerca de 100 m.
    private static let actividadMinSeconds: TimeInterval = 10 * 60
    private static let actividadMinMeters: CLLocationDistance = 100

    /// Actividad en curso (foto de entrada enviada, sin foto de salida): los
    /// puntos viajan con `actividadId` para la geocerca. Solo en memoria: la
    /// pone la foto de entrada y la quita la de salida.
    static var currentActivityId: Int?

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
        manager.distanceFilter = ShiftGpsTracker.actividadMinMeters
        manager.activityType = .automotiveNavigation
        manager.pausesLocationUpdatesAutomatically = false
        isTracking = UserDefaults.standard.bool(forKey: ShiftGpsTracker.activeKey)
    }

    /// Hay permiso de ubicación (cualquiera de los dos; solo se pide «Mientras se usa»).
    var isAuthorized: Bool {
        DemoMode.isActive || authorization == .authorizedWhenInUse || authorization == .authorizedAlways
    }
    var isDenied: Bool { !DemoMode.isActive && (authorization == .denied || authorization == .restricted) }

    /// ¿Se puede compartir el trayecto? (`JornadaGps.canTrack` de Android). Con la
    /// ubicación bloqueada no se enciende el consentimiento: el encargado vería una
    /// jornada «compartiendo» sin un solo punto. Sin decidir todavía, `start()` la pide.
    var canTrack: Bool { !isDenied }

    /// Texto para explicar el permiso antes de pedirlo (lo pinta la pantalla).
    var authorizationLabel: String {
        if DemoMode.isActive { return "Mientras usas la app" }
        switch authorization {
        case .authorizedAlways, .authorizedWhenInUse: return "Mientras usas la app"
        case .denied, .restricted: return "Ubicación bloqueada"
        default: return "Sin permiso todavía"
        }
    }

    /// Pide «Permitir mientras se usa la app». Nunca «Siempre»: ver la nota del tipo.
    func requestAuthorization() {
        // Modo demostración: no se pide ningún permiso de ubicación.
        if DemoMode.isActive { return }
        if authorization == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
    }

    /// Arranca el seguimiento de la jornada.
    func start() {
        // Modo demostración: se «comparte» ubicación de mentira, sin tocar CoreLocation.
        if DemoMode.isActive {
            isTracking = true
            lastError = nil
            lastSentAt = Date()
            return
        }
        UserDefaults.standard.set(true, forKey: ShiftGpsTracker.activeKey)
        isTracking = true
        lastError = nil
        requestAuthorization()
        guard !isDenied else { return }
        // Primer plano: iOS deja de entregar puntos en cuanto la app se suspende.
        manager.startUpdatingLocation()
    }

    /// Detiene el seguimiento (salida marcada, permiso retirado o sesión cerrada).
    func stop() {
        if DemoMode.isActive {
            isTracking = false
            return
        }
        UserDefaults.standard.set(false, forKey: ShiftGpsTracker.activeKey)
        isTracking = false
        manager.stopUpdatingLocation()
        lastPoint = nil
        lastSent = nil
    }

    /// Reanuda al volver a abrir la app: manda la verdad el servidor
    /// (`GET gps/me` ya cruza consentimiento con jornada abierta), no la
    /// bandera local, que podría haber quedado encendida de ayer.
    func resumeIfNeeded() async {
        // Modo demostración: nada que reanudar.
        if DemoMode.isActive { return }
        guard SessionStore.shared.currentUser != nil else {
            if isTracking { stop() }
            return
        }
        let consent = (try? await AsistenciasRepository.shared.gpsConsentIsOn()) ?? false
        if consent {
            // Se re-arma siempre al volver a primer plano: sin modo de fondo,
            // las actualizaciones se cortaron al suspenderse la app.
            start()
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

        let enActividad = ShiftGpsTracker.currentActivityId != nil
        let esperaSeg = enActividad ? ShiftGpsTracker.actividadMinSeconds : ShiftGpsTracker.minSeconds
        let esperaMetros = enActividad ? ShiftGpsTracker.actividadMinMeters : ShiftGpsTracker.minMeters
        if let lastSent, Date().timeIntervalSince(lastSent) < esperaSeg {
            let moved = lastPoint.map { location.distance(from: $0) } ?? .greatestFiniteMagnitude
            if moved < esperaMetros { return }
        }

        sending = true
        let actividadId = ShiftGpsTracker.currentActivityId
        Task { @MainActor in
            defer { self.sending = false }
            // Sin red no se encola: un día entero de pings en la cola sin
            // conexión se convertiría en cientos de peticiones al reconectar.
            guard NetworkMonitor.shared.isOnline else { return }
            do {
                try await ConsoleRepository.shared.gpsPost(
                    lat: coordinate.latitude,
                    lng: coordinate.longitude,
                    speedKmh: location.speed >= 0 ? location.speed * 3.6 : nil,
                    actividadId: actividadId,
                    // El punto viaja marcado si lo produjo software. No se descarta: un
                    // hueco en el recorrido no se puede leer, un punto marcado sí.
                    mockLocation: location.isSimulatedLocation
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
