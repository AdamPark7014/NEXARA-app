import SwiftUI

/// Centro de notificaciones — paridad web `notifications-center` y Android `NotificationsScreen`.
struct NotificationsCenterView: View {
    let onBack: () -> Void

    @State private var rows: [[String: Any]] = []
    @State private var isLoading = true
    @State private var saving = false
    @State private var error: String?
    @State private var message: String?

    private var unread: Int {
        rows.filter { ($0["isRead"] as? Bool) != true }.count
    }

    var body: some View {
        List {
            if let message {
                Section {
                    Text(message).foregroundColor(.green).font(.footnote)
                }
            }
            if let error {
                Section {
                    Text(error).foregroundColor(.red)
                    Button("Reintentar") { Task { await load() } }
                }
            }
            if isLoading && rows.isEmpty {
                Section { ProgressView() }
            } else if rows.isEmpty && error == nil {
                Section {
                    VStack(spacing: 8) {
                        Text("🎉").font(.largeTitle)
                        Text("Sin notificaciones").foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                }
            } else {
                Section("\(unread) sin leer") {
                    ForEach(rows, id: \.notifKey) { n in
                        notificationRow(n)
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    Task { await deleteItem(n) }
                                } label: { Label("Eliminar", systemImage: "trash") }
                            }
                            .swipeActions(edge: .leading) {
                                if (n["isRead"] as? Bool) != true {
                                    Button {
                                        Task { await markRead(n) }
                                    } label: { Label("Leída", systemImage: "checkmark") }
                                    .tint(.blue)
                                }
                            }
                    }
                }
            }
        }
        .navigationTitle("Notificaciones")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button("Paneles", action: onBack)
            }
            ToolbarItemGroup(placement: .navigationBarTrailing) {
                Button { Task { await load() } } label: {
                    Image(systemName: "arrow.clockwise")
                }
                if unread > 0 {
                    Button("Leer todo") { Task { await markAll() } }
                        .disabled(saving)
                }
            }
        }
        .task {
            await load()
            await NotificationsBadgeStore.shared.refresh()
        }
        .onReceive(RealtimeBus.shared.events) { event in
            let model = event.model?.lowercased() ?? ""
            guard model.isEmpty || model == "notification" else { return }
            Task { await load() }
        }
    }

    @ViewBuilder
    private func notificationRow(_ n: [String: Any]) -> some View {
        let isRead = (n["isRead"] as? Bool) == true
        let category = ConsoleHelpers.mapStr(n, "category")
        HStack(alignment: .top, spacing: 12) {
            Text(categoryIcon(category)).font(.title2)
            VStack(alignment: .leading, spacing: 4) {
                Text(ConsoleHelpers.mapStr(n, "title").isEmpty ? "Notificación" : ConsoleHelpers.mapStr(n, "title"))
                    .font(.subheadline)
                    .fontWeight(isRead ? .regular : .bold)
                let msg = ConsoleHelpers.mapStr(n, "message")
                if !msg.isEmpty {
                    Text(msg).font(.caption).foregroundColor(.secondary)
                }
                HStack(spacing: 6) {
                    Text(timeAgo(ConsoleHelpers.mapStr(n, "createdAt")))
                    if !category.isEmpty {
                        Text("·").foregroundColor(.secondary)
                        Text(category).font(.caption2)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Color(.tertiarySystemFill))
                            .clipShape(Capsule())
                    }
                    if ConsoleHelpers.mapStr(n, "priority").lowercased() == "high" {
                        Text("ALTA").font(.caption2).bold()
                            .foregroundColor(.red)
                    }
                }
                .font(.caption2)
                .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
        .listRowBackground(isRead ? Color.clear : Color.accentColor.opacity(0.06))
    }

    private func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            rows = try await NotificationsRepository.shared.list(limit: 50)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func markRead(_ n: [String: Any]) async {
        guard let id = ConsoleHelpers.mapInt64(n, "id") else { return }
        saving = true
        defer { saving = false }
        do {
            try await NotificationsRepository.shared.markRead(id: id)
            await load()
            await NotificationsBadgeStore.shared.refresh()
        } catch {
            message = error.localizedDescription
        }
    }

    private func markAll() async {
        saving = true
        defer { saving = false }
        do {
            try await NotificationsRepository.shared.markAllRead()
            message = "Marcadas como leídas"
            await load()
            await NotificationsBadgeStore.shared.refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func deleteItem(_ n: [String: Any]) async {
        guard let id = ConsoleHelpers.mapInt64(n, "id") else { return }
        saving = true
        defer { saving = false }
        do {
            try await NotificationsRepository.shared.delete(id: id)
            await load()
            await NotificationsBadgeStore.shared.refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func categoryIcon(_ category: String) -> String {
        switch category.lowercased() {
        case "attendance": return "🕐"
        case "activity": return "🧰"
        case "tool": return "🔧"
        case "finance": return "💸"
        case "noc": return "🚨"
        case "crm": return "✨"
        case "approval": return "🛡️"
        case "evidence": return "📸"
        default: return "🔔"
        }
    }

    private func timeAgo(_ iso: String) -> String {
        guard !iso.isEmpty else { return "" }
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = fmt.date(from: iso)
        if date == nil {
            fmt.formatOptions = [.withInternetDateTime]
            date = fmt.date(from: iso)
        }
        guard let date else { return iso.prefix(16).description }
        let m = Int(Date().timeIntervalSince(date) / 60)
        if m < 1 { return "Hace un momento" }
        if m < 60 { return "Hace \(m) min" }
        let h = m / 60
        if h < 24 { return "Hace \(h)h" }
        return "Hace \(h / 24)d"
    }
}

extension [String: Any] {
    fileprivate var notifKey: String { "n-\(self["id"] ?? UUID().uuidString)" }
}
