import SwiftUI

// MARK: - Oportunidades

struct CrmOpportunitiesView: View {
    @State private var items: [[String: Any]] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var selectedId: Int?
    @State private var showCreate = false
    @State private var createForm = OpportunityFormState()
    @State private var creating = false
    @State private var createError: String?

    private var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            ConsoleHelpers.mapStr($0, "title", "name", "titulo").lowercased().contains(q) ||
            ConsoleHelpers.mapStr($0, "stage", "etapa").lowercased().contains(q)
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
                            List(filtered, id: \.crmKey) { o in
                                Button {
                                    if let id = ConsoleHelpers.mapInt64(o, "id") {
                                        selectedId = Int(id)
                                    }
                                } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(ConsoleHelpers.mapStr(o, "title", "name", "titulo")).font(.headline)
                                        HStack {
                                            CrmStageChip(text: ConsoleHelpers.mapStr(o, "stage", "etapa", "status"))
                                            Spacer()
                                            if let v = o["value"] as? NSNumber {
                                                Text(crmMxn(v.doubleValue)).font(.caption).bold()
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
        items = (try? await CrmRepository.shared.oportunidades()) ?? []
    }
}

// MARK: - Clientes comerciales

struct CrmCommercialClientsView: View {
    @State private var items: [[String: Any]] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var selected: [String: Any]?

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
            List(filtered, id: \.crmKey) { c in
                Button { selected = c } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(ConsoleHelpers.mapStr(c, "name", "nombre", "razonSocial")).font(.headline)
                        Text(ConsoleHelpers.mapStr(c, "email", "rfc")).font(.caption).foregroundColor(.secondary)
                    }
                }
            }
        }
    }

    private var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter { ConsoleHelpers.mapStr($0, "name", "nombre").lowercased().contains(q) }
    }

    private func clientDetail(_ c: [String: Any]) -> some View {
        CrmClientDetailView(client: c, onBack: { selected = nil })
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await CrmRepository.shared.clientes()) ?? []
    }
}

// MARK: - Productos

struct CrmProductsView: View {
    @State private var items: [[String: Any]] = []
    @State private var query = ""
    @State private var isLoading = true

    var body: some View {
        VStack(spacing: 0) {
            crmSearchBar("Buscar producto…", text: $query)
                .onSubmit { Task { await reload() } }
            if isLoading { Spacer(); ProgressView(); Spacer() }
            else {
                List(items, id: \.crmKey) { p in
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(ConsoleHelpers.mapStr(p, "name", "nombre")).font(.headline)
                            Text(ConsoleHelpers.mapStr(p, "sku", "code")).font(.caption).foregroundColor(.secondary)
                        }
                        Spacer()
                        if let price = p["price"] as? NSNumber {
                            Text(crmMxn(price.doubleValue)).font(.subheadline).bold()
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Catálogo IT/CCTV")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        let q = query.isEmpty ? nil : query
        items = (try? await CrmRepository.shared.products(search: q)) ?? []
    }
}

// MARK: - Proyectos ventas

struct CrmProjectsView: View {
    @State private var items: [[String: Any]] = []
    @State private var isLoading = true
    @State private var selected: [String: Any]?

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
            ForEach(items, id: \.crmKey) { p in
                Button { selected = p } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(ConsoleHelpers.mapStr(p, "name", "title", "nombre")).font(.headline)
                        HStack {
                            CrmStageChip(text: ConsoleHelpers.mapStr(p, "status", "estado"))
                            Spacer()
                            if let client = p["client"] as? [String: Any] {
                                Text(ConsoleHelpers.mapStr(client, "name", "nombre")).font(.caption).foregroundColor(.secondary)
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
        items = (try? await CrmRepository.shared.proyectos()) ?? []
    }
}

struct CrmProjectDetailView: View {
    let project: [String: Any]
    let onBack: () -> Void

    @State private var tab = 0
    @State private var detail: [String: Any] = [:]
    @State private var loading = true

    private let tabs = ["Info", "Costos", "Orden de cierre"]

    private func pStr(_ keys: String...) -> String {
        let src = detail.isEmpty ? project : detail
        for k in keys {
            let v = ConsoleHelpers.mapStr(src, k)
            if !v.isEmpty { return v }
        }
        return ""
    }

    private func nestedList(_ key: String) -> [[String: Any]] {
        let src = detail.isEmpty ? project : detail
        return (src[key] as? [[String: Any]]) ?? []
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("← Volver", action: onBack)
                Text(pStr("name", "title", "nombre").isEmpty ? "Proyecto" : pStr("name", "title", "nombre"))
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
        List {
            Section {
                CrmStageChip(text: pStr("status", "estado"))
            }
            Section("Datos del proyecto") {
                crmPRow("Cliente", {
                    if let c = (detail.isEmpty ? project : detail)["client"] as? [String: Any] {
                        return ConsoleHelpers.mapStr(c, "name", "nombre")
                    }
                    return pStr("clientName")
                }())
                crmPRow("Responsable", pStr("ownerName", "assignedName", "vendorName"))
                crmPRow("Tipo", pStr("type", "tipo", "projectType"))
                crmPRow("Inicio", String(pStr("startDate", "startAt", "createdAt").prefix(10)))
                crmPRow("Fin", String(pStr("endDate", "closedAt").prefix(10)))
                crmPRow("Descripción", pStr("description", "descripcion", "notes"))
            }
        }
        .listStyle(.insetGrouped)
    }

    private var costosTab: some View {
        let costs = nestedList("costs") + nestedList("costos") + nestedList("expenses")
        return Group {
            if costs.isEmpty {
                VStack { Spacer(); Text("Sin costos registrados").foregroundColor(.secondary); Spacer() }
            } else {
                List(Array(costs.enumerated()), id: \.offset) { _, c in
                    let concept = ConsoleHelpers.mapStr(c, "concept", "concepto", "description", "name")
                    let amount = ConsoleHelpers.mapDouble(c, "amount", "total", "costo")
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(concept.isEmpty ? "Costo" : concept).font(.subheadline)
                            Text(ConsoleHelpers.mapStr(c, "category", "categoria")).font(.caption).foregroundColor(.secondary)
                        }
                        Spacer()
                        Text(crmMxn(amount)).font(.subheadline.bold())
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    private var ordenTab: some View {
        let orden = (detail.isEmpty ? project : detail)["closingOrder"] as? [String: Any]
            ?? (detail.isEmpty ? project : detail)["workOrder"] as? [String: Any]
            ?? (detail.isEmpty ? project : detail)["orden"] as? [String: Any]
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
        let id = ConsoleHelpers.mapStr(project, "id")
        if id.isEmpty { detail = project; return }
        if let raw = try? await ApiClient.shared.get("projects/\(id)"),
           let obj = try? JSONSerialization.jsonObject(with: raw) as? [String: Any] {
            detail = obj
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
