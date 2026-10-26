import Foundation
import CoreLocation
import UIKit

/// GPS de jornada: mientras la jornada esté abierta, el teléfono manda su
/// posición al API (`POST gps`), **un punto cada 30 min** (Adam, 23-10-2026), igual que Android.
///
/// Se enciende al marcar **entrada** (junto con `PATCH gps/consent {enabled:true}`)
/// y se apaga al marcar **salida**. No sigue a nadie fuera de su jornada: el
/// propio API cruza el consentimiento con `AttendanceDay.isOpen`, así que un
/// punto enviado con la jornada cerrada no lo ve ningún encargado.
///
/// **Con el permiso «Mientras se usa la app»** (el único que pide la app publicada): Apple rechazó
/// 1.0.0 (9) el 07-10-2026 por la guía 2.5.4 — el modo de fondo `location` no se acepta cuando su
/// único uso es seguir a empleados. Por eso NO hay `UIBackgroundModes: location` ni
/// `allowsBackgroundLocationUpdates`. Lo que sí se hace:
///
/// - Con la app abierta: un punto al abrirla (si el último fue hace más de 20 min) y otro cada
///   30 min mientras siga abierta. Lecturas sueltas (`requestLocation`), no el GPS encendido.
/// - Con la app cerrada iOS no deja medir: el servidor manda un recordatorio visible («Abre NEXARA
///   un momento para registrar tu ubicación») si lleva más de 35 min sin punto, y al abrirla se mide.
/// - **Si algún día se agrega `NSLocationAlwaysAndWhenInUseUsageDescription`** al Info.plist (decisión
///   de Adam: arriesga otro rechazo 2.5.4, o se distribuye como app privada por Apple Business
///   Manager), este mismo código pide «Siempre» y entonces sí mide con la app cerrada: cambios
///   significativos de ubicación (relanzan la app al moverse ~500 m) y el latido silencioso del
///   servidor (`gps-latido`). Sin esa clave, nada de eso se activa.
///
/// Las reglas de cadencia son las de `JornadaGpsReglas` en Android: nunca dos puntos en 20 min, y
/// un punto que el servidor no aceptó (sesión cerrada) se guarda con su hora y se reenvía después.
@MainActor
final class ShiftGpsTracker: NSObject, ObservableObject, CLLocationManagerDelegate {
    static let shared = ShiftGpsTracker()

    /// Se recuerda para poder reanudar el seguimiento cuando la app vuelve a
    /// abrirse con la jornada todavía abierta.
    private static let activeKey = "nexara.shiftGps.active"
    private static let lastSentKey = "nexara.shiftGps.lastSent"
    private static let pendientesKey = "nexara.shiftGps.pendientes"

    /// Un punto cada media hora; nunca dos en menos de 20 min (la misma cifra que el servidor).
    static let cadencia: TimeInterval = 30 * 60
    static let espaciadoMinimo: TimeInterval = 20 * 60
    private static let pendientesMax = 60

    /// Actividad en curso (foto de entrada enviada, sin foto de salida): los
    /// puntos viajan con `actividadId` para la geocerca. Solo en memoria: la
    /// pone la foto de entrada y la quita la de salida.
    static var currentActivityId: Int?

    private let manager = CLLocationManager()
    private var sending = false
    private var timer: Timer?
    private var observadores: [NSObjectProtocol] = []
    private var esperaPermiso: CheckedContinuation<CLAuthorizationStatus, Never>?

    @Published private(set) var isTracking = false
    @Published private(set) var authorization: CLAuthorizationStatus
    @Published private(set) var lastError: String?
    @Published private(set) var lastSentAt: Date?

    private override init() {
        authorization = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.activityType = .otherNavigation
        manager.pausesLocationUpdatesAutomatically = false
        isTracking = UserDefaults.standard.bool(forKey: ShiftGpsTracker.activeKey)
        lastSentAt = UserDefaults.standard.object(forKey: ShiftGpsTracker.lastSentKey) as? Date
    }

    /// Hay permiso de ubicación (cualquiera de los dos).
    var isAuthorized: Bool {
        DemoMode.isActive || authorization == .authorizedWhenInUse || authorization == .authorizedAlways
    }
    var isDenied: Bool { !DemoMode.isActive && (authorization == .denied || authorization == .restricted) }

    /// ¿Se puede compartir el trayecto? (`JornadaGps.canTrack` de Android). Con la
    /// ubicación bloqueada no se enciende el consentimiento: el encargado vería una
    /// jornada «compartiendo» sin un solo punto. Sin decidir todavía, `start()` la pide.
    var canTrack: Bool { !isDenied }

    /// El Info.plist trae la explicación de «Siempre»: solo entonces se pide ese permiso.
    private static var puedePedirSiempre: Bool {
        Bundle.main.object(forInfoDictionaryKey: "NSLocationAlwaysAndWhenInUseUsageDescription") != nil
    }

    /// Texto para explicar el permiso antes de pedirlo (lo pinta la pantalla).
    var authorizationLabel: String {
        if DemoMode.isActive { return "Mientras usas la app" }
        switch authorization {
        case .authorizedAlways: return "Siempre"
        case .authorizedWhenInUse: return "Mientras usas la app"
        case .denied, .restricted: return "Ubicación bloqueada"
        default: return "Sin permiso todavía"
        }
    }

    /// Pide «Permitir mientras se usa la app» (y «Siempre» solo si el Info.plist lo explica).
    func requestAuthorization() {
        // Modo demostración: no se pide ningún permiso de ubicación.
        if DemoMode.isActive { return }
        if authorization == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else if authorization == .authorizedWhenInUse && ShiftGpsTracker.puedePedirSiempre {
            manager.requestAlwaysAuthorization()
        }
    }

    /// Antes de checar: pide el permiso si aún no se decidió y espera la respuesta (máx. 60 s).
    func pedirPermisoYEsperar() async -> CLAuthorizationStatus {
        if DemoMode.isActive { return .authorizedWhenInUse }
        guard authorization == .notDetermined else { return authorization }
        return await withCheckedContinuation { cont in
            esperaPermiso?.resume(returning: authorization)
            esperaPermiso = cont
            manager.requestWhenInUseAuthorization()
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 60 * 1_000_000_000)
                if let c = self.esperaPermiso {
                    self.esperaPermiso = nil
                    c.resume(returning: self.authorization)
                }
            }
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
        armarMientrasAbierta()
        if authorization == .authorizedAlways {
            // Solo con «Siempre»: iOS relanza la app al moverse ~500 m aunque esté cerrada.
            manager.startMonitoringSignificantLocationChanges()
        }
        tomarPuntoSiToca()
    }

    /// Detiene el seguimiento (salida marcada, permiso retirado o sesión cerrada).
    func stop() {
        if DemoMode.isActive {
            isTracking = false
            return
        }
        UserDefaults.standard.set(false, forKey: ShiftGpsTracker.activeKey)
        UserDefaults.standard.removeObject(forKey: ShiftGpsTracker.lastSentKey)
        isTracking = false
        desarmar()
        manager.stopMonitoringSignificantLocationChanges()
        lastSentAt = nil
        // Lo que quedó sin enviar se intenta una última vez (la sesión pudo volver).
        Task { await self.enviarPendientes() }
    }

    /// Un punto ya llegó al servidor a esta hora (también la checada con ubicación, que el
    /// servidor guarda en el recorrido): el siguiente sale 30 min después y no a los segundos.
    func marcarPuntoEnviado(_ fecha: Date = Date()) {
        lastSentAt = fecha
        UserDefaults.standard.set(fecha, forKey: ShiftGpsTracker.lastSentKey)
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
        await enviarPendientes()
        let consent = (try? await AsistenciasRepository.shared.gpsConsentIsOn()) ?? false
        if consent {
            // Se re-arma siempre al volver a primer plano: el temporizador no corre suspendido.
            start()
        } else if isTracking {
            stop()
        }
    }

    /// Latido del servidor (push silencioso `gps-latido`): solo sirve con «Siempre». Con
    /// «Mientras se usa», iOS no deja medir con la app cerrada; el recordatorio visible lo
    /// muestra el sistema y al abrir la app se mide.
    func latido() {
        guard isTracking, authorization == .authorizedAlways else { return }
        tomarPuntoSiToca()
    }

    // MARK: Cadencia

    /// Mientras la app está abierta: un punto cada 30 min y otro al volver a ella.
    private func armarMientrasAbierta() {
        if timer == nil {
            let t = Timer(timeInterval: ShiftGpsTracker.cadencia, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.tomarPuntoSiToca() }
            }
            t.tolerance = 60
            RunLoop.main.add(t, forMode: .common)
            timer = t
        }
        if observadores.isEmpty {
            let centro = NotificationCenter.default
            observadores.append(centro.addObserver(
                forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
            ) { [weak self] _ in
                Task { @MainActor in self?.tomarPuntoSiToca() }
            })
        }
    }

    private func desarmar() {
        timer?.invalidate()
        timer = nil
        observadores.forEach { NotificationCenter.default.removeObserver($0) }
        observadores.removeAll()
    }

    private var debeTomarPunto: Bool {
        guard let ultimo = lastSentAt else { return true }
        let pasado = Date().timeIntervalSince(ultimo)
        return pasado < 0 || pasado >= ShiftGpsTracker.espaciadoMinimo
    }

    /// Una lectura suelta si ya pasaron 20 min del último punto.
    private func tomarPuntoSiToca() {
        guard isTracking, isAuthorized, debeTomarPunto else { return }
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.requestLocation()
    }

    // MARK: Delegado

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.authorization = status
            if status != .notDetermined, let c = self.esperaPermiso {
                self.esperaPermiso = nil
                c.resume(returning: status)
            }
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

    private struct Pendiente: Codable {
        let lat: Double
        let lng: Double
        let en: Date
        let actividadId: Int?
        let mock: Bool
    }

    private var pendientes: [Pendiente] {
        get {
            guard let data = UserDefaults.standard.data(forKey: ShiftGpsTracker.pendientesKey) else { return [] }
            return (try? JSONDecoder().decode([Pendiente].self, from: data)) ?? []
        }
        set {
            let recortada = Array(newValue.sorted { $0.en < $1.en }.suffix(ShiftGpsTracker.pendientesMax))
            if let data = try? JSONEncoder().encode(recortada) {
                UserDefaults.standard.set(data, forKey: ShiftGpsTracker.pendientesKey)
            }
        }
    }

    /// Reenvía lo pendiente, del más viejo al más nuevo; se detiene en el primer fallo.
    private func enviarPendientes() async {
        var lista = pendientes
        guard !lista.isEmpty, NetworkMonitor.shared.isOnline else { return }
        while let p = lista.first {
            do {
                try await ConsoleRepository.shared.gpsPost(
                    lat: p.lat,
                    lng: p.lng,
                    actividadId: p.actividadId,
                    mockLocation: p.mock,
                    medidoEn: p.en
                )
            } catch {
                break
            }
            lista.removeFirst()
            pendientes = lista
        }
    }

    private func send(_ location: CLLocation) {
        guard isTracking, !sending else { return }
        guard location.horizontalAccuracy >= 0 else { return }
        let coordinate = location.coordinate
        // El (0,0) de un teléfono sin señal no es una lectura: el API lo tira.
        guard coordinate.latitude != 0 || coordinate.longitude != 0 else { return }
        // Cambios significativos o lecturas que llegan juntas: nunca dos puntos en 20 min.
        guard debeTomarPunto else { return }

        sending = true
        let punto = Pendiente(
            lat: coordinate.latitude,
            lng: coordinate.longitude,
            en: Date(),
            actividadId: ShiftGpsTracker.currentActivityId,
            // El punto viaja marcado si lo produjo software. No se descarta: un
            // hueco en el recorrido no se puede leer, un punto marcado sí.
            mock: location.isSimulatedLocation
        )
        // Se marca como tomado aunque no llegue: queda pendiente con su hora.
        marcarPuntoEnviado(punto.en)
        Task { @MainActor in
            defer { self.sending = false }
            guard NetworkMonitor.shared.isOnline else {
                self.pendientes = self.pendientes + [punto]
                return
            }
            await self.enviarPendientes()
            do {
                try await ConsoleRepository.shared.gpsPost(
                    lat: punto.lat,
                    lng: punto.lng,
                    speedKmh: location.speed >= 0 ? location.speed * 3.6 : nil,
                    actividadId: punto.actividadId,
                    mockLocation: punto.mock,
                    medidoEn: punto.en
                )
                self.lastError = nil
            } catch {
                if let api = error as? ApiError, case .http(let code, _) = api, code == 403 {
                    // Sin permiso de GPS en el servidor: se apaga en vez de insistir.
                    self.stop()
                } else {
                    // Sesión cerrada (401), servidor caído…: se guarda con su hora y se reenvía después.
                    self.pendientes = self.pendientes + [punto]
                }
                self.lastError = error.toUserMessage(fallback: "No se pudo enviar tu ubicación")
            }
        }
    }
}
