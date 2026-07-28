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
    @State private var projects: [OperationalProjectItem] = []
    @State private var isLoading = true
    @State private var selected: OperationalProjectItem?
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
            ForEach(projects) { p in
                Button { selected = p } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(p.displayTitle).font(.headline)
                        OpsStatusChip(text: p.status)
                    }
                }
            }
        }
    }

    private func projectDetail(_ p: OperationalProjectItem) -> some View {
        OpsProjectDetailView(project: p, onBack: { selected = nil }, onPatch: { id, status in
            await patch(id, status)
        })
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        projects = (try? await ConsoleRepository.shared.operationalProjectItems()) ?? []
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
    var personalOnly: Bool = false
    @State private var items: [[String: Any]] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var selected: [String: Any]?

    var body: some View {
        Group {
            if let s = selected { vehDetail(s) } else { vehList }
        }
        .navigationTitle(selected == nil ? (personalOnly ? "Mis vehículos" : "Vehículos") : "")
        .task { await load() }
        .refreshable { if selected == nil { await load() } }
    }

    private var vehList: some View {
        List {
            if isLoading { ProgressView() }
            ForEach(filtered, id: \.vehKey) { v in
                Button { selected = v } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(ConsoleHelpers.mapStr(v, "nombreVehiculo", "placas", "marca", "modelo")).font(.headline).foregroundColor(.primary)
                        Text(ConsoleHelpers.mapStr(v, "solicitanteNombre", "solicitante", "estatusAprobacion", "estado"))
                            .font(.caption).foregroundColor(.secondary)
                        if personalOnly {
                            let range = [ConsoleHelpers.mapStr(v, "fechaInicio"), ConsoleHelpers.mapStr(v, "fechaFin")]
                                .filter { !$0.isEmpty }.joined(separator: " → ")
                            if !range.isEmpty { Text(range).font(.caption2).foregroundColor(.secondary) }
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .searchable(text: $query)
    }

    @ViewBuilder
    private func vehDetail(_ v: [String: Any]) -> some View {
        List {
            Section { Button("← Vehículos") { selected = nil } }
            Section("Vehículo") {
                vRow("Nombre",      ConsoleHelpers.mapStr(v, "nombreVehiculo", "marca", "modelo"))
                vRow("Placas",      ConsoleHelpers.mapStr(v, "placas", "placasVehiculo"))
                vRow("Estatus",     ConsoleHelpers.mapStr(v, "estatusAprobacion", "estado"))
                vRow("Solicitante", ConsoleHelpers.mapStr(v, "solicitanteNombre", "solicitante"))
                vRow("Inicio",      ConsoleHelpers.mapStr(v, "fechaInicioAprobada", "fechaInicio", "fechaInicioSolicitada"))
                vRow("Fin",         ConsoleHelpers.mapStr(v, "fechaFinAprobada", "fechaFin", "fechaFinSolicitada"))
                vRow("Solicitud",   ConsoleHelpers.mapStr(v, "fechaSolicitud"))
                vRow("Observaciones", ConsoleHelpers.mapStr(v, "entregaObservaciones", "observaciones"))
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func vRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value).multilineTextAlignment(.trailing) }
        }
    }

    private var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            ConsoleHelpers.mapStr($0, "placas", "marca", "nombreVehiculo").lowercased().contains(q)
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        let all = (try? await ConsoleRepository.shared.vehicles()) ?? []
        if personalOnly, let uid = SessionStore.shared.currentUser?.id {
            items = all.filter { row in
                if let sol = row["solicitante"] as? [String: Any], let id = sol["id"] {
                    return String(describing: id) == uid
                }
                return ConsoleHelpers.mapStr(row, "solicitanteId", "usuarioId") == uid
            }
        } else {
            items = all
        }
    }
}

extension [String: Any] {
    fileprivate var clientKey: String { "cl-\(self["id"] ?? UUID().uuidString)" }
    fileprivate var projKey: String { "pr-\(self["id"] ?? UUID().uuidString)" }
    fileprivate var userKey: String { "us-\(self["id"] ?? UUID().uuidString)" }
    fileprivate var vehKey: String { "vh-\(self["id"] ?? UUID().uuidString)" }
}

// MARK: - OPS Project Detail (tabbed)

struct OpsProjectDetailView: View {
    let project: OperationalProjectItem
    let onBack: () -> Void
    let onPatch: (Int64, String) async -> Void

    @State private var tab = 0
    private let tabs = ["Info", "Actividades", "Ingenieros"]

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("← Volver", action: onBack)
                Text(project.displayTitle)
                    .font(.headline).lineLimit(1)
                Spacer()
            }
            .padding(.horizontal, 12).padding(.vertical, 6)

            Picker("", selection: $tab) {
                ForEach(0..<tabs.count, id: \.self) { Text(tabs[$0]).tag($0) }
            }
            .pickerStyle(.segmented).padding(.horizontal)

            switch tab {
            case 0: infoTab
            case 1: actividadesTab
            default: ingenierosTab
            }
        }
        .navigationBarHidden(true)
    }

    private var infoTab: some View {
        List {
            Section {
                OpsStatusChip(text: project.status)
            }
            Section("Datos generales") {
                pRow("Cliente", project.clientName)
                pRow("Responsable", project.vendorName)
                pRow("Tipo", project.projectType)
                pRow("Sitios", project.siteCount)
                pRow("Inicio", String(project.startDate.prefix(10)))
                pRow("Fin planeado", String(project.endDate.prefix(10)))
                pRow("Fin real", String(project.actualEndDate.prefix(10)))
                pRow("Descripción", project.description)
                pRow("Alcance", project.scopeSummary)
            }
            if project.id > 0 {
                Section("Cambiar estado") {
                    Button("Marcar activo")     { Task { await onPatch(project.id, "ACTIVE") } }
                    Button("Poner en pausa")   { Task { await onPatch(project.id, "ON_HOLD") } }
                    Button("Marcar completado") { Task { await onPatch(project.id, "COMPLETED") } }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var actividadesTab: some View {
        let acts = project.activities
        return Group {
            if acts.isEmpty {
                VStack { Spacer(); Text("Sin actividades vinculadas").foregroundColor(.secondary); Spacer() }
            } else {
                List(Array(acts.enumerated()), id: \.offset) { _, a in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(ConsoleHelpers.mapStr(a, "title", "titulo", "type", "tipo")
                             .ifBlankAdmin("Actividad #\(ConsoleHelpers.mapStr(a, "id"))"))
                            .font(.subheadline.bold())
                        let status = ConsoleHelpers.mapStr(a, "status", "estado")
                        if !status.isEmpty { OpsStatusChip(text: status) }
                        let date = String(ConsoleHelpers.mapStr(a, "scheduledDate", "startDate", "fecha").prefix(10))
                        if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    private var ingenierosTab: some View {
        let engs = project.engineers
        return Group {
            if engs.isEmpty {
                VStack { Spacer(); Text("Sin ingenieros asignados").foregroundColor(.secondary); Spacer() }
            } else {
                List(Array(engs.enumerated()), id: \.offset) { _, eng in
                    let engObj = eng["engineer"] as? [String: Any] ?? eng
                    let name = ConsoleHelpers.mapStr(engObj, "nombre", "name")
                    let role = ConsoleHelpers.mapStr(engObj, "role", "rol", "email")
                    VStack(alignment: .leading, spacing: 2) {
                        Text(name.isEmpty ? "Ingeniero" : name).font(.subheadline.bold())
                        if !role.isEmpty { Text(role).font(.caption).foregroundColor(.secondary) }
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    @ViewBuilder private func pRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value).multilineTextAlignment(.trailing) }
        }
    }
}

private extension String {
    func ifBlankAdmin(_ fallback: String) -> String { isEmpty ? fallback : self }
}
