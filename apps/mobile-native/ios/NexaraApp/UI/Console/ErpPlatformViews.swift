import SwiftUI

// MARK: – ERP BI

@MainActor
final class ErpBiVM: ObservableObject {
    @Published var dashboard = AnalyticsDashboard(raw: [:])
    @Published var computedKpis: [ComputedKpi] = []
    @Published var margin: [BiMarginRow] = []
    @Published var engineers: [BiEngineerRow] = []
    @Published var clientsRoi: [BiClientRoi] = []
    @Published var isLoading = false
    @Published var error: String?

    func load() {
        isLoading = true; error = nil
        Task {
            async let d = ExtraRepository.shared.analyticsDashboardItem()
            async let k = ExtraRepository.shared.analyticsComputedKpiItems()
            async let m = ExtraRepository.shared.biMarginRows()
            async let e = ExtraRepository.shared.biEngineerRows()
            async let c = ExtraRepository.shared.biClientRoiRows()
            dashboard = await d; computedKpis = await k; margin = await m; engineers = await e; clientsRoi = await c
            isLoading = false
        }
    }
}

struct ErpBiView: View {
    @StateObject private var vm = ErpBiVM()

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Business Intelligence").font(.title2).bold()
                    Text("KPIs cross-módulo · margen · ingenieros · ROI").font(.caption).foregroundColor(.secondary)
                }
                if vm.isLoading && vm.dashboard.isEmpty { ProgressView().frame(maxWidth: .infinity).padding(.top, 40) }
                else if let err = vm.error { Text(err).foregroundColor(.red) }
                else {
                    executiveSummary
                    if !vm.computedKpis.isEmpty { computedSection }
                    if !vm.margin.isEmpty { marginSection }
                    if !vm.engineers.isEmpty { engineersSection }
                    if !vm.clientsRoi.isEmpty { clientsSection }
                }
            }
            .padding()
        }
        .navigationTitle("BI")
        .task { vm.load() }
        .refreshable { vm.load() }
    }

    private var executiveSummary: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Resumen ejecutivo").font(.headline)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ErpTile(label: "Ingresos", value: platFmtMxn(vm.dashboard.revenue), accent: .green)
                ErpTile(label: "Gastos", value: platFmtMxn(vm.dashboard.expenses), accent: .red)
                ErpTile(label: "OC abiertas", value: "\(vm.dashboard.openPurchaseOrders)", accent: .blue)
                ErpTile(label: "Mant. activos", value: "\(vm.dashboard.pendingMaintenanceOrders)", accent: .orange)
            }
        }
    }

    private var computedSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("KPIs en tiempo real").font(.headline).padding(.top, 8)
            ForEach(vm.computedKpis) { kpi in
                let accent: Color = kpi.status == "danger" ? .red : kpi.status == "warning" ? .orange : kpi.status == "ok" ? .green : .secondary
                HStack {
                    VStack(alignment: .leading) {
                        Text(kpi.name).font(.subheadline)
                        Text(kpi.unit).font(.caption2).foregroundColor(.secondary)
                    }
                    Spacer()
                    Text(kpi.value.map { platFmtValue($0) } ?? kpi.valueLabel).bold().foregroundColor(accent)
                }
                .padding(10).background(accent.opacity(0.1)).clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    private var marginSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Margen por línea").font(.headline).padding(.top, 8)
            ForEach(vm.margin) { row in
                PlatListRow(
                    title: row.projectType,
                    subtitle: "\(row.count) proy. · \(platFmtPct(row.marginPercent))",
                    trailing: platFmtMxn(row.margin)
                )
            }
        }
    }

    private var engineersSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Ranking ingenieros").font(.headline).padding(.top, 8)
            ForEach(vm.engineers) { row in
                PlatListRow(
                    title: row.engineerName,
                    subtitle: "\(row.completed)/\(row.totalActivities) OT",
                    trailing: platFmtPct(row.completionRate)
                )
            }
        }
    }

    private var clientsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("ROI por cliente").font(.headline).padding(.top, 8)
            ForEach(vm.clientsRoi) { row in
                PlatListRow(
                    title: row.clientName,
                    subtitle: "\(row.projects) proy.",
                    trailing: platFmtPct(row.roi)
                )
            }
        }
    }
}

// MARK: – Vista ejecutiva

@MainActor
final class ExecutiveVM: ObservableObject {
    @Published var data = ExecutiveCLevel(raw: [:])
    @Published var isLoading = false
    @Published var error: String?

    func load() {
        isLoading = true
        Task {
            data = await ExtraRepository.shared.executiveCLevelItem()
            isLoading = false
        }
    }
}

struct ExecutiveView: View {
    var panel: PanelId = .erp
    @StateObject private var vm = ExecutiveVM()

    private var drillLinks: [CommandWidget] { CommandCenterAccess.buildExecutiveDrillLinks() }
    private var commandWidgets: [CommandWidget] {
        CommandCenterAccess.buildExecutiveDynamicWidgets(vm.data)
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Text("Vista ejecutiva").font(.title2).bold()
                Text("KPIs cross-módulo del negocio").font(.caption).foregroundColor(.secondary)
                if vm.isLoading { ProgressView() }
                else {
                    CommandCenterRail(
                        widgets: commandWidgets,
                        useNavigationLinks: true,
                        title: "Acciones ejecutivas"
                    )

                    executiveDrillDownSection

                    let h = vm.data.headline
                    let ops = vm.data.operations
                    Text("Finanzas y ventas").font(.headline)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ErpTile(label: "Ingresos MTD", value: platFmtMxn(h.revenueMtd), accent: .green)
                        ErpTile(label: "Pipeline", value: platFmtMxn(h.pipelineValue), accent: .blue)
                        ErpTile(label: "Caja", value: platFmtMxn(h.cashOnHand), accent: .teal)
                        ErpTile(label: "CxC", value: platFmtMxn(h.arOutstanding), accent: .orange)
                    }
                    Text("Operaciones").font(.headline).padding(.top, 8)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ErpTile(label: "OT abiertas", value: "\(ops.otOpen)", accent: .indigo)
                        ErpTile(label: "OT vencidas", value: "\(ops.otOverdue)", accent: .red)
                        ErpTile(label: "Tickets", value: "\(ops.ticketsOpen)", accent: .purple)
                    }
                    if !vm.data.topAccounts.isEmpty {
                        Text("Cuentas clave").font(.headline).padding(.top, 8)
                        ForEach(vm.data.topAccounts) { acc in
                            if acc.clientId > 0 {
                                NavigationLink(value: ExecutiveClientRoute(id: Int64(acc.clientId))) {
                                    executiveAccountRow(acc)
                                }
                                .buttonStyle(.plain)
                            } else {
                                executiveAccountRow(acc)
                            }
                        }
                    }
                    if !vm.data.alerts.isEmpty {
                        Text("Alertas").font(.headline).padding(.top, 8)
                        ForEach(vm.data.alerts) { a in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(a.title).font(.subheadline.bold())
                                if !a.detail.isEmpty {
                                    Text(a.detail).font(.caption).foregroundColor(.secondary)
                                }
                            }
                            .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.orange.opacity(0.12)).clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Ejecutivo")
        .navigationDestination(for: String.self) { key in
            ModuleRouter.view(for: panel, key: key)
        }
        .navigationDestination(for: ExecutiveClientRoute.self) { route in
            CrmClientDetailByIdView(clientId: route.id, onBack: {})
        }
        .task { vm.load() }
        .refreshable { vm.load() }
    }

    private var executiveDrillDownSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Explorar módulos").font(.headline)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(drillLinks) { link in
                    NavigationLink(value: link.moduleKey) {
                        HStack(spacing: 8) {
                            Text(link.icon).font(.title3)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(link.label).font(.caption.weight(.semibold)).foregroundColor(.primary)
                                if !link.hint.isEmpty {
                                    Text(link.hint).font(.caption2).foregroundColor(.secondary).lineLimit(1)
                                }
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                        .padding(10)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func executiveAccountRow(_ acc: ExecutiveTopAccount) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(acc.clientName).font(.subheadline.weight(.semibold))
                Text("\(acc.projects) proy. · \(platFmtMxn(acc.revenue))")
                    .font(.caption).foregroundColor(.secondary)
            }
            Spacer()
            Text(platFmtPct(acc.marginPercent))
                .font(.subheadline.weight(.bold))
                .foregroundColor(.teal)
        }
        .padding(10)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

private struct ExecutiveClientRoute: Hashable {
    let id: Int64
}

// MARK: – Aprobaciones

@MainActor
final class ApprovalsVM: ObservableObject {
    @Published var items: [WorkflowApproval] = []
    @Published var isLoading = false
    @Published var actingId: Int64?
    @Published var error: String?
    @Published var message: String?
    @Published var rejectNotes: [Int64: String] = [:]

    func load() {
        isLoading = true
        Task {
            items = await ExtraRepository.shared.workflowApprovals()
            isLoading = false
            actingId = nil
        }
    }

    func decide(id: Int64, approved: Bool) {
        let comments = rejectNotes[id]?.trimmingCharacters(in: .whitespacesAndNewlines)
        if !approved && (comments == nil || comments?.isEmpty == true) {
            error = "Indica el motivo de rechazo"
            return
        }
        actingId = id
        error = nil
        message = nil
        Task {
            do {
                try await ExtraRepository.shared.workflowDecide(
                    id: id,
                    decision: approved ? "APPROVED" : "REJECTED",
                    comments: comments
                )
                message = approved ? "✅ Aprobado" : "✅ Rechazado"
                actingId = nil
                load()
            } catch {
                self.error = error.localizedDescription
                actingId = nil
            }
        }
    }
}

struct ApprovalsView: View {
    @StateObject private var vm = ApprovalsVM()

    var body: some View {
        List {
            if vm.isLoading { ProgressView() }
            if let message = vm.message {
                Text(message).foregroundColor(.green).font(.footnote.weight(.semibold))
            }
            if let error = vm.error {
                Text(error).foregroundColor(.red).font(.footnote)
            }
            if vm.items.isEmpty && !vm.isLoading {
                Text("Sin aprobaciones pendientes.").foregroundColor(.secondary)
            }
            ForEach(vm.items) { item in
                VStack(alignment: .leading, spacing: 8) {
                    Text(item.displayTitle).font(.headline)
                    Text(item.displaySubtitle).font(.caption).foregroundColor(.secondary)
                    TextField("Comentario / motivo rechazo", text: Binding(
                        get: { vm.rejectNotes[item.id] ?? "" },
                        set: { vm.rejectNotes[item.id] = $0 }
                    ))
                    HStack {
                        Button("Aprobar") { vm.decide(id: item.id, approved: true) }
                            .buttonStyle(.borderedProminent).tint(.green)
                            .disabled(vm.actingId == item.id)
                        Button("Rechazar") { vm.decide(id: item.id, approved: false) }
                            .buttonStyle(.bordered).tint(.red)
                            .disabled(vm.actingId == item.id)
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .navigationTitle("Aprobaciones")
        .task { vm.load() }
        .refreshable { vm.load() }
    }
}

// MARK: – NOC

@MainActor
final class NocVM: ObservableObject {
    @Published var summary: [String: Any] = [:]
    @Published var alerts: [NocAlert] = []
    @Published var devices: [NocDevice] = []
    @Published var isLoading = false

    func load() {
        isLoading = true
        Task {
            async let s = ExtraRepository.shared.nocSummary()
            async let a = ExtraRepository.shared.nocAlertItems()
            async let d = ExtraRepository.shared.nocDeviceItems()
            summary = await s; alerts = await a; devices = await d
            isLoading = false
        }
    }
}

struct NocView: View {
    @StateObject private var vm = NocVM()
    @State private var sevFilter = "todos"

    private var filteredAlerts: [NocAlert] {
        switch sevFilter {
        case "critical":
            return vm.alerts.filter(\.isCritical)
        case "warning":
            return vm.alerts.filter(\.isWarningBand)
        default:
            return vm.alerts
        }
    }

    var body: some View {
        List {
            if vm.isLoading { ProgressView() }
            Section("Resumen") {
                HStack {
                    ErpTile(label: "Dispositivos", value: "\(platInt(vm.summary, "total"))", accent: .blue)
                    ErpTile(label: "Críticos", value: "\(platInt(vm.summary, "criticalCount"))", accent: .red)
                    ErpTile(label: "Uptime", value: platFmtPct(platDbl(vm.summary, "avgUptime")), accent: .green)
                }
            }
            if !vm.alerts.isEmpty {
                Section {
                    Picker("Severidad", selection: $sevFilter) {
                        Text("Todas").tag("todos")
                        Text("Críticas").tag("critical")
                        Text("Warning").tag("warning")
                    }
                    .pickerStyle(.segmented)
                    ForEach(filteredAlerts.prefix(20)) { a in
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(a.displayTitle).font(.subheadline.bold())
                                Text(a.message).font(.caption).foregroundColor(.secondary)
                            }
                            Spacer()
                            Text(a.severity)
                                .font(.caption2.bold())
                                .foregroundColor(a.isCritical ? .red : .orange)
                        }
                    }
                } header: {
                    Text("Alertas (\(filteredAlerts.count)/\(vm.alerts.count))")
                }
            }
            if !vm.devices.isEmpty {
                Section("Dispositivos") {
                    ForEach(vm.devices.prefix(20)) { d in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(d.displayName).font(.subheadline)
                                Text("\(d.type) · \(d.clientName)").font(.caption2).foregroundColor(.secondary)
                            }
                            Spacer()
                            Text(d.status).font(.caption.bold())
                                .foregroundColor(deviceStatusColor(d.status))
                        }
                    }
                }
            }
        }
        .navigationTitle("NOC")
        .task { vm.load() }
        .refreshable { vm.load() }
    }

    private func deviceStatusColor(_ status: String) -> Color {
        switch status.uppercased() {
        case "ONLINE": return .green
        case "OFFLINE", "ALERT": return .red
        default: return .orange
        }
    }
}

// MARK: – SLA

@MainActor
final class SlaVM: ObservableObject {
    @Published var stats = SlaStats(raw: [:])
    @Published var isLoading = false

    func load() {
        isLoading = true
        Task { stats = await ExtraRepository.shared.slaStatsItem(); isLoading = false }
    }
}

struct SlaView: View {
    @StateObject private var vm = SlaVM()

    var body: some View {
        List {
            if vm.isLoading { ProgressView() }
            Section("Resumen") {
                LabeledContent("Tickets", value: "\(vm.stats.total)")
                LabeledContent("Abiertos", value: "\(vm.stats.stillOpen)")
            }
            Section("Tiempo de respuesta") {
                LabeledContent("A tiempo", value: "\(vm.stats.response.onTime)")
                LabeledContent("Tarde", value: "\(vm.stats.response.late)")
                LabeledContent("Cumplimiento", value: platFmtPct(vm.stats.response.compliancePercent))
            }
            Section("Tiempo de resolución") {
                LabeledContent("A tiempo", value: "\(vm.stats.resolution.onTime)")
                LabeledContent("Tarde", value: "\(vm.stats.resolution.late)")
                LabeledContent("Cumplimiento", value: platFmtPct(vm.stats.resolution.compliancePercent))
            }
            if !vm.stats.recentBreaches.isEmpty {
                Section("Incumplimientos recientes") {
                    ForEach(vm.stats.recentBreaches.prefix(15)) { b in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(b.displayTitle).font(.subheadline.bold())
                                Text("\(b.type) · \(b.priority)").font(.caption).foregroundColor(.secondary)
                            }
                            Spacer()
                            Text(String(format: "+%.0fh", b.hoursLate)).font(.caption.bold()).foregroundColor(.red)
                        }
                    }
                }
            }
        }
        .navigationTitle("SLA")
        .task { vm.load() }
        .refreshable { vm.load() }
    }
}

// MARK: – Contratos mantenimiento

@MainActor
final class MaintContractsVM: ObservableObject {
    @Published var items: [MaintenanceContract] = []
    @Published var isLoading = false

    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.maintenanceContractItems(); isLoading = false }
    }
}

struct MaintenanceContractsView: View {
    @StateObject private var vm = MaintContractsVM()
    @State private var selected: MaintenanceContract?
    @State private var query = ""

    private var filtered: [MaintenanceContract] {
        guard !query.isEmpty else { return vm.items }
        let q = query.lowercased()
        return vm.items.filter {
            $0.displayTitle.lowercased().contains(q) ||
            $0.clientName.lowercased().contains(q) ||
            $0.contractNumber.lowercased().contains(q)
        }
    }

    var body: some View {
        Group {
            if let s = selected { contractDetail(s) } else { listBody }
        }
        .navigationTitle("Contratos")
        .task { vm.load() }
        .refreshable { if selected == nil { vm.load() } }
    }

    private var listBody: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                TextField("Buscar contrato o cliente…", text: $query).autocorrectionDisabled()
                if !query.isEmpty { Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundColor(.secondary) } }
            }
            .padding(10)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding()

            if vm.isLoading { Spacer(); ProgressView(); Spacer() }
            else if filtered.isEmpty { Spacer(); Text("Sin contratos activos.").foregroundColor(.secondary); Spacer() }
            else {
                List(filtered) { c in
                    Button { selected = c } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(c.displayTitle).font(.headline)
                                Text(c.clientName).font(.caption).foregroundColor(.secondary)
                            }
                            Spacer()
                            if !c.status.isEmpty {
                                Text(c.status.capitalized).font(.caption2).bold()
                                    .foregroundColor(mcStatusColor(c.status))
                                    .padding(.horizontal, 7).padding(.vertical, 2)
                                    .background(mcStatusColor(c.status).opacity(0.13)).clipShape(Capsule())
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .buttonStyle(.plain)
                }
                .listStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func contractDetail(_ c: MaintenanceContract) -> some View {
        _ContractDetailTabs(
            contract: c,
            activities: c.activities,
            slaList: c.slaEntries,
            inventory: c.inventory,
            onBack: { selected = nil }
        )
    }
}

private struct _ContractDetailTabs: View {
    let contract: MaintenanceContract
    let activities: [[String: Any]]
    let slaList: [[String: Any]]
    let inventory: [[String: Any]]
    let onBack: () -> Void
    @State private var tab = 0

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    ForEach(["Info", "Actividades", "SLA", "Inventario"].enumerated().map { $0 }, id: \.offset) { i, t in
                        Button { tab = i } label: {
                            Text(t).font(.subheadline).bold()
                                .padding(.horizontal, 14).padding(.vertical, 10)
                                .foregroundColor(tab == i ? .teal : .primary)
                                .overlay(alignment: .bottom) {
                                    if tab == i { Rectangle().fill(Color.teal).frame(height: 2) }
                                }
                        }
                    }
                }
            }
            Divider()

            List {
                Section {
                    HStack {
                        Button("← Lista") { onBack() }
                        Spacer()
                        if !contract.status.isEmpty {
                            Text(contract.status.capitalized).font(.caption).bold().foregroundColor(mcStatusColor(contract.status))
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(mcStatusColor(contract.status).opacity(0.12)).clipShape(Capsule())
                        }
                    }
                }

                switch tab {
                case 0:
                    Section("Contrato") {
                        mcRow("Número", contract.contractNumber)
                        mcRow("Nombre", contract.title)
                        mcRow("Cliente", contract.clientName)
                        mcRow("Frecuencia", contract.frequency)
                        mcRow("Estado", contract.status)
                        mcRow("Inicio", String(contract.startDate.prefix(10)))
                        mcRow("Vencimiento", String(contract.endDate.prefix(10)))
                        if let fee = contract.monthlyFee {
                            mcRow("Monto", "\(contract.currency) \(Int(fee))")
                        }
                        if let h = contract.slaResponseHours {
                            mcRow("Resp. SLA", "\(h)h")
                        }
                    }
                case 1:
                    if activities.isEmpty {
                        Section { Text("Sin actividades.").foregroundColor(.secondary) }
                    } else {
                        Section("Actividades (\(activities.count))") {
                            ForEach(Array(activities.enumerated()), id: \.offset) { _, a in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(platStr(a, "title", "titulo", "anNumber")).font(.subheadline.bold())
                                    let st2 = platStr(a, "status", "estado")
                                    if !st2.isEmpty { Text(st2.capitalized).font(.caption).foregroundColor(.secondary) }
                                }
                            }
                        }
                    }
                case 2:
                    if slaList.isEmpty {
                        Section { Text("Sin métricas SLA.").foregroundColor(.secondary) }
                    } else {
                        Section("SLA") {
                            ForEach(Array(slaList.enumerated()), id: \.offset) { _, s in
                                HStack {
                                    Text(platStr(s, "name", "metrica")).font(.subheadline)
                                    Spacer()
                                    Text(platStr(s, "value", "valor")).font(.subheadline.bold()).foregroundColor(.teal)
                                }
                            }
                        }
                    }
                default:
                    if inventory.isEmpty {
                        Section { Text("Sin inventario registrado.").foregroundColor(.secondary) }
                    } else {
                        Section("Inventario (\(inventory.count))") {
                            ForEach(Array(inventory.enumerated()), id: \.offset) { _, item in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(platStr(item, "name", "nombre", "description", "itemName")).font(.subheadline.bold())
                                        Text(platStr(item, "serial", "serialNumber", "modelo")).font(.caption).foregroundColor(.secondary)
                                    }
                                    Spacer()
                                    let qty = platStr(item, "quantity", "cantidad")
                                    if !qty.isEmpty { Text("x\(qty)").font(.caption2).foregroundColor(.teal) }
                                }
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
        }
    }

    @ViewBuilder private func mcRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }
}

private func mcStatusColor(_ status: String) -> Color {
    switch status.lowercased() {
    case "activo", "active", "vigente": return .green
    case "vencido", "expired", "inactivo": return .red
    case "por_vencer", "por vencer", "próximo": return .orange
    default: return .secondary
    }
}

// MARK: – Shared helpers

private struct ErpTile: View {
    let label: String; let value: String; let accent: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption2).foregroundColor(accent)
            Text(value).font(.subheadline).bold()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10).background(accent.opacity(0.12)).clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

private struct PlatListRow: View {
    let title: String; let subtitle: String; let trailing: String
    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(title).font(.subheadline.bold())
                Text(subtitle).font(.caption).foregroundColor(.secondary)
            }
            Spacer()
            Text(trailing).font(.subheadline.bold()).foregroundColor(.teal)
        }
        .padding(10).background(Color(.secondarySystemGroupedBackground)).clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

private func platStr(_ m: [String: Any], _ keys: String...) -> String {
    for k in keys {
        if let v = m[k] {
            let s: String
            if let ss = v as? String { s = ss } else if let n = v as? NSNumber { s = n.stringValue } else { s = String(describing: v) }
            if !s.isEmpty && s != "null" { return s }
        }
    }
    return ""
}

private func platDbl(_ m: [String: Any], _ key: String) -> Double {
    if let d = m[key] as? Double { return d }
    if let n = m[key] as? NSNumber { return n.doubleValue }
    if let s = m[key] as? String, let d = Double(s) { return d }
    return 0
}

private func platInt(_ m: [String: Any], _ key: String) -> Int { Int(platDbl(m, key)) }

private func platFmtMxn(_ v: Double) -> String {
    let n = NumberFormatter(); n.numberStyle = .currency; n.currencySymbol = "$"; n.maximumFractionDigits = 0
    return n.string(from: NSNumber(value: v)) ?? "$\(Int(v))"
}

private func platFmtPct(_ v: Double) -> String { String(format: "%.1f%%", v) }

private func platFmtValue(_ v: Any?) -> String {
    if let d = v as? Double { return d > 1000 ? platFmtMxn(d) : String(format: "%.1f", d) }
    if let n = v as? NSNumber { return n.stringValue }
    return v.map { String(describing: $0) } ?? "—"
}

extension [String: Any] {
    fileprivate var platRowId: String {
        if let n = self["id"] as? Int { return "p-\(n)" }
        if let s = self["id"] as? String { return "p-\(s)" }
        return UUID().uuidString
    }
}
