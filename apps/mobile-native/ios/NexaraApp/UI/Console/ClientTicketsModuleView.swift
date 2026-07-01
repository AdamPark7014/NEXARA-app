import SwiftUI

/// Bandeja de tickets de clientes — paridad web `/ops/support`.
struct ClientTicketsModuleView: View {
    @State private var items: [[String: Any]] = []
    @State private var query = ""
    @State private var statusFilter = "todos"
    @State private var isLoading = true
    @State private var message: String?
    @State private var actingId: Int64?
    @State private var selected: [String: Any]?

    private let statuses = ["todos", "NEW", "ASSIGNED", "CLOSED", "APPROVED", "REJECTED"]

    private var filtered: [[String: Any]] {
        var list = items
        if !query.isEmpty {
            let q = query.lowercased()
            list = list.filter {
                opsStr($0, "description", "title").lowercased().contains(q) ||
                opsStr($0, "branchName", "clientName").lowercased().contains(q)
            }
        }
        return list
    }

    private var kpiNew: Int { items.filter { opsStr($0, "status").uppercased() == "NEW" }.count }
    private var kpiAssigned: Int { items.filter { opsStr($0, "status").uppercased() == "ASSIGNED" }.count }

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
                    ForEach(filtered.prefix(80), id: \.opsId) { t in
                        Button { selected = t } label: { ticketCard(t) }
                            .buttonStyle(.plain)
                            .padding(.horizontal)
                    }
                }
            }
            .padding(.vertical)
        }
    }

    private func ticketCard(_ t: [String: Any]) -> some View {
        let urgency = opsStr(t, "urgency").uppercased()
        let status = opsStr(t, "status")
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(opsStr(t, "description", "title").prefix(120).description)
                    .font(.subheadline).bold().multilineTextAlignment(.leading)
                Spacer()
                Text(status).font(.caption2).bold()
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(opsStatusColor(status).opacity(0.15))
                    .foregroundColor(opsStatusColor(status))
                    .clipShape(Capsule())
            }
            HStack {
                if !opsStr(t, "branchName").isEmpty {
                    Label(opsStr(t, "branchName"), systemImage: "building.2").font(.caption).foregroundColor(.secondary)
                }
                Spacer()
                if urgency == "HIGH" {
                    Text("ALTA").font(.caption2).bold().foregroundColor(.red)
                }
            }
            Text(String(opsStr(t, "createdAt").prefix(16))).font(.caption2).foregroundColor(.secondary)
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func detailView(_ t: [String: Any]) -> some View {
        let id = ConsoleHelpers.mapInt64(t, "id")
        let status = opsStr(t, "status")
        return List {
            Section("Solicitud") {
                row("Descripción", opsStr(t, "description"))
                row("Tipo", opsStr(t, "requestType"))
                row("Urgencia", opsStr(t, "urgency"))
                row("Estado", status)
                row("Sucursal", opsStr(t, "branchName"))
                row("Cliente", opsStr(t, "clientName", "client", "name"))
                row("Creado", opsStr(t, "createdAt"))
            }
            if let id {
                Section("Acciones") {
                    if status.uppercased() == "NEW" {
                        actionButton("Marcar asignado", id: id, status: "ASSIGNED")
                    }
                    if status.uppercased() != "CLOSED" {
                        actionButton("Cerrar", id: id, status: "CLOSED")
                    }
                    if ["NEW", "ASSIGNED"].contains(status.uppercased()) {
                        actionButton("Aprobar", id: id, status: "APPROVED")
                        actionButton("Rechazar", id: id, status: "REJECTED", destructive: true)
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
        items = (try? await OpsRepository.shared.clientTicketRequests(status: st)) ?? []
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

private func opsStr(_ m: [String: Any], _ keys: String...) -> String {
    for k in keys {
        if let v = m[k] {
            let s: String
            if let ss = v as? String { s = ss }
            else if let n = v as? NSNumber { s = n.stringValue }
            else if let client = v as? [String: Any] { return opsStr(client, "name", "nombre") }
            else { s = String(describing: v) }
            if !s.isEmpty && s != "null" { return s }
        }
    }
    return ""
}

private func opsStatusColor(_ status: String) -> Color {
    switch status.uppercased() {
    case "CLOSED", "APPROVED": return .green
    case "REJECTED": return .red
    case "ASSIGNED": return .blue
    default: return .orange
    }
}

extension [String: Any] {
    fileprivate var opsId: String { "ct-\(self["id"] ?? UUID().uuidString)" }
}
