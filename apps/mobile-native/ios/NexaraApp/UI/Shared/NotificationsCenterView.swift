import SwiftUI

/// Centro de notificaciones — paridad web `notifications-center` y Android `NotificationsScreen`.
struct NotificationsCenterView: View {
    let onBack: () -> Void

    @State private var rows: [[String: Any]] = []
    @State private var isLoading = true
    @State private var saving = false
    @State private var error: String?
    @State private var message: String?
    @State private var showFeed = false
    @State private var feedItems: [[String: Any]] = []
    @State private var categoryFilter: NotifCategoryFilter = .all

    private var unread: Int {
        rows.filter { ($0["isRead"] as? Bool) != true }.count
    }

    /// Filtro por categoría, con los mismos cubos que `bucketCategory` de la web.
    private var filteredRows: [[String: Any]] {
        guard categoryFilter != .all else { return rows }
        return rows.filter { NotifCategoryFilter.bucket(ConsoleHelpers.mapStr($0, "category")) == categoryFilter }
    }

    var body: some View {
        List {
            Section {
                Picker("Vista", selection: $showFeed) {
                    Text("Bandeja").tag(false)
                    Text("Actividad").tag(true)
                }
                .pickerStyle(.segmented)
                .listRowInsets(EdgeInsets())
            }
            if !showFeed {
                Section {
                    Picker("Categoría", selection: $categoryFilter) {
                        ForEach(NotifCategoryFilter.allCases) { f in
                            Text(f.title).tag(f)
                        }
                    }
                    .pickerStyle(.segmented)
                    .listRowInsets(EdgeInsets())
                }
            }
            if let message {
                Section {
                    NxIconText(systemName: "checkmark.circle.fill", text: message, tint: NxTone.success.fg)
                        .font(.footnote)
                }
            }
            if let error {
                Section {
                    NxStaleBanner(message: error) {
                        Task { if showFeed { await loadFeed() } else { await load() } }
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            }
            if isLoading && rows.isEmpty && !showFeed {
                Section {
                    NxLoadingState(text: "Cargando notificaciones…")
                }
            } else if showFeed {
                if feedItems.isEmpty && error == nil {
                    Section {
                        ContentUnavailableView(
                            "Sin actividad reciente",
                            systemImage: "clock.arrow.circlepath",
                            description: Text("Aquí verás lo último que pasó en tus actividades.")
                        )
                    }
                } else {
                    Section("Actividad reciente") {
                        ForEach(feedItems.indices, id: \.self) { idx in
                            let item = feedItems[idx]
                            VStack(alignment: .leading, spacing: 4) {
                                Text(ConsoleHelpers.mapStr(item, "title").isEmpty ? "Evento" : ConsoleHelpers.mapStr(item, "title"))
                                    .font(.subheadline.bold())
                                let sub = ConsoleHelpers.mapStr(item, "subtitle")
                                if !sub.isEmpty { Text(sub).font(.caption).foregroundColor(.secondary) }
                            }
                        }
                    }
                }
            } else if rows.isEmpty && error == nil {
                Section {
                    ContentUnavailableView(
                        "Estás al día",
                        systemImage: "bell.badge",
                        description: Text("No tienes notificaciones.")
                    )
                }
            } else {
                Section(unread == 0 ? "Todo leído" : (unread == 1 ? "1 sin leer" : "\(unread) sin leer")) {
                    if filteredRows.isEmpty {
                        Text("Sin notificaciones en esta categoría").foregroundStyle(.secondary)
                    }
                    ForEach(filteredRows, id: \.notifKey) { n in
                        notificationRow(n)
                            .contentShape(Rectangle())
                            .onTapGesture { open(n) }
                            .accessibilityAddTraits(.isButton)
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
                                    .tint(NxBrand.primary)
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
                Button("Cerrar", action: onBack)
            }
            ToolbarItemGroup(placement: .navigationBarTrailing) {
                Button { Task { await load() } } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .accessibilityLabel("Actualizar")
                if unread > 0 {
                    Button("Leer todo") { Task { await markAll() } }
                        .disabled(saving)
                }
            }
        }
        .refreshable {
            if showFeed { await loadFeed() } else { await load() }
            await NotificationsBadgeStore.shared.refresh()
        }
        .task {
            await load()
            await NotificationsBadgeStore.shared.refresh()
        }
        .onChange(of: showFeed) { _, newValue in
            if newValue { Task { await loadFeed() } }
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
        let symbol = NotificationIcon.symbol(for: n)
        HStack(alignment: .top, spacing: 12) {
            NxIconBadge(systemName: symbol, tint: NotificationIcon.tint(forSymbol: symbol), size: 38, circle: true)
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
                        Text(NotifCategoryFilter.label(category)).font(.caption2)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Color(.tertiarySystemFill))
                            .clipShape(Capsule())
                    }
                    if ConsoleHelpers.mapStr(n, "priority").lowercased() == "high" {
                        NxStatusChip(text: "Urgente", tone: .danger)
                    }
                }
                .font(.caption2)
                .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
        .listRowBackground(isRead ? Color.clear : Color.accentColor.opacity(0.06))
    }

    /// Toque: abre la pantalla nativa (misma resolución que el push:
    /// relatedUrl → entityType + relatedEntityId → category).
    @MainActor
    private func open(_ n: [String: Any]) {
        if (n["isRead"] as? Bool) != true {
            Task { await markRead(n) }
        }
        guard let destination = NotificationDeepLinkResolver.resolve(notification: n) else { return }
        onBack()
        DeepLinkCoordinator.shared.ingest(destination: destination)
    }

    private func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            rows = try await NotificationsRepository.shared.list(limit: 50)
        } catch {
            self.error = error.toUserMessage()
        }
    }

    private func loadFeed() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            feedItems = try await NotificationsRepository.shared.activityFeed(limit: 40)
        } catch {
            self.error = error.toUserMessage()
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
            self.error = error.toUserMessage()
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
            self.error = error.toUserMessage()
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
            self.error = error.toUserMessage()
        }
    }

    private func timeAgo(_ iso: String) -> String {
        guard !iso.isEmpty else { return "" }
        guard let date = NxFormat.parseISO(iso) else { return iso.prefix(16).description }
        let m = Int(Date().timeIntervalSince(date) / 60)
        if m < 1 { return "Hace un momento" }
        if m < 60 { return "Hace \(m) min" }
        let h = m / 60
        if h < 24 { return "Hace \(h) h" }
        let d = h / 24
        if d < 7 { return d == 1 ? "Ayer" : "Hace \(d) días" }
        return NxFormat.day(date)
    }
}

/// Filtros del centro de notificaciones — `CategoryFilter`, `bucketCategory`
/// y `CATEGORY_LABEL` de `apps/web/app/(panels)/erp/notifications-center`.
private enum NotifCategoryFilter: String, CaseIterable, Identifiable {
    case all, ops, attendance, chat, other

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: return "Todas"
        case .ops: return "Actividades"
        case .attendance: return "Asistencia"
        case .chat: return "Chat"
        case .other: return "Otras"
        }
    }

    static func bucket(_ category: String) -> NotifCategoryFilter {
        let c = category.lowercased()
        if c.contains("sla") || c.hasPrefix("activit") || c.hasPrefix("evidence")
            || c == "approval" || c == "confirmations" || c == "erp" {
            return .ops
        }
        if c == "attendance" || c.hasPrefix("lunch") { return .attendance }
        if c == "chat" { return .chat }
        return .other
    }

    static func label(_ category: String) -> String {
        switch category.lowercased() {
        case "attendance": return "Asistencia"
        case "lunch_break", "lunch_breaks": return "Comida"
        case "activity", "activities": return "Actividad"
        case "approval": return "Aprobación"
        case "evidence", "evidences": return "Evidencias"
        case "sla-alert", "sla-breach": return "Atraso"
        case "chat": return "Chat"
        case "profile": return "Perfil"
        case "confirmations": return "Confirmación"
        default: return category
        }
    }
}

extension [String: Any] {
    fileprivate var notifKey: String { "n-\(self["id"] ?? UUID().uuidString)" }
}
