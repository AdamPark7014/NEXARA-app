import SwiftUI

/// Cola de mutaciones offline: listar, sincronizar y descartar.
struct OfflineQueueView: View {
    @ObservedObject private var network = NetworkMonitor.shared
    @State private var items: [QueuedMutation] = []
    @State private var syncing = false
    @State private var message: String?

    var body: some View {
        List {
            Section {
                Text(network.isOnline
                      ? "Con conexión — puedes sincronizar ahora"
                      : "Sin conexión — los cambios se encolan aquí")
                    .font(.footnote)
                    .foregroundColor(.secondary)
                if let message {
                    Text(message)
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(message.hasPrefix("❌") ? .red : .green)
                }
                Button {
                    Task { await syncNow() }
                } label: {
                    Text(syncing ? "Sincronizando…" : "Sincronizar ahora")
                }
                .disabled(syncing || !network.isOnline || items.isEmpty)
                if !items.isEmpty {
                    Button("Vaciar cola", role: .destructive) {
                        for item in items {
                            OfflineMediaStore.shared.purgeRefs(in: item.body)
                        }
                        OfflineMutationQueue.shared.removeIds(Set(items.map(\.id)))
                        refresh()
                        message = "Cola descartada"
                    }
                }
            }

            if items.isEmpty {
                Section {
                    Text("Sin mutaciones pendientes")
                        .foregroundColor(.green)
                        .font(.subheadline.weight(.semibold))
                }
            } else {
                Section("Pendientes (\(items.count))") {
                    ForEach(items) { item in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(item.method).font(.subheadline.bold()).foregroundColor(.teal)
                                Spacer()
                                Text(shortPath(item.url)).font(.caption2).foregroundColor(.secondary)
                            }
                            if item.attempts > 0 {
                                Text("Intentos: \(item.attempts)" + (item.lastError.map { " · \($0)" } ?? ""))
                                    .font(.caption2)
                                    .foregroundColor(.orange)
                            }
                            if (item.body ?? "").contains("nexara-media://") {
                                Text("Incluye media local").font(.caption2).foregroundColor(.blue)
                            }
                            Button("Descartar", role: .destructive) {
                                OfflineMediaStore.shared.purgeRefs(in: item.body)
                                OfflineMutationQueue.shared.removeIds([item.id])
                                refresh()
                            }
                            .font(.caption)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
        .navigationTitle("Cola offline")
        .task { refresh() }
        .onReceive(NotificationCenter.default.publisher(for: .nexaraOfflineQueueChanged)) { _ in
            refresh()
        }
        .refreshable { refresh() }
    }

    private func refresh() {
        items = OfflineMutationQueue.shared.load()
    }

    private func syncNow() async {
        syncing = true
        message = nil
        await OfflineSyncCoordinator.shared.replay()
        refresh()
        message = items.isEmpty ? "✅ Cola vacía" : "Quedan \(items.count) pendientes"
        syncing = false
    }

    private func shortPath(_ url: String) -> String {
        guard let u = URL(string: url) else { return url }
        var path = u.path
        if path.hasPrefix("/api/") { path = String(path.dropFirst(5)) }
        return path
    }
}
