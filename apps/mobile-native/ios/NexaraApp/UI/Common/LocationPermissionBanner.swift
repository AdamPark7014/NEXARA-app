import SwiftUI
import CoreLocation

/// Banner para solicitar permiso de ubicación en pantallas de campo.
struct LocationPermissionBanner: View {
    var message: String = "Activa la ubicación para registrar GPS en esta acción de campo."
    var requestOnAppear: Bool = false

    @Environment(\.scenePhase) private var scenePhase
    @State private var hasPermission = DeviceLocation.shared.hasPermission

    var body: some View {
        Group {
            if !hasPermission {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Ubicación desactivada")
                        .font(.subheadline.bold())
                    Text(message)
                        .font(.caption)
                        .foregroundColor(.secondary)
                    HStack {
                        Button("Permitir ubicación") {
                            Task {
                                _ = await DeviceLocation.shared.current()
                                refresh()
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.orange)
                        Button("Ya lo activé") { refresh() }
                            .buttonStyle(.bordered)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Color.orange.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .onAppear {
            refresh()
            if requestOnAppear && !hasPermission {
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

    private func refresh() {
        hasPermission = DeviceLocation.shared.hasPermission
    }
}
