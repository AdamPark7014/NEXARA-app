import SwiftUI

// MARK: – ERP BI

@MainActor
final class ErpBiVM: ObservableObject {
    @Published var dashboard: [String: Any] = [:]
    @Published var computedKpis: [[String: Any]] = []
    @Published var margin: [[String: Any]] = []
    @Published var engineers: [[String: Any]] = []
    @Published var clientsRoi: [[String: Any]] = []
    @Published var isLoading = false
    @Published var error: String?

    func load() {
        isLoading = true; error = nil
        Task {
            async let d = ExtraRepository.shared.analyticsDashboardMap()
            async let k = ExtraRepository.shared.analyticsComputedKpis()
            async let m = ExtraRepository.shared.biMarginByType()
            async let e = ExtraRepository.shared.biEngineers()
            async let c = ExtraRepository.shared.biClientsRoi()
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
                ErpTile(label: "Ingresos", value: platFmtMxn(platDbl(vm.dashboard, "revenue")), accent: .green)
                ErpTile(label: "Gastos", value: platFmtMxn(platDbl(vm.dashboard, "expenses")), accent: .red)
                ErpTile(label: "OC abiertas", value: "\(platInt(vm.dashboard, "openPurchaseOrders"))", accent: .blue)
                ErpTile(label: "Mant. activos", value: "\(platInt(vm.dashboard, "pendingMaintenanceOrders"))", accent: .orange)
            }
        }
    }

    private var computedSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("KPIs en tiempo real").font(.headline).padding(.top, 8)
            ForEach(Array(vm.computedKpis.enumerated()), id: \.offset) { _, kpi in
                let status = platStr(kpi, "status")
                let accent: Color = status == "danger" ? .red : status == "warning" ? .orange : status == "ok" ? .green : .secondary
                HStack {
                    VStack(alignment: .leading) {
                        Text(platStr(kpi, "name")).font(.subheadline)
                        Text(platStr(kpi, "unit")).font(.caption2).foregroundColor(.secondary)
                    }
                    Spacer()
                    Text(platFmtValue(kpi["value"])).bold().foregroundColor(accent)
                }
                .padding(10).background(accent.opacity(0.1)).clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    private var marginSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Margen por línea").font(.headline).padding(.top, 8)
            ForEach(vm.margin, id: \.platRowId) { row in
                PlatListRow(
                    title: platStr(row, "projectType"),
                    subtitle: "\(platInt(row, "count")) proy. · \(platFmtPct(platDbl(row, "marginPercent")))",
                    trailing: platFmtMxn(platDbl(row, "margin"))
                )
            }
        }
    }

    private var engineersSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Ranking ingenieros").font(.headline).padding(.top, 8)
            ForEach(vm.engineers, id: \.platRowId) { row in
                PlatListRow(
                    title: platStr(row, "engineerName", "nombre"),
                    subtitle: "\(platInt(row, "completed"))/\(platInt(row, "totalActivities")) OT",
                    trailing: platFmtPct(platDbl(row, "completionRate"))
                )
            }
        }
    }

    private var clientsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("ROI por cliente").font(.headline).padding(.top, 8)
            ForEach(vm.clientsRoi, id: \.platRowId) { row in
                PlatListRow(
                    title: platStr(row, "clientName"),
                    subtitle: "\(platInt(row, "projects")) proy.",
                    trailing: platFmtPct(platDbl(row, "roi"))
                )
            }
        }
    }
}

// MARK: – Vista ejecutiva

@MainActor
final class ExecutiveVM: ObservableObject {
    @Published var data: [String: Any] = [:]
    @Published var isLoading = false
    @Published var error: String?

    func load() {
        isLoading = true
        Task {
            data = await ExtraRepository.shared.executiveCLevel()
            isLoading = false
        }
    }
}

struct ExecutiveView: View {
    @StateObject private var vm = ExecutiveVM()

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Text("Vista ejecutiva").font(.title2).bold()
                Text("KPIs cross-módulo del negocio").font(.caption).foregroundColor(.secondary)
                if vm.isLoading { ProgressView() }
                else {
                    let h = vm.data["headlineKpis"] as? [String: Any] ?? [:]
                    let ops = vm.data["operations"] as? [String: Any] ?? [:]
                    Text("Finanzas y ventas").font(.headline)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ErpTile(label: "Ingresos MTD", value: platFmtMxn(platDbl(h, "revenueMtd")), accent: .green)
                        ErpTile(label: "Pipeline", value: platFmtMxn(platDbl(h, "pipelineValue")), accent: .blue)
                        ErpTile(label: "Caja", value: platFmtMxn(platDbl(h, "cashOnHand")), accent: .teal)
                        ErpTile(label: "CxC", value: platFmtMxn(platDbl(h, "arOutstanding")), accent: .orange)
                    }
                    Text("Operaciones").font(.headline).padding(.top, 8)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ErpTile(label: "OT abiertas", value: "\(platInt(ops, "otOpen"))", accent: .indigo)
                        ErpTile(label: "OT vencidas", value: "\(platInt(ops, "otOverdue"))", accent: .red)
                        ErpTile(label: "Tickets", value: "\(platInt(ops, "ticketsOpen"))", accent: .purple)
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Ejecutivo")
        .task { vm.load() }
        .refreshable { vm.load() }
    }
}

// MARK: – Aprobaciones

@MainActor
final class ApprovalsVM: ObservableObject {
    @Published var items: [[String: Any]] = []
    @Published var isLoading = false
    @Published var actingId: Int?

    func load() {
        isLoading = true
        Task {
            items = await ExtraRepository.shared.workflowPending()
            isLoading = false
        }
    }

    func decide(id: Int, approved: Bool) {
        actingId = id
        Task {
            try? await ExtraRepository.shared.workflowDecide(id: id, decision: approved ? "APPROVED" : "REJECTED")
            actingId = nil
            load()
        }
    }
}

struct ApprovalsView: View {
    @StateObject private var vm = ApprovalsVM()

    var body: some View {
        List {
            if vm.isLoading { ProgressView() }
            if vm.items.isEmpty && !vm.isLoading {
                Text("Sin aprobaciones pendientes.").foregroundColor(.secondary)
            }
            ForEach(vm.items, id: \.platRowId) { item in
                let id = platInt(item, "id")
                VStack(alignment: .leading, spacing: 8) {
                    Text(approvalTitle(item)).font(.headline)
                    Text(approvalSubtitle(item)).font(.caption).foregroundColor(.secondary)
                    HStack {
                        Button("Aprobar") { vm.decide(id: id, approved: true) }
                            .buttonStyle(.borderedProminent).tint(.green)
                            .disabled(vm.actingId == id)
                        Button("Rechazar") { vm.decide(id: id, approved: false) }
                            .buttonStyle(.bordered).tint(.red)
                            .disabled(vm.actingId == id)
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
    @Published var alerts: [[String: Any]] = []
    @Published var devices: [[String: Any]] = []
    @Published var isLoading = false

    func load() {
        isLoading = true
        Task {
            async let s = ExtraRepository.shared.nocSummary()
            async let a = ExtraRepository.shared.nocAlerts()
            async let d = ExtraRepository.shared.nocDevices()
            summary = await s; alerts = await a; devices = await d
            isLoading = false
        }
    }
}

struct NocView: View {
    @StateObject private var vm = NocVM()

    var body: some View {
        List {
            if vm.isLoading { ProgressView() }
            Section("Resumen") {
                HStack {
                    ErpTile(label: "Dispositivos", value: "\(platInt(vm.summary, "total"))", accent: .blue)
                    ErpTile(label: "Críticos", value: "\(platInt(vm.summary, "criticalCount"))", accent: .red)
                }
            }
            if !vm.alerts.isEmpty {
                Section("Alertas") {
                    ForEach(vm.alerts.prefix(15), id: \.platRowId) { a in
                        VStack(alignment: .leading) {
                            Text(platStr(a, "title", "deviceName")).font(.subheadline.bold())
                            Text(platStr(a, "message")).font(.caption).foregroundColor(.secondary)
                        }
                    }
                }
            }
            if !vm.devices.isEmpty {
                Section("Dispositivos") {
                    ForEach(vm.devices.prefix(20), id: \.platRowId) { d in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(platStr(d, "name")).font(.subheadline)
                                Text(platStr(d, "type")).font(.caption2).foregroundColor(.secondary)
                            }
                            Spacer()
                            Text(platStr(d, "status")).font(.caption.bold())
                        }
                    }
                }
            }
        }
        .navigationTitle("NOC")
        .task { vm.load() }
        .refreshable { vm.load() }
    }
}

// MARK: – SLA

@MainActor
final class SlaVM: ObservableObject {
    @Published var stats: [String: Any] = [:]
    @Published var isLoading = false

    func load() {
        isLoading = true
        Task { stats = await ExtraRepository.shared.slaStats(); isLoading = false }
    }
}

struct SlaView: View {
    @StateObject private var vm = SlaVM()

    var body: some View {
        List {
            if vm.isLoading { ProgressView() }
            let resp = vm.stats["responseSla"] as? [String: Any] ?? [:]
            let resol = vm.stats["resolutionSla"] as? [String: Any] ?? [:]
            Section("Resumen") {
                LabeledContent("Tickets", value: "\(platInt(vm.stats, "total"))")
                LabeledContent("Abiertos", value: "\(platInt(vm.stats, "stillOpen"))")
            }
            Section("Tiempo de respuesta") {
                LabeledContent("A tiempo", value: "\(platInt(resp, "onTime"))")
                LabeledContent("Tarde", value: "\(platInt(resp, "late"))")
                LabeledContent("Cumplimiento", value: platFmtPct(platDbl(resp, "compliancePercent")))
            }
            Section("Tiempo de resolución") {
                LabeledContent("A tiempo", value: "\(platInt(resol, "onTime"))")
                LabeledContent("Tarde", value: "\(platInt(resol, "late"))")
                LabeledContent("Cumplimiento", value: platFmtPct(platDbl(resol, "compliancePercent")))
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
    @Published var items: [[String: Any]] = []
    @Published var isLoading = false

    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.maintenanceContracts(); isLoading = false }
    }
}

struct MaintenanceContractsView: View {
    @StateObject private var vm = MaintContractsVM()
    @State private var selected: [String: Any]?
    @State private var query = ""

    private var filtered: [[String: Any]] {
        guard !query.isEmpty else { return vm.items }
        let q = query.lowercased()
        return vm.items.filter {
            platStr($0, "name", "title", "contractNumber").lowercased().contains(q) ||
            platStr($0, "clientName", "cliente").lowercased().contains(q)
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
                List(filtered, id: \.platRowId) { c in
                    Button { selected = c } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(platStr(c, "name", "title", "contractNumber")).font(.headline)
                                Text(platStr(c, "clientName", "cliente")).font(.caption).foregroundColor(.secondary)
                            }
                            Spacer()
                            let st = platStr(c, "status", "estado")
                            if !st.isEmpty {
                                Text(st.capitalized).font(.caption2).bold()
                                    .foregroundColor(mcStatusColor(st))
                                    .padding(.horizontal, 7).padding(.vertical, 2)
                                    .background(mcStatusColor(st).opacity(0.13)).clipShape(Capsule())
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
    private func contractDetail(_ c: [String: Any]) -> some View {
        let activities = (c["activities"] as? [[String: Any]]) ?? (c["actividades"] as? [[String: Any]]) ?? []
        let slaList    = (c["sla"] as? [[String: Any]]) ?? (c["slaEntries"] as? [[String: Any]]) ?? []
        let inventory  = (c["inventory"] as? [[String: Any]]) ?? (c["inventario"] as? [[String: Any]]) ?? []

        _ContractDetailTabs(contract: c, activities: activities, slaList: slaList, inventory: inventory, onBack: { selected = nil })
    }
}

private struct _ContractDetailTabs: View {
    let contract: [String: Any]
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
                        let st = platStr(contract, "status", "estado")
                        if !st.isEmpty {
                            Text(st.capitalized).font(.caption).bold().foregroundColor(mcStatusColor(st))
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(mcStatusColor(st).opacity(0.12)).clipShape(Capsule())
                        }
                    }
                }

                switch tab {
                case 0: // Info
                    Section("Contrato") {
                        mcRow("Número", platStr(contract, "contractNumber", "number", "folio"))
                        mcRow("Nombre", platStr(contract, "name", "title"))
                        mcRow("Cliente", platStr(contract, "clientName", "cliente"))
                        mcRow("Tipo", platStr(contract, "type", "tipo", "contractType"))
                        mcRow("Estado", platStr(contract, "status", "estado"))
                        mcRow("Inicio", String(platStr(contract, "startDate", "fechaInicio").prefix(10)))
                        mcRow("Vencimiento", String(platStr(contract, "expiresAt", "endDate", "fechaFin").prefix(10)))
                        mcRow("Monto", platStr(contract, "amount", "monto", "total"))
                        mcRow("Renovación", platStr(contract, "renewal", "renovacion"))
                    }
                case 1: // Actividades
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
                case 2: // SLA
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
                default: // Inventario
                    if inventory.isEmpty {
                        Section { Text("Sin inventario registrado.").foregroundColor(.secondary) }
                    } else {
                        Section("Inventario (\(inventory.count))") {
                            ForEach(Array(inventory.enumerated()), id: \.offset) { _, item in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(platStr(item, "name", "nombre", "description")).font(.subheadline.bold())
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

private func approvalTitle(_ item: [String: Any]) -> String {
    if let inst = item["instance"] as? [String: Any], let wf = inst["workflow"] as? [String: Any], let name = wf["name"] as? String, !name.isEmpty { return name }
    return platStr(item, "title", "entityType")
}

private func approvalSubtitle(_ item: [String: Any]) -> String {
    var parts: [String] = []
    if let inst = item["instance"] as? [String: Any], let eid = inst["entityId"] { parts.append("Entidad #\(eid)") }
    if let step = item["step"] as? [String: Any], let n = step["stepNumber"] { parts.append("Paso \(n)") }
    return parts.joined(separator: " · ")
}

extension [String: Any] {
    fileprivate var platRowId: String {
        if let n = self["id"] as? Int { return "p-\(n)" }
        if let s = self["id"] as? String { return "p-\(s)" }
        return UUID().uuidString
    }
}
