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
    @State private var selected: [String: Any]?

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
                    let aprobadas = vm.items.filter { ["aprobada","completada","won"].contains(cStr($0, "status", "estatus", "estado").lowercased()) }.count
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
                List(vm.filtered, id: \.cotId) { cot in
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
    private func cotDetail(_ cot: [String: Any]) -> some View {
        let status = cStr(cot, "status", "estatus", "estado")
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
                cotRow("Folio", cStr(cot, "folio", "number"))
                cotRow("Cliente", cStr(cot, "clientName", "cliente", "razonSocial"))
                if let total = cDouble(cot, "total", "amount") {
                    HStack { Text("Total"); Spacer(); Text(fmtMxn(total)).foregroundColor(.secondary) }
                }
                cotRow("Fecha", String(cStr(cot, "fecha", "createdAt", "date").prefix(10)))
                cotRow("Responsable", cStr(cot, "ownerName", "responsable", "vendedor"))
                cotRow("Vigencia", cStr(cot, "vigencia", "validUntil", "fechaVigencia"))
                cotRow("Moneda", cStr(cot, "moneda", "currency"))
                cotRow("Descuento", cStr(cot, "descuento", "discount"))
            }
            let notas = cStr(cot, "notas", "notes", "description", "observaciones")
            if !notas.isEmpty {
                Section("Notas") { Text(notas).font(.subheadline) }
            }
            let items = (cot["items"] as? [[String: Any]]) ?? (cot["conceptos"] as? [[String: Any]]) ?? []
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
    @Published var items: [[String: Any]] = []
    @Published var query = ""
    @Published var statusFilter = "todos"
    @Published var isLoading = false

    let statuses = ["todos", "pendiente", "aprobada", "rechazada", "en proceso"]

    var filtered: [[String: Any]] {
        var list = items
        if statusFilter != "todos" {
            list = list.filter { cStr($0, "status", "estatus", "estado").lowercased() == statusFilter }
        }
        if !query.isEmpty {
            let q = query.lowercased()
            list = list.filter { row in
                cStr(row, "folio", "number").lowercased().contains(q) ||
                cStr(row, "clientName", "cliente").lowercased().contains(q)
            }
        }
        return list
    }

    var totalMxn: Double {
        items.reduce(0) { $0 + (cDouble($1, "total", "amount") ?? 0) }
    }

    func load() {
        isLoading = true
        Task {
            items = (try? await CrmRepository.shared.cotizaciones()) ?? await ExtraRepository.shared.cotizaciones()
            isLoading = false
        }
    }
}

private struct CotizacionCard: View {
    let item: [String: Any]
    var body: some View {
        let folio   = cStr(item, "folio", "number")
        let client  = cStr(item, "clientName", "cliente", "razonSocial")
        let status  = cStr(item, "status", "estatus", "estado")
        let total   = cDouble(item, "total", "amount")
        let date    = String(cStr(item, "createdAt", "date").prefix(10))
        let color   = cotStatusColor(status)

        HStack(spacing: 0) {
            Rectangle().fill(color).frame(width: 4)
                .clipShape(RoundedRectangle(cornerRadius: 2))
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(folio.isEmpty ? "Sin folio" : folio)
                        .font(.subheadline).bold()
                    Spacer()
                    if let t = total {
                        Text(fmtMxn(t)).font(.subheadline).foregroundColor(.primary)
                    }
                }
                if !client.isEmpty {
                    Text(client).font(.caption).foregroundColor(.secondary)
                }
                HStack {
                    Text(status.capitalized)
                        .font(.caption2).bold()
                        .foregroundColor(color)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(color.opacity(0.12))
                        .clipShape(Capsule())
                    Spacer()
                    if !date.isEmpty {
                        Text(date).font(.caption2).foregroundColor(.secondary)
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
    @State private var selected: [String: Any]?

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
                List(vm.filtered, id: \.leadId) { lead in
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
    private func leadDetail(_ lead: [String: Any]) -> some View {
        let status = cStr(lead, "status", "estatus", "estado")
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
                ldRow("Título", cStr(lead, "title", "subject", "asunto"))
                ldRow("Cliente", cStr(lead, "clientName", "cliente"))
                ldRow("Email", cStr(lead, "email", "correo"))
                ldRow("Teléfono", cStr(lead, "phone", "telefono"))
                ldRow("Origen", cStr(lead, "source", "origen", "fuente"))
                ldRow("Asignado a", cStr(lead, "ownerName", "assignedTo"))
                ldRow("Fecha", String(cStr(lead, "createdAt", "fecha").prefix(10)))
            }
            let notes = cStr(lead, "notes", "notas", "description")
            if !notes.isEmpty {
                Section("Notas") { Text(notes).font(.subheadline) }
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
    @Published var items: [[String: Any]] = []
    @Published var query = ""
    @Published var isLoading = false

    var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter { row in
            let title  = cStr(row, "title", "subject", "asunto").lowercased()
            let client = cStr(row, "clientName", "cliente").lowercased()
            return title.contains(q) || client.contains(q)
        }
    }

    func load() {
        isLoading = true
        Task {
            let leads = (try? await CrmRepository.shared.leads()) ?? []
            if leads.isEmpty {
                items = await ExtraRepository.shared.clientTicketRequests()
            } else {
                items = leads
            }
            isLoading = false
        }
    }
}

private struct LeadCard: View {
    let item: [String: Any]
    var body: some View {
        let title   = cStr(item, "title", "subject", "asunto")
        let client  = cStr(item, "clientName", "cliente")
        let status  = cStr(item, "status", "estatus")
        let date    = String(cStr(item, "createdAt").prefix(10))
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
