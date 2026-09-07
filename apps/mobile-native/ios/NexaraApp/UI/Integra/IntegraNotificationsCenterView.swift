import SwiftUI

/// Centro de notificaciones INTEGRA.
/// Bandeja = ERP `NotificationsRepository` (no hay inbox INTEGRA propio).
/// Pulso = alarmas abiertas + push stats del sitio.
struct IntegraNotificationsCenterView: View {
    var onOpenAlarms: (() -> Void)? = nil

    enum Tab: String, CaseIterable {
        case inbox = "Bandeja"
        case pulse = "Pulso ACS"
    }

    @State private var tab: Tab = .inbox
    @State private var items: [IntegraNotificationRow] = []
    @State private var openAlarms: Int?
    @State private var eventsToday: Int?
    @State private var isLoading = true
    @State private var errorText: String?
    @State private var inboxHonestEmpty = false

    var body: some View {
        VStack(spacing: 0) {
            Picker("Tab", selection: $tab) {
                ForEach(Tab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(12)

            if isLoading {
                ProgressView("Cargando…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorText, items.isEmpty && tab == .inbox && !inboxHonestEmpty {
                Text(errorText).foregroundStyle(.secondary).padding()
            } else {
                switch tab {
                case .inbox: inboxList
                case .pulse: pulseBody
                }
            }
        }
        .navigationTitle("Centro de notificaciones")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private var inboxList: some View {
        List {
            Section {
                Text(
                    "La bandeja es la misma que ERP. Ack/cierre de alarmas vive en el módulo Alarmas, no aquí."
                )
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            if items.isEmpty {
                NxEmptyState(
                    title: "Sin notificaciones",
                    subtitle: inboxHonestEmpty
                        ? "La bandeja ERP está vacía (o no hay API de inbox)."
                        : "La bandeja está vacía."
                )
            } else {
                ForEach(items) { n in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(n.title).font(.headline)
                            if !n.read {
                                NxStatusChip(text: "Nueva", tone: .info)
                            }
                        }
                        if let body = n.body {
                            Text(body).font(.caption).foregroundStyle(.secondary)
                        }
                        if let created = n.createdAt {
                            Text(created).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private var pulseBody: some View {
        List {
            Section("Pulso de terminales") {
                NxKpiGrid(items: [
                    NxKpi(
                        label: "Alarmas abiertas",
                        value: openAlarms.map(String.init) ?? "—",
                        hint: openAlarms == nil ? "Endpoint sin respuesta" : "No inventado",
                        tone: (openAlarms ?? 0) > 0 ? .warning : .success
                    ),
                    NxKpi(
                        label: "Eventos hoy",
                        value: eventsToday.map(String.init) ?? "—",
                        hint: eventsToday == nil ? "Sin stats" : nil,
                        tone: .brand
                    ),
                ])
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
            if let onOpenAlarms {
                Section {
                    Button("Ir a cola de alarmas", action: onOpenAlarms)
                }
            }
        }
    }

    private func reload() async {
        isLoading = true
        errorText = nil
        inboxHonestEmpty = false
        defer { isLoading = false }

        do {
            let rows = try await NotificationsRepository.shared.list(limit: 50)
            items = rows.enumerated().map { i, m in
                let id: String = {
                    if let n = m["id"] as? Int { return String(n) }
                    if let n = m["id"] as? Int64 { return String(n) }
                    if let s = m["id"] as? String { return s }
                    return "\(i)"
                }()
                IntegraNotificationRow(
                    id: id,
                    title: (m["title"] as? String)
                        ?? (m["subject"] as? String)
                        ?? "Notificación",
                    body: (m["body"] as? String) ?? (m["message"] as? String),
                    createdAt: (m["createdAt"] as? String) ?? (m["at"] as? String),
                    read: (m["read"] as? Bool) ?? (m["isRead"] as? Bool) ?? true
                )
            }
            if items.isEmpty { inboxHonestEmpty = true }
        } catch {
            // Honest empty when shared inbox API absent — do not invent rows.
            items = []
            inboxHonestEmpty = true
            errorText = nil
        }

        if let stats = try? await IntegraGovernanceRepository.shared.pushEventStats() {
            eventsToday = stats.integraInt("today", "count", "eventsToday")
        } else {
            eventsToday = nil
        }
        if let q = try? await IntegraRepository.shared.alarmQueue(hours: 24) {
            openAlarms = q.openCount
        } else {
            openAlarms = nil
        }
    }
}
