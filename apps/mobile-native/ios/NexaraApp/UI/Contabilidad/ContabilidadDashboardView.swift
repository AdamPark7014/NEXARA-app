import SwiftUI

// MARK: – ViewModel

@MainActor
final class ContabilidadDashboardVM: ObservableObject {
    @Published var invoices:     [[String: Any]] = []
    @Published var expenses:     [[String: Any]] = []
    @Published var bankAccounts: [[String: Any]] = []
    @Published var isLoading = false
    @Published var error: String?

    func load() {
        isLoading = true; error = nil
        Task {
            async let inv  = ExtraRepository.shared.invoices()
            async let exp  = ExtraRepository.shared.expenses()
            async let bank = ExtraRepository.shared.bankAccounts()
            let (i, e, b) = await (inv, exp, bank)
            invoices     = i
            expenses     = e
            bankAccounts = b
            isLoading    = false
        }
    }
}

// MARK: – View

struct ContabilidadDashboardView: View {
    @StateObject private var vm = ContabilidadDashboardVM()

    var body: some View {
        Group {
            if vm.isLoading && vm.invoices.isEmpty {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            } else if let err = vm.error {
                VStack(spacing: 12) {
                    Text("No se pudo cargar").font(.headline)
                    Text(err).font(.footnote).foregroundColor(.secondary)
                    Button("Reintentar") { vm.load() }.buttonStyle(.bordered)
                }.padding()
            } else {
                content
            }
        }
        .navigationTitle("Dashboard Contabilidad")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { vm.load() } label: { Image(systemName: "arrow.clockwise") }
            }
        }
        .refreshable { vm.load() }
        .task { vm.load() }
    }

    private var content: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                kpiSection
                bankSection
                invoiceSection
                expenseSection
                Spacer(minLength: 24)
            }
            .padding(.vertical)
        }
    }

    // ── KPIs
    private var kpiSection: some View {
        let invTotal  = vm.invoices.compactMap { cfDouble($0, "total") }.reduce(0, +)
        let invPaid   = vm.invoices.filter { cfStr($0, "status").localizedLowercase.contains("pagad") || cfStr($0, "status").localizedLowercase.contains("cobrad") }.count
        let expTotal  = vm.expenses.compactMap { cfDouble($0, "monto") }.reduce(0, +)
        let balance   = vm.bankAccounts.compactMap { cfDouble($0, "balance", "saldo") }.reduce(0, +)

        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            CfKpi(icon: "🧾", label: "Facturación", value: fmtMxn(invTotal), sub: "\(invPaid) cobradas", accent: .teal)
            CfKpi(icon: "📊", label: "Gastos", value: fmtMxn(expTotal), sub: "\(vm.expenses.count) registros", accent: .orange)
            CfKpi(icon: "🏦", label: "Saldo bancario", value: fmtMxn(balance), sub: "\(vm.bankAccounts.count) cuentas", accent: .green)
            CfKpi(icon: "📋", label: "Facturas", value: "\(vm.invoices.count)", sub: "\(vm.invoices.filter { cfStr($0, "status").localizedLowercase.contains("pendiente") }.count) pendientes", accent: .blue)
        }
        .padding(.horizontal)
    }

    // ── Bank accounts
    @ViewBuilder
    private var bankSection: some View {
        if !vm.bankAccounts.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                CfSectionRow(title: "Cuentas bancarias", detail: "\(vm.bankAccounts.count) cuentas")
                    .padding(.horizontal)
                ForEach(vm.bankAccounts, id: \.cfId) { b in
                    BankRow(item: b).padding(.horizontal)
                }
            }
        }
    }

    // ── Invoices
    @ViewBuilder
    private var invoiceSection: some View {
        if !vm.invoices.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                CfSectionRow(title: "Facturas recientes", detail: "Últimas 8")
                    .padding(.horizontal)
                ForEach(vm.invoices.prefix(8), id: \.cfId) { inv in
                    InvoiceRow(item: inv).padding(.horizontal)
                }
            }
        }
    }

    // ── Expenses
    @ViewBuilder
    private var expenseSection: some View {
        if !vm.expenses.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                CfSectionRow(title: "Gastos recientes", detail: "Últimos 8")
                    .padding(.horizontal)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(vm.expenses.prefix(8), id: \.cfId) { e in
                            ExpenseCard(item: e)
                        }
                    }
                    .padding(.horizontal)
                }
            }
        }
    }
}

// MARK: – Subviews

private struct CfKpi: View {
    let icon: String; let label: String; let value: String; let sub: String; let accent: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(icon).font(.title3)
                Text(label).font(.caption).foregroundColor(accent).lineLimit(1)
            }
            Text(value).font(.title2).bold()
            Text(sub).font(.caption2).foregroundColor(.secondary).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(accent.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

private struct CfSectionRow: View {
    let title: String; let detail: String
    var body: some View {
        HStack {
            Text(title).font(.headline)
            Spacer()
            Text(detail).font(.caption).foregroundColor(.secondary)
        }
    }
}

private struct BankRow: View {
    let item: [String: Any]
    var body: some View {
        let name    = cfStr(item, "name", "nombre").ifBlank("Cuenta")
        let bank    = cfStr(item, "bank", "banco")
        let acct    = cfStr(item, "accountNumber", "numeroCuenta")
        let balance = cfDouble(item, "balance", "saldo") ?? 0
        let cur     = cfStr(item, "currency", "moneda")

        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.subheadline).bold()
                Text([bank, acct.isEmpty ? "" : "****\(acct.suffix(4))"].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundColor(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(fmtMxn(balance))
                    .font(.subheadline).bold()
                    .foregroundColor(balance >= 0 ? .green : .red)
                if !cur.isEmpty { Text(cur).font(.caption2).foregroundColor(.secondary) }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

private struct InvoiceRow: View {
    let item: [String: Any]
    var body: some View {
        let folio  = cfStr(item, "folio").ifBlank("Factura #\(cfStr(item, "id"))")
        let client = cfStr(item, "clientName", "cliente")
        let total  = cfDouble(item, "total") ?? 0
        let status = cfStr(item, "status", "estatus")
        let color  = invColor(status)

        HStack(spacing: 12) {
            Rectangle().fill(color).frame(width: 4)
                .clipShape(RoundedRectangle(cornerRadius: 2))
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(folio).font(.subheadline).bold().foregroundColor(.teal)
                    Spacer()
                    Text(fmtMxn(total)).font(.subheadline).bold()
                }
                HStack {
                    if !client.isEmpty { Text(client).font(.caption).foregroundColor(.secondary) }
                    Spacer()
                    if !status.isEmpty {
                        Text(status).font(.caption2).bold().foregroundColor(color)
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(color.opacity(0.12)).clipShape(Capsule())
                    }
                }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

private struct ExpenseCard: View {
    let item: [String: Any]
    var body: some View {
        let amount  = cfDouble(item, "monto", "amount") ?? 0
        let concept = cfStr(item, "concepto", "concept", "descripcion").ifBlank("Gasto")
        let status  = cfStr(item, "estatus", "status").ifBlank("–")
        VStack(alignment: .leading, spacing: 6) {
            Text("📊").font(.title2)
            Text(fmtMxn(amount)).font(.headline).bold()
            Text(concept).font(.caption).foregroundColor(.secondary).lineLimit(2)
            Text(status).font(.caption2).bold().foregroundColor(.orange)
                .padding(.horizontal, 7).padding(.vertical, 2)
                .background(Color.orange.opacity(0.12)).clipShape(Capsule())
        }
        .frame(width: 160)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

// MARK: – Helpers

private func cfStr(_ m: [String: Any], _ keys: String...) -> String {
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

private func cfDouble(_ m: [String: Any], _ keys: String...) -> Double? {
    for k in keys {
        if let v = m[k] {
            if let d = v as? Double { return d }
            if let n = v as? NSNumber { return n.doubleValue }
            if let s = v as? String, let d = Double(s) { return d }
        }
    }
    return nil
}

private func fmtMxn(_ v: Double) -> String {
    let n = NumberFormatter()
    n.numberStyle = .currency; n.currencySymbol = "$"; n.maximumFractionDigits = 0
    return n.string(from: NSNumber(value: v)) ?? "$\(Int(v))"
}

private func invColor(_ s: String) -> Color {
    let l = s.localizedLowercase
    if l.contains("pagad") || l.contains("cobrad") { return .green }
    if l.contains("pendiente") { return .orange }
    if l.contains("cancelad") { return .red }
    return .secondary
}

extension String {
    fileprivate func ifBlank(_ fallback: String) -> String { isEmpty ? fallback : self }
}

extension [String: Any] {
    fileprivate var cfId: String {
        if let n = self["id"] as? Int { return String(n) }
        if let s = self["id"] as? String { return s }
        return UUID().uuidString
    }
}
