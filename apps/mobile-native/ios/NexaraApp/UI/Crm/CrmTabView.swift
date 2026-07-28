import SwiftUI

/// CRM portal con TabView inferior — paridad con VentasNavHost de Android.
/// Tabs: Inicio · Cotizaciones · Leads · Más
struct CrmTabView: View {
    let onExit: () -> Void
    @State private var selectedTab: CrmTab = .dashboard
    @State private var deepLinkModuleKey: String?
    @EnvironmentObject var session: SessionStore
    @ObservedObject private var deepLink = DeepLinkCoordinator.shared

    private var isAdmin: Bool {
        guard let u = session.currentUser else { return false }
        return u.isSuperAdmin || u.permissions.contains("ventas.admin")
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            // ── Dashboard
            NavigationStack {
                CrmDashboardView()
                    .toolbar {
                        ToolbarItem(placement: .navigationBarLeading) {
                            Button("Paneles", action: onExit)
                        }
                    }
            }
            .tabItem { Label("Inicio", systemImage: "chart.bar") }
            .tag(CrmTab.dashboard)

            // ── Cotizaciones
            NavigationStack {
                CrmCotizacionesView()
                    .navigationTitle("Cotizaciones")
            }
            .tabItem { Label("Cotizaciones", systemImage: "doc.text") }
            .tag(CrmTab.cotizaciones)

            // ── Leads / Tickets
            NavigationStack {
                CrmLeadsView()
                    .navigationTitle("Leads")
            }
            .tabItem { Label("Leads", systemImage: "person.badge.plus") }
            .tag(CrmTab.leads)

            // ── Más módulos
            NavigationStack {
                CrmMoreView(onExit: onExit)
                    .navigationTitle("Más módulos")
            }
            .tabItem { Label("Más", systemImage: "ellipsis.circle") }
            .tag(CrmTab.more)
        }
        .deepLinkModulePresenter(panel: .crm, presentedKey: $deepLinkModuleKey)
        .onAppear { if let k = deepLink.consumeModule(for: .crm) { deepLinkModuleKey = k } }
        .onChange(of: deepLink.pending) { _, _ in
            if let k = deepLink.consumeModule(for: .crm) { deepLinkModuleKey = k }
        }
    }
}

// MARK: – Cotizaciones list screen

struct CrmCotizacionesView: View {
    @StateObject private var vm = CrmCotizacionesVM()
    @State private var selected: Cotizacion?

    var body: some View {
        Group {
            if let s = selected { cotDetail(s) } else { listBody }
        }
        .task { vm.load() }
        .refreshable { if selected == nil { vm.load() } }
    }

    private var listBody: some View {
        VStack(spacing: 0) {
            if !vm.items.isEmpty && !vm.isLoading {
                HStack(spacing: 0) {
                    crmKpi("Total", "\(vm.items.count)", .primary)
                    Divider().frame(height: 32)
                    let aprobadas = vm.items.filter {
                        ["aprobada", "completada", "won"].contains($0.estatus.lowercased())
                    }.count
                    crmKpi("Aprobadas", "\(aprobadas)", .green)
                    Divider().frame(height: 32)
                    crmKpi("Monto", fmtMxn(vm.totalMxn), .blue)
                }
                .padding(.horizontal).padding(.vertical, 6)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal).padding(.top, 8)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(vm.statuses, id: \.self) { st in
                        let sel = vm.statusFilter == st
                        Button { vm.statusFilter = st } label: {
                            Text(st.capitalized).font(.caption).bold()
                                .padding(.horizontal, 12).padding(.vertical, 6)
                                .background(sel ? Color.green : Color(.secondarySystemGroupedBackground))
                                .foregroundColor(sel ? .white : .primary)
                                .clipShape(Capsule())
                        }
                    }
                }
                .padding(.horizontal).padding(.vertical, 8)
            }

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                TextField("Buscar cotización…", text: $vm.query)
                    .autocorrectionDisabled()
                if !vm.query.isEmpty {
                    Button { vm.query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundColor(.secondary) }
                }
            }
            .padding(10)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal).padding(.top, 8)

            if vm.isLoading {
                Spacer(); ProgressView(); Spacer()
            } else if vm.filtered.isEmpty {
                Spacer(); Text("Sin cotizaciones").foregroundColor(.secondary); Spacer()
            } else {
                List(vm.filtered) { cot in
                    Button { selected = cot } label: {
                        CotizacionCard(item: cot)
                    }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
                    .listRowSeparator(.hidden)
                }
                .listStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func cotDetail(_ cot: Cotizacion) -> some View {
        let status = cot.estatus
        let color  = cotStatusColor(status)
        List {
            Section {
                HStack {
                    Button("← Cotizaciones") { selected = nil }
                    Spacer()
                    if !status.isEmpty {
                        Text(status.capitalized).font(.caption).bold().foregroundColor(color)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(color.opacity(0.12)).clipShape(Capsule())
                    }
                }
            }
            Section("Cotización") {
                cotRow("Folio", cot.folio)
                cotRow("Cliente", cot.cliente)
                if cot.total != 0 {
                    HStack { Text("Total"); Spacer(); Text(fmtMxn(cot.total)).foregroundColor(.secondary) }
                }
                cotRow("Fecha", cot.dateLabel)
                cotRow("Responsable", cot.ownerName)
                cotRow("Vigencia", cot.vigencia)
                cotRow("Moneda", cot.moneda)
                cotRow("Descuento", cot.descuento)
            }
            if !cot.notes.isEmpty {
                Section("Notas") { Text(cot.notes).font(.subheadline) }
            }
            let items = cot.lineItems
            if !items.isEmpty {
                Section("Conceptos (\(items.count))") {
                    ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                        let desc = cStr(item, "descripcion", "description", "nombre", "name")
                        let qty  = cStr(item, "cantidad", "qty", "quantity")
                        let pu   = cStr(item, "precioUnitario", "unitPrice", "precio")
                        VStack(alignment: .leading, spacing: 2) {
                            Text(desc.isEmpty ? "Concepto" : desc).font(.subheadline).bold()
                            if !qty.isEmpty || !pu.isEmpty {
                                Text("Cant: \(qty)  PU: \(pu)").font(.caption).foregroundColor(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func cotRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }
}

@MainActor
final class CrmCotizacionesVM: ObservableObject {
    @Published var items: [Cotizacion] = []
    @Published var query = ""
    @Published var statusFilter = "todos"
    @Published var isLoading = false

    let statuses = ["todos", "pendiente", "aprobada", "rechazada", "en proceso"]

    var filtered: [Cotizacion] {
        var list = items
        if statusFilter != "todos" {
            list = list.filter { $0.estatus.lowercased() == statusFilter }
        }
        if !query.isEmpty {
            let q = query.lowercased()
            list = list.filter {
                $0.folio.lowercased().contains(q) || $0.cliente.lowercased().contains(q)
            }
        }
        return list
    }

    var totalMxn: Double {
        items.reduce(0) { $0 + $1.total }
    }

    func load() {
        isLoading = true
        Task {
            if let typed = try? await CrmRepository.shared.cotizacionItems(), !typed.isEmpty {
                items = typed
            } else {
                items = await ExtraRepository.shared.cotizacionItems()
            }
            isLoading = false
        }
    }
}

private struct CotizacionCard: View {
    let item: Cotizacion
    var body: some View {
        let color = cotStatusColor(item.estatus)

        HStack(spacing: 0) {
            Rectangle().fill(color).frame(width: 4)
                .clipShape(RoundedRectangle(cornerRadius: 2))
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(item.displayFolio)
                        .font(.subheadline).bold()
                    Spacer()
                    if item.total != 0 {
                        Text(fmtMxn(item.total)).font(.subheadline).foregroundColor(.primary)
                    }
                }
                if !item.cliente.isEmpty {
                    Text(item.cliente).font(.caption).foregroundColor(.secondary)
                }
                HStack {
                    Text(item.estatus.capitalized)
                        .font(.caption2).bold()
                        .foregroundColor(color)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(color.opacity(0.12))
                        .clipShape(Capsule())
                    Spacer()
                    if !item.dateLabel.isEmpty {
                        Text(item.dateLabel).font(.caption2).foregroundColor(.secondary)
                    }
                }
            }
            .padding(.horizontal, 10).padding(.vertical, 8)
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: – Leads list screen

struct CrmLeadsView: View {
    @StateObject private var vm = CrmLeadsVM()
    @State private var selected: CrmLead?

    var body: some View {
        Group {
            if let s = selected { leadDetail(s) } else { listBody }
        }
        .task { vm.load() }
        .refreshable { if selected == nil { vm.load() } }
    }

    private var listBody: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                TextField("Buscar lead…", text: $vm.query)
                    .autocorrectionDisabled()
                if !vm.query.isEmpty {
                    Button { vm.query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundColor(.secondary) }
                }
            }
            .padding(10)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal).padding(.top, 8)

            if vm.isLoading {
                Spacer(); ProgressView(); Spacer()
            } else if vm.filtered.isEmpty {
                Spacer(); Text("Sin leads").foregroundColor(.secondary); Spacer()
            } else {
                List(vm.filtered) { lead in
                    Button { selected = lead } label: {
                        LeadCard(item: lead)
                    }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
                    .listRowSeparator(.hidden)
                }
                .listStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func leadDetail(_ lead: CrmLead) -> some View {
        let raw = lead.raw
        let status = lead.status
        let color  = cotStatusColor(status)
        List {
            Section {
                HStack {
                    Button("← Leads") { selected = nil }
                    Spacer()
                    if !status.isEmpty {
                        Text(status.capitalized).font(.caption).bold().foregroundColor(color)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(color.opacity(0.12)).clipShape(Capsule())
                    }
                }
            }
            Section("Lead") {
                ldRow("Título", lead.displayTitle)
                ldRow("Cliente", lead.clientName)
                ldRow("Email", StockParse.str(raw["email"], raw["correo"]))
                ldRow("Teléfono", StockParse.str(raw["phone"], raw["telefono"]))
                ldRow("Origen", StockParse.str(raw["source"], raw["origen"], raw["fuente"]))
                ldRow("Asignado a", StockParse.str(raw["ownerName"], raw["assignedTo"]))
                ldRow("Fecha", String(StockParse.str(raw["createdAt"], raw["fecha"]).prefix(10)))
            }
            if !lead.description.isEmpty {
                Section("Notas") { Text(lead.description).font(.subheadline) }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func ldRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }
}

@MainActor
final class CrmLeadsVM: ObservableObject {
    @Published var items: [CrmLead] = []
    @Published var query = ""
    @Published var isLoading = false

    var filtered: [CrmLead] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter { row in
            row.displayTitle.lowercased().contains(q) ||
            row.clientName.lowercased().contains(q) ||
            row.branchName.lowercased().contains(q)
        }
    }

    func load() {
        isLoading = true
        Task {
            let leads = (try? await CrmRepository.shared.leadItems()) ?? []
            if leads.isEmpty {
                items = await ExtraRepository.shared.clientTicketRequests().map { CrmLead(raw: $0) }
            } else {
                items = leads
            }
            isLoading = false
        }
    }
}

private struct LeadCard: View {
    let item: CrmLead
    var body: some View {
        let title   = item.displayTitle
        let client  = item.clientName.isEmpty ? item.branchName : item.clientName
        let status  = item.status
        let date    = String(StockParse.str(item.raw["createdAt"], item.raw["fecha"]).prefix(10))
        let color   = cotStatusColor(status)

        HStack(spacing: 12) {
            Circle().fill(color).frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 3) {
                Text(title.isEmpty ? "Sin título" : title).font(.subheadline).bold()
                if !client.isEmpty {
                    Text(client).font(.caption).foregroundColor(.secondary)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(status.capitalized)
                    .font(.caption2).bold().foregroundColor(color)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(color.opacity(0.12)).clipShape(Capsule())
                if !date.isEmpty {
                    Text(date).font(.caption2).foregroundColor(.secondary)
                }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: – More screen

private struct CrmMoreView: View {
    let onExit: () -> Void

    var body: some View {
        List {
            ForEach(ConsoleAccessRules.ventasSidebarGroups()) { group in
                Section(group.title) {
                    ForEach(group.modules) { m in
                        NavigationLink(value: m.key) {
                            HStack(spacing: 12) {
                                Text(m.icon).font(.title3)
                                Text(m.label)
                            }
                        }
                    }
                }
            }
            Section {
                Button(role: .destructive) { onExit() } label: {
                    Label("Cambiar panel", systemImage: "arrow.left.circle")
                }
            }
        }
        .navigationDestination(for: String.self) { key in
            ModuleRouter.view(for: .crm, key: key)
        }
    }
}

// MARK: – Tab enum

private enum CrmTab: Hashable {
    case dashboard, cotizaciones, leads, more
}

// MARK: – Shared helpers (file-private to avoid conflicts)

private func cStr(_ m: [String: Any], _ keys: String...) -> String {
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

private func cDouble(_ m: [String: Any], _ keys: String...) -> Double? {
    for k in keys {
        if let v = m[k] {
            if let d = v as? Double { return d }
            if let n = v as? NSNumber { return n.doubleValue }
            if let s = v as? String, let d = Double(s) { return d }
        }
    }
    return nil
}

private func fmtMxn(_ v: Double) -> String { crmMxn(v) }

private func crmKpi(_ label: String, _ value: String, _ color: Color) -> some View {
    VStack(spacing: 2) {
        Text(value).font(.headline).bold().foregroundColor(color)
        Text(label).font(.caption2).foregroundColor(.secondary)
    }
    .frame(maxWidth: .infinity)
}

private func cotStatusColor(_ status: String) -> Color {
    switch status.lowercased() {
    case "aprobada", "aprobado", "completada", "completado", "cerrado", "closed", "won": return .green
    case "pendiente", "pending", "abierto", "open": return .orange
    case "rechazada", "rechazado", "cancelada", "cancelado", "lost": return .red
    case "en proceso", "in_progress", "en revision": return .blue
    default: return .secondary
    }
}

extension [String: Any] {
    fileprivate var cotId: String {
        if let n = self["id"] as? Int { return "cot-\(n)" }
        if let s = self["id"] as? String { return "cot-\(s)" }
        return UUID().uuidString
    }
    fileprivate var leadId: String {
        if let n = self["id"] as? Int { return "lead-\(n)" }
        if let s = self["id"] as? String { return "lead-\(s)" }
        return UUID().uuidString
    }
}
