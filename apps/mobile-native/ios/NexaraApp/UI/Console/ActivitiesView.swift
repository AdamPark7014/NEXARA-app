import SwiftUI

// MARK: – ViewModel

@MainActor
final class ActivitiesVM: ObservableObject {
    @Published var items: [[String: Any]] = []
    @Published var query        = ""
    @Published var statusFilter = "todos"
    @Published var isLoading    = false

    let statuses = ["todos", "pendiente", "en proceso", "completada", "cancelada"]

    var filtered: [[String: Any]] {
        var result = items
        if statusFilter != "todos" {
            result = result.filter { actStr($0, "status", "estatus", "estado").lowercased() == statusFilter }
        }
        if !query.isEmpty {
            let q = query.lowercased()
            result = result.filter { row in
                actStr(row, "titulo", "title", "descripcion").lowercased().contains(q) ||
                actStr(row, "clientName", "cliente").lowercased().contains(q) ||
                actStr(row, "responsable", "assignedTo").lowercased().contains(q)
            }
        }
        return result
    }

    var statusCounts: [String: Int] {
        Dictionary(grouping: items) { actStr($0, "status", "estatus", "estado").lowercased() }
            .mapValues(\.count)
    }

    func load() {
        isLoading = true
        Task {
            items     = await ExtraRepository.shared.activities()
            isLoading = false
        }
    }
}

// MARK: – View

struct ActivitiesView: View {
    @StateObject private var vm = ActivitiesVM()
    var filterForUserId: String? = nil

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                // KPI strip
                if !vm.items.isEmpty {
                    kpiStrip
                }

                // Search
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Buscar actividad…", text: $vm.query)
                        .autocorrectionDisabled()
                    if !vm.query.isEmpty {
                        Button { vm.query = "" } label: {
                            Image(systemName: "xmark.circle.fill").foregroundColor(.secondary)
                        }
                    }
                }
                .padding(10)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)

                // Status chips
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(vm.statuses, id: \.self) { s in
                            let isSelected = vm.statusFilter == s
                            Button { vm.statusFilter = s } label: {
                                Text(s.capitalized)
                                    .font(.caption).bold()
                                    .padding(.horizontal, 12).padding(.vertical, 6)
                                    .background(isSelected ? Color.teal : Color(.secondarySystemGroupedBackground))
                                    .foregroundColor(isSelected ? .white : .primary)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                    .padding(.horizontal)
                }

                // List
                if vm.isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if vm.filtered.isEmpty {
                    Text("Sin actividades").foregroundColor(.secondary)
                        .frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    VStack(spacing: 6) {
                        ForEach(vm.filtered.prefix(60), id: \.actId) { act in
                            ActivityCard(item: act)
                                .padding(.horizontal)
                        }
                    }
                }

                Spacer(minLength: 24)
            }
            .padding(.vertical)
        }
        .navigationTitle("Actividades")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { vm.load() } label: { Image(systemName: "arrow.clockwise") }
            }
        }
        .refreshable { vm.load() }
        .task {
            vm.load()
        }
    }

    // ── KPI strip
    private var kpiStrip: some View {
        let counts = vm.statusCounts
        let pending   = counts["pendiente"] ?? 0
        let inProcess = counts["en proceso"] ?? 0
        let done      = counts["completada"] ?? 0

        return HStack(spacing: 0) {
            ActKpi(label: "Total",      value: "\(vm.items.count)",  color: .primary)
            Divider().frame(height: 36)
            ActKpi(label: "Pendientes", value: "\(pending)",         color: .orange)
            Divider().frame(height: 36)
            ActKpi(label: "En proceso", value: "\(inProcess)",       color: .blue)
            Divider().frame(height: 36)
            ActKpi(label: "Completadas",value: "\(done)",            color: .green)
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }
}

// MARK: – Card

private struct ActivityCard: View {
    let item: [String: Any]
    var body: some View {
        let title      = actStr(item, "titulo", "title", "descripcion")
        let client     = actStr(item, "clientName", "cliente", "clienteNombre")
        let responsible= actStr(item, "responsable", "assignedTo", "asignadoNombre")
        let status     = actStr(item, "status", "estatus", "estado")
        let date       = String(actStr(item, "scheduledDate", "fechaProgramada", "createdAt").prefix(10))
        let priority   = actStr(item, "priority", "prioridad")
        let color      = actStatusColor(status)

        VStack(alignment: .leading, spacing: 0) {
            // Top bar
            HStack {
                Circle().fill(color).frame(width: 8, height: 8)
                Text(title.isEmpty ? "Sin título" : title)
                    .font(.subheadline).bold()
                    .lineLimit(2)
                Spacer()
                Text(status.capitalized)
                    .font(.caption2).bold()
                    .foregroundColor(color)
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(color.opacity(0.13))
                    .clipShape(Capsule())
            }
            .padding(.bottom, 6)

            if !client.isEmpty || !responsible.isEmpty {
                HStack(spacing: 12) {
                    if !client.isEmpty {
                        Label(client, systemImage: "building.2")
                            .font(.caption).foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                    if !responsible.isEmpty {
                        Label(responsible, systemImage: "person")
                            .font(.caption).foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                }
                .padding(.bottom, 4)
            }

            HStack {
                if !date.isEmpty {
                    Label(date, systemImage: "calendar")
                        .font(.caption2).foregroundColor(.secondary)
                }
                if !priority.isEmpty {
                    Spacer()
                    Text("Prioridad: \(priority.capitalized)")
                        .font(.caption2)
                        .foregroundColor(priority.lowercased() == "alta" ? .red : .secondary)
                }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: – Helpers

private struct ActKpi: View {
    let label: String; let value: String; let color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).bold().foregroundColor(color)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
    }
}

private func actStr(_ m: [String: Any], _ keys: String...) -> String {
    for k in keys {
        if let v = m[k] {
            let s: String
            if let ss = v as? String { s = ss }
            else if let dict = v as? [String: Any], let name = dict["nombre"] as? String { s = name }
            else if let n = v as? NSNumber { s = n.stringValue }
            else { s = String(describing: v) }
            if !s.isEmpty && s != "null" { return s }
        }
    }
    return ""
}

private func actStatusColor(_ status: String) -> Color {
    switch status.lowercased() {
    case "completada", "completado", "done", "closed": return .green
    case "pendiente", "pending": return .orange
    case "en proceso", "in_progress", "en progreso": return .blue
    case "cancelada", "cancelado", "cancelled": return .red
    default: return .secondary
    }
}

extension [String: Any] {
    fileprivate var actId: String {
        if let n = self["id"] as? Int { return "act-\(n)" }
        if let s = self["id"] as? String { return "act-\(s)" }
        return UUID().uuidString
    }
}
