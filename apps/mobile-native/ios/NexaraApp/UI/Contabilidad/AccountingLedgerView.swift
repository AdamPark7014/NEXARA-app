import SwiftUI

// Contabilidad general: catálogo de cuentas, centros de costo, periodos
// fiscales y presupuestos.
//
// Por qué esta pantalla y no ampliar `AccountingView` (asientos): esa vive en
// `UI/Console/OpsModuleViews.swift`, que mantiene otro agente en paralelo sobre
// la misma rama. Separarlas evita el conflicto y además son dos cosas
// distintas: aquí está la estructura contable, allí el movimiento diario.
//
// ─────────────────────────────────────────────────────────────────────────────
// LÍMITE EXPLÍCITO: esta pantalla es de SOLO LECTURA, a propósito.
// El dueño no ha autorizado las escrituras fiscales. Por eso NO hay botón de
// crear cuenta (`POST accounting/accounts`), ni de cerrar o reabrir periodo
// (`PATCH accounting/accounts/fiscal-periods/:id/close|reopen`), ni de crear
// presupuesto (`POST accounting/budgets`). No están ocultos: no existen.
// ─────────────────────────────────────────────────────────────────────────────

// MARK: – ViewModel

@MainActor
final class AccountingLedgerVM: ObservableObject {
    @Published var accounts: [LedgerAccount] = []
    @Published var costCenters: [CostCenter] = []
    @Published var periods: [FiscalPeriod] = []
    @Published var budgets: [BudgetItem] = []
    @Published var vsActual: [BudgetVsActualRow] = []
    @Published var vsActualTitle = ""
    /// Detalle de la cuenta abierta. Vive aquí y no en la vista para no
    /// reasignar el `selectedAccount` que dispara el propio `.task`: eso haría
    /// que la pantalla se recargara a sí misma en bucle.
    @Published var accountDetail: LedgerAccount?
    @Published var isLoading = false
    @Published var isLoadingVsActual = false
    @Published var query = ""
    /// `nil` = todos los tipos. Los tipos vienen del enum `AccountType` de la API.
    @Published var typeFilter: String?

    let accountTypes = ["ACTIVO", "PASIVO", "CAPITAL", "INGRESO", "EGRESO"]

    var filteredAccounts: [LedgerAccount] {
        var list = accounts
        if let t = typeFilter {
            list = list.filter { $0.type.uppercased() == t }
        }
        guard !query.isEmpty else { return list }
        let q = query.lowercased()
        return list.filter {
            $0.name.lowercased().contains(q) || $0.code.lowercased().contains(q)
        }
    }

    var filteredCostCenters: [CostCenter] {
        guard !query.isEmpty else { return costCenters }
        let q = query.lowercased()
        return costCenters.filter {
            $0.name.lowercased().contains(q) || $0.code.lowercased().contains(q)
        }
    }

    var filteredBudgets: [BudgetItem] {
        guard !query.isEmpty else { return budgets }
        let q = query.lowercased()
        return budgets.filter {
            $0.name.lowercased().contains(q) || $0.costCenterName.lowercased().contains(q)
        }
    }

    var openPeriods: Int { periods.filter { !$0.isClosed }.count }
    var accountsWithoutSat: Int { accounts.filter(\.missingSatAgrupador).count }
    var plannedTotal: Double { budgets.reduce(0) { $0 + $1.plannedAmount } }
    var actualTotal: Double { budgets.reduce(0) { $0 + $1.actualAmount } }

    func load() {
        isLoading = true
        Task {
            // Las cuatro listas son independientes: en paralelo, la pantalla
            // abre en el tiempo de la más lenta y no en la suma de las cuatro.
            async let a = AccountingRepository.shared.chartOfAccounts()
            async let c = AccountingRepository.shared.costCenters()
            async let p = AccountingRepository.shared.fiscalPeriods()
            async let b = AccountingRepository.shared.budgets()
            let (acc, cc, per, bud) = await (a, c, p, b)
            accounts = acc
            costCenters = cc
            periods = per
            budgets = bud
            isLoading = false
        }
    }

    /// GET accounting/accounts/:id — el listado no trae padre ni subcuentas.
    func loadAccountDetail(id: Int64) {
        accountDetail = nil
        guard id > 0 else { return }
        Task { accountDetail = await AccountingRepository.shared.account(id: id) }
    }

    /// Presupuesto contra real de un centro de costo y ejercicio concretos.
    /// La API responde 400 sin ambos parámetros, así que se piden del propio
    /// renglón de presupuesto en lugar de dejar que el usuario los invente.
    func loadVsActual(for budget: BudgetItem) {
        guard let ccId = budget.costCenterId, budget.year > 0 else {
            vsActual = []
            vsActualTitle = "Este presupuesto no tiene centro de costo o ejercicio"
            return
        }
        isLoadingVsActual = true
        let centro = budget.costCenterName.isEmpty ? "Centro \(ccId)" : budget.costCenterName
        vsActualTitle = "\(centro) · \(budget.year)"
        Task {
            vsActual = await AccountingRepository.shared.budgetVsActual(
                costCenterId: ccId, year: budget.year
            )
            isLoadingVsActual = false
        }
    }
}

// MARK: – View

struct AccountingLedgerView: View {
    @StateObject private var vm = AccountingLedgerVM()
    @State private var tab: LedgerTab = .accounts
    @State private var selectedAccount: LedgerAccount?
    @State private var selectedBudget: BudgetItem?

    var body: some View {
        Group {
            if let acc = selectedAccount {
                accountDetail(acc)
            } else if let bud = selectedBudget {
                budgetDetail(bud)
            } else {
                listBody
            }
        }
        .navigationTitle(selectedAccount == nil && selectedBudget == nil ? "Contabilidad general" : "")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if selectedAccount == nil && selectedBudget == nil {
                    Button { vm.load() } label: { Image(systemName: "arrow.clockwise") }
                }
            }
        }
        .refreshable { if selectedAccount == nil && selectedBudget == nil { vm.load() } }
        .task { vm.load() }
    }

    // MARK: Lista

    private var listBody: some View {
        VStack(spacing: 0) {
            Picker("Sección", selection: $tab) {
                Text("Cuentas").tag(LedgerTab.accounts)
                Text("Centros").tag(LedgerTab.costCenters)
                Text("Periodos").tag(LedgerTab.periods)
                Text("Presupuestos").tag(LedgerTab.budgets)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.top, 8)

            LedgerReadOnlyNote()

            if tab != .periods {
                LedgerSearchField(text: $vm.query)
            }

            if tab == .accounts { typeChips }

            if vm.isLoading && vm.accounts.isEmpty {
                Spacer(); ProgressView(); Spacer()
            } else {
                switch tab {
                case .accounts: accountsList
                case .costCenters: costCentersList
                case .periods: periodsList
                case .budgets: budgetsList
                }
            }
        }
    }

    private var typeChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                LedgerChip(label: "Todas", selected: vm.typeFilter == nil) { vm.typeFilter = nil }
                ForEach(vm.accountTypes, id: \.self) { t in
                    LedgerChip(label: t.capitalized, selected: vm.typeFilter == t) {
                        vm.typeFilter = vm.typeFilter == t ? nil : t
                    }
                }
            }
            .padding(.horizontal)
        }
        .padding(.bottom, 6)
    }

    @ViewBuilder
    private var accountsList: some View {
        if vm.filteredAccounts.isEmpty {
            NxEmptyState(
                title: "Sin cuentas",
                subtitle: "No hay cuentas activas en el catálogo con este filtro.",
                actionLabel: "Actualizar",
                onAction: { vm.load() }
            )
        } else {
            List {
                Section {
                    HStack(spacing: 0) {
                        LedgerKpi(label: "Cuentas", value: "\(vm.accounts.count)", color: .primary)
                        Divider().frame(height: 32)
                        LedgerKpi(
                            label: "Sin agrupador SAT",
                            value: "\(vm.accountsWithoutSat)",
                            color: vm.accountsWithoutSat > 0 ? .orange : .green
                        )
                    }
                }
                ForEach(vm.filteredAccounts.prefix(200), id: \.rowKey) { acc in
                    Button {
                        selectedAccount = acc
                        vm.loadAccountDetail(id: acc.id)
                    } label: {
                        LedgerAccountRow(item: acc)
                    }
                    .buttonStyle(.plain)
                }
            }
            .listStyle(.plain)
        }
    }

    @ViewBuilder
    private var costCentersList: some View {
        if vm.filteredCostCenters.isEmpty {
            NxEmptyState(
                title: "Sin centros de costo",
                subtitle: "No hay centros de costo activos.",
                actionLabel: "Actualizar",
                onAction: { vm.load() }
            )
        } else {
            List(vm.filteredCostCenters, id: \.rowKey) { cc in
                VStack(alignment: .leading, spacing: 3) {
                    Text(cc.displayLabel).font(.subheadline).bold()
                    if !cc.departmentName.isEmpty {
                        Text("Departamento: \(cc.departmentName)")
                            .font(.caption).foregroundColor(.secondary)
                    }
                    if !cc.defaultAccountName.isEmpty {
                        Text("Cuenta por defecto: \(cc.defaultAccountName)")
                            .font(.caption2).foregroundColor(.secondary)
                    }
                }
                .padding(.vertical, 3)
            }
            .listStyle(.plain)
        }
    }

    @ViewBuilder
    private var periodsList: some View {
        if vm.periods.isEmpty {
            NxEmptyState(
                title: "Sin periodos fiscales",
                subtitle: "No hay periodos dados de alta.",
                actionLabel: "Actualizar",
                onAction: { vm.load() }
            )
        } else {
            List {
                Section {
                    HStack(spacing: 0) {
                        LedgerKpi(label: "Periodos", value: "\(vm.periods.count)", color: .primary)
                        Divider().frame(height: 32)
                        LedgerKpi(label: "Abiertos", value: "\(vm.openPeriods)", color: .green)
                    }
                }
                Section {
                    ForEach(vm.periods, id: \.rowKey) { p in
                        HStack(spacing: 10) {
                            Image(systemName: p.isClosed ? "lock.fill" : "lock.open")
                                .foregroundColor(p.isClosed ? .secondary : .green)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.displayName).font(.subheadline).bold()
                                if !p.rangeLabel.isEmpty {
                                    Text(p.rangeLabel).font(.caption).foregroundColor(.secondary)
                                }
                                if p.isClosed && !p.closedByName.isEmpty {
                                    Text("Cerró: \(p.closedByName)")
                                        .font(.caption2).foregroundColor(.secondary)
                                }
                            }
                            Spacer()
                            Text(p.statusLabel)
                                .font(.caption2).bold()
                                .foregroundColor(p.isClosed ? .secondary : .green)
                                .padding(.horizontal, 7).padding(.vertical, 2)
                                .background((p.isClosed ? Color.secondary : Color.green).opacity(0.12))
                                .clipShape(Capsule())
                        }
                        .padding(.vertical, 2)
                    }
                } footer: {
                    Text("Cerrar o reabrir un periodo es una escritura contable y no está habilitada en la app.")
                        .font(.caption2)
                }
            }
            .listStyle(.insetGrouped)
        }
    }

    @ViewBuilder
    private var budgetsList: some View {
        if vm.filteredBudgets.isEmpty {
            NxEmptyState(
                title: "Sin presupuestos",
                subtitle: "No hay presupuestos cargados.",
                actionLabel: "Actualizar",
                onAction: { vm.load() }
            )
        } else {
            List {
                Section {
                    HStack(spacing: 0) {
                        LedgerKpi(label: "Planeado", value: fmtLedger(vm.plannedTotal), color: .blue)
                        Divider().frame(height: 32)
                        LedgerKpi(
                            label: "Ejercido",
                            value: fmtLedger(vm.actualTotal),
                            color: vm.actualTotal > vm.plannedTotal ? .red : .green
                        )
                    }
                }
                ForEach(vm.filteredBudgets, id: \.rowKey) { b in
                    Button {
                        selectedBudget = b
                        vm.loadVsActual(for: b)
                    } label: {
                        LedgerBudgetRow(item: b)
                    }
                    .buttonStyle(.plain)
                }
            }
            .listStyle(.plain)
        }
    }

    // MARK: Detalles

    @ViewBuilder
    private func accountDetail(_ base: LedgerAccount) -> some View {
        // El detalle completo puede tardar; mientras llega se enseña lo que ya
        // traía el listado en vez de una pantalla en blanco.
        let acc = vm.accountDetail ?? base
        List {
            Section {
                Button("← Contabilidad general") {
                    selectedAccount = nil
                    vm.accountDetail = nil
                }
            }
            Section {
                VStack(spacing: 4) {
                    Text("Saldo").font(.caption).foregroundColor(.secondary)
                    Text(fmtLedger(acc.balance))
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundColor(acc.balance < 0 ? .red : .primary)
                }
                .frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            Section("Cuenta") {
                ledgerRow("Código", acc.code)
                ledgerRow("Nombre", acc.name)
                ledgerRow("Tipo", acc.type)
                ledgerRow("Moneda", acc.currency)
                ledgerRow("Agrupador SAT", acc.satAgrupador)
                ledgerRow("Padre", [acc.parentCode, acc.parentName].filter { !$0.isEmpty }.joined(separator: " · "))
                if acc.childrenCount > 0 {
                    HStack { Text("Subcuentas"); Spacer(); Text("\(acc.childrenCount)").foregroundColor(.secondary) }
                }
                HStack {
                    Text("Activa"); Spacer()
                    Text(acc.isActive ? "Sí" : "No").foregroundColor(acc.isActive ? .green : .secondary)
                }
            }
            if acc.missingSatAgrupador {
                Section {
                    Label(
                        "Sin agrupador SAT: esta cuenta no puede salir en el XML de contabilidad electrónica.",
                        systemImage: "exclamationmark.triangle"
                    )
                    .font(.caption)
                    .foregroundColor(.orange)
                }
            }
            if !acc.description.isEmpty {
                Section("Descripción") { Text(acc.description).font(.subheadline) }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder
    private func budgetDetail(_ bud: BudgetItem) -> some View {
        List {
            Section {
                Button("← Presupuestos") {
                    selectedBudget = nil
                    vm.vsActual = []
                    vm.vsActualTitle = ""
                }
            }
            Section("Presupuesto") {
                ledgerRow("Nombre", bud.displayName)
                ledgerRow("Centro de costo", [bud.costCenterCode, bud.costCenterName].filter { !$0.isEmpty }.joined(separator: " · "))
                ledgerRow("Periodo", bud.periodLabel)
                HStack { Text("Planeado"); Spacer(); Text(fmtLedger(bud.plannedAmount)).foregroundColor(.blue) }
                HStack {
                    Text("Ejercido"); Spacer()
                    Text(fmtLedger(bud.actualAmount)).foregroundColor(bud.isOverBudget ? .red : .green)
                }
                HStack {
                    Text("Variación"); Spacer()
                    Text(fmtLedger(bud.variance)).foregroundColor(bud.variance < 0 ? .red : .secondary)
                }
                if let pct = bud.executedPercent {
                    HStack {
                        Text("Ejecutado"); Spacer()
                        Text(String(format: "%.1f%%", pct)).foregroundColor(.secondary)
                    }
                }
            }
            Section(vm.vsActualTitle.isEmpty ? "Mes a mes" : "Mes a mes · \(vm.vsActualTitle)") {
                if vm.isLoadingVsActual {
                    ProgressView().frame(maxWidth: .infinity)
                } else if vm.vsActual.isEmpty {
                    Text("Sin desglose mensual para este centro de costo y ejercicio.")
                        .font(.caption).foregroundColor(.secondary)
                } else {
                    ForEach(vm.vsActual, id: \.rowKey) { row in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text(row.periodLabel).font(.subheadline).bold()
                                Spacer()
                                Text(String(format: "%.1f%%", row.variancePercent))
                                    .font(.caption).bold()
                                    .foregroundColor(row.isOverBudget ? .red : .green)
                            }
                            HStack {
                                Text("Plan \(fmtLedger(row.plannedAmount))")
                                    .font(.caption).foregroundColor(.blue)
                                Spacer()
                                Text("Real \(fmtLedger(row.actualAmount))")
                                    .font(.caption)
                                    .foregroundColor(row.isOverBudget ? .red : .green)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
            if !bud.notes.isEmpty {
                Section("Notas") { Text(bud.notes).font(.subheadline) }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func ledgerRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }
}

private enum LedgerTab: Hashable {
    case accounts, costCenters, periods, budgets
}

// MARK: – Subvistas

/// Decirlo en pantalla y no sólo en el informe: quien abre esto tiene que saber
/// que no va a poder registrar nada aquí.
private struct LedgerReadOnlyNote: View {
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "eye")
            Text("Consulta. Las altas y los cierres contables se hacen en la web.")
        }
        .font(.caption2)
        .foregroundColor(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
        .padding(.top, 6)
    }
}

private struct LedgerSearchField: View {
    @Binding var text: String
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundColor(.secondary)
            TextField("Buscar…", text: $text).autocorrectionDisabled()
            if !text.isEmpty {
                Button { text = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(.secondary)
                }
            }
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
        .padding(.vertical, 8)
    }
}

private struct LedgerChip: View {
    let label: String
    let selected: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(label).font(.caption).bold()
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(selected ? Color.blue : Color(.secondarySystemGroupedBackground))
                .foregroundColor(selected ? .white : .primary)
                .clipShape(Capsule())
        }
    }
}

private struct LedgerKpi: View {
    let label: String
    let value: String
    let color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).bold().foregroundColor(color)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 4)
    }
}

private struct LedgerAccountRow: View {
    let item: LedgerAccount
    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.displayLabel).font(.subheadline).lineLimit(1)
                HStack(spacing: 6) {
                    if !item.type.isEmpty {
                        Text(item.type.capitalized).font(.caption2).foregroundColor(.secondary)
                    }
                    if item.missingSatAgrupador {
                        Text("sin SAT").font(.caption2).bold().foregroundColor(.orange)
                    }
                }
            }
            Spacer()
            Text(fmtLedger(item.balance))
                .font(.caption).bold()
                .foregroundColor(item.balance < 0 ? .red : .secondary)
        }
        .padding(.vertical, 3)
    }
}

private struct LedgerBudgetRow: View {
    let item: BudgetItem
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(item.displayName).font(.subheadline).bold().lineLimit(1)
                Spacer()
                Text(item.periodLabel).font(.caption2).foregroundColor(.secondary)
            }
            if !item.costCenterName.isEmpty {
                Text(item.costCenterName).font(.caption).foregroundColor(.secondary)
            }
            HStack {
                Text("Plan \(fmtLedger(item.plannedAmount))").font(.caption2).foregroundColor(.blue)
                Spacer()
                Text("Real \(fmtLedger(item.actualAmount))")
                    .font(.caption2)
                    .foregroundColor(item.isOverBudget ? .red : .green)
            }
        }
        .padding(.vertical, 3)
    }
}

// MARK: – Helpers

private func fmtLedger(_ v: Double) -> String {
    let abs = Swift.abs(v)
    let signo = v < 0 ? "-" : ""
    if abs >= 1_000_000 { return String(format: "%@$%.1fM", signo, abs / 1_000_000) }
    if abs >= 10_000 { return String(format: "%@$%.0fK", signo, abs / 1_000) }
    let f = NumberFormatter()
    f.numberStyle = .currency
    f.currencyCode = "MXN"
    f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: v)) ?? "\(signo)$\(Int(abs))"
}
