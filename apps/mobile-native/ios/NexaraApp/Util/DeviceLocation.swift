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

/// Lo que salió de buscar la ubicación para una checada: las coordenadas o, si no hubo,
/// por qué (`UbicacionFalla`). Espejo de `LecturaUbicacion` de Android.
struct LecturaUbicacion {
    let coords: DeviceCoords?
    /// Código para `ubicacionFalla`; `nil` cuando sí hubo coordenadas.
    let falla: String?
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
    /// Número de la lectura en curso: el plazo de una lectura que ya terminó no corta la
    /// siguiente (antes, el temporizador de la primera resolvía la segunda antes de tiempo).
    private var lecturaEnCurso = 0
    /// Error que Core Location reportó en la lectura en curso; lo usa el diagnóstico de la checada.
    private var errorDeLectura: Error?

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
        // Modo demostración: coordenadas fijas (Puebla), sin permiso, sin GPS real y sin «mock».
        if DemoMode.isActive { return DemoImages.coords }
        if !hasPermission {
            manager.requestWhenInUseAuthorization()
        }
        return await leer(precision: kCLLocationAccuracyHundredMeters, segundos: 8)
    }

    /// Lectura para la checada: las coordenadas o, si no las hubo, POR QUÉ.
    ///
    /// La lectura de siempre pide 100 m (Wi-Fi y celdas): adentro de un edificio o con datos
    /// malos regresa vacía y antes nadie reintentaba. Si sale vacía y hay permiso, se intenta
    /// una vez con `kCLLocationAccuracyBest`, que sí enciende el GPS. Si tampoco, se dice por
    /// qué (`UbicacionFalla`) y el jefe lo lee en el motivo «Sin ubicación: …».
    ///
    /// - Parameter previaVacia: quien llama ya hizo la lectura de siempre y salió vacía (la
    ///   cámara de la checada la hace al tomar la foto): se va directo a la de máxima precisión.
    func lecturaChecada(previaVacia: Bool = false) async -> LecturaUbicacion {
        if DemoMode.isActive { return LecturaUbicacion(coords: DemoImages.coords, falla: nil) }
        var coords: DeviceCoords?
        if !previaVacia {
            coords = await current()
        }
        if coords == nil, hasPermission {
            coords = await leer(precision: kCLLocationAccuracyBest, segundos: 12)
        }
        if let coords {
            return LecturaUbicacion(coords: coords, falla: nil)
        }
        let encendida = await Self.ubicacionEncendida()
        let falla = UbicacionFalla.de(
            tienePermiso: hasPermission,
            ubicacionEncendida: encendida,
            huboError: Self.esFallaDeLectura(errorDeLectura)
        )
        return LecturaUbicacion(coords: nil, falla: falla)
    }

    /// Una lectura con la precisión pedida y un plazo; al vencer el plazo se usa la última
    /// posición que guardó el sistema.
    private func leer(precision: CLLocationAccuracy, segundos: UInt64) async -> DeviceCoords? {
        manager.desiredAccuracy = precision
        errorDeLectura = nil
        lecturaEnCurso += 1
        let numero = lecturaEnCurso
        return await withCheckedContinuation { cont in
            continuation?.resume(returning: nil)
            continuation = cont
            manager.requestLocation()
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: segundos * 1_000_000_000)
                guard numero == self.lecturaEnCurso, let c = self.continuation else { return }
                self.continuation = nil
                // La petición del sistema sigue viva: se cancela para que su respuesta tardía
                // no conteste la lectura siguiente.
                self.manager.stopUpdatingLocation()
                // `manager.location` es la última que el sistema guardó: puede ser vieja.
                // No se descarta aquí — su `fixAgeMs` viaja y el servidor decide.
                c.resume(returning: self.manager.location.map { $0.toCoords() })
            }
        }
    }

    /// `locationServicesEnabled()` le pregunta al sistema de forma síncrona y Apple pide no
    /// llamarla en el hilo principal (puede trabar la pantalla): se pregunta fuera de él.
    static func ubicacionEncendida() async -> Bool {
        await Task.detached(priority: .userInitiated) {
            CLLocationManager.locationServicesEnabled()
        }.value
    }

    /// «Todavía no hay lectura» (`locationUnknown`) es falta de señal, no una falla. El
    /// permiso negado y la ubicación apagada los explica `UbicacionFalla` antes que esto.
    private static func esFallaDeLectura(_ error: Error?) -> Bool {
        guard let error else { return false }
        if let cl = error as? CLError, cl.code == .locationUnknown { return false }
        return true
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            continuation?.resume(returning: locations.last?.toCoords())
            continuation = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            if continuation != nil { errorDeLectura = error }
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
