import SwiftUI

/// Banner cuando no hay red o hay mutaciones pendientes.
struct OfflineBanner: View {
    @ObservedObject private var network = NetworkMonitor.shared
    @State private var pending = 0
    @State private var syncing = false

    var body: some View {
        Group {
            if !network.isOnline {
                banner(
                    pending > 0
                        ? "Sin conexión — \(pending) en cola (incl. fotos)"
                        : "Sin conexión — cambios y fotos se encolan localmente",
                    color: .orange,
                    tappable: false
                )
            } else if pending > 0 {
                banner(
                    syncing
                        ? "Sincronizando \(pending)…"
                        : "Pendientes de sync: \(pending) · toca para reintentar",
                    color: .blue,
                    tappable: !syncing
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

    private func banner(_ text: String, color: Color, tappable: Bool) -> some View {
        Text(text)
            .font(.caption)
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .background(color)
            .onTapGesture {
                guard tappable else { return }
                Task {
                    syncing = true
                    await OfflineSyncCoordinator.shared.replay()
                    pending = OfflineMutationQueue.shared.pendingCount
                    syncing = false
                }
            }
    }
}

extension Notification.Name {
    static let nexaraOfflineQueueChanged = Notification.Name("nexara.offline.queue.changed")
}
