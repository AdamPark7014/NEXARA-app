import SwiftUI
import CoreLocation
import UIKit

/// Antes de la foto de la checada: permiso de ubicación y ubicación del iPhone encendida.
///
/// Adam (23-10-2026): había quien checaba siempre «Sin ubicación» (permiso negado o la ubicación
/// apagada). Sin decidir, se pide el permiso en ese momento; bloqueado o apagado, un aviso lleva a
/// Ajustes (iOS no tiene el diálogo «Activar ubicación» de Android). Nadie se queda sin checar:
/// «Checar sin ubicación» sigue a la foto, y el servidor le pone a la entrada el primer punto del
/// GPS de jornada que llegue en los 30 min siguientes.
enum AvisoUbicacionChecada {
    case permiso
    case apagada

    var titulo: String {
        switch self {
        case .permiso: return "Permite tu ubicación"
        case .apagada: return "Tu ubicación está apagada"
        }
    }

    var mensaje: String {
        switch self {
        case .permiso:
            return "Tu checada y tu jornada llevan tu ubicación. En Ajustes → NEXARA → Ubicación, elige «Al usar la app» y vuelve a checar."
        case .apagada:
            return "Tu checada y tu jornada llevan tu ubicación. Enciéndela en Ajustes → Privacidad y seguridad → Localización y vuelve a checar."
        }
    }

    /// `nil` = todo listo para checar con ubicación. Si aún no se decidió el permiso, se pide aquí.
    @MainActor
    static func revisar() async -> AvisoUbicacionChecada? {
        if DemoMode.isActive { return nil }
        if !(await DeviceLocation.ubicacionEncendida()) { return .apagada }
        let tracker = ShiftGpsTracker.shared
        var estado = tracker.authorization
        if estado == .notDetermined {
            estado = await tracker.pedirPermisoYEsperar()
        }
        if estado == .denied || estado == .restricted { return .permiso }
        return nil
    }
}

private struct AvisoUbicacionChecadaModifier: ViewModifier {
    @Binding var aviso: AvisoUbicacionChecada?
    let onChecarSinUbicacion: () -> Void

    func body(content: Content) -> some View {
        content.alert(
            aviso?.titulo ?? "",
            isPresented: Binding(
                get: { aviso != nil },
                set: { if !$0 { aviso = nil } }
            ),
            presenting: aviso
        ) { _ in
            Button("Abrir Ajustes") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            Button("Checar sin ubicación") {
                // La cámara se abre cuando la alerta ya se fue.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { onChecarSinUbicacion() }
            }
            Button("Cancelar", role: .cancel) {}
        } message: { aviso in
            Text(aviso.mensaje)
        }
    }
}

extension View {
    /// Aviso de permiso/ubicación apagada antes de checar (ver `AvisoUbicacionChecada`).
    func avisoUbicacionChecada(
        _ aviso: Binding<AvisoUbicacionChecada?>,
        onChecarSinUbicacion: @escaping () -> Void
    ) -> some View {
        modifier(AvisoUbicacionChecadaModifier(aviso: aviso, onChecarSinUbicacion: onChecarSinUbicacion))
    }
}
