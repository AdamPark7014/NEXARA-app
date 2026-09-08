import SwiftUI

/// CRM portal con TabView inferior — paridad con VentasNavHost de Android.
/// Tabs: Inicio · Cotizaciones · Leads · Más
struct CrmTabView: View {
    let onExit: () -> Void
    @State private var selectedTab: CrmTab = .dashboard
    @State private var deepLinkModuleKey: String?
    @State private var deepLinkClientId: Int64?
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
        .fullScreenCover(item: Binding(
            get: { deepLinkClientId.map { CrmClientDeepLink(id: $0) } },
            set: { deepLinkClientId = $0?.id }
        )) { link in
            NavigationStack {
                CrmClientDetailByIdView(clientId: link.id, onBack: { deepLinkClientId = nil })
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cerrar") { deepLinkClientId = nil }
                        }
                    }
            }
        }
        .onAppear { consumeCrmDeepLink() }
        .onChange(of: deepLink.pending) { _, _ in consumeCrmDeepLink() }
    }

    private func consumeCrmDeepLink() {
        if let link = deepLink.consumeModuleLink(for: .crm) {
            if link.key == "clients", let id = link.entityId, id > 0 {
                deepLinkClientId = id
            } else {
                deepLinkModuleKey = link.key
            }
        }
    }
}

private struct CrmClientDeepLink: Identifiable {
    let id: Int64
}

// MARK: – Cotizaciones list screen

struct CrmCotizacionesView: View {
    @StateObject private var vm = CrmCotizacionesVM()
    @State private var selected: Cotizacion?

    var body: some View {
        Group {
            if let s = selected, s.id > 0 {
                VentasQuoteDetailView(cotizacionId: Int(s.id), onBack: { selected = nil })
            } else {
                listBody
            }
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

private let leadStatuses = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"]

struct CrmLeadsView: View {
    @StateObject private var vm = CrmLeadsVM()
    @State private var selected: CrmLead?
    @State private var showCreate = false
    @State private var showConvert = false
    @State private var editing = false
    @State private var actionError: String?
    @State private var acting = false
    @State private var convertedOppId: Int?

    @State private var name = ""
    @State private var company = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var source = ""
    @State private var notes = ""
    @State private var status = "NEW"
    @State private var convertValue = ""
    @State private var convertStage = "DISCOVERY"

    var body: some View {
        Group {
            if let s = selected { leadDetail(s) } else { listBody }
        }
        .task { vm.load() }
        .refreshable { if selected == nil { vm.load() } }
        .sheet(isPresented: $showCreate) { createSheet }
        .sheet(isPresented: $showConvert) { convertSheet }
        .alert("Lead convertido", isPresented: Binding(
            get: { convertedOppId != nil },
            set: { if !$0 { convertedOppId = nil } }
        )) {
            Button("OK") { convertedOppId = nil }
        } message: {
            if let id = convertedOppId {
                Text("Se creó la oportunidad #\(id). Ábrela desde Oportunidades.")
            }
        }
    }

    private var listBody: some View {
        ZStack(alignment: .bottomTrailing) {
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

                if let actionError {
                    Text(actionError).font(.caption).foregroundColor(.red).padding(.horizontal)
                }

                if vm.isLoading {
                    Spacer(); ProgressView(); Spacer()
                } else if vm.filtered.isEmpty {
                    Spacer(); Text("Sin leads").foregroundColor(.secondary); Spacer()
                } else {
                    List(vm.filtered) { lead in
                        Button { openDetail(lead) } label: {
                            LeadCard(item: lead)
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
                        .listRowSeparator(.hidden)
                    }
                    .listStyle(.plain)
                }
            }
            Button {
                resetForm()
                showCreate = true
            } label: {
                Image(systemName: "plus")
                    .font(.title2.bold())
                    .foregroundColor(.white)
                    .frame(width: 56, height: 56)
                    .background(Color(red: 0.06, green: 0.73, blue: 0.51))
                    .clipShape(Circle())
                    .shadow(radius: 4, y: 2)
            }
            .padding(20)
            .accessibilityLabel("Nuevo lead")
        }
    }

    @ViewBuilder
    private func leadDetail(_ lead: CrmLead) -> some View {
        let color = cotStatusColor(lead.status)
        List {
            Section {
                HStack {
                    Button("← Leads") {
                        selected = nil
                        editing = false
                        actionError = nil
                    }
                    Spacer()
                    if !lead.status.isEmpty {
                        Text(lead.status.capitalized).font(.caption).bold().foregroundColor(color)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(color.opacity(0.12)).clipShape(Capsule())
                    }
                }
            }
            if let actionError {
                Section { Text(actionError).foregroundColor(.red).font(.footnote) }
            }
            if editing {
                Section("Editar") {
                    TextField("Nombre *", text: $name)
                    TextField("Empresa", text: $company)
                    TextField("Email", text: $email).textInputAutocapitalization(.never).keyboardType(.emailAddress)
                    TextField("Teléfono", text: $phone).keyboardType(.phonePad)
                    TextField("Origen", text: $source)
                    TextField("Notas", text: $notes, axis: .vertical).lineLimit(2...4)
                    Picker("Estado", selection: $status) {
                        ForEach(leadStatuses, id: \.self) { Text($0).tag($0) }
                    }
                }
                Section {
                    Button(acting ? "Guardando…" : "Guardar cambios") {
                        Task { await saveLead(lead) }
                    }
                    .disabled(acting || name.trimmingCharacters(in: .whitespaces).isEmpty)
                    Button("Cancelar edición") { editing = false }
                }
            } else {
                Section("Lead") {
                    ldRow("Título", lead.displayTitle)
                    ldRow("Cliente", lead.clientName)
                    ldRow("Email", StockParse.str(lead.raw["email"], lead.raw["correo"]))
                    ldRow("Teléfono", StockParse.str(lead.raw["phone"], lead.raw["telefono"]))
                    ldRow("Origen", StockParse.str(lead.raw["source"], lead.raw["origen"], lead.raw["fuente"]))
                    ldRow("Asignado a", StockParse.str(lead.raw["ownerName"], lead.raw["assignedTo"]))
                    ldRow("Fecha", String(StockParse.str(lead.raw["createdAt"], lead.raw["fecha"]).prefix(10)))
                }
                if !lead.description.isEmpty {
                    Section("Notas") { Text(lead.description).font(.subheadline) }
                }
                Section {
                    Button("Editar") { beginEdit(lead) }
                    if lead.isConvertible {
                        Button("Convertir a oportunidad") {
                            convertValue = ""
                            convertStage = "DISCOVERY"
                            showConvert = true
                        }
                    }
                    if lead.numericId != nil {
                        Button("Eliminar", role: .destructive) {
                            Task { await deleteLead(lead) }
                        }
                        .disabled(acting)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var createSheet: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nombre *", text: $name)
                    TextField("Empresa", text: $company)
                    TextField("Email", text: $email).textInputAutocapitalization(.never).keyboardType(.emailAddress)
                    TextField("Teléfono", text: $phone).keyboardType(.phonePad)
                    TextField("Origen", text: $source)
                    TextField("Notas", text: $notes, axis: .vertical).lineLimit(2...4)
                }
                if let actionError {
                    Section { Text(actionError).foregroundColor(.red).font(.footnote) }
                }
            }
            .navigationTitle("Nuevo lead")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { showCreate = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(acting ? "Creando…" : "Crear") { Task { await createLead() } }
                        .disabled(acting || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private var convertSheet: some View {
        NavigationStack {
            Form {
                Section("Oportunidad") {
                    TextField("Valor estimado (MXN)", text: $convertValue).keyboardType(.decimalPad)
                    Picker("Etapa inicial", selection: $convertStage) {
                        ForEach(opportunityStages.prefix(5), id: \.id) { s in
                            Text(s.label).tag(s.id)
                        }
                    }
                }
                if let actionError {
                    Section { Text(actionError).foregroundColor(.red).font(.footnote) }
                }
            }
            .navigationTitle("Convertir lead")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { showConvert = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(acting ? "Convirtiendo…" : "Convertir") {
                        Task { await convertSelected() }
                    }
                    .disabled(acting || Double(convertValue.replacingOccurrences(of: ",", with: "")) == nil)
                }
            }
        }
        .presentationDetents([.medium])
    }

    @ViewBuilder private func ldRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }

    private func openDetail(_ lead: CrmLead) {
        selected = lead
        editing = false
        actionError = nil
        beginEdit(lead, applyOnly: true)
    }

    private func beginEdit(_ lead: CrmLead, applyOnly: Bool = false) {
        name = StockParse.str(lead.raw["name"], lead.displayTitle)
        company = StockParse.str(lead.raw["company"], lead.clientName)
        email = StockParse.str(lead.raw["email"], lead.raw["correo"])
        phone = StockParse.str(lead.raw["phone"], lead.raw["telefono"])
        source = StockParse.str(lead.raw["source"], lead.raw["origen"], lead.raw["fuente"])
        notes = StockParse.str(lead.raw["notes"], lead.description)
        status = lead.status.isEmpty ? "NEW" : lead.status.uppercased()
        if !applyOnly { editing = true }
    }

    private func resetForm() {
        name = ""; company = ""; email = ""; phone = ""; source = ""; notes = ""
        status = "NEW"; actionError = nil
    }

    private func createLead() async {
        acting = true
        defer { acting = false }
        do {
            _ = try await CrmRepository.shared.createLead([
                "name": name.trimmingCharacters(in: .whitespaces),
                "company": company,
                "email": email,
                "phone": phone,
                "source": source,
                "notes": notes,
                "status": "NEW",
            ])
            showCreate = false
            vm.load()
        } catch {
            actionError = error.toUserMessage()
        }
    }

    private func saveLead(_ lead: CrmLead) async {
        guard let id = lead.numericId else { return }
        acting = true
        defer { acting = false }
        do {
            let updated = try await CrmRepository.shared.updateLead(id: id, fields: [
                "name": name.trimmingCharacters(in: .whitespaces),
                "company": company,
                "email": email,
                "phone": phone,
                "source": source,
                "notes": notes,
                "status": status,
            ])
            selected = updated
            editing = false
            vm.load()
        } catch {
            actionError = error.toUserMessage()
        }
    }

    private func deleteLead(_ lead: CrmLead) async {
        guard let id = lead.numericId else { return }
        acting = true
        defer { acting = false }
        do {
            try await CrmRepository.shared.deleteLead(id: id)
            selected = nil
            vm.load()
        } catch {
            actionError = error.toUserMessage()
        }
    }

    private func convertSelected() async {
        guard let lead = selected else { return }
        guard let value = Double(convertValue.replacingOccurrences(of: ",", with: "")) else { return }
        acting = true
        defer { acting = false }
        do {
            let created = try await CrmRepository.shared.convertLeadToOpportunity(
                lead: lead,
                value: value,
                stage: convertStage
            )
            showConvert = false
            selected = nil
            vm.load()
            if let id = StockParse.int64(created["id"]) {
                convertedOppId = Int(id)
            }
        } catch {
            actionError = error.toUserMessage()
        }
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
            row.branchName.lowercased().contains(q) ||
            row.status.lowercased().contains(q)
        }
    }

    func load() {
        isLoading = true
        Task {
            do {
                items = try await CrmRepository.shared.leadItems()
            } catch {
                items = []
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
