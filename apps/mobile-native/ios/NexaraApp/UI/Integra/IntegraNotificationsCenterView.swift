import SwiftUI

/// Centro de notificaciones INTEGRA-specific.
/// Web redirects `/integra/notifications-center` → ERP inbox; here we keep
/// integra pulse (open alarms / push stats) plus a shared-style inbox stub.
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
            } else if let errorText, items.isEmpty && tab == .inbox {
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
                NxEmptyState(title: "Sin notificaciones", subtitle: "La bandeja está vacía.")
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
        defer { isLoading = false }
        do {
            items = try await IntegraGovernanceDataStub.notifications()
            let stats = try await IntegraGovernanceDataStub.pushEventStats()
            openAlarms = stats.openAlarms
            eventsToday = stats.eventsToday
        } catch {
            errorText = error.localizedDescription
        }
    }
}
