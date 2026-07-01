import SwiftUI

/// Banner cuando no hay red o hay mutaciones pendientes.
struct OfflineBanner: View {
    @ObservedObject private var network = NetworkMonitor.shared
    @State private var pending = 0

    var body: some View {
        Group {
            if !network.isOnline {
                banner("Sin conexión — mostrando datos guardados", color: .orange)
            } else if pending > 0 {
                banner("Sincronizando \(pending) cambio(s) pendiente(s)…", color: .blue)
            }
        }
        .task {
            pending = OfflineMutationQueue.shared.pendingCount
        }
        .onReceive(NotificationCenter.default.publisher(for: .nexaraOfflineQueueChanged)) { _ in
            pending = OfflineMutationQueue.shared.pendingCount
        }
    }

    private func banner(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption)
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .background(color)
    }
}

extension Notification.Name {
    static let nexaraOfflineQueueChanged = Notification.Name("nexara.offline.queue.changed")
}
