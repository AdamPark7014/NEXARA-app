import SwiftUI

// MARK: – ViewModel

@MainActor
final class InvoicesVM: ObservableObject {
    @Published var items: [[String: Any]] = []
    @Published var query        = ""
    @Published var statusFilter = "todos"
    @Published var isLoading    = false
    @Published var acting = false
    @Published var message: String?
    @Published var detail: [String: Any] = [:]

    let statuses = ["todos", "pagada", "pendiente", "cancelada", "vencida"]

    var canManage: Bool {
        let u = SessionStore.shared.currentUser
        if u?.isSuperAdmin == true { return true }
        let perms = u?.permissions ?? []
        return perms.contains { $0.contains("invoicing.manage") || $0.contains("contabilidad.manage") || $0.contains("console.admin") }
    }

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

    func loadDetail(id: Int64) {
        Task { detail = await ExtraRepository.shared.invoiceDetail(id: id) }
    }

    func registerPayment(id: Int64, amount: Double, method: String?, reference: String?) async -> Bool {
        acting = true; message = nil
        defer { acting = false }
        do {
            let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"
            try await ExtraRepository.shared.registerInvoicePayment(
                id: id,
                amount: amount,
                paymentDate: df.string(from: Date()),
                method: method,
                reference: reference
            )
            message = "✅ Pago registrado"
            load()
            loadDetail(id: id)
            return true
        } catch {
            message = "❌ \(error.localizedDescription)"
            return false
        }
    }

    func evaluateMatch(id: Int64) async {
        acting = true; message = nil
        defer { acting = false }
        do {
            let result = try await ExtraRepository.shared.evaluateInvoiceMatch(id: id)
            let status = invStr(result, "matchStatus", "status")
            message = "✅ 3-way match: \(status.isEmpty ? "evaluado" : status)"
            loadDetail(id: id)
        } catch {
            message = "❌ \(error.localizedDescription)"
        }
    }
}

// MARK: – View

struct InvoicesView: View {
    @StateObject private var vm = InvoicesVM()
    @State private var selected: [String: Any]?
    @State private var payAmount = ""
    @State private var payMethod = "TRANSFERENCIA"
    @State private var payRef = ""

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
        let id = ConsoleHelpers.mapInt64(inv, "id")
        let merged = vm.detail.isEmpty ? inv : vm.detail.merging(inv) { new, _ in new }
        let pdfUrl = invStr(merged, "pdfUrl")
        let matchStatus = invStr(merged, "matchStatus", "threeWayMatchStatus")
        let pending = status.lowercased().contains("pendiente")
            || status.lowercased().contains("parcial")
            || status.lowercased().contains("open")
            || status.lowercased().contains("posted")
        List {
            Section {
                HStack {
                    Button("← Facturas") { selected = nil; payAmount = ""; payRef = ""; vm.message = nil }
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
                iRow("Cliente",  invStr(merged, "clientName", "cliente"))
                if let t = invDouble(merged, "total", "amount") {
                    HStack { Text("Total"); Spacer(); Text(fmtInv(t)).foregroundColor(.secondary) }
                }
                if let bal = invDouble(merged, "balance", "amountDue") {
                    HStack { Text("Saldo"); Spacer(); Text(fmtInv(bal)).foregroundColor(.orange) }
                }
                iRow("RFC",      invStr(merged, "rfc", "taxId"))
                iRow("Fecha",    String(invStr(merged, "createdAt", "issuedAt", "issueDate", "fecha").prefix(10)))
                iRow("Vence",    String(invStr(merged, "dueDate", "fechaVencimiento").prefix(10)))
                iRow("3-way match", matchStatus)
            }
            if !pdfUrl.isEmpty {
                Section {
                    if let url = URL(string: pdfUrl) {
                        Link("Abrir PDF", destination: url)
                    }
                }
            }
            if vm.canManage, let id {
                Section("Acciones") {
                    Button(vm.acting ? "…" : "Evaluar 3-way match") {
                        Task { await vm.evaluateMatch(id: id) }
                    }
                    .disabled(vm.acting)
                    if pending {
                        TextField("Monto pago", text: $payAmount).keyboardType(.decimalPad)
                        TextField("Método", text: $payMethod)
                        TextField("Referencia", text: $payRef)
                        Button(vm.acting ? "…" : "Registrar pago") {
                            Task {
                                guard let amt = Double(payAmount), amt > 0 else {
                                    vm.message = "❌ Monto inválido"; return
                                }
                                let ok = await vm.registerPayment(
                                    id: id, amount: amt,
                                    method: payMethod.isEmpty ? nil : payMethod,
                                    reference: payRef.isEmpty ? nil : payRef
                                )
                                if ok { payAmount = ""; payRef = "" }
                            }
                        }
                        .disabled(vm.acting)
                    }
                }
            }
            if let msg = vm.message {
                Section { Text(msg).foregroundColor(msg.hasPrefix("✅") ? .green : .red) }
            }
            let notes = invStr(merged, "notes", "notas", "description")
            if !notes.isEmpty { Section("Notas") { Text(notes).font(.subheadline) } }
        }
        .listStyle(.insetGrouped)
        .task {
            if let id { vm.loadDetail(id: id) }
        }
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
