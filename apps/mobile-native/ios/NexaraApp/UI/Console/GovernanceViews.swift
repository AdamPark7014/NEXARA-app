import SwiftUI

// MARK: – Multi-empresa

@MainActor final class CompaniesVM: ObservableObject {
    @Published var items: [[String: Any]] = []
    @Published var isLoading = false
    func load() { isLoading = true; Task { items = await ExtraRepository.shared.companies(); isLoading = false } }
}

struct CompaniesView: View {
    @StateObject private var vm = CompaniesVM()
    var body: some View {
        List {
            if vm.isLoading { ProgressView() }
            ForEach(vm.items, id: \.govId) { c in
                VStack(alignment: .leading, spacing: 4) {
                    Text(govStr(c, "legalName", "tradeName")).font(.headline)
                    Text(govStr(c, "rfc")).font(.caption).foregroundColor(.secondary)
                    if c["isPrimary"] as? Bool == true {
                        Text("Principal").font(.caption2).foregroundColor(.green)
                    }
                }
            }
        }
        .navigationTitle("Multi-empresa")
        .task { vm.load() }
        .refreshable { vm.load() }
    }
}

// MARK: – KB

@MainActor final class KbVM: ObservableObject {
    @Published var articles: [[String: Any]] = []
    @Published var query = ""
    @Published var selected: [String: Any]?
    @Published var isLoading = false
    func load() {
        isLoading = true
        Task {
            articles = await ExtraRepository.shared.kbArticles(q: query.isEmpty ? nil : query)
            isLoading = false
        }
    }
    func open(_ slug: String) { Task { selected = await ExtraRepository.shared.kbArticle(slug) } }
}

struct KbView: View {
    @StateObject private var vm = KbVM()
    var body: some View {
        List {
            if vm.isLoading { ProgressView() }
            ForEach(vm.filtered, id: \.govId) { a in
                Button {
                    vm.open(govStr(a, "slug", "id"))
                } label: {
                    VStack(alignment: .leading) {
                        Text(govStr(a, "title")).font(.subheadline.bold())
                        Text(govStr(a, "excerpt")).font(.caption).foregroundColor(.secondary).lineLimit(2)
                    }
                }
            }
        }
        .searchable(text: $vm.query, prompt: "Buscar artículo…")
        .onChange(of: vm.query) { _, _ in vm.load() }
        .navigationTitle("Knowledge Base")
        .task { vm.load() }
        .sheet(item: Binding(
            get: { vm.selected.map { GovSheetItem(map: $0) } },
            set: { _ in vm.selected = nil }
        )) { item in
            NavigationStack {
                ScrollView {
                    Text(govStr(item.map, "content")).padding()
                }
                .navigationTitle(govStr(item.map, "title"))
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { vm.selected = nil } } }
            }
        }
    }
}

private struct GovSheetItem: Identifiable { let id = UUID(); let map: [String: Any] }

extension KbVM {
    var filtered: [[String: Any]] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return articles }
        return articles.filter { govStr($0, "title").lowercased().contains(q) }
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
            await MainActor.run { self.error = error.localizedDescription; loading = nil }
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
    @Published var events: [[String: Any]] = []
    @Published var rangeDays = 30
    @Published var isLoading = false
    func load() {
        isLoading = true
        Task {
            let from = ISO8601DateFormatter().string(from: Date())
            let to = ISO8601DateFormatter().string(from: Date().addingTimeInterval(Double(rangeDays) * 86400))
            events = await ExtraRepository.shared.calendarEvents(from: from, to: to)
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
            ForEach(vm.events, id: \.govId) { ev in
                VStack(alignment: .leading) {
                    Text(govStr(ev, "title")).font(.subheadline.bold())
                    Text("\(govStr(ev, "source")) · \(govStr(ev, "start").prefix(16))").font(.caption).foregroundColor(.secondary)
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
    @State private var roots: [[String: Any]] = []
    @State private var loading = true

    var body: some View {
        List {
            if loading { ProgressView() }
            ForEach(roots, id: \.govId) { node in OrgNodeView(node: node, depth: 0) }
        }
        .navigationTitle("Organigrama")
        .task {
            loading = true
            roots = await ExtraRepository.shared.orgchart()
            loading = false
        }
    }
}

private struct OrgNodeView: View {
    let node: [String: Any]; let depth: Int
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(govStr(node, "nombre")).font(.subheadline.bold())
                Spacer()
                Text(govNested(node, "role", "nombre")).font(.caption).foregroundColor(.secondary)
            }
            .padding(.leading, CGFloat(depth * 14))
            let children = node["children"] as? [[String: Any]] ?? []
            ForEach(children, id: \.govId) { child in OrgNodeView(node: child, depth: depth + 1) }
        }
    }
}

// MARK: – KPIs RH

@MainActor final class HrKpisVM: ObservableObject {
    @Published var staff: [[String: Any]] = []
    @Published var engineers: [[String: Any]] = []
    @Published var isLoading = false
    func load() {
        isLoading = true
        Task {
            var all: [[String: Any]] = []; var page = 1
            repeat {
                let batch = await ExtraRepository.shared.hrStaff(page: page)
                if batch.isEmpty { break }
                all.append(contentsOf: batch)
                if batch.count < 100 { break }
                page += 1
            } while page < 10
            staff = all
            engineers = await ExtraRepository.shared.biEngineers(limit: 15)
            isLoading = false
        }
    }
}

struct HrKpisView: View {
    @StateObject private var vm = HrKpisVM()
    var body: some View {
        let total = vm.staff.count
        let bajas = vm.staff.filter { govStr($0, "estadoRRHH") == "Baja" || ($0["isActive"] as? Bool) == false }.count
        let rot = total > 0 ? Double(bajas) / Double(total) * 100 : 0
        List {
            if vm.isLoading { ProgressView() }
            Section("Plantilla") {
                LabeledContent("Total", value: "\(total)")
                LabeledContent("Rotación", value: String(format: "%.1f%%", rot))
            }
            if !vm.engineers.isEmpty {
                Section("Productividad (90d)") {
                    ForEach(vm.engineers, id: \.govId) { e in
                        HStack {
                            Text(govStr(e, "engineerName"))
                            Spacer()
                            Text("\(Int(govDbl(e, "completionRate"))) %")
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
