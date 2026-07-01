import SwiftUI

// MARK: - Pipeline (oportunidades por etapa)

struct CrmPipelineView: View {
    @State private var stages: [(String, [[String: Any]])] = []
    @State private var isLoading = true

    var body: some View {
        ScrollView {
            if isLoading { ProgressView().padding(.top, 40) }
            else if stages.isEmpty {
                Text("Sin oportunidades en pipeline").foregroundColor(.secondary).padding()
            } else {
                LazyVStack(alignment: .leading, spacing: 16) {
                    ForEach(stages, id: \.0) { stage, items in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(stage).font(.headline)
                                Spacer()
                                Text("\(items.count)").font(.caption.bold())
                                    .padding(.horizontal, 8).padding(.vertical, 2)
                                    .background(Color.green.opacity(0.15)).clipShape(Capsule())
                            }
                            ForEach(items.indices, id: \.self) { i in
                                let o = items[i]
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(ConsoleHelpers.mapStr(o, "title", "name")).font(.subheadline.bold())
                                    Text(fmtMxn(ConsoleHelpers.mapDouble(o, "value", "amount")))
                                        .font(.caption).foregroundColor(.green)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10)
                                .background(Color(.secondarySystemGroupedBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                        }
                    }
                }
                .padding()
            }
        }
        .navigationTitle("Pipeline")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        let list = (try? await CrmRepository.shared.oportunidades()) ?? []
        let grouped = Dictionary(grouping: list) { item -> String in
            let s = ConsoleHelpers.mapStr(item, "stage")
            if !s.isEmpty { return s }
            let e = ConsoleHelpers.mapStr(item, "etapa")
            return e.isEmpty ? "Sin etapa" : e
        }
        stages = grouped.keys.sorted().map { ($0, grouped[$0] ?? []) }
    }
}

// MARK: - Agenda

struct CrmAgendaView: View {
    @State private var events: [[String: Any]] = []
    @State private var isLoading = true
    @State private var query = ""
    @State private var selected: [String: Any]?

    private var filtered: [[String: Any]] {
        guard !query.isEmpty else { return events }
        let q = query.lowercased()
        return events.filter {
            ConsoleHelpers.mapStr($0, "title", "subject").lowercased().contains(q) ||
            ConsoleHelpers.mapStr($0, "ownerName").lowercased().contains(q)
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
                List(filtered, id: \.agKey) { ev in
                    Button { selected = ev } label: {
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(ConsoleHelpers.mapStr(ev, "title", "subject")).font(.headline).foregroundColor(.primary)
                                let date = ConsoleHelpers.mapStr(ev, "startAt", "start", "fecha")
                                if !date.isEmpty { Text(String(date.prefix(16))).font(.caption).foregroundColor(.secondary) }
                                let owner = ConsoleHelpers.mapStr(ev, "ownerName", "attendeeName")
                                if !owner.isEmpty { Text(owner).font(.caption2).foregroundColor(.secondary) }
                            }
                            Spacer()
                            let evType = ConsoleHelpers.mapStr(ev, "type", "tipo")
                            if !evType.isEmpty {
                                Text(evType).font(.caption2).padding(.horizontal, 6).padding(.vertical, 2)
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
    private func agendaDetail(_ ev: [String: Any]) -> some View {
        List {
            Section {
                Button("← Agenda") { selected = nil }
            }
            Section("Evento") {
                agRow("Título", ConsoleHelpers.mapStr(ev, "title", "subject"))
                agRow("Tipo", ConsoleHelpers.mapStr(ev, "type", "tipo"))
                agRow("Inicio", String(ConsoleHelpers.mapStr(ev, "startAt", "start", "fecha").prefix(16)))
                agRow("Fin", String(ConsoleHelpers.mapStr(ev, "endAt", "end", "fin").prefix(16)))
                agRow("Responsable", ConsoleHelpers.mapStr(ev, "ownerName", "attendeeName"))
                agRow("Descripción", ConsoleHelpers.mapStr(ev, "description", "notes", "descripcion"))
                agRow("Ubicación", ConsoleHelpers.mapStr(ev, "location", "ubicacion"))
                agRow("Resultado", ConsoleHelpers.mapStr(ev, "result", "resultado"))
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
        events = (try? await CrmRepository.shared.calendarEvents()) ?? []
    }
}

// MARK: - Licitaciones

struct CrmTendersView: View {
    @State private var items: [[String: Any]] = []
    @State private var isLoading = true
    @State private var query = ""
    @State private var statusFilter = "todos"
    @State private var selected: [String: Any]?

    private var statuses: [String] {
        ["todos"] + Array(Set(items.map { ConsoleHelpers.mapStr($0, "status", "estado").lowercased() }.filter { !$0.isEmpty })).sorted()
    }

    private var filtered: [[String: Any]] {
        var list = items
        if statusFilter != "todos" {
            list = list.filter { ConsoleHelpers.mapStr($0, "status", "estado").lowercased() == statusFilter }
        }
        if !query.isEmpty {
            let q = query.lowercased()
            list = list.filter { ConsoleHelpers.mapStr($0, "title", "name").lowercased().contains(q) ||
                ConsoleHelpers.mapStr($0, "clientName", "cliente").lowercased().contains(q) }
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
                    tdKpi("Activas", "\(items.filter { ["activo","abierto","open"].contains(ConsoleHelpers.mapStr($0,"status","estado").lowercased()) }.count)", .green)
                    Divider().frame(height: 36)
                    tdKpi("Cerradas", "\(items.filter { ["cerrado","closed","ganado","perdido"].contains(ConsoleHelpers.mapStr($0,"status","estado").lowercased()) }.count)", .secondary)
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
                List(filtered, id: \.tdKey) { t in
                    Button { selected = t } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(ConsoleHelpers.mapStr(t, "title", "name")).font(.headline).foregroundColor(.primary)
                                Spacer()
                                OpsStatusChip(text: ConsoleHelpers.mapStr(t, "status", "estado"))
                            }
                            let client = ConsoleHelpers.mapStr(t, "clientName", "cliente")
                            if !client.isEmpty { Text(client).font(.caption).foregroundColor(.secondary) }
                            let deadline = String(ConsoleHelpers.mapStr(t, "deadline", "dueDate", "fechaLimite").prefix(10))
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
    private func tenderDetail(_ t: [String: Any]) -> some View {
        List {
            Section { Button("← Licitaciones") { selected = nil } }
            Section("Licitación") {
                tdRow("Título", ConsoleHelpers.mapStr(t, "title", "name"))
                tdRow("Cliente", ConsoleHelpers.mapStr(t, "clientName", "cliente"))
                tdRow("Estado", ConsoleHelpers.mapStr(t, "status", "estado"))
                tdRow("Monto", fmtMxn(ConsoleHelpers.mapDouble(t, "amount", "value", "monto")))
                tdRow("Fecha límite", String(ConsoleHelpers.mapStr(t, "deadline", "dueDate").prefix(10)))
                tdRow("Descripción", ConsoleHelpers.mapStr(t, "description", "notes"))
                tdRow("Resultado", ConsoleHelpers.mapStr(t, "result", "resultado"))
                tdRow("Responsable", ConsoleHelpers.mapStr(t, "ownerName", "responsable"))
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
        items = (try? await CrmRepository.shared.tenders()) ?? []
    }
}

// MARK: - Metas comerciales

struct CrmTargetsView: View {
    @State private var items: [[String: Any]] = []
    @State private var isLoading = true
    @State private var query = ""

    private var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter { ConsoleHelpers.mapStr($0, "ownerName", "userName").lowercased().contains(q) }
    }

    private var totalTarget: Double { items.reduce(0.0) { $0 + ConsoleHelpers.mapDouble($1, "targetAmount", "amount") } }
    private var totalActual: Double { items.reduce(0.0) { $0 + ConsoleHelpers.mapDouble($1, "actualAmount", "actual", "currentAmount") } }

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
                List(filtered, id: \.tgKey) { t in
                    let target = ConsoleHelpers.mapDouble(t, "targetAmount", "amount")
                    let actual = ConsoleHelpers.mapDouble(t, "actualAmount", "actual", "currentAmount")
                    let pct    = target > 0 ? min(actual / target, 1.0) : 0
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(ConsoleHelpers.mapStr(t, "ownerName", "userName")).font(.headline)
                            Spacer()
                            Text(fmtMxn(actual)).font(.subheadline.bold()).foregroundColor(pct >= 1 ? .green : .orange)
                        }
                        Text("\(ConsoleHelpers.mapStr(t, "year")) / \(ConsoleHelpers.mapStr(t, "month"))").font(.caption).foregroundColor(.secondary)
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 4).fill(Color.secondary.opacity(0.2)).frame(height: 6)
                                RoundedRectangle(cornerRadius: 4).fill(pct >= 1 ? Color.green : Color.orange)
                                    .frame(width: geo.size.width * CGFloat(pct), height: 6)
                            }
                        }
                        .frame(height: 6)
                        Text("Meta: \(fmtMxn(target)) · \(Int(pct * 100))%").font(.caption2).foregroundColor(.secondary)
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
        items = (try? await CrmRepository.shared.salesTargets()) ?? []
    }
}

// MARK: - Equipo comercial

struct CrmSalesTeamView: View {
    @State private var items: [[String: Any]] = []
    @State private var isLoading = true
    @State private var query = ""

    private var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter { ConsoleHelpers.mapStr($0, "nombre", "name", "userName").lowercased().contains(q) }
    }

    private var totalSales: Double { items.reduce(0.0) { $0 + ConsoleHelpers.mapDouble($1, "totalVentas", "salesTotal", "amount") } }

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
                List(filtered, id: \.stKey) { v in
                    let sales = ConsoleHelpers.mapDouble(v, "totalVentas", "salesTotal", "amount")
                    let maxSales = items.map { ConsoleHelpers.mapDouble($0, "totalVentas", "salesTotal", "amount") }.max() ?? 1
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ConsoleHelpers.mapStr(v, "nombre", "name", "userName")).font(.headline)
                                let role = ConsoleHelpers.mapStr(v, "role", "puesto", "cargo")
                                if !role.isEmpty { Text(role).font(.caption).foregroundColor(.secondary) }
                            }
                            Spacer()
                            Text(fmtMxn(sales)).font(.subheadline.bold()).foregroundColor(.green)
                        }
                        let leads = ConsoleHelpers.mapStr(v, "totalLeads", "leads")
                        let opps  = ConsoleHelpers.mapStr(v, "totalOportunidades", "oportunidades")
                        if !leads.isEmpty || !opps.isEmpty {
                            HStack(spacing: 12) {
                                if !leads.isEmpty { Label(leads + " leads", systemImage: "person.badge.plus").font(.caption).foregroundColor(.secondary) }
                                if !opps.isEmpty { Label(opps + " opps", systemImage: "target").font(.caption).foregroundColor(.secondary) }
                            }
                        }
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 4).fill(Color.secondary.opacity(0.2)).frame(height: 5)
                                RoundedRectangle(cornerRadius: 4).fill(Color.green)
                                    .frame(width: geo.size.width * CGFloat(maxSales > 0 ? sales / maxSales : 0), height: 5)
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
        items = (try? await CrmRepository.shared.salesTeam()) ?? []
    }
}

private extension [String: Any] {
    var agKey: String { "ag-\(self["id"] ?? UUID().uuidString)" }
    var tdKey: String { "td-\(self["id"] ?? UUID().uuidString)" }
    var tgKey: String { "tg-\(self["id"] ?? UUID().uuidString)" }
    var stKey: String { "st-\(self["id"] ?? UUID().uuidString)" }
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
    @State private var cotizaciones: [[String: Any]] = []
    @State private var oportunidades: [[String: Any]] = []
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
        let cots = cotizaciones.filter { cot in
            let cn = (cot["cliente"] as? String ?? "").lowercased()
            return clientName.isEmpty || cn.contains(clientName.lowercased().prefix(6))
        }
        return Group {
            if cots.isEmpty {
                VStack { Spacer(); Text("Sin cotizaciones").foregroundColor(.secondary); Spacer() }
            } else {
                List(cots, id: \.crmKey) { cot in
                    let folio = ConsoleHelpers.mapStr(cot, "folio").ifBlankExt("Cot. #\(ConsoleHelpers.mapStr(cot, "id"))")
                    let total = ConsoleHelpers.mapDouble(cot, "total")
                    let status = ConsoleHelpers.mapStr(cot, "estatus")
                    VStack(alignment: .leading, spacing: 4) {
                        HStack { Text(folio).font(.subheadline.bold()); Spacer(); Text(fmtMxn(total)).bold() }
                        Text(status).font(.caption).foregroundColor(.orange)
                    }
                }.listStyle(.plain)
            }
        }
    }

    private var oportunidadesTab: some View {
        let opps = oportunidades.filter { o in
            let cn = (o["clientName"] as? String ?? o["cliente"] as? String ?? "").lowercased()
            return clientName.isEmpty || cn.contains(clientName.lowercased().prefix(6))
        }
        return Group {
            if opps.isEmpty {
                VStack { Spacer(); Text("Sin oportunidades").foregroundColor(.secondary); Spacer() }
            } else {
                List(opps, id: \.crmKey) { o in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(ConsoleHelpers.mapStr(o, "title", "name")).font(.subheadline.bold())
                        HStack {
                            Text(ConsoleHelpers.mapStr(o, "stage", "etapa")).font(.caption).foregroundColor(.blue)
                            Spacer()
                            Text(fmtMxn(ConsoleHelpers.mapDouble(o, "value"))).font(.caption).bold()
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
        async let cots = ExtraRepository.shared.cotizaciones()
        async let opps = (try? await CrmRepository.shared.oportunidades()) ?? []
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
