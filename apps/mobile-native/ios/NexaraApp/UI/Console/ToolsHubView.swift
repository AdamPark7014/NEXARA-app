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
    @State private var mine: [[String: Any]] = []
    @State private var isLoading = true
    @State private var query = ""

    var body: some View {
        toolList(
            items: filtered(mine),
            isLoading: isLoading,
            query: $query,
            empty: "Sin solicitudes de herramientas"
        )
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        mine = (try? await ConsoleRepository.shared.myToolRequests()) ?? []
    }

    private func filtered(_ items: [[String: Any]]) -> [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            ConsoleHelpers.mapStr($0, "toolName", "name", "nombre").lowercased().contains(q) ||
            ConsoleHelpers.mapStr($0, "status", "estado").lowercased().contains(q)
        }
    }
}

private struct ToolMyKitView: View {
    @State private var items: [[String: Any]] = []
    @State private var isLoading = true

    var body: some View {
        toolList(items: items, isLoading: isLoading, query: .constant(""), showSearch: false, empty: "Sin herramientas asignadas")
            .task { await load() }
            .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await ConsoleRepository.shared.myToolKit()) ?? []
    }
}

private struct ToolInventoryView: View {
    @State private var items: [[String: Any]] = []
    @State private var isLoading = true
    @State private var query = ""

    var body: some View {
        toolList(items: items.filter { query.isEmpty || ConsoleHelpers.mapStr($0, "name", "nombre").lowercased().contains(query.lowercased()) },
                 isLoading: isLoading, query: $query, empty: "Inventario vacío")
        .task { await load() }
        .onChange(of: query) { _ in Task { await load() } }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        let q = query.isEmpty ? nil : query
        items = (try? await ConsoleRepository.shared.toolInventory(search: q)) ?? []
    }
}

private struct ToolRenewalsView: View {
    @State private var items: [[String: Any]] = []
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
                    ForEach(items.prefix(80), id: \.renewalKey) { item in
                        renewalCard(item)
                    }
                }
            }
            .padding(.vertical)
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func renewalCard(_ item: [String: Any]) -> some View {
        let id = ConsoleHelpers.mapInt64(item, "id")
        let busy = actingId == id
        return VStack(alignment: .leading, spacing: 8) {
            Text(renewalTitle(item)).font(.subheadline).bold()
            Text("De: \(ConsoleHelpers.mapStr(item, "previousReturnDate"))")
                .font(.caption).foregroundColor(.secondary)
            Text("A: \(ConsoleHelpers.mapStr(item, "newReturnDate"))")
                .font(.caption).foregroundColor(.secondary)
            Text("Estatus: \(ConsoleHelpers.mapStr(item, "status", "estado"))")
                .font(.caption).foregroundColor(.secondary)
            HStack {
                Button(busy ? "Procesando…" : "Aprobar") {
                    guard let id else { return }
                    Task { await approve(id) }
                }
                .buttonStyle(.borderedProminent)
                .disabled(actingId != nil)

                Button(busy ? "Procesando…" : "Rechazar") {
                    guard let id else { return }
                    Task { await reject(id) }
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

    private func renewalTitle(_ item: [String: Any]) -> String {
        if let tr = item["toolRequest"] as? [String: Any] {
            let tool = ConsoleHelpers.mapStr(tr, "toolName", "name")
            if let u = tr["usuario"] as? [String: Any] {
                return "\(ConsoleHelpers.mapStr(u, "nombre", "name")) · \(tool)"
            }
            return ConsoleHelpers.mapStr(tr, "userName", "toolName", "name")
        }
        return ConsoleHelpers.mapStr(item, "toolName", "userName", "name")
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await ConsoleRepository.shared.toolRenewalsPending()) ?? []
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
    @State private var items: [[String: Any]] = []
    @State private var isLoading = true

    var body: some View {
        toolList(items: items, isLoading: isLoading, query: .constant(""), showSearch: false, empty: "Sin asignaciones")
            .task { await load() }
            .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await ConsoleRepository.shared.toolKitsUsers()) ?? []
    }
}

@ViewBuilder
private func toolList(
    items: [[String: Any]],
    isLoading: Bool,
    query: Binding<String>,
    showSearch: Bool = true,
    empty: String
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
                ForEach(items.prefix(80), id: \.toolKey) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(ConsoleHelpers.mapStr(item, "toolName", "name", "nombre", "userName"))
                            .font(.subheadline).bold()
                        Text(ConsoleHelpers.mapStr(item, "status", "estado", "code", "sku"))
                            .font(.caption).foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
                }
            }
        }
        .padding(.vertical)
    }
}

extension [String: Any] {
    fileprivate var toolKey: String {
        if let id = self["id"] { return "tool-\(id)" }
        return UUID().uuidString
    }
    fileprivate var renewalKey: String {
        if let id = self["id"] { return "renew-\(id)" }
        return UUID().uuidString
    }
}
