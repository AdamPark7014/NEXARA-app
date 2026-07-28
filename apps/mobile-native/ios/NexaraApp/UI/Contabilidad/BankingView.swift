import SwiftUI

// MARK: – ViewModel

@MainActor
final class BankingVM: ObservableObject {
    @Published var accounts: [BankAccountItem] = []
    @Published var isLoading = false

    var totalBalance: Double { accounts.reduce(0) { $0 + $1.balance } }

    func load() {
        isLoading = true
        Task {
            accounts = await ExtraRepository.shared.bankAccountItems()
            isLoading = false
        }
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
                            Button { selected = acc } label: {
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
                Button("← Banca") { selected = nil }
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

// MARK: – Helpers

private func fmtBank(_ v: Double) -> String {
    let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = "MXN"
    return f.string(from: NSNumber(value: v)) ?? "$\(v)"
}
