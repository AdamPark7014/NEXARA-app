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

    var body: some View {
        List {
            if isLoading { ProgressView() }
            ForEach(events, id: \.agKey) { ev in
                VStack(alignment: .leading, spacing: 4) {
                    Text(ConsoleHelpers.mapStr(ev, "title", "subject")).font(.headline)
                    Text(ConsoleHelpers.mapStr(ev, "startAt", "start", "fecha"))
                        .font(.caption).foregroundColor(.secondary)
                    if !ConsoleHelpers.mapStr(ev, "ownerName").isEmpty {
                        Text(ConsoleHelpers.mapStr(ev, "ownerName")).font(.caption2)
                    }
                }
            }
        }
        .navigationTitle("Agenda")
        .task { await reload() }
        .refreshable { await reload() }
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

    var body: some View {
        List {
            if isLoading { ProgressView() }
            ForEach(items, id: \.tdKey) { t in
                VStack(alignment: .leading, spacing: 4) {
                    Text(ConsoleHelpers.mapStr(t, "title", "name")).font(.headline)
                    OpsStatusChip(text: ConsoleHelpers.mapStr(t, "status", "estado"))
                    Text(ConsoleHelpers.mapStr(t, "deadline", "dueDate"))
                        .font(.caption2).foregroundColor(.secondary)
                }
            }
        }
        .navigationTitle("Licitaciones")
        .task { await reload() }
        .refreshable { await reload() }
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

    var body: some View {
        List {
            if isLoading { ProgressView() }
            ForEach(items, id: \.tgKey) { t in
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(ConsoleHelpers.mapStr(t, "ownerName", "userName")).font(.headline)
                        Text("\(ConsoleHelpers.mapStr(t, "year")) / \(ConsoleHelpers.mapStr(t, "month"))")
                            .font(.caption).foregroundColor(.secondary)
                    }
                    Spacer()
                    Text(fmtMxn(ConsoleHelpers.mapDouble(t, "targetAmount", "amount")))
                        .font(.subheadline.bold())
                }
            }
        }
        .navigationTitle("Metas")
        .task { await reload() }
        .refreshable { await reload() }
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

    var body: some View {
        List {
            if isLoading { ProgressView() }
            ForEach(items, id: \.stKey) { v in
                HStack {
                    Text(ConsoleHelpers.mapStr(v, "nombre", "name", "userName")).font(.headline)
                    Spacer()
                    Text(fmtMxn(ConsoleHelpers.mapDouble(v, "totalVentas", "salesTotal", "amount")))
                        .font(.subheadline.bold()).foregroundColor(.green)
                }
            }
        }
        .navigationTitle("Equipo comercial")
        .task { await reload() }
        .refreshable { await reload() }
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
    @State private var loading = true

    private let tabs = ["Info", "Cotizaciones", "Oportunidades", "Tickets"]
    private var clientName: String { ConsoleHelpers.mapStr(client, "name", "nombre", "razonSocial") }
    private var clientId: String { ConsoleHelpers.mapStr(client, "id") }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("← Volver", action: onBack)
                Spacer()
            }
            .padding(.horizontal, 12).padding(.vertical, 6)

            Text(clientName.isEmpty ? "Cliente" : clientName)
                .font(.headline).padding(.horizontal).padding(.bottom, 4)

            Picker("", selection: $tab) {
                ForEach(0..<tabs.count, id: \.self) { Text(tabs[$0]).tag($0) }
            }
            .pickerStyle(.segmented).padding(.horizontal)

            if loading {
                Spacer(); ProgressView(); Spacer()
            } else {
                switch tab {
                case 0: infoTab
                case 1: cotizacionesTab
                case 2: oportunidadesTab
                default: ticketsTab
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

    private func load() async {
        async let cots = ExtraRepository.shared.cotizaciones()
        async let opps = (try? await CrmRepository.shared.oportunidades()) ?? []
        async let tks  = ExtraRepository.shared.clientTickets()
        let (c, o, t) = await (cots, opps, tks)
        cotizaciones = c
        oportunidades = o
        tickets = t
        loading = false
    }
}

private extension String {
    func ifBlankExt(_ fallback: String) -> String { isEmpty ? fallback : self }
}
