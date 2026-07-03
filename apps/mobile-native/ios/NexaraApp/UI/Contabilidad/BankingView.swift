import SwiftUI

// MARK: – ViewModel

@MainActor
final class BankingVM: ObservableObject {
    @Published var accounts: [[String: Any]] = []
    @Published var isLoading = false

    var totalBalance: Double { accounts.reduce(0.0) { $0 + (bankDouble($1, "balance", "saldo") ?? 0) } }

    func load() {
        isLoading = true
        Task {
            accounts  = await ExtraRepository.shared.bankAccounts()
            isLoading = false
        }
    }
}

// MARK: – View

struct BankingView: View {
    @StateObject private var vm = BankingVM()
    @State private var selected: [String: Any]?

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
                    Text("Sin cuentas bancarias").foregroundColor(.secondary)
                        .frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Cuentas").font(.headline).padding(.horizontal)
                        ForEach(vm.accounts, id: \.bankId) { acc in
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
    private func bankDetail(_ acc: [String: Any]) -> some View {
        let name    = bankStr(acc, "name", "nombre", "alias")
        let balance = bankDouble(acc, "balance", "saldo")
        let isNeg   = (balance ?? 0) < 0
        List {
            Section {
                Button("← Banca") { selected = nil }
            }
            if let b = balance {
                Section {
                    VStack(spacing: 4) {
                        Text("Saldo").font(.caption).foregroundColor(.secondary)
                        Text(fmtBank(b)).font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundColor(isNeg ? .red : .green)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 8)
                }
            }
            Section("Cuenta") {
                bRow("Nombre",         name)
                bRow("Banco",          bankStr(acc, "bank", "banco", "bankName"))
                bRow("Número",         bankStr(acc, "accountNumber", "numeroCuenta"))
                bRow("CLABE",          bankStr(acc, "clabe"))
                bRow("Moneda",         bankStr(acc, "currency", "moneda"))
                bRow("Tipo",           bankStr(acc, "type", "tipo"))
                bRow("Responsable",    bankStr(acc, "ownerName", "responsable"))
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
    let item: [String: Any]
    var body: some View {
        let name    = bankStr(item, "name", "nombre", "alias")
        let bank    = bankStr(item, "bank", "banco", "bankName")
        let account = bankStr(item, "accountNumber", "numeroCuenta", "clabe")
        let balance = bankDouble(item, "balance", "saldo")
        let currency = bankStr(item, "currency", "moneda")
        let isNeg   = (balance ?? 0) < 0

        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10).fill(Color.blue.opacity(0.12)).frame(width: 44, height: 44)
                Image(systemName: "building.columns.fill").foregroundColor(.blue).font(.system(size: 20))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(name.isEmpty ? "Cuenta" : name).font(.subheadline).bold()
                if !bank.isEmpty { Text(bank).font(.caption).foregroundColor(.secondary) }
                if !account.isEmpty { Text(account.suffix(8).description).font(.caption2).foregroundColor(.secondary) }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                if let b = balance {
                    Text(fmtBank(b)).font(.subheadline).bold().foregroundColor(isNeg ? .red : .green)
                }
                if !currency.isEmpty { Text(currency).font(.caption2).foregroundColor(.secondary) }
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

// MARK: – Helpers

private func bankStr(_ m: [String: Any], _ keys: String...) -> String {
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

private func bankDouble(_ m: [String: Any], _ keys: String...) -> Double? {
    for k in keys {
        if let v = m[k] {
            if let d = v as? Double { return d }
            if let n = v as? NSNumber { return n.doubleValue }
            if let s = v as? String, let d = Double(s) { return d }
        }
    }
    return nil
}

private func fmtBank(_ v: Double) -> String {
    let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = "MXN"
    return f.string(from: NSNumber(value: v)) ?? "$\(v)"
}

extension [String: Any] {
    fileprivate var bankId: String {
        if let n = self["id"] as? Int { return "bank-\(n)" }
        if let s = self["id"] as? String { return "bank-\(s)" }
        return UUID().uuidString
    }
}
