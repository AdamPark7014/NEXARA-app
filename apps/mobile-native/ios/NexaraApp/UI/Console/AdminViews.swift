import SwiftUI

struct ClientsView: View {
    @State private var clients: [[String: Any]] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var selected: [String: Any]?

    private var filtered: [[String: Any]] {
        guard !query.isEmpty else { return clients }
        let q = query.lowercased()
        return clients.filter {
            ConsoleHelpers.mapStr($0, "name", "nombre").lowercased().contains(q) ||
            ConsoleHelpers.mapStr($0, "contactEmail", "email").lowercased().contains(q)
        }
    }

    var body: some View {
        Group {
            if let c = selected { clientDetail(c) } else { listBody }
        }
        .navigationTitle("Clientes")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private var listBody: some View {
        List {
            if isLoading { ProgressView() }
            ForEach(filtered, id: \.clientKey) { c in
                Button { selected = c } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(ConsoleHelpers.mapStr(c, "name", "nombre")).font(.headline)
                        Text(ConsoleHelpers.mapStr(c, "contactEmail", "email", "city"))
                            .font(.caption).foregroundColor(.secondary)
                    }
                }
            }
        }
        .searchable(text: $query, prompt: "Buscar cliente")
    }

    private func clientDetail(_ c: [String: Any]) -> some View {
        List {
            Section("Identidad") {
                row("Nombre", ConsoleHelpers.mapStr(c, "name", "nombre"))
                row("Código", ConsoleHelpers.mapStr(c, "accountCode"))
                row("Activo", (c["isActive"] as? Bool == false) ? "No" : "Sí")
            }
            Section("Contacto") {
                row("Persona", ConsoleHelpers.mapStr(c, "contactName"))
                row("Email", ConsoleHelpers.mapStr(c, "contactEmail"))
                row("Teléfono", ConsoleHelpers.mapStr(c, "contactPhone"))
            }
            Section("Ubicación") {
                row("Dirección", ConsoleHelpers.mapStr(c, "address"))
                row("Ciudad", ConsoleHelpers.mapStr(c, "city"))
                row("Estado", ConsoleHelpers.mapStr(c, "state"))
            }
            Button("Volver") { selected = nil }
        }
        .navigationTitle(ConsoleHelpers.mapStr(c, "name", "nombre"))
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private func row(_ label: String, _ value: String) -> some View {
        if !value.isEmpty { HStack { Text(label); Spacer(); Text(value).foregroundColor(.secondary) } }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        clients = (try? await ConsoleRepository.shared.serviceClients()) ?? []
    }
}

struct ProjectsView: View {
    @State private var projects: [[String: Any]] = []
    @State private var isLoading = true
    @State private var selected: [String: Any]?
    @State private var message: String?

    var body: some View {
        Group {
            if let p = selected { projectDetail(p) } else { listBody }
        }
        .navigationTitle("Proyectos")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private var listBody: some View {
        List {
            if isLoading { ProgressView() }
            if let message { Text(message).font(.footnote).foregroundColor(.green) }
            ForEach(projects, id: \.projKey) { p in
                Button { selected = p } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(ConsoleHelpers.mapStr(p, "title", "name", "nombre")).font(.headline)
                        OpsStatusChip(text: ConsoleHelpers.mapStr(p, "status", "estado"))
                    }
                }
            }
        }
    }

    private func projectDetail(_ p: [String: Any]) -> some View {
        let id = ConsoleHelpers.mapInt64(p, "id")
        return List {
            Section("Proyecto") {
                row("Título", ConsoleHelpers.mapStr(p, "title", "name"))
                row("Estado", ConsoleHelpers.mapStr(p, "status"))
                row("Inicio", String(ConsoleHelpers.mapStr(p, "startDate").prefix(10)))
                row("Fin", String(ConsoleHelpers.mapStr(p, "endDate").prefix(10)))
            }
            if let id {
                Section("Acciones") {
                    Button("Marcar activo") { Task { await patch(id, "ACTIVE") } }
                    Button("En pausa") { Task { await patch(id, "ON_HOLD") } }
                    Button("Completado") { Task { await patch(id, "COMPLETED") } }
                }
            }
            Button("Volver") { selected = nil }
        }
        .navigationTitle(ConsoleHelpers.mapStr(p, "title", "name"))
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private func row(_ label: String, _ value: String) -> some View {
        if !value.isEmpty { HStack { Text(label); Spacer(); Text(value).foregroundColor(.secondary) } }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        projects = (try? await ConsoleRepository.shared.operationalProjects()) ?? []
    }

    private func patch(_ id: Int64, _ status: String) async {
        do {
            _ = try await ConsoleRepository.shared.patchProjectStatus(id: id, status: status)
            message = "Estado actualizado"
            selected = nil
            await reload()
        } catch { message = error.localizedDescription }
    }
}

struct UsersView: View {
    @State private var users: [[String: Any]] = []
    @State private var query = ""
    @State private var isLoading = true

    private var filtered: [[String: Any]] {
        guard !query.isEmpty else { return users }
        let q = query.lowercased()
        return users.filter {
            ConsoleHelpers.mapStr($0, "nombre", "name").lowercased().contains(q) ||
            ConsoleHelpers.mapStr($0, "email").lowercased().contains(q)
        }
    }

    var body: some View {
        List {
            if isLoading { ProgressView() }
            ForEach(filtered, id: \.userKey) { u in
                VStack(alignment: .leading, spacing: 4) {
                    Text(ConsoleHelpers.mapStr(u, "nombre", "name")).font(.headline)
                    Text(ConsoleHelpers.mapStr(u, "email", "rol", "role"))
                        .font(.caption).foregroundColor(.secondary)
                }
            }
        }
        .navigationTitle("Usuarios")
        .searchable(text: $query, prompt: "Buscar usuario")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        users = (try? await ConsoleRepository.shared.users()) ?? []
    }
}

struct VehiclesView: View {
    @State private var items: [[String: Any]] = []
    @State private var query = ""
    @State private var isLoading = true

    var body: some View {
        List {
            if isLoading { ProgressView() }
            ForEach(filtered, id: \.vehKey) { v in
                VStack(alignment: .leading, spacing: 4) {
                    Text(ConsoleHelpers.mapStr(v, "placas", "marca", "modelo")).font(.headline)
                    Text(ConsoleHelpers.mapStr(v, "solicitanteNombre", "solicitante", "estado"))
                        .font(.caption).foregroundColor(.secondary)
                }
            }
        }
        .navigationTitle("Vehículos")
        .searchable(text: $query)
        .task { await load() }
        .refreshable { await load() }
    }

    private var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            ConsoleHelpers.mapStr($0, "placas", "marca").lowercased().contains(q)
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await ConsoleRepository.shared.vehicles()) ?? []
    }
}

extension [String: Any] {
    fileprivate var clientKey: String { "cl-\(self["id"] ?? UUID().uuidString)" }
    fileprivate var projKey: String { "pr-\(self["id"] ?? UUID().uuidString)" }
    fileprivate var userKey: String { "us-\(self["id"] ?? UUID().uuidString)" }
    fileprivate var vehKey: String { "vh-\(self["id"] ?? UUID().uuidString)" }
}
