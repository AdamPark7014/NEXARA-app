import SwiftUI

// MARK: - Oportunidades

struct CrmOpportunitiesView: View {
    @State private var items: [CrmOpportunity] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var selectedId: Int?
    @State private var showCreate = false
    @State private var createForm = OpportunityFormState()
    @State private var creating = false
    @State private var createError: String?

    private var filtered: [CrmOpportunity] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            $0.title.lowercased().contains(q) || $0.stage.lowercased().contains(q)
        }
    }

    var body: some View {
        Group {
            if let selectedId {
                CrmOpportunityDetailView(oppId: selectedId) { self.selectedId = nil }
            } else {
                ZStack(alignment: .bottomTrailing) {
                    VStack(spacing: 0) {
                        crmSearchBar("Buscar oportunidad…", text: $query)
                        if isLoading { Spacer(); ProgressView(); Spacer() }
                        else if filtered.isEmpty {
                            Spacer(); Text("Sin oportunidades").foregroundColor(.secondary); Spacer()
                        } else {
                            List(filtered) { o in
                                Button {
                                    if o.id > 0 { selectedId = Int(o.id) }
                                } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(o.displayTitle).font(.headline)
                                        HStack {
                                            CrmStageChip(text: o.stageKey)
                                            Spacer()
                                            if o.value > 0 {
                                                Text(crmMxn(o.value)).font(.caption).bold()
                                            }
                                        }
                                    }
                                }
                            }
                            .listStyle(.plain)
                        }
                    }
                    Button {
                        createForm = OpportunityFormState()
                        createError = nil
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
                    .accessibilityLabel("Nueva oportunidad")
                }
            }
        }
        .navigationTitle("Oportunidades")
        .task { await reload() }
        .refreshable { await reload() }
        .sheet(isPresented: $showCreate) {
            OpportunityFormSheet(
                title: "Nueva oportunidad",
                state: $createForm,
                saving: creating,
                error: createError,
                onDismiss: { showCreate = false },
                onSave: { Task { await createOpportunity() } }
            )
        }
    }

    private func createOpportunity() async {
        creating = true
        defer { creating = false }
        do {
            let created = try await CrmRepository.shared.createOpportunity(createForm.toPayload())
            showCreate = false
            await reload()
            if let id = ConsoleHelpers.mapInt64(created, "id") {
                selectedId = Int(id)
            }
        } catch {
            createError = error.localizedDescription
        }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await CrmRepository.shared.opportunityItems()) ?? []
    }
}

// MARK: - Clientes comerciales

struct CrmCommercialClientsView: View {
    @State private var items: [CrmClient] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var selected: CrmClient?

    var body: some View {
        Group {
            if let c = selected { clientDetail(c) } else { listBody }
        }
        .navigationTitle("Clientes CRM")
        .task { await reload() }
    }

    private var listBody: some View {
        VStack(spacing: 0) {
            crmSearchBar("Buscar cliente…", text: $query)
            List(filtered) { c in
                Button { selected = c } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(c.displayName).font(.headline)
                        Text(c.subtitle).font(.caption).foregroundColor(.secondary)
                    }
                }
            }
        }
    }

    private var filtered: [CrmClient] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter { $0.name.lowercased().contains(q) }
    }

    private func clientDetail(_ c: CrmClient) -> some View {
        CrmClientDetailView(client: c.raw, onBack: { selected = nil })
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await CrmRepository.shared.clientItems()) ?? []
    }
}

// MARK: - Productos

struct CrmProductsView: View {
    @State private var items: [CrmProduct] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var selected: CrmProduct?

    var body: some View {
        Group {
            if let s = selected { productDetail(s) } else { listBody }
        }
        .navigationTitle(selected == nil ? "Catálogo IT/CCTV" : "")
        .task { await reload() }
        .refreshable { if selected == nil { await reload() } }
    }

    private var listBody: some View {
        VStack(spacing: 0) {
            crmSearchBar("Buscar producto…", text: $query)
                .onSubmit { Task { await reload() } }
            if isLoading { Spacer(); ProgressView(); Spacer() }
            else {
                List(items) { p in
                    Button { selected = p } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(p.displayName).font(.headline)
                                Text(p.sku).font(.caption).foregroundColor(.secondary)
                            }
                            Spacer()
                            if p.price > 0 {
                                Text(crmMxn(p.price)).font(.subheadline).bold()
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
                .listStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func productDetail(_ p: CrmProduct) -> some View {
        let raw = p.raw
        List {
            Section {
                Button("← Catálogo") { selected = nil }
            }
            Section("Producto") {
                prodRow("Nombre", p.displayName)
                prodRow("SKU / Código", p.sku)
                if p.price > 0 {
                    HStack { Text("Precio"); Spacer(); Text(crmMxn(p.price)).foregroundColor(.secondary) }
                }
                prodRow("Categoría", StockParse.str(raw["category"], raw["categoria"], raw["tipo"]))
                prodRow("Stock", StockParse.str(raw["stock"], raw["quantity"], raw["inventario"]))
                prodRow("Unidad", StockParse.str(raw["unit"], raw["unidad"]))
                prodRow("Proveedor", StockParse.str(raw["supplier"], raw["proveedor"]))
            }
            let desc = StockParse.str(raw["description"], raw["descripcion"], raw["notas"])
            if !desc.isEmpty {
                Section("Descripción") { Text(desc).font(.subheadline) }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func prodRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        let q = query.isEmpty ? nil : query
        items = (try? await CrmRepository.shared.productos(search: q)) ?? []
    }
}

// MARK: - Proyectos ventas

struct CrmProjectsView: View {
    @State private var items: [CrmSalesProject] = []
    @State private var isLoading = true
    @State private var selected: CrmSalesProject?

    var body: some View {
        Group {
            if let sel = selected {
                CrmProjectDetailView(project: sel, onBack: { selected = nil })
            } else {
                listBody
            }
        }
        .navigationTitle(selected == nil ? "Proyectos comerciales" : "")
        .task { await reload() }
        .refreshable { if selected == nil { await reload() } }
    }

    private var listBody: some View {
        List {
            if isLoading { ProgressView() }
            ForEach(items) { p in
                Button { selected = p } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(p.displayName).font(.headline)
                        HStack {
                            CrmStageChip(text: p.status)
                            Spacer()
                            if !p.clientName.isEmpty {
                                Text(p.clientName).font(.caption).foregroundColor(.secondary)
                            }
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await CrmRepository.shared.projectItems()) ?? []
    }
}

struct CrmProjectDetailView: View {
    let project: CrmSalesProject
    let onBack: () -> Void

    @State private var tab = 0
    @State private var detail: CrmSalesProject?
    @State private var loading = true

    private let tabs = ["Info", "Costos", "Orden de cierre"]

    private var current: CrmSalesProject { detail ?? project }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("← Volver", action: onBack)
                Text(current.displayName)
                    .font(.headline).lineLimit(1)
                Spacer()
            }
            .padding(.horizontal, 12).padding(.vertical, 6)

            Picker("", selection: $tab) {
                ForEach(0..<tabs.count, id: \.self) { Text(tabs[$0]).tag($0) }
            }
            .pickerStyle(.segmented).padding(.horizontal)

            if loading {
                Spacer(); ProgressView(); Spacer()
            } else {
                switch tab {
                case 0: infoTab
                case 1: costosTab
                default: ordenTab
                }
            }
        }
        .navigationBarHidden(true)
        .task { await loadDetail() }
    }

    private var infoTab: some View {
        let p = current
        return List {
            Section {
                CrmStageChip(text: p.status)
            }
            Section("Datos del proyecto") {
                crmPRow("Cliente", p.clientName)
                crmPRow("Responsable", p.ownerName)
                crmPRow("Tipo", p.projectType)
                if p.budget != 0 { crmPRow("Presupuesto", crmMxn(p.budget)) }
                if p.margin != 0 { crmPRow("Margen", crmMxn(p.margin)) }
                crmPRow("Inicio", String(p.startDate.prefix(10)))
                crmPRow("Fin", String(p.endDate.prefix(10)))
                crmPRow("Descripción", p.scopeSummary)
            }
        }
        .listStyle(.insetGrouped)
    }

    private var costosTab: some View {
        let raw = current.raw
        let nested = (raw["costs"] as? [[String: Any]] ?? [])
            + (raw["costos"] as? [[String: Any]] ?? [])
            + (raw["expenses"] as? [[String: Any]] ?? [])
        let rows: [(String, Double)] = {
            if !nested.isEmpty {
                return nested.map { c in
                    let concept = ConsoleHelpers.mapStr(c, "concept", "concepto", "description", "name")
                    let amount = ConsoleHelpers.mapDouble(c, "amount", "total", "costo")
                    return (concept.isEmpty ? "Costo" : concept, amount)
                }
            }
            return current.costRows
        }()
        return Group {
            if rows.isEmpty {
                VStack { Spacer(); Text("Sin costos registrados").foregroundColor(.secondary); Spacer() }
            } else {
                List(Array(rows.enumerated()), id: \.offset) { _, row in
                    HStack {
                        Text(row.0).font(.subheadline)
                        Spacer()
                        Text(crmMxn(row.1)).font(.subheadline.bold())
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    private var ordenTab: some View {
        let raw = current.raw
        let orden = raw["closingOrder"] as? [String: Any]
            ?? raw["workOrder"] as? [String: Any]
            ?? raw["orden"] as? [String: Any]
            ?? raw["closureOrder"] as? [String: Any]
        return Group {
            if let o = orden {
                List {
                    Section("Orden de cierre") {
                        crmPRow("Número", ConsoleHelpers.mapStr(o, "number", "folio", "id"))
                        crmPRow("Estado", ConsoleHelpers.mapStr(o, "status", "estado"))
                        crmPRow("Fecha", String(ConsoleHelpers.mapStr(o, "createdAt", "date").prefix(10)))
                        crmPRow("Total", crmMxn(ConsoleHelpers.mapDouble(o, "total", "amount")))
                    }
                }
                .listStyle(.insetGrouped)
            } else {
                VStack { Spacer(); Text("Sin orden de cierre").foregroundColor(.secondary); Spacer() }
            }
        }
    }

    @ViewBuilder private func crmPRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value).multilineTextAlignment(.trailing) }
        }
    }

    private func loadDetail() async {
        loading = true
        defer { loading = false }
        guard project.id > 0 else { detail = project; return }
        if let raw = try? await ApiClient.shared.get("ventas/proyectos/\(project.id)/resumen"),
           let obj = try? JSONSerialization.jsonObject(with: raw) as? [String: Any] {
            var merged = project.raw
            for (k, v) in obj { merged[k] = v }
            detail = CrmSalesProject(raw: merged)
        } else {
            detail = project
        }
    }
}

// MARK: - Shared CRM UI

struct CrmStageChip: View {
    let text: String
    var body: some View {
        Text(text.isEmpty ? "—" : text)
            .font(.caption2).bold()
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Color.green.opacity(0.15)).foregroundColor(.green)
            .clipShape(Capsule())
    }
}

func crmSearchBar(_ placeholder: String, text: Binding<String>) -> some View {
    HStack {
        Image(systemName: "magnifyingglass").foregroundColor(.secondary)
        TextField(placeholder, text: text).autocorrectionDisabled()
    }
    .padding(10)
    .background(Color(.secondarySystemGroupedBackground))
    .clipShape(RoundedRectangle(cornerRadius: 12))
    .padding(.horizontal).padding(.top, 8)
}

func crmMxn(_ v: Double) -> String {
    let f = NumberFormatter()
    f.numberStyle = .currency; f.currencyCode = "MXN"; f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: v)) ?? "$\(Int(v))"
}

extension [String: Any] {
    fileprivate var crmKey: String { "crm-\(self["id"] ?? UUID().uuidString)" }
}
