import SwiftUI
import CoreLocation
import UIKit

/// Aviso para pedir el permiso de ubicación en pantallas de campo (Android
/// `LocationPermissionBanner`): tarjeta ámbar suave con «Ubicación desactivada», el
/// motivo, «Permitir ubicación» y «Ya lo activé». Con el permiso dado no dibuja nada.
struct LocationPermissionBanner: View {
    var message: String = "Activa la ubicación para registrar GPS en esta acción de campo."
    /// Pide el permiso en cuanto aparece (como `requestOnAppear` de Android).
    var requestOnAppear: Bool = false

    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @State private var hasPermission = LocationPermissionBanner.permitido()

    /// En demo no se pide ningún permiso real: se da por concedido.
    @MainActor
    private static func permitido() -> Bool {
        DemoMode.isActive || DeviceLocation.shared.hasPermission
    }

    /// Ya se negó: iOS no vuelve a enseñar el aviso, solo Ajustes lo cambia.
    private var negado: Bool {
        let status = CLLocationManager().authorizationStatus
        return status == .denied || status == .restricted
    }

    var body: some View {
        Group {
            if !hasPermission {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Ubicación desactivada")
                        .font(NxType.titleSmall)
                        .foregroundStyle(NxColors.fg)
                    Text(message)
                        .font(.system(size: 12))
                        .foregroundStyle(NxColors.muted)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(alignment: .center, spacing: 8) {
                        Button("Permitir ubicación") { pedir() }
                            .buttonStyle(NxPillButtonStyle(fill: NxColors.brand, foreground: .white))
                        Button("Ya lo activé") { refresh() }
                            .buttonStyle(NxPillButtonStyle(fill: .clear, foreground: NxColors.brand))
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(NxColors.warningSoft, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .onAppear {
            refresh()
            if requestOnAppear && !hasPermission && !negado {
                Task {
                    _ = await DeviceLocation.shared.current()
                    refresh()
                }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { refresh() }
        }
    }

    private func pedir() {
        if negado {
            if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
            return
        }
        Task {
            _ = await DeviceLocation.shared.current()
            refresh()
        }
    }

    private func refresh() {
        hasPermission = Self.permitido()
    }
}
