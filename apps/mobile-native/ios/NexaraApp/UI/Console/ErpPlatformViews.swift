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

    var body: some View {
        List {
            if vm.isLoading { ProgressView() }
            if vm.items.isEmpty && !vm.isLoading {
                Text("Sin contratos activos.").foregroundColor(.secondary)
            }
            ForEach(vm.items, id: \.platRowId) { c in
                VStack(alignment: .leading, spacing: 4) {
                    Text(platStr(c, "name", "title", "contractNumber")).font(.headline)
                    Text(platStr(c, "clientName", "status")).font(.caption).foregroundColor(.secondary)
                }
            }
        }
        .navigationTitle("Contratos")
        .task { vm.load() }
        .refreshable { vm.load() }
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
