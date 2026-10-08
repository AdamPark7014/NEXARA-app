import Foundation
import CoreLocation

/// Avisa al servidor cuando el teléfono se queda sin ubicación durante la jornada
/// (`POST attendance/estado-ubicacion`): APAGADA, SIN_PERMISO y, cuando se arregla, ENCENDIDA.
///
/// Adam (08-10): «que nos registre si hay algún dispositivo con la ubicación apagada», no
/// solo al checar. Android lo escucha con el servicio de jornada; en iPhone solo hay
/// primer plano (Apple rechazó la ubicación en segundo plano, ver `ShiftGpsTracker`), así
/// que se revisa al volver la app a primer plano y cuando cambia el permiso
/// (`locationManagerDidChangeAuthorization`, que iOS también dispara al apagar o encender
/// la ubicación del teléfono). Este manager no pide ni recibe ubicaciones: solo mira el permiso.
///
/// Sin jornada abierta no se manda nada. Para no preguntarle al servidor en cada regreso a
/// la app, primero se decide en el teléfono si hay algo nuevo que decir (`EstadoUbicacion`)
/// y solo entonces se confirma la jornada con `attendance/current`.
@MainActor
final class EstadoUbicacionMonitor: NSObject, CLLocationManagerDelegate {
    static let shared = EstadoUbicacionMonitor()

    /// Último estado que el servidor tiene de este teléfono según lo que se le mandó,
    /// por usuario («12|APAGADA»): sobrevive a que iOS cierre la app en segundo plano.
    private static let ultimoKey = "nexara.estadoUbicacion.ultimo"

    private let manager = CLLocationManager()
    private var revisando = false
    /// Llegó otro aviso mientras se revisaba: se vuelve a revisar al terminar.
    private var otraVez = false

    private override init() {
        super.init()
        manager.delegate = self
    }

    /// Revisa el estado de la ubicación y lo manda si es nuevo y hay jornada abierta.
    func revisar() async {
        if revisando {
            otraVez = true
            return
        }
        revisando = true
        defer { revisando = false }
        repeat {
            otraVez = false
            await revisarUnaVez()
        } while otraVez
    }

    /// La checada sin coordenadas ya le dijo al servidor el estado (él registra APAGADA o
    /// SIN_PERMISO a partir de `ubicacionFalla`): se anota como enviado, para mandar
    /// ENCENDIDA en cuanto el teléfono vuelva a tener ubicación.
    func checadaRegistrada(falla: String?) {
        guard let estado = EstadoUbicacion.deFalla(falla),
              let userId = SessionStore.shared.currentUser?.id else { return }
        guardar(estado, userId: userId)
    }

    private func revisarUnaVez() async {
        // Modo demostración: la sesión es de mentira, no hay a quién avisar.
        guard !DemoMode.isActive, let user = SessionStore.shared.currentUser else { return }
        // Clientes, sucursales y dirección no checan: no tienen jornada que reportar.
        guard !CoreNavigation.isExternal(user), AsistenciasAccess.mode(for: user).canRegisterSelf else { return }
        let status = manager.authorizationStatus
        // Sin decidir todavía no es «sin permiso»: la app lo pide cuando lo necesita.
        guard status != .notDetermined else { return }
        let encendida = await DeviceLocation.ubicacionEncendida()
        let actual = EstadoUbicacion.de(
            tienePermiso: status == .authorizedWhenInUse || status == .authorizedAlways,
            ubicacionEncendida: encendida
        )
        guard let estado = EstadoUbicacion.aEnviar(actual: actual, ultimoEnviado: ultimo(userId: user.id)) else {
            return
        }
        // Solo con la jornada abierta. Sin red contesta la última respuesta guardada.
        guard let jornada = try? await ConsoleRepository.shared.attendanceCurrentItem(),
              jornada.isOpen else { return }
        do {
            // Sin conexión queda en la cola y cuenta como enviado: sale sola al volver la red.
            try await ConsoleRepository.shared.attendanceEstadoUbicacion(estado)
            guardar(estado, userId: user.id)
        } catch {
            // No se anota: se vuelve a intentar al siguiente regreso a primer plano.
        }
    }

    private func ultimo(userId: String) -> String? {
        guard let valor = UserDefaults.standard.string(forKey: Self.ultimoKey) else { return nil }
        let partes = valor.split(separator: "|", maxSplits: 1).map(String.init)
        guard partes.count == 2, partes[0] == userId else { return nil }
        return partes[1]
    }

    private func guardar(_ estado: String, userId: String) {
        UserDefaults.standard.set("\(userId)|\(estado)", forKey: Self.ultimoKey)
    }

    // MARK: Delegado

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            await self.revisar()
        }
    }
}
