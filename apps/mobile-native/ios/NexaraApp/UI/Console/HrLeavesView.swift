import SwiftUI

// MARK: – ViewModel

@MainActor
final class HrLeavesVM: ObservableObject {
    @Published var items: [[String: Any]] = []
    @Published var query        = ""
    @Published var typeFilter   = "todos"
    @Published var isLoading    = false

    var types: [String] {
        var t = Array(Set(items.compactMap { hrStr($0, "type", "tipo").ifBlankHr(nil) })).sorted()
        return ["todos"] + t
    }

    var filtered: [[String: Any]] {
        var list = items
        if typeFilter != "todos" {
            list = list.filter { hrStr($0, "type", "tipo").lowercased() == typeFilter.lowercased() }
        }
        if !query.isEmpty {
            let q = query.lowercased()
            list = list.filter { row in
                hrStr(row, "reason", "motivo", "type").lowercased().contains(q) ||
                hrStr(row, "userName", "employeeName", "nombre").lowercased().contains(q)
            }
        }
        return list
    }

    var pendingCount: Int { items.filter { hrStr($0, "status", "estado").lowercased() == "pendiente" }.count }
    var approvedCount: Int { items.filter { hrStr($0, "status", "estado").lowercased() == "aprobado" }.count }

    func load() {
        isLoading = true
        Task {
            items     = await ExtraRepository.shared.hrLeaves()
            isLoading = false
        }
    }
}

// MARK: – View

struct HrLeavesView: View {
    @StateObject private var vm = HrLeavesVM()
    @State private var selected: [String: Any]?

    var body: some View {
        Group {
            if let s = selected { leaveDetail(s) } else { leaveList }
        }
        .navigationTitle(selected == nil ? "RR. HH. · Permisos" : "")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { vm.load() } label: { Image(systemName: "arrow.clockwise") } } }
        .refreshable { if selected == nil { vm.load() } }
        .task { vm.load() }
    }

    @ViewBuilder
    private func leaveDetail(_ leave: [String: Any]) -> some View {
        let reason = hrStr(leave, "reason", "motivo", "type")
        let user   = hrStr(leave, "userName", "employeeName", "nombre")
        let status = hrStr(leave, "status", "estado")
        let color  = hrStatusColor(status)
        List {
            Section { Button("← Permisos") { selected = nil } }
            Section {
                HStack {
                    Text(reason.isEmpty ? hrStr(leave, "type", "tipo").capitalized : reason)
                        .font(.headline)
                    Spacer()
                    Text(status.capitalized).font(.caption).bold().foregroundColor(color)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(color.opacity(0.12)).clipShape(Capsule())
                }
            }
            Section("Detalles") {
                hrRow("Empleado",    user)
                hrRow("Tipo",        hrStr(leave, "type", "tipo").capitalized)
                hrRow("Inicio",      String(hrStr(leave, "startDate", "startAt").prefix(10)))
                hrRow("Fin",         String(hrStr(leave, "endDate", "endAt").prefix(10)))
                hrRow("Días",        hrStr(leave, "days", "diasSolicitados", "totalDays"))
                hrRow("Aprobado por", hrStr(leave, "approvedBy", "approverName", "aprobadoPor"))
            }
            let notes = hrStr(leave, "notes", "notas", "comments", "comentarios")
            if !notes.isEmpty {
                Section("Notas") { Text(notes).font(.footnote) }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(user.isEmpty ? "Permiso" : user)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private func hrRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value).multilineTextAlignment(.trailing) }
        }
    }

    private var leaveList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                // KPI strip
                if !vm.items.isEmpty {
                    HStack(spacing: 0) {
                        HrKpi(label: "Solicitudes",value: "\(vm.items.count)",     color: .primary)
                        Divider().frame(height: 36)
                        HrKpi(label: "Pendientes", value: "\(vm.pendingCount)",   color: .orange)
                        Divider().frame(height: 36)
                        HrKpi(label: "Aprobados",  value: "\(vm.approvedCount)",  color: .green)
                    }
                    .padding(.horizontal).padding(.vertical, 6)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
                }

                // Search
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Buscar permiso…", text: $vm.query).autocorrectionDisabled()
                    if !vm.query.isEmpty {
                        Button { vm.query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundColor(.secondary) }
                    }
                }
                .padding(10)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)

                // Type chips
                if vm.types.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(vm.types, id: \.self) { t in
                                let sel = vm.typeFilter == t
                                Button { vm.typeFilter = t } label: {
                                    Text(t.capitalized).font(.caption).bold()
                                        .padding(.horizontal, 12).padding(.vertical, 6)
                                        .background(sel ? Color.purple : Color(.secondarySystemGroupedBackground))
                                        .foregroundColor(sel ? .white : .primary)
                                        .clipShape(Capsule())
                                }
                            }
                        }
                        .padding(.horizontal)
                    }
                }

                // List
                if vm.isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if vm.filtered.isEmpty {
                    Text("Sin solicitudes").foregroundColor(.secondary).frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    VStack(spacing: 6) {
                        ForEach(vm.filtered.prefix(50), id: \.hrId) { leave in
                            Button { selected = leave } label: {
                                HrLeaveCard(item: leave)
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal)
                        }
                    }
                }
                Spacer(minLength: 24)
            }
            .padding(.vertical)
        }
    }
}

// MARK: – Card

private struct HrLeaveCard: View {
    let item: [String: Any]
    var body: some View {
        let reason  = hrStr(item, "reason", "motivo", "type")
        let user    = hrStr(item, "userName", "employeeName", "nombre")
        let status  = hrStr(item, "status", "estado")
        let type_   = hrStr(item, "type", "tipo")
        let startD  = String(hrStr(item, "startDate", "startAt", "createdAt").prefix(10))
        let endD    = String(hrStr(item, "endDate", "endAt").prefix(10))
        let color   = hrStatusColor(status)

        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(reason.isEmpty ? type_.capitalized : reason).font(.subheadline).bold().lineLimit(2)
                Spacer()
                Text(status.capitalized).font(.caption2).bold().foregroundColor(color)
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(color.opacity(0.12)).clipShape(Capsule())
            }
            if !user.isEmpty { Label(user, systemImage: "person").font(.caption).foregroundColor(.secondary) }
            HStack {
                if !type_.isEmpty {
                    Label(type_.capitalized, systemImage: "tag").font(.caption2).foregroundColor(.secondary)
                }
                Spacer()
                if !startD.isEmpty {
                    Text(endD.isEmpty ? startD : "\(startD) → \(endD)").font(.caption2).foregroundColor(.secondary)
                }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: – Helpers

private struct HrKpi: View {
    let label: String; let value: String; let color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).bold().foregroundColor(color)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 4)
    }
}

private func hrStr(_ m: [String: Any], _ keys: String...) -> String {
    for k in keys {
        if let v = m[k] {
            let s: String
            if let ss = v as? String { s = ss }
            else if let n = v as? NSNumber { s = n.stringValue }
            else { s = String(describing: v) }
            if !s.isEmpty && s != "null" { return s }
        }
    }
    return ""
}

private func hrStatusColor(_ status: String) -> Color {
    switch status.lowercased() {
    case "aprobado", "approved": return .green
    case "pendiente", "pending": return .orange
    case "rechazado", "rejected", "denied": return .red
    default: return .secondary
    }
}

extension String {
    fileprivate func ifBlankHr(_ fallback: String?) -> String? { isEmpty ? fallback : self }
}

extension [String: Any] {
    fileprivate var hrId: String {
        if let n = self["id"] as? Int { return "hr-\(n)" }
        if let s = self["id"] as? String { return "hr-\(s)" }
        return UUID().uuidString
    }
}
