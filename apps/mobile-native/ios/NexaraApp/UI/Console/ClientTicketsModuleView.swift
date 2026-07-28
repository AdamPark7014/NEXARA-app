import SwiftUI

/// Bandeja de tickets de clientes — paridad web `/ops/support`.
struct ClientTicketsModuleView: View {
    @State private var items: [ClientTicketRequest] = []
    @State private var query = ""
    @State private var statusFilter = "todos"
    @State private var isLoading = true
    @State private var message: String?
    @State private var actingId: Int64?
    @State private var selected: ClientTicketRequest?

    private let statuses = ["todos", "NEW", "ASSIGNED", "CLOSED", "APPROVED", "REJECTED"]

    private var filtered: [ClientTicketRequest] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            $0.displayTitle.lowercased().contains(q) ||
            $0.branchName.lowercased().contains(q) ||
            $0.clientName.lowercased().contains(q)
        }
    }

    private var kpiNew: Int { items.filter { $0.status.uppercased() == "NEW" }.count }
    private var kpiAssigned: Int { items.filter { $0.status.uppercased() == "ASSIGNED" }.count }

    var body: some View {
        Group {
            if let s = selected { detailView(s) } else { listBody }
        }
        .navigationTitle("Tickets de clientes")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private var listBody: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let message {
                    Text(message).font(.footnote).foregroundColor(message.contains("Error") ? .red : .green)
                        .padding(.horizontal)
                }
                if !items.isEmpty {
                    HStack(spacing: 0) {
                        opsKpi("Total", "\(items.count)", .primary)
                        Divider().frame(height: 36)
                        opsKpi("Nuevos", "\(kpiNew)", .orange)
                        Divider().frame(height: 36)
                        opsKpi("Asignados", "\(kpiAssigned)", .blue)
                    }
                    .padding(.horizontal).padding(.vertical, 6)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(statuses, id: \.self) { st in
                            let sel = statusFilter == st
                            Button {
                                statusFilter = st
                                Task { await reload() }
                            } label: {
                                Text(st == "todos" ? "Todos" : st)
                                    .font(.caption).bold()
                                    .padding(.horizontal, 12).padding(.vertical, 6)
                                    .background(sel ? Color.teal : Color(.secondarySystemGroupedBackground))
                                    .foregroundColor(sel ? .white : .primary)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                    .padding(.horizontal)
                }
                HStack {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Buscar ticket…", text: $query).autocorrectionDisabled()
                }
                .padding(10)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)

                if isLoading { ProgressView().frame(maxWidth: .infinity).padding(.top, 40) }
                else if filtered.isEmpty {
                    Text("Sin tickets").foregroundColor(.secondary).frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    ForEach(filtered.prefix(80)) { t in
                        Button { selected = t } label: { ticketCard(t) }
                            .buttonStyle(.plain)
                            .padding(.horizontal)
                    }
                }
            }
            .padding(.vertical)
        }
    }

    private func ticketCard(_ t: ClientTicketRequest) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(String(t.displayTitle.prefix(120)))
                    .font(.subheadline).bold().multilineTextAlignment(.leading)
                Spacer()
                Text(t.status).font(.caption2).bold()
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(opsStatusColor(t.status).opacity(0.15))
                    .foregroundColor(opsStatusColor(t.status))
                    .clipShape(Capsule())
            }
            HStack {
                if !t.branchName.isEmpty {
                    Label(t.branchName, systemImage: "building.2").font(.caption).foregroundColor(.secondary)
                }
                Spacer()
                if t.isHighUrgency {
                    Text("ALTA").font(.caption2).bold().foregroundColor(.red)
                }
            }
            Text(String(t.createdAt.prefix(16))).font(.caption2).foregroundColor(.secondary)
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func detailView(_ t: ClientTicketRequest) -> some View {
        let status = t.status.uppercased()
        return List {
            Section("Solicitud") {
                row("Descripción", t.displayTitle)
                row("Tipo", t.requestType)
                row("Urgencia", t.urgency)
                row("Estado", t.status)
                row("Sucursal", t.branchName)
                row("Cliente", t.clientName)
                row("Creado", t.createdAt)
            }
            if t.id > 0 {
                Section("Acciones") {
                    if status == "NEW" {
                        actionButton("Marcar asignado", id: t.id, status: "ASSIGNED")
                    }
                    if status != "CLOSED" {
                        actionButton("Cerrar", id: t.id, status: "CLOSED")
                    }
                    if ["NEW", "ASSIGNED"].contains(status) {
                        actionButton("Aprobar", id: t.id, status: "APPROVED")
                        actionButton("Rechazar", id: t.id, status: "REJECTED", destructive: true)
                    }
                }
            }
            Button("Volver") { selected = nil }
        }
    }

    private func actionButton(_ label: String, id: Int64, status: String, destructive: Bool = false) -> some View {
        Button(role: destructive ? .destructive : nil) {
            Task { await patch(id, status) }
        } label: {
            if actingId == id { ProgressView() } else { Text(label) }
        }
        .disabled(actingId != nil)
    }

    @ViewBuilder private func row(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary).multilineTextAlignment(.trailing) } }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        let st = statusFilter == "todos" ? nil : statusFilter
        items = (try? await OpsRepository.shared.clientTicketRequestItems(status: st)) ?? []
    }

    private func patch(_ id: Int64, _ status: String) async {
        actingId = id
        defer { actingId = nil }
        do {
            _ = try await OpsRepository.shared.patchClientTicketStatus(id: id, status: status)
            message = "Estado actualizado"
            selected = nil
            await reload()
        } catch {
            message = "Error: \(error.localizedDescription)"
        }
    }
}

private struct opsKpi: View {
    let label: String; let value: String; let color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).bold().foregroundColor(color)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

private func opsStatusColor(_ status: String) -> Color {
    switch status.uppercased() {
    case "CLOSED", "APPROVED": return .green
    case "REJECTED": return .red
    case "ASSIGNED": return .blue
    default: return .orange
    }
}
