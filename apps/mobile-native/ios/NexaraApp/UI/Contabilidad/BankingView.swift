import SwiftUI

// MARK: – ViewModel

@MainActor
final class BankingVM: ObservableObject {
    @Published var accounts: [BankAccountItem] = []
    @Published var isLoading = false

    /// Movimientos y resumen de la cuenta abierta. La lista de cuentas sólo
    /// traía el saldo; "¿entró ya el pago?" era justamente lo que no se podía
    /// contestar desde el teléfono.
    @Published var transactions: [BankTransaction] = []
    @Published var summary: BankAccountSummary?
    @Published var isLoadingDetail = false
    @Published var detailError: String?

    var totalBalance: Double { accounts.reduce(0) { $0 + $1.balance } }

    func load() {
        isLoading = true
        Task {
            accounts = await ExtraRepository.shared.bankAccountItems()
            isLoading = false
        }
    }

    /// GET banking/accounts/:id/summary + /transactions.
    func loadDetail(accountId: Int64) {
        transactions = []
        summary = nil
        detailError = nil
        guard accountId > 0 else {
            detailError = "La cuenta no trae identificador; no se pueden pedir sus movimientos."
            return
        }
        isLoadingDetail = true
        Task {
            async let s = AccountingRepository.shared.bankAccountSummary(id: accountId)
            async let t = AccountingRepository.shared.bankTransactions(accountId: accountId, limit: 50)
            let (resumen, movs) = await (s, t)
            summary = resumen.hasData ? resumen : nil
            // Si el listado paginado viene vacío pero el resumen sí trae los
            // últimos movimientos, se enseñan esos antes que un "sin datos"
            // que sería falso.
            transactions = movs.isEmpty ? resumen.lastTransactions : movs
            isLoadingDetail = false
        }
    }

    func clearDetail() {
        transactions = []
        summary = nil
        detailError = nil
    }
}

// MARK: – View

struct BankingView: View {
    @StateObject private var vm = BankingVM()
    @State private var selected: BankAccountItem?

    var body: some View {
        Group {
            if let s = selected { bankDetail(s) } else { listBody }
        }
        .navigationTitle(selected == nil ? "Banca" : "")
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
            VStack(alignment: .leading, spacing: 16) {
                if !vm.accounts.isEmpty {
                    VStack(spacing: 6) {
                        Text("Saldo total").font(.caption).foregroundColor(.secondary)
                        Text(fmtBank(vm.totalBalance))
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                            .foregroundColor(vm.totalBalance >= 0 ? .primary : .red)
                        Text("\(vm.accounts.count) cuenta\(vm.accounts.count == 1 ? "" : "s")")
                            .font(.caption).foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(20)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .padding(.horizontal)
                }
                if vm.isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if vm.accounts.isEmpty {
                    NxEmptyState(
                        title: "Sin cuentas bancarias",
                        subtitle: "No hay cuentas registradas en contabilidad.",
                        actionLabel: "Actualizar",
                        onAction: { vm.load() }
                    )
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Cuentas").font(.headline).padding(.horizontal)
                        ForEach(vm.accounts) { acc in
                            Button {
                                selected = acc
                                vm.loadDetail(accountId: acc.id)
                            } label: {
                                BankAccountCard(item: acc).padding(.horizontal)
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
    private func bankDetail(_ acc: BankAccountItem) -> some View {
        let isNeg = acc.balance < 0
        List {
            Section {
                Button("← Banca") { selected = nil; vm.clearDetail() }
            }
            Section {
                VStack(spacing: 4) {
                    Text("Saldo").font(.caption).foregroundColor(.secondary)
                    Text(fmtBank(acc.balance)).font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundColor(isNeg ? .red : .green)
                }
                .frame(maxWidth: .infinity).padding(.vertical, 8)
            }
            Section("Cuenta") {
                bRow("Nombre",         acc.name)
                bRow("Banco",          acc.bank)
                bRow("Número",         acc.accountNumber)
                bRow("CLABE",          acc.clabe)
                bRow("Moneda",         acc.currency)
                bRow("Tipo",           acc.type)
                bRow("Responsable",    acc.ownerName)
            }
            if let s = vm.summary {
                Section("Este mes") {
                    HStack(spacing: 0) {
                        BankSummaryCell(label: "Abonos", value: fmtBank(s.monthCredits), color: .green)
                        Divider().frame(height: 32)
                        BankSummaryCell(label: "Cargos", value: fmtBank(s.monthDebits), color: .red)
                        Divider().frame(height: 32)
                        BankSummaryCell(
                            label: "Neto",
                            value: fmtBank(s.monthNet),
                            color: s.monthNet < 0 ? .red : .green
                        )
                    }
                    if s.unreconciledCount > 0 {
                        HStack {
                            Text("Sin conciliar")
                            Spacer()
                            Text("\(s.unreconciledCount)").bold().foregroundColor(.orange)
                        }
                    }
                }
            }
            Section {
                if vm.isLoadingDetail {
                    ProgressView().frame(maxWidth: .infinity)
                } else if let err = vm.detailError {
                    Text(err).font(.caption).foregroundColor(.orange)
                } else if vm.transactions.isEmpty {
                    Text("Sin movimientos importados para esta cuenta.")
                        .font(.caption).foregroundColor(.secondary)
                } else {
                    ForEach(vm.transactions, id: \.rowKey) { tx in
                        BankTransactionRow(item: tx)
                    }
                }
            } header: {
                Text("Movimientos")
            } footer: {
                // No se puede conciliar desde la app: `PATCH banking/transactions/:id/reconcile`
                // es una escritura contable y está fuera de lo autorizado.
                Text("Sólo consulta. Conciliar un movimiento se hace en la web.")
                    .font(.caption2)
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func bRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }
}

// MARK: – Card

private struct BankAccountCard: View {
    let item: BankAccountItem
    var body: some View {
        let isNeg = item.balance < 0

        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10).fill(Color.blue.opacity(0.12)).frame(width: 44, height: 44)
                Image(systemName: "building.columns.fill").foregroundColor(.blue).font(.system(size: 20))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(item.displayName).font(.subheadline).bold()
                if !item.bank.isEmpty { Text(item.bank).font(.caption).foregroundColor(.secondary) }
                if !item.maskedNumber.isEmpty {
                    Text(item.maskedNumber).font(.caption2).foregroundColor(.secondary)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(fmtBank(item.balance)).font(.subheadline).bold().foregroundColor(isNeg ? .red : .green)
                if !item.currency.isEmpty { Text(item.currency).font(.caption2).foregroundColor(.secondary) }
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

private struct BankSummaryCell: View {
    let label: String
    let value: String
    let color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.subheadline).bold().foregroundColor(color).lineLimit(1).minimumScaleFactor(0.7)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 2)
    }
}

private struct BankTransactionRow: View {
    let item: BankTransaction
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: item.isDebit ? "arrow.up.right" : "arrow.down.left")
                .font(.caption)
                .foregroundColor(item.isDebit ? .red : .green)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.displayDescription).font(.subheadline).lineLimit(2)
                HStack(spacing: 6) {
                    if !item.dateLabel.isEmpty {
                        Text(item.dateLabel).font(.caption2).foregroundColor(.secondary)
                    }
                    if !item.counterpartyName.isEmpty {
                        Text(item.counterpartyName).font(.caption2).foregroundColor(.secondary).lineLimit(1)
                    }
                    // La clave de rastreo SPEI es lo que se le pide al cliente
                    // cuando dice "ya te transferí"; merece estar a la vista.
                    if !item.speiTrackingKey.isEmpty {
                        Text(item.speiTrackingKey).font(.caption2).foregroundColor(.blue).lineLimit(1)
                    }
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(fmtBank(item.amount))
                    .font(.caption).bold()
                    .foregroundColor(item.isDebit ? .red : .green)
                if !item.isReconciled {
                    Text("sin conciliar").font(.caption2).foregroundColor(.orange)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: – Helpers

private func fmtBank(_ v: Double) -> String {
    let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = "MXN"
    return f.string(from: NSNumber(value: v)) ?? "$\(v)"
}
