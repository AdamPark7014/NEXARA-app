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

// MARK: - Client Detail (tabbed)

struct CrmClientDetailView: View {
    let client: [String: Any]
    let onBack: () -> Void

    @State private var tab = 0
    @State private var cotizaciones: [Cotizacion] = []
    @State private var oportunidades: [CrmOpportunity] = []
    @State private var tickets: [[String: Any]] = []
    @State private var sucursales: [[String: Any]] = []
    @State private var servicios: [[String: Any]] = []
    @State private var loading = true

    private let tabs = ["Info", "Cotizaciones", "Oportunidades", "Tickets", "Sucursales", "Servicios"]
    private var clientName: String { ConsoleHelpers.mapStr(client, "name", "nombre", "razonSocial") }
    private var clientId: String { ConsoleHelpers.mapStr(client, "id") }
    private var serviceClientId: String {
        let scId = ConsoleHelpers.mapStr(client, "serviceClientId", "scId")
        return scId.isEmpty ? clientId : scId
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("← Volver", action: onBack)
                Spacer()
            }
            .padding(.horizontal, 12).padding(.vertical, 6)

            Text(clientName.isEmpty ? "Cliente" : clientName)
                .font(.headline).padding(.horizontal).padding(.bottom, 4)

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
                case 0: infoTab
                case 1: cotizacionesTab
                case 2: oportunidadesTab
                case 3: ticketsTab
                case 4: sucursalesTab
                default: serviciosTab
                }
            }
        }
        .navigationBarHidden(true)
        .task { await load() }
    }

    private var infoTab: some View {
        List {
            Section("Datos del cliente") {
                infoRow("Nombre", ConsoleHelpers.mapStr(client, "name", "nombre", "razonSocial"))
                infoRow("RFC", ConsoleHelpers.mapStr(client, "rfc"))
                infoRow("Email", ConsoleHelpers.mapStr(client, "email"))
                infoRow("Teléfono", ConsoleHelpers.mapStr(client, "phone", "telefono"))
                infoRow("Ciudad", ConsoleHelpers.mapStr(client, "city", "ciudad"))
                infoRow("Estado", ConsoleHelpers.mapStr(client, "state", "estado"))
                infoRow("País", ConsoleHelpers.mapStr(client, "country", "pais"))
            }
        }
        .listStyle(.insetGrouped)
    }

    private var cotizacionesTab: some View {
        let prefix = clientName.lowercased().prefix(6)
        let cots = cotizaciones.filter { cot in
            clientName.isEmpty || cot.cliente.lowercased().contains(prefix)
        }
        return Group {
            if cots.isEmpty {
                VStack { Spacer(); Text("Sin cotizaciones").foregroundColor(.secondary); Spacer() }
            } else {
                List(cots) { cot in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack { Text(cot.displayFolio).font(.subheadline.bold()); Spacer(); Text(fmtMxn(cot.total)).bold() }
                        Text(cot.estatus).font(.caption).foregroundColor(.orange)
                    }
                }.listStyle(.plain)
            }
        }
    }

    private var oportunidadesTab: some View {
        let prefix = clientName.lowercased().prefix(6)
        let opps = oportunidades.filter { o in
            clientName.isEmpty || o.clientName.lowercased().contains(prefix)
        }
        return Group {
            if opps.isEmpty {
                VStack { Spacer(); Text("Sin oportunidades").foregroundColor(.secondary); Spacer() }
            } else {
                List(opps) { o in
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

    @ViewBuilder private func infoRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value) }
        }
    }

    private var ticketsTab: some View {
        let prefix6 = clientName.lowercased().prefix(6)
        let tks = tickets.filter { t in
            let cn = (t["clientName"] as? String ?? t["branchName"] as? String ?? "").lowercased()
            return clientName.isEmpty || cn.contains(prefix6)
        }
        return Group {
            if tks.isEmpty {
                VStack { Spacer(); Text("Sin tickets del cliente").foregroundColor(.secondary); Spacer() }
            } else {
                List(tks, id: \.crmKey) { t in
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

    private var sucursalesTab: some View {
        return Group {
            if sucursales.isEmpty {
                VStack { Spacer(); Text("Sin sucursales registradas").foregroundColor(.secondary); Spacer() }
            } else {
                List(sucursales, id: \.crmKey) { b in
                    let name = ConsoleHelpers.mapStr(b, "name", "nombre", "branchName")
                    let address = ConsoleHelpers.mapStr(b, "address", "direccion")
                    let city = ConsoleHelpers.mapStr(b, "city", "ciudad")
                    VStack(alignment: .leading, spacing: 4) {
                        Text(name.isEmpty ? "Sucursal" : name).font(.subheadline.bold())
                        if !address.isEmpty { Text(address).font(.caption).foregroundColor(.secondary) }
                        if !city.isEmpty { Text(city).font(.caption2).foregroundColor(.secondary) }
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
        async let cots = ExtraRepository.shared.cotizacionItems()
        async let opps = (try? await CrmRepository.shared.opportunityItems()) ?? []
        async let tks  = ExtraRepository.shared.clientTickets()
        async let suc  = ExtraRepository.shared.serviceClientBranches(serviceClientId: serviceClientId)
        async let srv  = ExtraRepository.shared.maintenanceContracts(clientId: clientId)
        let (c, o, t, s, sv) = await (cots, opps, tks, suc, srv)
        cotizaciones = c
        oportunidades = o
        tickets = t
        sucursales = s
        servicios = sv
        loading = false
    }
}

private extension String {
    func ifBlankExt(_ fallback: String) -> String { isEmpty ? fallback : self }
}
