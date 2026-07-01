import SwiftUI

// MARK: - Oportunidades

struct CrmOpportunitiesView: View {
    @State private var items: [[String: Any]] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var selectedId: Int?

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
            }
        }
        .navigationTitle("Oportunidades")
        .task { await reload() }
        .refreshable { await reload() }
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

    var body: some View {
        List {
            if isLoading { ProgressView() }
            ForEach(items, id: \.crmKey) { p in
                VStack(alignment: .leading, spacing: 4) {
                    Text(ConsoleHelpers.mapStr(p, "name", "title", "nombre")).font(.headline)
                    CrmStageChip(text: ConsoleHelpers.mapStr(p, "status", "estado"))
                }
            }
        }
        .navigationTitle("Proyectos comerciales")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await CrmRepository.shared.proyectos()) ?? []
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
