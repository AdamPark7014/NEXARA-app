import SwiftUI

/// Banda de conexión de arriba (Android `OfflineBanner`): ámbar #B45309 sin red,
/// azul #0369A1 con cambios pendientes de subir; texto blanco 12 SemiBold. El
/// color llega hasta la barra de estado, como `statusBarsPadding` en Android.
/// Con red y pendientes, tocarla reintenta el envío.
struct OfflineBanner: View {
    @ObservedObject private var network = NetworkMonitor.shared
    @State private var pending = 0
    @State private var syncing = false

    private static let ambar = NxColors.rgb(0xB45309)
    private static let azul = NxColors.rgb(0x0369A1)

    var body: some View {
        Group {
            if DemoMode.isActive {
                // Modo demostración: nada sale del teléfono, no hay banda de conexión.
                EmptyView()
            } else if !network.isOnline {
                banda(
                    pending > 0
                        ? "Sin conexión · \(pending) en cola (incl. fotos)"
                        : "Sin conexión · cambios y fotos se encolan localmente",
                    color: Self.ambar,
                    tocable: false
                )
            } else if pending > 0 {
                banda(
                    "Pendientes de sync: \(pending) · toca para reintentar",
                    color: Self.azul,
                    tocable: true
                )
            }
        }
        .task {
            pending = OfflineMutationQueue.shared.pendingCount
        }
        .onReceive(NotificationCenter.default.publisher(for: .nexaraOfflineQueueChanged)) { _ in
            pending = OfflineMutationQueue.shared.pendingCount
        }
    }

    @ViewBuilder
    private func banda(_ texto: String, color: Color, tocable: Bool) -> some View {
        let contenido = Text(texto)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(color.ignoresSafeArea(edges: .top))
        if tocable {
            Button {
                guard !syncing else { return }
                Task {
                    syncing = true
                    await OfflineSyncCoordinator.shared.replay()
                    pending = OfflineMutationQueue.shared.pendingCount
                    syncing = false
                }
            } label: {
                contenido.contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Reintenta enviar los cambios pendientes")
        } else {
            contenido
                .accessibilityAddTraits(.isStaticText)
        }
    }
}

extension Notification.Name {
    static let nexaraOfflineQueueChanged = Notification.Name("nexara.offline.queue.changed")
}
