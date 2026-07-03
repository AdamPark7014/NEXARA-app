import SwiftUI

// MARK: – ViewModel

@MainActor
final class InvoicesVM: ObservableObject {
    @Published var items: [[String: Any]] = []
    @Published var query        = ""
    @Published var statusFilter = "todos"
    @Published var isLoading    = false

    let statuses = ["todos", "pagada", "pendiente", "cancelada", "vencida"]

    var filtered: [[String: Any]] {
        var list = items
        if statusFilter != "todos" {
            list = list.filter { invStr($0, "status", "estatus").lowercased() == statusFilter }
        }
        if !query.isEmpty {
            let q = query.lowercased()
            list = list.filter { row in
                invStr(row, "folio", "invoiceNumber", "number").lowercased().contains(q) ||
                invStr(row, "clientName", "cliente").lowercased().contains(q)
            }
        }
        return list
    }

    var totalPaid:    Double { items.filter { invStr($0, "status","estatus").lowercased() == "pagada" }.reduce(0) { $0 + (invDouble($1, "total","amount") ?? 0) } }
    var totalPending: Double { items.filter { invStr($0, "status","estatus").lowercased() == "pendiente" }.reduce(0) { $0 + (invDouble($1, "total","amount") ?? 0) } }

    func load() {
        isLoading = true
        Task {
            items     = await ExtraRepository.shared.invoices()
            isLoading = false
        }
    }
}

// MARK: – View

struct InvoicesView: View {
    @StateObject private var vm = InvoicesVM()
    @State private var selected: [String: Any]?

    var body: some View {
        Group {
            if let s = selected { invDetail(s) } else { listBody }
        }
        .navigationTitle(selected == nil ? "Facturación" : "")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if selected == nil { Button { vm.load() } label: { Image(systemName: "arrow.clockwise") } }
            }
        }
        .refreshable { if selected == nil { vm.load() } }
        .task { vm.load() }
    }

    private var listBody: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if !vm.items.isEmpty {
                    HStack(spacing: 0) {
                        InvKpi(label: "Total",    value: "\(vm.items.count)",          color: .primary)
                        Divider().frame(height: 36)
                        InvKpi(label: "Pagadas",  value: fmtInv(vm.totalPaid),         color: .green)
                        Divider().frame(height: 36)
                        InvKpi(label: "Pendiente",value: fmtInv(vm.totalPending),      color: .orange)
                    }
                    .padding(.horizontal).padding(.vertical, 6)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
                }
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Buscar factura…", text: $vm.query).autocorrectionDisabled()
                    if !vm.query.isEmpty {
                        Button { vm.query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundColor(.secondary) }
                    }
                }
                .padding(10)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(vm.statuses, id: \.self) { s in
                            let sel = vm.statusFilter == s
                            Button { vm.statusFilter = s } label: {
                                Text(s.capitalized).font(.caption).bold()
                                    .padding(.horizontal, 12).padding(.vertical, 6)
                                    .background(sel ? Color.blue : Color(.secondarySystemGroupedBackground))
                                    .foregroundColor(sel ? .white : .primary)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                    .padding(.horizontal)
                }
                if vm.isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if vm.filtered.isEmpty {
                    Text("Sin facturas").foregroundColor(.secondary).frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    VStack(spacing: 6) {
                        ForEach(vm.filtered.prefix(50), id: \.invId) { inv in
                            Button { selected = inv } label: {
                                InvoiceCard(item: inv).padding(.horizontal)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                Spacer(minLength: 24)
            }
            .padding(.vertical)
        }
    }

    @ViewBuilder
    private func invDetail(_ inv: [String: Any]) -> some View {
        let folio  = invStr(inv, "folio", "invoiceNumber", "number")
        let status = invStr(inv, "status", "estatus")
        let color  = invStatusColor(status)
        List {
            Section {
                HStack {
                    Button("← Facturas") { selected = nil }
                    Spacer()
                    if !status.isEmpty {
                        Text(status.capitalized).font(.caption).bold().foregroundColor(color)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(color.opacity(0.12)).clipShape(Capsule())
                    }
                }
            }
            Section("Factura") {
                iRow("Folio",    folio)
                iRow("Cliente",  invStr(inv, "clientName", "cliente"))
                if let t = invDouble(inv, "total", "amount") {
                    HStack { Text("Total"); Spacer(); Text(fmtInv(t)).foregroundColor(.secondary) }
                }
                iRow("RFC",      invStr(inv, "rfc", "taxId"))
                iRow("Fecha",    String(invStr(inv, "createdAt", "issuedAt", "fecha").prefix(10)))
                iRow("Vence",    String(invStr(inv, "dueDate", "fechaVencimiento").prefix(10)))
                iRow("Método",   invStr(inv, "paymentMethod", "metodoPago"))
                iRow("CFDI",     invStr(inv, "cfdiUse", "usoCfdi"))
            }
            let notes = invStr(inv, "notes", "notas", "description")
            if !notes.isEmpty { Section("Notas") { Text(notes).font(.subheadline) } }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func iRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }
}

// MARK: – Card

private struct InvoiceCard: View {
    let item: [String: Any]
    var body: some View {
        let folio  = invStr(item, "folio", "invoiceNumber", "number")
        let client = invStr(item, "clientName", "cliente")
        let status = invStr(item, "status", "estatus")
        let total  = invDouble(item, "total", "amount")
        let date   = String(invStr(item, "createdAt", "issuedAt", "fecha").prefix(10))
        let color  = invStatusColor(status)

        HStack(spacing: 0) {
            Rectangle().fill(color).frame(width: 4).clipShape(RoundedRectangle(cornerRadius: 2))
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(folio.isEmpty ? "Sin folio" : folio).font(.subheadline).bold()
                        if !client.isEmpty { Text(client).font(.caption).foregroundColor(.secondary) }
                    }
                    Spacer()
                    if let t = total { Text(fmtInv(t)).font(.subheadline).bold() }
                }
                HStack {
                    Text(status.capitalized).font(.caption2).bold().foregroundColor(color)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(color.opacity(0.12)).clipShape(Capsule())
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

private struct InvKpi: View {
    let label: String; let value: String; let color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).bold().foregroundColor(color)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 4)
    }
}

private func invStr(_ m: [String: Any], _ keys: String...) -> String {
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

private func invDouble(_ m: [String: Any], _ keys: String...) -> Double? {
    for k in keys {
        if let v = m[k] {
            if let d = v as? Double { return d }
            if let n = v as? NSNumber { return n.doubleValue }
            if let s = v as? String, let d = Double(s) { return d }
        }
    }
    return nil
}

private func fmtInv(_ v: Double) -> String {
    if v >= 1_000_000 { return String(format: "$%.1fM", v / 1_000_000) }
    if v >= 1_000     { return String(format: "$%.0fK", v / 1_000) }
    let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = "MXN"; f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: v)) ?? "$\(Int(v))"
}

private func invStatusColor(_ status: String) -> Color {
    switch status.lowercased() {
    case "pagada", "pagado", "completada": return .green
    case "pendiente": return .orange
    case "vencida": return .red
    case "cancelada", "cancelado": return Color(.systemGray)
    default: return .secondary
    }
}

extension [String: Any] {
    fileprivate var invId: String {
        if let n = self["id"] as? Int { return "inv-\(n)" }
        if let s = self["id"] as? String { return "inv-\(s)" }
        return UUID().uuidString
    }
}
