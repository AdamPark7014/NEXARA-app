import SwiftUI

// MARK: – Multi-empresa

@MainActor final class CompaniesVM: ObservableObject {
    @Published var items: [Company] = []
    @Published var isLoading = false
    @Published var message: String?
    @Published var messageIsError = false
    /// Empresa sobre la que se está actuando; bloquea sus botones.
    @Published var actingId: Int64?

    func load() async {
        isLoading = true
        defer { isLoading = false }
        items = await ExtraRepository.shared.companyItems()
    }

    func setActive(_ company: Company, isActive: Bool) async {
        actingId = company.id
        defer { actingId = nil }
        do {
            try await CompanyAdminRepository.shared.setCompanyActive(id: company.id, isActive: isActive)
            show(isActive ? "Empresa activada" : "Empresa desactivada", isError: false)
            await load()
        } catch {
            show(error.toUserMessage(fallback: "No se pudo cambiar el estado"), isError: true)
        }
    }

    func setPrimary(_ company: Company) async {
        actingId = company.id
        defer { actingId = nil }
        do {
            try await CompanyAdminRepository.shared.setCompanyPrimary(id: company.id)
            show("«\(company.displayName)» es ahora la empresa principal", isError: false)
            await load()
        } catch {
            show(error.toUserMessage(fallback: "No se pudo cambiar la empresa principal"), isError: true)
        }
    }

    func save(
        _ company: Company,
        legalName: String, tradeName: String, rfc: String, fiscalRegime: String,
        email: String, phone: String, address: String, city: String, state: String
    ) async -> Bool {
        actingId = company.id
        defer { actingId = nil }
        do {
            _ = try await CompanyAdminRepository.shared.updateCompany(
                id: company.id,
                legalName: legalName, tradeName: tradeName, rfc: rfc,
                fiscalRegime: fiscalRegime, email: email, phone: phone,
                address: address, city: city, state: state
            )
            show("Datos guardados", isError: false)
            await load()
            return true
        } catch {
            show(error.toUserMessage(fallback: "No se pudieron guardar los datos"), isError: true)
            return false
        }
    }

    private func show(_ text: String, isError: Bool) {
        message = text
        messageIsError = isError
    }
}

struct CompaniesView: View {
    @EnvironmentObject var session: SessionStore
    @StateObject private var vm = CompaniesVM()
    @State private var selectedId: Int64?
    @State private var editing = false
    @State private var confirmingPrimary: Company?

    /// Puede escribir quien tenga `console.admin` o `company.settings.manage`;
    /// el resto ve exactamente la misma pantalla sin botones, en vez de
    /// tocarlos para recibir un 403.
    private var canManage: Bool {
        guard let user = session.currentUser else { return false }
        return user.isSuperAdmin
            || user.permissions.contains("console.admin")
            || user.permissions.contains("company.settings.manage")
    }

    /// Se resuelve por id en cada dibujado: así el detalle refleja lo guardado
    /// sin cerrarlo y volver a abrirlo.
    private var selected: Company? {
        guard let selectedId else { return nil }
        return vm.items.first { $0.id == selectedId }
    }

    var body: some View {
        Group {
            if let company = selected { companyDetail(company) } else { companyList }
        }
        .navigationTitle(selected == nil ? "Multi-empresa" : "")
        .task { await vm.load() }
        .refreshable { await vm.load() }
        .sheet(isPresented: $editing) {
            if let company = selected {
                CompanyEditSheet(company: company, vm: vm, isPresented: $editing)
            }
        }
        .alert("Cambiar empresa principal", isPresented: primaryAlertBinding) {
            Button("Cancelar", role: .cancel) { confirmingPrimary = nil }
            Button("Cambiar") {
                if let target = confirmingPrimary {
                    Task { await vm.setPrimary(target) }
                }
                confirmingPrimary = nil
            }
        } message: {
            // Afecta a todo el grupo, no sólo a quien pulsa: se confirma.
            Text("«\(confirmingPrimary?.displayName ?? "")» pasará a ser la empresa principal del grupo para todo el mundo.")
        }
    }

    private var primaryAlertBinding: Binding<Bool> {
        Binding(
            get: { confirmingPrimary != nil },
            set: { if !$0 { confirmingPrimary = nil } }
        )
    }

    private var companyList: some View {
        List {
            if vm.isLoading && vm.items.isEmpty { ProgressView() }
            if let message = vm.message {
                Text(message).font(.footnote)
                    .foregroundColor(vm.messageIsError ? .red : .green)
            }
            ForEach(vm.items) { c in
                Button { selectedId = c.id } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(c.displayName).font(.headline).foregroundColor(.primary)
                        Text(c.rfc).font(.caption).foregroundColor(.secondary)
                        HStack(spacing: 6) {
                            if c.isPrimary {
                                Text("Principal").font(.caption2).foregroundColor(.green)
                            }
                            if !c.isActive {
                                Text("Inactiva").font(.caption2).foregroundColor(.orange)
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func companyDetail(_ c: Company) -> some View {
        List {
            Section { Button("← Empresas") { selectedId = nil } }
            if let message = vm.message {
                Section {
                    Text(message).font(.footnote)
                        .foregroundColor(vm.messageIsError ? .red : .green)
                }
            }
            Section("Empresa") {
                govRow("Razón social",  c.legalName)
                govRow("Nombre comercial", c.tradeName)
                govRow("RFC",           c.rfc)
                govRow("Régimen fiscal",c.fiscalRegime)
                govRow("Email",         c.email)
                govRow("Teléfono",      c.phone)
                govRow("Dirección",     c.address)
                govRow("Ciudad",        c.city)
                govRow("Estado",        c.state)
                if c.isPrimary {
                    HStack {
                        Text("Empresa principal").foregroundColor(.secondary)
                        Spacer()
                        Image(systemName: "checkmark.circle.fill").foregroundColor(.green)
                    }
                }
            }
            if canManage {
                Section("Gestión") {
                    Button {
                        editing = true
                    } label: {
                        Label("Editar datos fiscales", systemImage: "square.and.pencil")
                    }
                    .disabled(vm.actingId == c.id)

                    if !c.isPrimary {
                        Button {
                            confirmingPrimary = c
                        } label: {
                            Label("Hacer empresa principal", systemImage: "star")
                        }
                        .disabled(vm.actingId == c.id)
                    }

                    // La principal no se desactiva: dejaría al grupo sin tenant
                    // por omisión. Es la misma regla que aplica la web.
                    if !c.isPrimary {
                        Button(role: c.isActive ? ButtonRole.destructive : nil) {
                            Task { await vm.setActive(c, isActive: !c.isActive) }
                        } label: {
                            Label(c.isActive ? "Desactivar empresa" : "Activar empresa",
                                  systemImage: c.isActive ? "pause.circle" : "play.circle")
                        }
                        .disabled(vm.actingId == c.id)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func govRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value).multilineTextAlignment(.trailing) }
        }
    }
}

/// Alta de datos fiscales de una empresa del grupo.
/// Los campos que se dejen vacíos NO se mandan: el API hace merge y un `""`
/// borraría el valor guardado.
private struct CompanyEditSheet: View {
    let company: Company
    @ObservedObject var vm: CompaniesVM
    @Binding var isPresented: Bool

    @State private var legalName: String
    @State private var tradeName: String
    @State private var rfc: String
    @State private var fiscalRegime: String
    @State private var email: String
    @State private var phone: String
    @State private var address: String
    @State private var city: String
    @State private var state: String
    @State private var saving = false

    init(company: Company, vm: CompaniesVM, isPresented: Binding<Bool>) {
        self.company = company
        self.vm = vm
        self._isPresented = isPresented
        _legalName = State(initialValue: company.legalName)
        _tradeName = State(initialValue: company.tradeName)
        _rfc = State(initialValue: company.rfc)
        _fiscalRegime = State(initialValue: company.fiscalRegime)
        _email = State(initialValue: company.email)
        _phone = State(initialValue: company.phone)
        _address = State(initialValue: company.address)
        _city = State(initialValue: company.city)
        _state = State(initialValue: company.state)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Identidad fiscal") {
                    TextField("Razón social", text: $legalName)
                    TextField("Nombre comercial", text: $tradeName)
                    TextField("RFC", text: $rfc).textInputAutocapitalization(.characters)
                    TextField("Régimen fiscal", text: $fiscalRegime)
                }
                Section("Contacto") {
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                    TextField("Teléfono", text: $phone).keyboardType(.phonePad)
                }
                Section("Domicilio") {
                    TextField("Dirección", text: $address)
                    TextField("Ciudad", text: $city)
                    TextField("Estado", text: $state)
                }
                Section {
                    Text("Un campo vacío no se envía: se conserva el valor guardado.")
                        .font(.caption).foregroundColor(.secondary)
                }
            }
            .navigationTitle("Editar empresa")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { isPresented = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Guardando…" : "Guardar") {
                        Task {
                            saving = true
                            let ok = await vm.save(
                                company,
                                legalName: legalName, tradeName: tradeName, rfc: rfc,
                                fiscalRegime: fiscalRegime, email: email, phone: phone,
                                address: address, city: city, state: state
                            )
                            saving = false
                            if ok { isPresented = false }
                        }
                    }
                    .disabled(saving)
                }
            }
        }
    }
}

// MARK: – KB

@MainActor final class KbVM: ObservableObject {
    @Published var articles: [KbArticle] = []
    @Published var query = ""
    @Published var selected: KbArticle?
    @Published var isLoading = false
    func load() {
        isLoading = true
        Task {
            articles = await ExtraRepository.shared.kbArticleItems(q: query.isEmpty ? nil : query)
            isLoading = false
        }
    }
    func open(_ slug: String) { Task { selected = await ExtraRepository.shared.kbArticleItem(slug) } }
}

struct KbView: View {
    @StateObject private var vm = KbVM()
    var body: some View {
        List {
            if vm.isLoading { ProgressView() }
            ForEach(vm.filtered) { a in
                Button {
                    vm.open(a.openKey)
                } label: {
                    VStack(alignment: .leading) {
                        Text(a.title).font(.subheadline.bold())
                        Text(a.excerpt).font(.caption).foregroundColor(.secondary).lineLimit(2)
                    }
                }
            }
        }
        .searchable(text: $vm.query, prompt: "Buscar artículo…")
        .onChange(of: vm.query) { _, _ in vm.load() }
        .navigationTitle("Knowledge Base")
        .task { vm.load() }
        .sheet(item: $vm.selected) { article in
            NavigationStack {
                ScrollView {
                    Text(article.content).padding()
                }
                .navigationTitle(article.title)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { vm.selected = nil } } }
            }
        }
    }
}

extension KbVM {
    var filtered: [KbArticle] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return articles }
        return articles.filter { $0.title.lowercased().contains(q) }
    }
}

// MARK: – Exportaciones

struct ExportsView: View {
    @State private var from = defaultGovFrom()
    @State private var to = defaultGovTo()
    @State private var loading: String?
    @State private var message: String?
    @State private var error: String?

    private let entities: [(String, String, String)] = [
        ("activities", "Actividades / OT", "🧰"),
        ("viatics", "Viáticos", "💸"),
        ("vehicles", "Vehículos", "🚐"),
        ("evidences", "Evidencias", "📷"),
        ("users", "Usuarios", "👥"),
    ]

    var body: some View {
        List {
            Section("Rango") {
                TextField("Desde (YYYY-MM-DD)", text: $from)
                TextField("Hasta (YYYY-MM-DD)", text: $to)
            }
            if let error { Text(error).foregroundColor(.red) }
            if let message { Text(message).foregroundColor(.green) }
            Section("Reportes") {
                ForEach(entities, id: \.0) { key, label, icon in
                    HStack {
                        Text("\(icon) \(label)")
                        Spacer()
                        Button(loading == key ? "…" : "CSV") {
                            Task { await download(key) }
                        }.disabled(loading != nil)
                    }
                }
            }
        }
        .navigationTitle("Exportaciones")
    }

    private func download(_ entity: String) async {
        loading = entity; error = nil; message = nil
        do {
            let data = try await ExtraRepository.shared.exportCsv(entity: entity, from: from, to: to)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(entity)-\(from)-\(to).csv")
            try data.write(to: url)
            await MainActor.run {
                let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                UIApplication.shared.firstKeyWindow?.rootViewController?.present(av, animated: true)
                message = "Listo para compartir"
                loading = nil
            }
        } catch {
            await MainActor.run { self.error = error.toUserMessage(); loading = nil }
        }
    }
}

private func defaultGovFrom() -> String {
    let d = Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date()
    return ISO8601DateFormatter().string(from: d).prefix(10).description
}
private func defaultGovTo() -> String {
    ISO8601DateFormatter().string(from: Date()).prefix(10).description
}

// MARK: – Arquitectura

struct ArchitectureView: View {
    @State private var selected = "all"
    private let panels: [(id: String, title: String, icon: String, modules: [ModuleEntry])] = [
        ("erp", "NEXARA ERP", "⚙️", ModuleCatalog.console),
        ("crm", "NEXARA CRM", "📈", ModuleCatalog.ventas),
        ("studio", "NEXARA STUDIO", "🎨", ModuleCatalog.studio),
        ("lab", "NEXARA LAB", "🧪", ModuleCatalog.lab),
    ]

    var body: some View {
        List {
            Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        FilterChipView("Todos", selected == "all") { selected = "all" }
                        ForEach(panels, id: \.id) { p in
                            FilterChipView("\(p.icon) \(p.title)", selected == p.id) { selected = p.id }
                        }
                    }
                }
            }
            ForEach(panels.filter { selected == "all" || selected == $0.id }, id: \.id) { panel in
                Section("\(panel.icon) \(panel.title)") {
                    ForEach(panel.modules) { m in
                        HStack {
                            Text("\(m.icon) \(m.label)")
                            Spacer()
                            Text(m.nativeImplemented ? "✓" : "—").foregroundColor(m.nativeImplemented ? .green : .secondary)
                        }
                        .font(.subheadline)
                    }
                }
            }
        }
        .navigationTitle("Arquitectura")
    }
}

private struct FilterChipView: View {
    let label: String; let on: Bool; let action: () -> Void
    init(_ label: String, _ on: Bool, _ action: @escaping () -> Void) { self.label = label; self.on = on; self.action = action }
    var body: some View {
        Button(action: action) {
            Text(label).font(.caption.bold())
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(on ? Color.teal.opacity(0.2) : Color(.systemFill))
                .clipShape(Capsule())
        }.buttonStyle(.plain)
    }
}

// MARK: – Calendario ERP

@MainActor final class ErpCalendarVM: ObservableObject {
    @Published var events: [CalendarEvent] = []
    @Published var rangeDays = 30
    @Published var isLoading = false
    func load() {
        isLoading = true
        Task {
            let from = ISO8601DateFormatter().string(from: Date())
            let to = ISO8601DateFormatter().string(from: Date().addingTimeInterval(Double(rangeDays) * 86400))
            events = await ExtraRepository.shared.calendarEventItems(from: from, to: to)
            isLoading = false
        }
    }
}

struct ErpCalendarView: View {
    @StateObject private var vm = ErpCalendarVM()
    var body: some View {
        List {
            Picker("Rango", selection: $vm.rangeDays) {
                Text("7 días").tag(7); Text("30 días").tag(30); Text("90 días").tag(90)
            }.onChange(of: vm.rangeDays) { _, _ in vm.load() }
            if vm.isLoading { ProgressView() }
            ForEach(vm.events) { ev in
                VStack(alignment: .leading) {
                    Text(ev.displayTitle).font(.subheadline.bold())
                    Text("\(ev.source) · \(ev.start.prefix(16))").font(.caption).foregroundColor(.secondary)
                }
            }
        }
        .navigationTitle("Mi calendario")
        .task { vm.load() }
        .refreshable { vm.load() }
    }
}

// MARK: – Organigrama

struct OrgchartView: View {
    @State private var roots: [OrgNode] = []
    @State private var loading = true

    var body: some View {
        List {
            if loading { ProgressView() }
            ForEach(roots) { node in OrgNodeView(node: node, depth: 0) }
        }
        .navigationTitle("Organigrama")
        .task {
            loading = true
            roots = await ExtraRepository.shared.orgNodeItems()
            loading = false
        }
    }
}

private struct OrgNodeView: View {
    let node: OrgNode; let depth: Int
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(node.name).font(.subheadline.bold())
                Spacer()
                Text(node.roleName).font(.caption).foregroundColor(.secondary)
            }
            .padding(.leading, CGFloat(depth * 14))
            ForEach(node.children) { child in OrgNodeView(node: child, depth: depth + 1) }
        }
    }
}

// MARK: – KPIs RH

@MainActor final class HrKpisVM: ObservableObject {
    @Published var staff: [HrStaffMember] = []
    @Published var engineers: [BiEngineerRow] = []
    @Published var isLoading = false
    func load() {
        isLoading = true
        Task {
            var all: [HrStaffMember] = []; var page = 1
            repeat {
                let batch = await ExtraRepository.shared.hrStaffItems(page: page)
                if batch.isEmpty { break }
                all.append(contentsOf: batch)
                if batch.count < 100 { break }
                page += 1
            } while page < 10
            staff = all
            engineers = await ExtraRepository.shared.biEngineerRows(limit: 15)
            isLoading = false
        }
    }
}

struct HrKpisView: View {
    @StateObject private var vm = HrKpisVM()
    var body: some View {
        let total = vm.staff.count
        let bajas = vm.staff.filter(\.isBaja).count
        let rot = total > 0 ? Double(bajas) / Double(total) * 100 : 0
        List {
            if vm.isLoading { ProgressView() }
            Section("Plantilla") {
                LabeledContent("Total", value: "\(total)")
                LabeledContent("Rotación", value: String(format: "%.1f%%", rot))
            }
            if !vm.engineers.isEmpty {
                Section("Productividad (90d)") {
                    ForEach(vm.engineers) { e in
                        HStack {
                            Text(e.engineerName)
                            Spacer()
                            Text("\(Int(e.completionRate)) %")
                        }
                    }
                }
            }
        }
        .navigationTitle("KPIs personas")
        .task { vm.load() }
        .refreshable { vm.load() }
    }
}

// MARK: – Helpers

private func govStr(_ m: [String: Any], _ keys: String...) -> String {
    for k in keys {
        if let v = m[k] {
            let s = (v as? String) ?? String(describing: v)
            if !s.isEmpty && s != "null" { return s }
        }
    }
    return ""
}
private func govDbl(_ m: [String: Any], _ key: String) -> Double {
    if let d = m[key] as? Double { return d }
    if let n = m[key] as? NSNumber { return n.doubleValue }
    return 0
}
private func govNested(_ m: [String: Any], _ obj: String, _ field: String) -> String {
    guard let o = m[obj] as? [String: Any] else { return "" }
    return govStr(o, field)
}

extension [String: Any] {
    fileprivate var govId: String {
        if let n = self["id"] as? Int { return "g-\(n)" }
        if let s = self["id"] as? String { return "g-\(s)" }
        if let n = self["engineerId"] as? Int { return "e-\(n)" }
        return UUID().uuidString
    }
}

private extension UIApplication {
    var firstKeyWindow: UIWindow? {
        connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first { $0.isKeyWindow }
    }
}
