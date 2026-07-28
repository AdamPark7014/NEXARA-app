import SwiftUI

// MARK: – ViewModel

@MainActor
final class ContabilidadDashboardVM: ObservableObject {
    @Published var invoices: [InvoiceItem] = []
    @Published var expenses: [ExpenseItem] = []
    @Published var bankAccounts: [BankAccountItem] = []
    @Published var isLoading = false
    @Published var error: String?

    func load() {
        isLoading = true; error = nil
        Task {
            async let inv = ExtraRepository.shared.invoiceItems()
            async let exp = ExtraRepository.shared.expenseItems()
            async let bank = ExtraRepository.shared.bankAccountItems()
            let (i, e, b) = await (inv, exp, bank)
            invoices = i
            expenses = e
            bankAccounts = b
            isLoading = false
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
                NxEmptyState(
                    title: "No se pudo cargar",
                    subtitle: err,
                    actionLabel: "Reintentar",
                    onAction: { vm.load() }
                )
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

    private var kpiSection: some View {
        let invTotal = vm.invoices.compactMap(\.total).reduce(0, +)
        let invPaid = vm.invoices.filter {
            $0.status.localizedLowercase.contains("pagad") || $0.status.localizedLowercase.contains("cobrad")
        }.count
        let expTotal = vm.expenses.reduce(0) { $0 + $1.amount }
        let balance = vm.bankAccounts.reduce(0) { $0 + $1.balance }
        let pending = vm.invoices.filter { $0.status.localizedLowercase.contains("pendiente") }.count

        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            CfKpi(icon: "doc.text", label: "Facturación", value: fmtMxn(invTotal), sub: "\(invPaid) cobradas", accent: .teal)
            CfKpi(icon: "chart.bar", label: "Gastos", value: fmtMxn(expTotal), sub: "\(vm.expenses.count) registros", accent: .orange)
            CfKpi(icon: "building.columns", label: "Saldo bancario", value: fmtMxn(balance), sub: "\(vm.bankAccounts.count) cuentas", accent: .green)
            CfKpi(icon: "list.bullet.rectangle", label: "Facturas", value: "\(vm.invoices.count)", sub: "\(pending) pendientes", accent: .blue)
        }
        .padding(.horizontal)
    }

    @ViewBuilder
    private var bankSection: some View {
        if !vm.bankAccounts.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                CfSectionRow(title: "Cuentas bancarias", detail: "\(vm.bankAccounts.count) cuentas")
                    .padding(.horizontal)
                ForEach(vm.bankAccounts) { b in
                    BankRow(item: b).padding(.horizontal)
                }
            }
        }
    }

    @ViewBuilder
    private var invoiceSection: some View {
        if !vm.invoices.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                CfSectionRow(title: "Facturas recientes", detail: "Últimas 8")
                    .padding(.horizontal)
                ForEach(vm.invoices.prefix(8)) { inv in
                    InvoiceRow(item: inv).padding(.horizontal)
                }
            }
        }
    }

    @ViewBuilder
    private var expenseSection: some View {
        if !vm.expenses.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                CfSectionRow(title: "Gastos recientes", detail: "Últimos 8")
                    .padding(.horizontal)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(vm.expenses.prefix(8)) { e in
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
                Image(systemName: icon).foregroundColor(accent)
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
    let item: BankAccountItem
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.displayName).font(.subheadline).bold()
                Text([item.bank, item.maskedNumber].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundColor(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(fmtMxn(item.balance))
                    .font(.subheadline).bold()
                    .foregroundColor(item.balance >= 0 ? .green : .red)
                if !item.currency.isEmpty { Text(item.currency).font(.caption2).foregroundColor(.secondary) }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

private struct InvoiceRow: View {
    let item: InvoiceItem
    var body: some View {
        let color = invColor(item.status)
        HStack(spacing: 12) {
            Rectangle().fill(color).frame(width: 4)
                .clipShape(RoundedRectangle(cornerRadius: 2))
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(item.displayFolio).font(.subheadline).bold().foregroundColor(.teal)
                    Spacer()
                    Text(fmtMxn(item.total ?? 0)).font(.subheadline).bold()
                }
                HStack {
                    if !item.clientName.isEmpty { Text(item.clientName).font(.caption).foregroundColor(.secondary) }
                    Spacer()
                    if !item.status.isEmpty {
                        Text(item.status).font(.caption2).bold().foregroundColor(color)
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
    let item: ExpenseItem
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: "chart.bar.fill").font(.title2).foregroundColor(.orange)
            Text(fmtMxn(item.amount)).font(.headline).bold()
            Text(item.displayConcept).font(.caption).foregroundColor(.secondary).lineLimit(2)
            Text(item.status.isEmpty ? "–" : item.status).font(.caption2).bold().foregroundColor(.orange)
                .padding(.horizontal, 7).padding(.vertical, 2)
                .background(Color.orange.opacity(0.12)).clipShape(Capsule())
        }
        .frame(width: 160)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
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
