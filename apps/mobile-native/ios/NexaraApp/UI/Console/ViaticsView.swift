import SwiftUI

// MARK: – ViewModel

@MainActor
final class ViaticsVM: ObservableObject {
    @Published var items: [[String: Any]] = []
    @Published var query        = ""
    @Published var statusFilter = "todos"
    @Published var isLoading    = false

    let statuses = ["todos", "pendiente", "aprobado", "rechazado", "pagado"]

    var filtered: [[String: Any]] {
        var list = items
        if statusFilter != "todos" {
            list = list.filter { vStr($0, "status", "estatus", "estado").lowercased() == statusFilter }
        }
        if !query.isEmpty {
            let q = query.lowercased()
            list = list.filter { row in
                vStr(row, "concepto", "descripcion", "motivo").lowercased().contains(q) ||
                vStr(row, "usuario", "userName", "nombre").lowercased().contains(q)
            }
        }
        return list
    }

    var totalAmount: Double {
        items.reduce(0.0) { $0 + (vDouble($1, "amount", "monto", "total") ?? 0) }
    }

    var pendingCount: Int {
        items.filter { vStr($0, "status", "estatus").lowercased() == "pendiente" }.count
    }

    func load(personalOnly: Bool = false) {
        isLoading = true
        Task {
            let all = (try? await ConsoleRepository.shared.viatics()) ?? await ExtraRepository.shared.viatics()
            if personalOnly, let uid = SessionStore.shared.currentUser?.id {
                items = all.filter { row in
                    if let usuario = row["usuario"] as? [String: Any], let id = usuario["id"] {
                        return String(describing: id) == uid
                    }
                    return vStr(row, "usuarioId", "userId", "usuario") == uid
                }
            } else {
                items = all
            }
            isLoading = false
        }
    }
}

// MARK: – View

struct ViaticsView: View {
    var personalOnly: Bool = false
    @StateObject private var vm = ViaticsVM()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                // KPI strip
                if !vm.items.isEmpty {
                    HStack(spacing: 0) {
                        ViatKpi(label: "Total",     value: "\(vm.items.count)",  color: .primary)
                        Divider().frame(height: 36)
                        ViatKpi(label: "Pendientes",value: "\(vm.pendingCount)", color: .orange)
                        Divider().frame(height: 36)
                        ViatKpi(label: "Monto",     value: fmtMxnV(vm.totalAmount), color: .teal)
                    }
                    .padding(.horizontal).padding(.vertical, 6)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
                }

                // Search
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Buscar viático…", text: $vm.query).autocorrectionDisabled()
                    if !vm.query.isEmpty {
                        Button { vm.query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundColor(.secondary) }
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
                            let sel = vm.statusFilter == s
                            Button { vm.statusFilter = s } label: {
                                Text(s.capitalized).font(.caption).bold()
                                    .padding(.horizontal, 12).padding(.vertical, 6)
                                    .background(sel ? Color.teal : Color(.secondarySystemGroupedBackground))
                                    .foregroundColor(sel ? .white : .primary)
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
                    Text("Sin viáticos").foregroundColor(.secondary)
                        .frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    VStack(spacing: 6) {
                        ForEach(vm.filtered.prefix(50), id: \.viatId) { viat in
                            ViaticCard(item: viat)
                                .padding(.horizontal)
                        }
                    }
                }

                Spacer(minLength: 24)
            }
            .padding(.vertical)
        }
        .navigationTitle(personalOnly ? "Mis viáticos" : "Viáticos")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { vm.load(personalOnly: personalOnly) } label: { Image(systemName: "arrow.clockwise") }
            }
        }
        .refreshable { vm.load(personalOnly: personalOnly) }
        .task { vm.load(personalOnly: personalOnly) }
    }
}

// MARK: – Card

private struct ViaticCard: View {
    let item: [String: Any]
    var body: some View {
        let concept = vStr(item, "concepto", "descripcion", "motivo")
        let user    = vStr(item, "usuario", "userName", "nombre")
        let status  = vStr(item, "status", "estatus", "estado")
        let amount  = vDouble(item, "amount", "monto", "total")
        let date    = String(vStr(item, "createdAt", "fecha").prefix(10))
        let color   = viatStatusColor(status)

        HStack(spacing: 0) {
            Rectangle().fill(color).frame(width: 4)
                .clipShape(RoundedRectangle(cornerRadius: 2))
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(concept.isEmpty ? "Sin concepto" : concept)
                        .font(.subheadline).bold().lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
                    if let a = amount {
                        Text(fmtMxnV(a)).font(.subheadline).bold().foregroundColor(color)
                    }
                }
                if !user.isEmpty {
                    Label(user, systemImage: "person").font(.caption).foregroundColor(.secondary)
                }
                HStack {
                    Text(status.capitalized).font(.caption2).bold().foregroundColor(color)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(color.opacity(0.13)).clipShape(Capsule())
                    Spacer()
                    if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
                }
            }
            .padding(.horizontal, 10).padding(.vertical, 8)
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: – Helpers

private struct ViatKpi: View {
    let label: String; let value: String; let color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).bold().foregroundColor(color)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 4)
    }
}

private func vStr(_ m: [String: Any], _ keys: String...) -> String {
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

private func vDouble(_ m: [String: Any], _ keys: String...) -> Double? {
    for k in keys {
        if let v = m[k] {
            if let d = v as? Double { return d }
            if let n = v as? NSNumber { return n.doubleValue }
            if let s = v as? String, let d = Double(s) { return d }
        }
    }
    return nil
}

private func fmtMxnV(_ v: Double) -> String {
    if v >= 1_000_000 { return String(format: "$%.1fM", v / 1_000_000) }
    if v >= 1_000     { return String(format: "$%.1fK", v / 1_000) }
    let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = "MXN"; f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: v)) ?? "$\(Int(v))"
}

private func viatStatusColor(_ status: String) -> Color {
    switch status.lowercased() {
    case "aprobado", "pagado", "completado": return .green
    case "pendiente": return .orange
    case "rechazado", "cancelado": return .red
    default: return .secondary
    }
}

extension [String: Any] {
    fileprivate var viatId: String {
        if let n = self["id"] as? Int { return "viat-\(n)" }
        if let s = self["id"] as? String { return "viat-\(s)" }
        return UUID().uuidString
    }
}
