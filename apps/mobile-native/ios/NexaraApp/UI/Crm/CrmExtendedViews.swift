import SwiftUI

// MARK: - Pipeline (oportunidades por etapa)

struct CrmPipelineView: View {
    @State private var stages: [(String, [CrmOpportunity])] = []
    @State private var flat: [CrmOpportunity] = []
    @State private var isLoading = true

    private let stageOrder: [(String, String)] = [
        ("LEAD", "Lead"),
        ("QUALIFIED", "Calificada"),
        ("PROPOSAL", "Propuesta"),
        ("NEGOTIATION", "Negociación"),
        ("WON", "Ganada"),
        ("LOST", "Perdida"),
    ]

    private var totalValue: Double { flat.reduce(0) { $0 + $1.value } }
    private var weighted: Double { flat.reduce(0) { $0 + $1.weightedValue } }
    private var wonCount: Int { flat.filter(\.isWon).count }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                NxSectionHeader(
                    title: "Pipeline comercial",
                    subtitle: "Valor · ponderado · conversión por etapa"
                )
                .padding(.horizontal)

                NxKpiGrid(items: [
                    NxKpi(label: "Pipeline", value: fmtMxn(totalValue), tone: .brand),
                    NxKpi(label: "Ponderado", value: fmtMxn(weighted), tone: .info),
                    NxKpi(label: "Ganadas", value: "\(wonCount)", tone: .success),
                    NxKpi(label: "Oportunidades", value: "\(flat.count)", tone: .neutral),
                ])
                .padding(.horizontal)

                if isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if stages.isEmpty {
                    Text("Sin oportunidades en pipeline")
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding()
                } else {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        ForEach(stages, id: \.0) { stage, items in
                            let stageValue = items.reduce(0.0) { $0 + $1.value }
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Text(stage).font(.headline)
                                    Spacer()
                                    Text("\(items.count) · \(fmtMxn(stageValue))")
                                        .font(.caption.bold())
                                        .foregroundColor(.green)
                                }
                                ForEach(items) { o in
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(o.displayTitle).font(.subheadline.bold())
                                        HStack {
                                            Text(fmtMxn(o.value))
                                                .font(.caption).foregroundColor(.green).bold()
                                            Spacer()
                                            if o.probability > 0 {
                                                Text("\(Int(o.probability))% prob.").font(.caption2).foregroundColor(.secondary)
                                            }
                                        }
                                        if !o.clientName.isEmpty {
                                            Text(o.clientName).font(.caption2).foregroundColor(.secondary)
                                        }
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(10)
                                    .background(Color(.secondarySystemGroupedBackground))
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                                }
                            }
                        }
                    }
                    .padding(.horizontal)
                }
            }
            .padding(.vertical)
        }
        .navigationTitle("Pipeline")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        let list = (try? await CrmRepository.shared.opportunityItems()) ?? []
        flat = list
        let grouped = Dictionary(grouping: list) { $0.stageKey }
        var ordered: [(String, [CrmOpportunity])] = []
        for (key, label) in stageOrder {
            if let items = grouped[key] ?? grouped[label], !items.isEmpty {
                ordered.append((label, items))
            }
        }
        let known = Set(stageOrder.flatMap { [$0.0, $0.1] })
        let extras = grouped.keys.filter { !known.contains($0) }.sorted()
        for key in extras {
            ordered.append((key, grouped[key] ?? []))
        }
        stages = ordered
    }
}

// MARK: - Agenda

struct CrmAgendaView: View {
    @State private var events: [CalendarEvent] = []
    @State private var isLoading = true
    @State private var query = ""
    @State private var selected: CalendarEvent?

    private var filtered: [CalendarEvent] {
        guard !query.isEmpty else { return events }
        let q = query.lowercased()
        return events.filter {
            $0.displayTitle.lowercased().contains(q) ||
            $0.ownerName.lowercased().contains(q)
        }
    }

    var body: some View {
        Group {
            if let s = selected { agendaDetail(s) } else { listBody }
        }
        .navigationTitle("Agenda")
        .task { await reload() }
        .refreshable { if selected == nil { await reload() } }
    }

    private var listBody: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                TextField("Buscar evento…", text: $query).autocorrectionDisabled()
                if !query.isEmpty { Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundColor(.secondary) } }
            }
            .padding(10)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal).padding(.top, 8)

            if isLoading { Spacer(); ProgressView(); Spacer() }
            else if filtered.isEmpty { Spacer(); Text("Sin eventos en agenda").foregroundColor(.secondary); Spacer() }
            else {
                List(filtered) { ev in
                    Button { selected = ev } label: {
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(ev.displayTitle).font(.headline).foregroundColor(.primary)
                                if !ev.start.isEmpty { Text(String(ev.start.prefix(16))).font(.caption).foregroundColor(.secondary) }
                                if !ev.ownerName.isEmpty { Text(ev.ownerName).font(.caption2).foregroundColor(.secondary) }
                            }
                            Spacer()
                            if !ev.type.isEmpty {
                                Text(ev.type).font(.caption2).padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(Color.blue.opacity(0.12)).foregroundColor(.blue).clipShape(Capsule())
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder
    private func agendaDetail(_ ev: CalendarEvent) -> some View {
        List {
            Section {
                Button("← Agenda") { selected = nil }
            }
            Section("Evento") {
                agRow("Título", ev.displayTitle)
                agRow("Tipo", ev.type)
                agRow("Inicio", String(ev.start.prefix(16)))
                agRow("Fin", String(ev.end.prefix(16)))
                agRow("Responsable", ev.ownerName)
                agRow("Descripción", ev.description)
                agRow("Ubicación", ev.location)
                agRow("Resultado", ev.result)
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func agRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        events = (try? await CrmRepository.shared.calendarEventItems()) ?? []
    }
}

// MARK: - Licitaciones

struct CrmTendersView: View {
    @State private var items: [Tender] = []
    @State private var isLoading = true
    @State private var query = ""
    @State private var statusFilter = "todos"
    @State private var selected: Tender?

    private var statuses: [String] {
        ["todos"] + Array(Set(items.map(\.statusLower).filter { !$0.isEmpty })).sorted()
    }

    private var filtered: [Tender] {
        var list = items
        if statusFilter != "todos" {
            list = list.filter { $0.statusLower == statusFilter }
        }
        if !query.isEmpty {
            let q = query.lowercased()
            list = list.filter {
                $0.displayTitle.lowercased().contains(q) || $0.clientName.lowercased().contains(q)
            }
        }
        return list
    }

    var body: some View {
        Group {
            if let s = selected { tenderDetail(s) } else { listBody }
        }
        .navigationTitle("Licitaciones")
        .task { await reload() }
        .refreshable { if selected == nil { await reload() } }
    }

    private var listBody: some View {
        VStack(spacing: 0) {
            if !items.isEmpty {
                HStack(spacing: 0) {
                    tdKpi("Total", "\(items.count)", .primary)
                    Divider().frame(height: 36)
                    tdKpi("Activas", "\(items.filter(\.isActive).count)", .green)
                    Divider().frame(height: 36)
                    tdKpi("Cerradas", "\(items.filter(\.isClosed).count)", .secondary)
                }
                .padding(.horizontal).padding(.vertical, 6)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal).padding(.top, 8)
            }

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                TextField("Buscar licitación…", text: $query).autocorrectionDisabled()
                if !query.isEmpty { Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundColor(.secondary) } }
            }
            .padding(10)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal).padding(.top, 8)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(statuses, id: \.self) { s in
                        let sel = statusFilter == s
                        Button { statusFilter = s } label: {
                            Text(s.capitalized).font(.caption).bold()
                                .padding(.horizontal, 12).padding(.vertical, 6)
                                .background(sel ? Color.indigo : Color(.secondarySystemGroupedBackground))
                                .foregroundColor(sel ? .white : .primary).clipShape(Capsule())
                        }
                    }
                }
                .padding(.horizontal)
            }
            .padding(.top, 6)

            if isLoading { Spacer(); ProgressView(); Spacer() }
            else if filtered.isEmpty { Spacer(); Text("Sin licitaciones").foregroundColor(.secondary); Spacer() }
            else {
                List(filtered) { t in
                    Button { selected = t } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(t.displayTitle).font(.headline).foregroundColor(.primary)
                                Spacer()
                                OpsStatusChip(text: t.status)
                            }
                            if !t.clientName.isEmpty { Text(t.clientName).font(.caption).foregroundColor(.secondary) }
                            let deadline = String(t.deadline.prefix(10))
                            if !deadline.isEmpty { Text("Vence: \(deadline)").font(.caption2).foregroundColor(.orange) }
                        }
                        .padding(.vertical, 2)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder
    private func tenderDetail(_ t: Tender) -> some View {
        List {
            Section { Button("← Licitaciones") { selected = nil } }
            Section("Licitación") {
                tdRow("Título", t.displayTitle)
                tdRow("Cliente", t.clientName)
                tdRow("Estado", t.status)
                tdRow("Monto", fmtMxn(t.amount))
                tdRow("Fecha límite", String(t.deadline.prefix(10)))
                tdRow("Descripción", t.description)
                tdRow("Resultado", t.result)
                tdRow("Responsable", t.ownerName)
            }
        }
        .listStyle(.insetGrouped)
    }

    private func tdKpi(_ l: String, _ v: String, _ c: Color) -> some View {
        VStack(spacing: 2) { Text(v).font(.headline).bold().foregroundColor(c); Text(l).font(.caption2).foregroundColor(.secondary) }
            .frame(maxWidth: .infinity).padding(.vertical, 4)
    }

    @ViewBuilder private func tdRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty && v != "$0" { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await CrmRepository.shared.tenderItems()) ?? []
    }
}

// MARK: - Metas comerciales

struct CrmTargetsView: View {
    @State private var items: [SalesTarget] = []
    @State private var isLoading = true
    @State private var query = ""

    private var filtered: [SalesTarget] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter { $0.ownerName.lowercased().contains(q) }
    }

    private var totalTarget: Double { items.reduce(0.0) { $0 + $1.targetAmount } }
    private var totalActual: Double { items.reduce(0.0) { $0 + $1.actualAmount } }

    var body: some View {
        VStack(spacing: 0) {
            if !items.isEmpty {
                HStack(spacing: 0) {
                    tgKpi("Vendedores", "\(items.count)", .primary)
                    Divider().frame(height: 36)
                    tgKpi("Meta total", fmtMxn(totalTarget), .blue)
                    Divider().frame(height: 36)
                    tgKpi("Alcanzado", fmtMxn(totalActual), totalActual >= totalTarget ? .green : .orange)
                }
                .padding(.horizontal).padding(.vertical, 6)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal).padding(.top, 8)
            }

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                TextField("Buscar vendedor…", text: $query).autocorrectionDisabled()
                if !query.isEmpty { Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundColor(.secondary) } }
            }
            .padding(10).background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12)).padding(.horizontal).padding(.top, 8)

            if isLoading { Spacer(); ProgressView(); Spacer() }
            else if filtered.isEmpty { Spacer(); Text("Sin metas definidas").foregroundColor(.secondary); Spacer() }
            else {
                List(filtered) { t in
                    let pct = t.progress
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(t.ownerName).font(.headline)
                            Spacer()
                            Text(fmtMxn(t.actualAmount)).font(.subheadline.bold()).foregroundColor(pct >= 1 ? .green : .orange)
                        }
                        Text("\(t.year) / \(t.month)").font(.caption).foregroundColor(.secondary)
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 4).fill(Color.secondary.opacity(0.2)).frame(height: 6)
                                RoundedRectangle(cornerRadius: 4).fill(pct >= 1 ? Color.green : Color.orange)
                                    .frame(width: geo.size.width * CGFloat(pct), height: 6)
                            }
                        }
                        .frame(height: 6)
                        Text("Meta: \(fmtMxn(t.targetAmount)) · \(Int(pct * 100))%").font(.caption2).foregroundColor(.secondary)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .navigationTitle("Metas")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func tgKpi(_ l: String, _ v: String, _ c: Color) -> some View {
        VStack(spacing: 2) { Text(v).font(.headline).bold().foregroundColor(c); Text(l).font(.caption2).foregroundColor(.secondary) }
            .frame(maxWidth: .infinity).padding(.vertical, 4)
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await CrmRepository.shared.salesTargetItems()) ?? []
    }
}

// MARK: - Equipo comercial

struct CrmSalesTeamView: View {
    @State private var items: [SalesTeamMember] = []
    @State private var isLoading = true
    @State private var query = ""

    private var filtered: [SalesTeamMember] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter { $0.name.lowercased().contains(q) }
    }

    private var totalSales: Double { items.reduce(0.0) { $0 + $1.totalSales } }

    var body: some View {
        VStack(spacing: 0) {
            if !items.isEmpty {
                HStack(spacing: 0) {
                    stKpi("Vendedores", "\(items.count)", .primary)
                    Divider().frame(height: 36)
                    stKpi("Total ventas", fmtMxn(totalSales), .green)
                    Divider().frame(height: 36)
                    stKpi("Promedio", fmtMxn(items.isEmpty ? 0 : totalSales / Double(items.count)), .teal)
                }
                .padding(.horizontal).padding(.vertical, 6)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal).padding(.top, 8)
            }

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                TextField("Buscar vendedor…", text: $query).autocorrectionDisabled()
                if !query.isEmpty { Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundColor(.secondary) } }
            }
            .padding(10).background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12)).padding(.horizontal).padding(.top, 8)

            if isLoading { Spacer(); ProgressView(); Spacer() }
            else if filtered.isEmpty { Spacer(); Text("Sin datos de equipo").foregroundColor(.secondary); Spacer() }
            else {
                List(filtered) { v in
                    let maxSales = items.map(\.totalSales).max() ?? 1
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(v.name).font(.headline)
                                if !v.role.isEmpty { Text(v.role).font(.caption).foregroundColor(.secondary) }
                            }
                            Spacer()
                            Text(fmtMxn(v.totalSales)).font(.subheadline.bold()).foregroundColor(.green)
                        }
                        if !v.totalLeads.isEmpty || !v.totalOpps.isEmpty {
                            HStack(spacing: 12) {
                                if !v.totalLeads.isEmpty { Label(v.totalLeads + " leads", systemImage: "person.badge.plus").font(.caption).foregroundColor(.secondary) }
                                if !v.totalOpps.isEmpty { Label(v.totalOpps + " opps", systemImage: "target").font(.caption).foregroundColor(.secondary) }
                            }
                        }
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 4).fill(Color.secondary.opacity(0.2)).frame(height: 5)
                                RoundedRectangle(cornerRadius: 4).fill(Color.green)
                                    .frame(width: geo.size.width * CGFloat(maxSales > 0 ? v.totalSales / maxSales : 0), height: 5)
                            }
                        }
                        .frame(height: 5)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .navigationTitle("Equipo comercial")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func stKpi(_ l: String, _ v: String, _ c: Color) -> some View {
        VStack(spacing: 2) { Text(v).font(.headline).bold().foregroundColor(c); Text(l).font(.caption2).foregroundColor(.secondary) }
            .frame(maxWidth: .infinity).padding(.vertical, 4)
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await CrmRepository.shared.salesTeamMemberItems()) ?? []
    }
}

private extension ConsoleHelpers {
    static func mapStr(_ m: [String: Any], _ k1: String, _ k2: String = "", default def: String = "") -> String {
        let a = mapStr(m, k1)
        if !a.isEmpty { return a }
        if !k2.isEmpty { let b = mapStr(m, k2); if !b.isEmpty { return b } }
        return def
    }

    static func mapDouble(_ m: [String: Any], _ k1: String, _ k2: String = "") -> Double {
        for k in [k1, k2] where !k.isEmpty {
            if let n = m[k] as? Double { return n }
            if let n = m[k] as? Int { return Double(n) }
            if let s = m[k] as? String, let n = Double(s) { return n }
        }
        return 0
    }
}

private func fmtMxn(_ v: Double) -> String {
    if v >= 1_000_000 { return String(format: "$%.1fM", v / 1_000_000) }
    if v >= 1_000 { return String(format: "$%.0fK", v / 1_000) }
    return String(format: "$%.0f", v)
}

private func statNum(_ s: [String: Any], _ key: String) -> Double {
    let v = s[key]
    if let n = v as? Double { return n }
    if let n = v as? Int { return Double(n) }
    if let n = v as? Int64 { return Double(n) }
    if let str = v as? String, let n = Double(str) { return n }
    return 0
}

private func statInt(_ s: [String: Any], _ key: String) -> Int { Int(statNum(s, key)) }

private func computeClientHealth(stats: [String: Any]?, status: String) -> (score: Int, label: String) {
    var score = 100
    if status == "Inactivo" || status == "INACTIVE" { score -= 25 }
    let s = stats ?? [:]
    if statInt(s, "activitiesOpen") > 3 { score -= 10 }
    if statInt(s, "pendingInvoices") > 0 { score -= 15 }
    if statInt(s, "ticketRequests") > 2 { score -= 10 }
    if statInt(s, "opportunitiesOpen") == 0 && statInt(s, "totalSalesProjects") == 0 { score -= 5 }
    if score >= 75 { return (score, "Saludable") }
    if score >= 50 { return (score, "En riesgo") }
    return (score, "Crítico")
}

private func snapPickDate(_ raw: Any?) -> String? {
    guard let raw else { return nil }
    let s = String(describing: raw).trimmingCharacters(in: .whitespacesAndNewlines)
    if s.isEmpty { return nil }
    return String(s.prefix(19))
}

private func buildClient360Timeline(snapshot: [String: Any]) -> [(title: String, kind: String, subtitle: String)] {
  var events: [(at: String, title: String, kind: String, subtitle: String)] = []

    if let opps = snapshot["opportunities"] as? [[String: Any]] {
        for row in opps {
            guard let at = snapPickDate(row["updatedAt"] ?? row["createdAt"]) else { continue }
            let title = ConsoleHelpers.mapStr(row, "title").isEmpty ? "Oportunidad" : ConsoleHelpers.mapStr(row, "title")
            events.append((at, title, "oportunidad", ConsoleHelpers.mapStr(row, "stage")))
        }
    }
    if let quotes = snapshot["quotes"] as? [[String: Any]] {
        for row in quotes {
            let cot = (row["cotizacion"] as? [String: Any]) ?? row
            guard let at = snapPickDate(cot["createdAt"] ?? row["createdAt"]) else { continue }
            let title = ConsoleHelpers.mapStr(cot, "quoteNumber", "folio")
            events.append((at, title.isEmpty ? "Cotización" : title, "cotización", ConsoleHelpers.mapStr(cot, "status", "estatus")))
        }
    }
    if let activities = snapshot["activities"] as? [[String: Any]] {
        for row in activities {
            guard let at = snapPickDate(row["fechaAsignacion"] ?? row["createdAt"]) else { continue }
            let title = ConsoleHelpers.mapStr(row, "titulo", "anNumber")
            events.append((at, title.isEmpty ? "Actividad" : title, "actividad", ConsoleHelpers.mapStr(row, "estatus", "status")))
        }
    }
    if let tickets = snapshot["ticketRequests"] as? [[String: Any]] {
        for row in tickets {
            guard let at = snapPickDate(row["createdAt"]) else { continue }
            let desc = ConsoleHelpers.mapStr(row, "description", "subject", "descripcion")
            let title = desc.isEmpty ? "Ticket" : String(desc.prefix(80))
            events.append((at, title, "ticket", ConsoleHelpers.mapStr(row, "status", "estado")))
        }
    }
    if let invoices = snapshot["invoices"] as? [[String: Any]] {
        for row in invoices {
            guard let at = snapPickDate(row["issueDate"] ?? row["createdAt"]) else { continue }
            let title = ConsoleHelpers.mapStr(row, "invoiceNumber", "folio")
            events.append((at, title.isEmpty ? "Factura" : title, "factura", ConsoleHelpers.mapStr(row, "status", "estado")))
        }
    }

    return events
        .sorted { $0.at > $1.at }
        .prefix(25)
        .map { (title: $0.title, kind: $0.kind, subtitle: $0.subtitle) }
}

// MARK: - Client Detail (tabbed)

private let clientIndustries = [
    "Corporativo", "Gobierno", "PyME", "Hogar", "Retail", "Industrial", "Educación", "Salud", "Otro",
]
private let clientStatuses = ["Activo", "Inactivo", "Prospecto"]

private func hasServiceClientLinked(_ client: [String: Any]) -> Bool {
    guard let v = client["serviceClientId"] else { return false }
    if let n = v as? NSNumber { return n.int64Value > 0 }
    if let s = v as? String { return !s.isEmpty && s != "0" && s != "null" }
    if let n = v as? Int { return n > 0 }
    if let n = v as? Int64 { return n > 0 }
    return false
}

private struct CrmClientDatosFormState {
    var name = ""
    var legalName = ""
    var taxId = ""
    var billingEmail = ""
    var billingPhone = ""
    var industry = "PyME"
    var status = "Prospecto"
    var fiscalAddress = ""
    var fiscalZipCode = ""
    var fiscalRegime = "601"
    var website = ""
    var notes = ""

    mutating func load(from client: [String: Any]) {
        name = ConsoleHelpers.mapStr(client, "name", "nombre")
        legalName = ConsoleHelpers.mapStr(client, "legalName", "razonSocial")
        taxId = ConsoleHelpers.mapStr(client, "taxId", "rfc")
        billingEmail = ConsoleHelpers.mapStr(client, "billingEmail", "email")
        billingPhone = ConsoleHelpers.mapStr(client, "billingPhone", "phone", "telefono")
        industry = ConsoleHelpers.mapStr(client, "industry").ifEmptyExt("PyME")
        status = ConsoleHelpers.mapStr(client, "status", "estatus").ifEmptyExt("Prospecto")
        fiscalAddress = ConsoleHelpers.mapStr(client, "fiscalAddress")
        fiscalZipCode = ConsoleHelpers.mapStr(client, "fiscalZipCode")
        fiscalRegime = ConsoleHelpers.mapStr(client, "fiscalRegime").ifEmptyExt("601")
        website = ConsoleHelpers.mapStr(client, "website")
        notes = ConsoleHelpers.mapStr(client, "notes", "notas")
    }

    func toPayload() -> [String: String] {
        [
            "name": name.trimmingCharacters(in: .whitespaces),
            "legalName": legalName.trimmingCharacters(in: .whitespaces),
            "taxId": taxId.trimmingCharacters(in: .whitespaces),
            "billingEmail": billingEmail.trimmingCharacters(in: .whitespaces),
            "billingPhone": billingPhone.trimmingCharacters(in: .whitespaces),
            "industry": industry,
            "status": status,
            "fiscalAddress": fiscalAddress.trimmingCharacters(in: .whitespaces),
            "fiscalZipCode": fiscalZipCode.trimmingCharacters(in: .whitespaces),
            "fiscalRegime": fiscalRegime.trimmingCharacters(in: .whitespaces),
            "website": website.trimmingCharacters(in: .whitespaces),
            "notes": notes.trimmingCharacters(in: .whitespaces),
        ]
    }
}

private struct CrmClientDatosEditSheet: View {
    @Binding var state: CrmClientDatosFormState
    let saving: Bool
    let error: String?
    let onDismiss: () -> Void
    let onSave: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Datos generales") {
                    TextField("Nombre comercial *", text: $state.name)
                    TextField("Razón social", text: $state.legalName)
                    TextField("RFC", text: $state.taxId)
                    TextField("CP fiscal (CFDI)", text: $state.fiscalZipCode)
                        .keyboardType(.numberPad)
                    TextField("Régimen fiscal", text: $state.fiscalRegime)
                    TextField("Sitio web", text: $state.website)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                    TextField("Email facturación", text: $state.billingEmail)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                    TextField("Teléfono", text: $state.billingPhone)
                        .keyboardType(.phonePad)
                    TextField("Dirección fiscal", text: $state.fiscalAddress, axis: .vertical)
                        .lineLimit(2...4)
                }
                Section("Industria") {
                    Picker("Industria", selection: $state.industry) {
                        ForEach(clientIndustries, id: \.self) { Text($0).tag($0) }
                    }
                }
                Section("Estado comercial") {
                    Picker("Estado", selection: $state.status) {
                        ForEach(clientStatuses, id: \.self) { Text($0).tag($0) }
                    }
                }
                Section("Notas internas") {
                    TextField("Notas", text: $state.notes, axis: .vertical)
                        .lineLimit(3...6)
                }
                if let error, !error.isEmpty {
                    Section { Text(error).foregroundColor(.red).font(.footnote) }
                }
            }
            .navigationTitle("Editar cliente")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar", action: onDismiss)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Guardando…" : "Guardar", action: onSave)
                        .disabled(saving || state.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}

struct CrmClientDetailByIdView: View {
    let clientId: Int64
    let onBack: () -> Void

    @State private var client: [String: Any]?
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        Group {
            if loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let client {
                CrmClientDetailView(client: client, onBack: onBack)
            } else {
                VStack(spacing: 12) {
                    Button("← Volver", action: onBack)
                    Text(error ?? "Cliente no encontrado").foregroundStyle(.red)
                }
                .padding()
            }
        }
        .task { await load() }
    }

    private func load() async {
        loading = true
        error = nil
        do {
            client = try await CrmRepository.shared.clientDetail(id: clientId)
            if (ConsoleHelpers.mapInt64(client ?? [:], "id") ?? 0) <= 0 {
                client = nil
                error = "Cliente no encontrado"
            }
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

struct CrmClientDetailView: View {
    @State private var clientData: [String: Any]
    let onBack: () -> Void

    @State private var tab = 0
    @State private var showEdit = false
    @State private var editForm = CrmClientDatosFormState()
    @State private var savingEdit = false
    @State private var provisioning = false
    @State private var actionError: String?
    @State private var reloadKey = 0
    @State private var cotizaciones: [Cotizacion] = []
    @State private var oportunidades: [CrmOpportunity] = []
    @State private var tickets: [[String: Any]] = []
    @State private var servicios: [[String: Any]] = []
    @State private var facturas: [[String: Any]] = []
    @State private var sucursales: [[String: Any]] = []
    @State private var snapshotStats: [String: Any]?
    @State private var timelineEvents: [(title: String, kind: String, subtitle: String)] = []
    @State private var healthLabel = ""
    @State private var healthScore = 0
    @State private var loading = true

    init(client: [String: Any], onBack: @escaping () -> Void) {
        _clientData = State(initialValue: client)
        self.onBack = onBack
    }

    private let tabs = ["360", "Cotizaciones", "Oportunidades", "Tickets", "Facturas", "Sucursales", "Servicios", "Timeline"]
    private var client: [String: Any] { clientData }
    private var clientName: String { ConsoleHelpers.mapStr(client, "name", "nombre", "razonSocial") }
    private var clientId: Int64 { ConsoleHelpers.mapInt64(client, "id") ?? 0 }
    private var hasServiceClient: Bool { hasServiceClientLinked(client) }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("← Volver", action: onBack)
                Spacer()
            }
            .padding(.horizontal, 12).padding(.vertical, 6)

            Text(clientName.isEmpty ? "Cliente" : clientName)
                .font(.headline).padding(.horizontal).padding(.bottom, 4)

            if !healthLabel.isEmpty {
                Text("Salud: \(healthLabel) (\(healthScore)/100)")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .padding(.horizontal)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    ForEach(0..<tabs.count, id: \.self) { i in
                        Button {
                            tab = i
                        } label: {
                            Text(tabs[i])
                                .font(.subheadline)
                                .padding(.horizontal, 14).padding(.vertical, 8)
                                .foregroundColor(tab == i ? .accentColor : .secondary)
                                .overlay(alignment: .bottom) {
                                    if tab == i { Rectangle().frame(height: 2).foregroundColor(.accentColor) }
                                }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 8)
            Divider()

            if loading {
                Spacer(); ProgressView(); Spacer()
            } else {
                switch tab {
                case 0: client360Tab
                case 1: cotizacionesTab
                case 2: oportunidadesTab
                case 3: ticketsTab
                case 4: facturasTab
                case 5: sucursalesTab
                case 6: serviciosTab
                default: timelineTab
                }
            }
        }
        .navigationBarHidden(true)
        .sheet(isPresented: $showEdit) {
            CrmClientDatosEditSheet(
                state: $editForm,
                saving: savingEdit,
                error: actionError,
                onDismiss: {
                    showEdit = false
                    actionError = nil
                },
                onSave: { Task { await saveEdit() } }
            )
        }
        .task(id: "\(clientId)-\(reloadKey)") { await load() }
    }

    private func openEdit() {
        editForm.load(from: client)
        actionError = nil
        showEdit = true
    }

    private func saveEdit() async {
        guard clientId > 0 else { return }
        savingEdit = true
        actionError = nil
        defer { savingEdit = false }
        do {
            let updated = try await CrmRepository.shared.updateClient(id: clientId, fields: editForm.toPayload())
            clientData = updated
            showEdit = false
            reloadKey += 1
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func provisionServiceClient() async {
        guard clientId > 0 else { return }
        provisioning = true
        actionError = nil
        defer { provisioning = false }
        do {
            clientData = try await CrmRepository.shared.provisionServiceClient(id: clientId)
            reloadKey += 1
        } catch {
            actionError = error.localizedDescription
        }
    }

    private var client360Tab: some View {
        List {
            if let stats = snapshotStats {
                Section("KPIs") {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        kpiCell("Pipeline", fmtMxn(statNum(stats, "pipelineValue")))
                        kpiCell("OT abiertas", "\(statInt(stats, "activitiesOpen"))")
                        kpiCell("Facturas pend.", "\(statInt(stats, "pendingInvoices"))")
                        kpiCell("Contratos", "\(statInt(stats, "activeContracts"))")
                    }
                    .padding(.vertical, 4)
                }
            }
            Section {
                HStack {
                    if !hasServiceClient {
                        Button(provisioning ? "Activando…" : "Activar en operación") {
                            Task { await provisionServiceClient() }
                        }
                        .disabled(provisioning)
                    }
                    Spacer()
                    Button("Editar datos", action: openEdit)
                }
                if let actionError, !actionError.isEmpty {
                    Text(actionError).font(.footnote).foregroundColor(.red)
                }
            }
            Section("Datos del cliente") {
                infoRow("Estado comercial", ConsoleHelpers.mapStr(client, "status", "estatus").ifEmptyExt("Prospecto"))
                infoRow("Industria", ConsoleHelpers.mapStr(client, "industry"))
                infoRow("Nombre comercial", ConsoleHelpers.mapStr(client, "name", "nombre"))
                infoRow("Razón social", ConsoleHelpers.mapStr(client, "legalName", "razonSocial"))
                infoRow("RFC", ConsoleHelpers.mapStr(client, "taxId", "rfc"))
                infoRow("CP fiscal", ConsoleHelpers.mapStr(client, "fiscalZipCode"))
                infoRow("Régimen fiscal", ConsoleHelpers.mapStr(client, "fiscalRegime"))
                infoRow("Email facturación", ConsoleHelpers.mapStr(client, "billingEmail", "email"))
                infoRow("Teléfono", ConsoleHelpers.mapStr(client, "billingPhone", "phone", "telefono"))
                infoRow("Sitio web", ConsoleHelpers.mapStr(client, "website"))
                infoRow("Dirección fiscal", ConsoleHelpers.mapStr(client, "fiscalAddress"))
                infoRow("Ciudad", ConsoleHelpers.mapStr(client, "city", "ciudad"))
                infoRow("Estado", ConsoleHelpers.mapStr(client, "state", "estado"))
                infoRow("País", ConsoleHelpers.mapStr(client, "country", "pais"))
                infoRow("Notas", ConsoleHelpers.mapStr(client, "notes", "notas"))
            }
        }
        .listStyle(.insetGrouped)
    }

    private func kpiCell(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundColor(.secondary)
            Text(value).font(.subheadline.bold())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var timelineTab: some View {
        Group {
            if timelineEvents.isEmpty {
                VStack { Spacer(); Text("Sin eventos recientes").foregroundColor(.secondary); Spacer() }
            } else {
                List(timelineEvents.indices, id: \.self) { idx in
                    let ev = timelineEvents[idx]
                    VStack(alignment: .leading, spacing: 4) {
                        Text(ev.title).font(.subheadline.bold())
                        Text([ev.kind, ev.subtitle].filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    private var cotizacionesTab: some View {
        return Group {
            if cotizaciones.isEmpty {
                VStack { Spacer(); Text("Sin cotizaciones").foregroundColor(.secondary); Spacer() }
            } else {
                List(cotizaciones) { cot in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack { Text(cot.displayFolio).font(.subheadline.bold()); Spacer(); Text(fmtMxn(cot.total)).bold() }
                        Text(cot.estatus).font(.caption).foregroundColor(.orange)
                    }
                }.listStyle(.plain)
            }
        }
    }

    private var oportunidadesTab: some View {
        return Group {
            if oportunidades.isEmpty {
                VStack { Spacer(); Text("Sin oportunidades").foregroundColor(.secondary); Spacer() }
            } else {
                List(oportunidades) { o in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(o.displayTitle).font(.subheadline.bold())
                        HStack {
                            Text(o.stageKey).font(.caption).foregroundColor(.blue)
                            Spacer()
                            if o.value > 0 { Text(fmtMxn(o.value)).font(.caption).bold() }
                        }
                    }
                }.listStyle(.plain)
            }
        }
    }

    private var ticketsTab: some View {
        return Group {
            if tickets.isEmpty {
                VStack { Spacer(); Text("Sin tickets del cliente").foregroundColor(.secondary); Spacer() }
            } else {
                List(tickets, id: \.crmKey) { t in
                    let subject = ConsoleHelpers.mapStr(t, "subject", "descripcion", "title")
                    let status  = ConsoleHelpers.mapStr(t, "status", "estado")
                    let date    = String(ConsoleHelpers.mapStr(t, "createdAt", "fecha").prefix(10))
                    VStack(alignment: .leading, spacing: 4) {
                        Text(subject.isEmpty ? "Ticket" : subject).font(.subheadline).bold()
                        HStack {
                            Text(status).font(.caption).foregroundColor(.orange)
                            Spacer()
                            if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
                        }
                    }
                }.listStyle(.plain)
            }
        }
    }

    @ViewBuilder private func infoRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value) }
        }
    }

    private var facturasTab: some View {
        Group {
            if facturas.isEmpty {
                VStack { Spacer(); Text("Sin facturas").foregroundColor(.secondary); Spacer() }
            } else {
                List(facturas, id: \.crmKey) { inv in
                    let num = ConsoleHelpers.mapStr(inv, "invoiceNumber", "folio")
                    let status = ConsoleHelpers.mapStr(inv, "status", "estado")
                    let total = ConsoleHelpers.mapDouble(inv, "totalAmount", "total")
                    VStack(alignment: .leading, spacing: 4) {
                        Text(num.isEmpty ? "Factura" : num).font(.subheadline.bold())
                        HStack {
                            if !status.isEmpty { Text(status).font(.caption).foregroundColor(.orange) }
                            Spacer()
                            Text(fmtMxn(total)).font(.caption.bold())
                        }
                    }
                }.listStyle(.plain)
            }
        }
    }

    private var sucursalesTab: some View {
        Group {
            if sucursales.isEmpty {
                VStack { Spacer(); Text("Sin sucursales").foregroundColor(.secondary); Spacer() }
            } else {
                List(sucursales, id: \.crmKey) { b in
                    let name = ConsoleHelpers.mapStr(b, "name", "nombre", "branchName")
                    let address = ConsoleHelpers.mapStr(b, "address", "direccion")
                    VStack(alignment: .leading, spacing: 4) {
                        Text(name.isEmpty ? "Sucursal" : name).font(.subheadline.bold())
                        if !address.isEmpty { Text(address).font(.caption).foregroundColor(.secondary) }
                    }
                }.listStyle(.plain)
            }
        }
    }

    private var serviciosTab: some View {
        return Group {
            if servicios.isEmpty {
                VStack { Spacer(); Text("Sin contratos de servicio").foregroundColor(.secondary); Spacer() }
            } else {
                List(servicios, id: \.crmKey) { s in
                    let name = ConsoleHelpers.mapStr(s, "name", "nombre", "contractNumber")
                    let status = ConsoleHelpers.mapStr(s, "status", "estado")
                    let expiry = String(ConsoleHelpers.mapStr(s, "expiresAt", "endDate", "vigencia").prefix(10))
                    VStack(alignment: .leading, spacing: 4) {
                        Text(name.isEmpty ? "Contrato" : name).font(.subheadline.bold())
                        HStack {
                            if !status.isEmpty { Text(status).font(.caption).foregroundColor(.orange) }
                            Spacer()
                            if !expiry.isEmpty { Text(expiry).font(.caption2).foregroundColor(.secondary) }
                        }
                    }
                }.listStyle(.plain)
            }
        }
    }

    private func load() async {
        loading = true
        let id = clientId
        if id > 0 {
            if let snap = try? await CrmRepository.shared.clientSnapshot(id: id) {
                snapshotStats = snap["stats"] as? [String: Any]
                let status = ConsoleHelpers.mapStr(client, "status", "estatus")
                let health = computeClientHealth(stats: snapshotStats, status: status)
                healthScore = health.score
                healthLabel = health.label
                timelineEvents = buildClient360Timeline(snapshot: snap)
                if let opps = snap["opportunities"] as? [[String: Any]] {
                    oportunidades = opps.map { CrmOpportunity(raw: $0) }
                }
                if let quotes = snap["quotes"] as? [[String: Any]] {
                    cotizaciones = quotes.compactMap { row -> Cotizacion? in
                        let cot = (row["cotizacion"] as? [String: Any]) ?? row
                        let parsed = Cotizacion(raw: cot)
                        return parsed.id > 0 ? parsed : nil
                    }
                }
                tickets = snap["ticketRequests"] as? [[String: Any]] ?? []
                servicios = snap["maintenanceContracts"] as? [[String: Any]] ?? []
                facturas = snap["invoices"] as? [[String: Any]] ?? []
                if let clientMap = snap["client"] as? [String: Any] {
                    sucursales = clientMap["branches"] as? [[String: Any]] ?? []
                }
                loading = false
                return
            }
        }
        let clientIdStr = String(id)
        async let cots = ExtraRepository.shared.cotizacionItems()
        async let opps = (try? await CrmRepository.shared.opportunityItems()) ?? []
        async let tks  = ExtraRepository.shared.clientTickets()
        async let srv  = ExtraRepository.shared.maintenanceContracts(clientId: clientIdStr)
        let (c, o, t, sv) = await (cots, opps, tks, srv)
        cotizaciones = c.filter { cot in
            let scId = StockParse.int64(cot.raw["salesClientId"]) ?? StockParse.int64(cot.raw["clientId"]) ?? 0
            return scId == id
        }
        oportunidades = o
        tickets = t
        servicios = sv
        loading = false
    }
}

private extension String {
    func ifBlankExt(_ fallback: String) -> String { isEmpty ? fallback : self }
}
