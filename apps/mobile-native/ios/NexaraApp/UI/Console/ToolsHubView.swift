import SwiftUI

struct ToolsHubView: View {
    @EnvironmentObject var session: SessionStore
    @State private var section: ToolsSection = .requests

    private var canManage: Bool {
        guard let u = session.currentUser else { return false }
        return u.isSuperAdmin || u.permissions.contains("console.admin")
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("Sección", selection: $section) {
                ForEach(availableSections, id: \.self) { s in
                    Text(s.label).tag(s)
                }
            }
            .pickerStyle(.segmented)
            .padding()

            switch section {
            case .requests: ToolRequestsView()
            case .myKit: ToolMyKitView()
            case .inventory: ToolInventoryView()
            case .renewals: ToolRenewalsView()
            case .kitsUsers: ToolKitsUsersView()
            }
        }
        .navigationTitle("Herramientas")
    }

    private var availableSections: [ToolsSection] {
        if canManage {
            return [.requests, .myKit, .inventory, .renewals, .kitsUsers]
        }
        return [.requests, .myKit]
    }
}

private enum ToolsSection: String, CaseIterable, Hashable {
    case requests, myKit, inventory, renewals, kitsUsers

    var label: String {
        switch self {
        case .requests: return "Solicitudes"
        case .myKit: return "Mi kit"
        case .inventory: return "Inventario"
        case .renewals: return "Renovaciones"
        case .kitsUsers: return "Usuarios"
        }
    }
}

// MARK: - Sub-screens

private struct ToolRequestsView: View {
    @State private var mine: [ToolItem] = []
    @State private var isLoading = true
    @State private var query = ""
    @State private var selected: ToolItem?

    var body: some View {
        Group {
            if let s = selected { toolDetail(s, backLabel: "← Solicitudes", onBack: { selected = nil }) }
            else {
                toolList(items: filtered(mine), isLoading: isLoading, query: $query,
                         empty: "Sin solicitudes de herramientas", onSelect: { selected = $0 })
            }
        }
        .task { await load() }
        .refreshable { if selected == nil { await load() } }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        mine = (try? await ConsoleRepository.shared.myToolRequestItems()) ?? []
    }

    private func filtered(_ items: [ToolItem]) -> [ToolItem] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            $0.title.lowercased().contains(q) || $0.status.lowercased().contains(q)
        }
    }
}

private struct ToolMyKitView: View {
    @State private var items: [ToolItem] = []
    @State private var isLoading = true
    @State private var selected: ToolItem?

    var body: some View {
        Group {
            if let s = selected { toolDetail(s, backLabel: "← Mi kit", onBack: { selected = nil }) }
            else {
                toolList(items: items, isLoading: isLoading, query: .constant(""), showSearch: false,
                         empty: "Sin herramientas asignadas", onSelect: { selected = $0 })
            }
        }
        .task { await load() }
        .refreshable { if selected == nil { await load() } }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await ConsoleRepository.shared.myToolKitItems()) ?? []
    }
}

private struct ToolInventoryView: View {
    @State private var items: [ToolItem] = []
    @State private var isLoading = true
    @State private var query = ""
    @State private var selected: ToolItem?

    var body: some View {
        Group {
            if let s = selected { toolDetail(s, backLabel: "← Inventario", onBack: { selected = nil }) }
            else {
                toolList(
                    items: items.filter {
                        query.isEmpty || $0.title.lowercased().contains(query.lowercased())
                    },
                    isLoading: isLoading,
                    query: $query,
                    empty: "Inventario vacío",
                    onSelect: { selected = $0 }
                )
            }
        }
        .task { await load() }
        .onChange(of: query) { _ in Task { await load() } }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        let q = query.isEmpty ? nil : query
        items = (try? await ConsoleRepository.shared.toolInventoryItems(search: q)) ?? []
    }
}

private struct ToolRenewalsView: View {
    @State private var items: [ToolRenewal] = []
    @State private var isLoading = true
    @State private var rejectionReason = ""
    @State private var actingId: Int64?
    @State private var feedback: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if let feedback {
                    Text(feedback).font(.footnote).foregroundColor(feedback.contains("Error") ? .red : .green)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal)
                }
                TextField("Motivo de rechazo (si aplica)", text: $rejectionReason)
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal)

                if isLoading { ProgressView().padding(.top, 40) }
                else if items.isEmpty {
                    Text("Sin renovaciones pendientes").foregroundColor(.secondary).padding(.top, 40)
                } else {
                    ForEach(items.prefix(80)) { item in
                        renewalCard(item)
                    }
                }
            }
            .padding(.vertical)
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func renewalCard(_ item: ToolRenewal) -> some View {
        let busy = actingId == item.id
        return VStack(alignment: .leading, spacing: 8) {
            Text(item.title).font(.subheadline).bold()
            Text("De: \(item.previousReturnDate)")
                .font(.caption).foregroundColor(.secondary)
            Text("A: \(item.newReturnDate)")
                .font(.caption).foregroundColor(.secondary)
            Text("Estatus: \(item.status)")
                .font(.caption).foregroundColor(.secondary)
            HStack {
                Button(busy ? "Procesando…" : "Aprobar") {
                    Task { await approve(item.id) }
                }
                .buttonStyle(.borderedProminent)
                .disabled(actingId != nil)

                Button(busy ? "Procesando…" : "Rechazar") {
                    Task { await reject(item.id) }
                }
                .buttonStyle(.bordered)
                .disabled(actingId != nil)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await ConsoleRepository.shared.toolRenewalItems()) ?? []
    }

    private func approve(_ id: Int64) async {
        actingId = id
        defer { actingId = nil }
        do {
            try await ConsoleRepository.shared.approveToolRenewal(id: id)
            feedback = "Renovación aprobada"
            rejectionReason = ""
            await load()
        } catch {
            feedback = "Error: \(error.localizedDescription)"
        }
    }

    private func reject(_ id: Int64) async {
        let reason = rejectionReason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !reason.isEmpty else {
            feedback = "Error: escribe el motivo de rechazo"
            return
        }
        actingId = id
        defer { actingId = nil }
        do {
            try await ConsoleRepository.shared.rejectToolRenewal(id: id, reason: reason)
            feedback = "Renovación rechazada"
            rejectionReason = ""
            await load()
        } catch {
            feedback = "Error: \(error.localizedDescription)"
        }
    }
}

private struct ToolKitsUsersView: View {
    @State private var items: [ToolItem] = []
    @State private var isLoading = true
    @State private var selected: ToolItem?

    var body: some View {
        Group {
            if let s = selected { toolDetail(s, backLabel: "← Usuarios", onBack: { selected = nil }) }
            else {
                toolList(items: items, isLoading: isLoading, query: .constant(""), showSearch: false,
                         empty: "Sin asignaciones", onSelect: { selected = $0 })
            }
        }
        .task { await load() }
        .refreshable { if selected == nil { await load() } }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await ConsoleRepository.shared.toolKitsUserItems()) ?? []
    }
}

@ViewBuilder
private func toolList(
    items: [ToolItem],
    isLoading: Bool,
    query: Binding<String>,
    showSearch: Bool = true,
    empty: String,
    onSelect: ((ToolItem) -> Void)? = nil
) -> some View {
    ScrollView {
        VStack(spacing: 10) {
            if showSearch {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Buscar…", text: query).autocorrectionDisabled()
                }
                .padding(10)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)
            }
            if isLoading { ProgressView().padding(.top, 40) }
            else if items.isEmpty {
                Text(empty).foregroundColor(.secondary).padding(.top, 40)
            } else {
                ForEach(items.prefix(80)) { item in
                    let card = VStack(alignment: .leading, spacing: 4) {
                        Text(item.title.isEmpty ? "Herramienta" : item.title)
                            .font(.subheadline).bold()
                        Text(item.subtitle.isEmpty ? item.status : item.subtitle)
                            .font(.caption).foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)

                    if let onSelect {
                        Button { onSelect(item) } label: { card }.buttonStyle(.plain)
                    } else {
                        card
                    }
                }
            }
        }
        .padding(.vertical)
    }
}

@ViewBuilder
private func toolDetail(_ item: ToolItem, backLabel: String, onBack: @escaping () -> Void) -> some View {
    let name = item.title
    List {
        Section { Button(backLabel, action: onBack) }
        Section("Herramienta") {
            tRow("Nombre", name)
            tRow("Código", item.code)
            tRow("Categoría", item.category)
            tRow("Estado", item.status)
            tRow("Ubicación", item.location)
            tRow("Usuario", item.userName)
            tRow("Fecha inicio", item.startDate)
            tRow("Fecha fin", item.endDate)
            tRow("Marca", item.brand)
            tRow("Modelo", item.model)
            tRow("Serial", item.serial)
        }
        if !item.notes.isEmpty {
            Section("Notas") { Text(item.notes).font(.footnote) }
        }
    }
    .listStyle(.insetGrouped)
    .navigationTitle(name.isEmpty ? "Herramienta" : name)
    .navigationBarTitleDisplayMode(.inline)
}

@ViewBuilder private func tRow(_ label: String, _ value: String) -> some View {
    if !value.isEmpty {
        HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value).multilineTextAlignment(.trailing) }
    }
}
