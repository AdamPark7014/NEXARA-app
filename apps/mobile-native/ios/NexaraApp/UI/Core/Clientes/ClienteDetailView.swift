import SwiftUI

/// Lo que se confirma antes de tocar el estatus del cliente o de uno de sus proyectos.
private enum ClienteAccion: Identifiable, Equatable {
    case desactivar, reactivar, eliminar
    case desactivarProyecto(id: Int, titulo: String)
    case reactivarProyecto(id: Int, titulo: String)
    case eliminarProyecto(id: Int, titulo: String)

    var id: String {
        switch self {
        case .desactivar: return "desactivar"
        case .reactivar: return "reactivar"
        case .eliminar: return "eliminar"
        case .desactivarProyecto(let id, _): return "desactivar-proyecto-\(id)"
        case .reactivarProyecto(let id, _): return "reactivar-proyecto-\(id)"
        case .eliminarProyecto(let id, _): return "eliminar-proyecto-\(id)"
        }
    }

    var titulo: String {
        switch self {
        case .desactivar: return "Desactivar cliente"
        case .reactivar: return "Reactivar cliente"
        case .eliminar: return "Eliminar cliente"
        case .desactivarProyecto: return "Desactivar proyecto"
        case .reactivarProyecto: return "Reactivar proyecto"
        case .eliminarProyecto: return "Eliminar proyecto"
        }
    }

    var boton: String {
        switch self {
        case .desactivar, .desactivarProyecto: return "Desactivar"
        case .reactivar, .reactivarProyecto: return "Reactivar"
        case .eliminar, .eliminarProyecto: return "Eliminar"
        }
    }

    /// Como la web: desactivar y eliminar se confirman en rojo; reactivar no.
    var rol: ButtonRole? {
        switch self {
        case .reactivar, .reactivarProyecto: return nil
        case .desactivar, .eliminar, .desactivarProyecto, .eliminarProyecto: return .destructive
        }
    }

    /// Los del cliente, mismos textos que el diálogo de `/erp/clientes/:id`.
    func mensaje(_ nombre: String) -> String {
        switch self {
        case .desactivar:
            return "«\(nombre)» quedará inactivo. Sus datos y su historial se conservan y podrás reactivarlo después."
        case .reactivar:
            return "«\(nombre)» volverá a estar activo en el padrón."
        case .eliminar:
            return "¿Eliminar «\(nombre)» del padrón? Esta acción no se puede deshacer. Si solo ya no trabajan con él, mejor desactívalo."
        case .desactivarProyecto(_, let titulo):
            return "«\(titulo)» quedará inactivo. Sus actividades y su historial se conservan y podrás reactivarlo después."
        case .reactivarProyecto(_, let titulo):
            return "«\(titulo)» volverá a estar activo."
        case .eliminarProyecto(_, let titulo):
            return "¿Eliminar «\(titulo)»? Deja de aparecer en listas y buscadores; sus actividades conservan su historial. Si solo está detenido, mejor desactívalo."
        }
    }
}

/// Detalle de cliente (`/erp/clientes/:id`): datos fiscales, sectores (con
/// «+ sector» de los que el usuario maneja) y, en PROYECTO, sus proyectos
/// operativos con alta rápida. Desactivar, reactivar y eliminar solo aparecen
/// con el permiso del API (hoy, solo Christian).
struct ClienteDetailView: View {
    let clientId: Int
    /// El padrón cambió (desactivado, reactivado o eliminado): la lista se recarga.
    var onChanged: (() -> Void)? = nil

    @EnvironmentObject var session: SessionStore
    @Environment(\.dismiss) private var dismiss
    @State private var client: CoreSalesClient?
    @State private var projects: [CoreOperationalProject] = []
    @State private var permisos = CoreClientPermissions.ninguno
    @State private var accion: ClienteAccion?
    @State private var error: String?
    @State private var notice: String?
    @State private var busy = false
    @State private var projectTitle = ""
    @State private var projectStart = Date()

    private var mySectors: [ClientSector] { ClientSector.sectors(for: session.currentUser?.email) }

    private var addable: [ClientSector] {
        let current = Set(client?.clientSectors ?? [])
        return ClientSector.allCases.filter { mySectors.contains($0) && !current.contains($0) }
    }

    var body: some View {
        List {
            if let client {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(client.name).font(.title3.bold())
                        if client.isInactive {
                            CoreChip(icon: "pause.circle", text: "Inactivo")
                        }
                        Text("Encargado: \(nonEmpty(client.owner?.nombre))")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.vertical, 4)
                }

                Section("Fiscal") {
                    field("Razón social", nonEmpty(client.legalName))
                    field("RFC", nonEmpty(client.taxId))
                    field("Dirección", nonEmpty(client.fiscalAddress))
                    field("CP / régimen", joined([client.fiscalZipCode, client.fiscalRegime]))
                    field("Contacto", joined([client.billingEmail, client.billingPhone]))
                }

                Section("Sectores") {
                    if client.clientSectors.isEmpty {
                        Text("Sin sector").foregroundColor(.secondary)
                    } else {
                        CoreFlowLayout(spacing: 6) {
                            ForEach(client.clientSectors) { s in
                                Label(s.shortTitle, systemImage: s.symbol)
                                    .font(.caption.weight(.semibold))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Color(.tertiarySystemFill), in: Capsule())
                            }
                        }
                    }
                    ForEach(addable) { s in
                        Button("+ \(s.shortTitle)") { Task { await addSector(s) } }
                            .disabled(busy)
                    }
                }

                if client.clientSectors.contains(.proyecto) {
                    projectsSection(client)
                }

                if permisos.puedeDesactivar || permisos.puedeEliminar {
                    estatusSection(client)
                }
            } else if error == nil {
                Section { ProgressView("Cargando…") }
            }

            if let notice {
                Section { Text(notice).font(.footnote).foregroundColor(.green) }
            }
            if let error {
                Section {
                    Text(error).font(.footnote).foregroundColor(.red)
                    if client == nil {
                        Button("Reintentar") { Task { await load() } }
                    }
                }
            }
        }
        .navigationTitle(client?.name ?? "Cliente")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .alert(
            accion?.titulo ?? "",
            isPresented: Binding(
                get: { accion != nil },
                set: { if !$0 { accion = nil } }
            ),
            presenting: accion
        ) { pendiente in
            Button(pendiente.boton, role: pendiente.rol) {
                Task { await run(pendiente) }
            }
            Button("Cancelar", role: .cancel) {}
        } message: { pendiente in
            Text(pendiente.mensaje(client?.name ?? "Este cliente"))
        }
    }

    /// Desactivar / reactivar y eliminar, cada uno con su permiso.
    @ViewBuilder
    private func estatusSection(_ client: CoreSalesClient) -> some View {
        Section {
            if permisos.puedeDesactivar {
                Button {
                    accion = client.isInactive ? .reactivar : .desactivar
                } label: {
                    Label(
                        client.isInactive ? "Reactivar cliente" : "Desactivar cliente",
                        systemImage: client.isInactive ? "play.circle" : "pause.circle"
                    )
                }
                .disabled(busy)
            }
            if permisos.puedeEliminar {
                Button(role: .destructive) {
                    accion = .eliminar
                } label: {
                    Label("Eliminar cliente", systemImage: "trash")
                        .foregroundColor(.red)
                }
                .disabled(busy)
            }
        } footer: {
            Text("Desactivar conserva sus datos y su historial. Eliminar no se puede deshacer.")
        }
    }

    @ViewBuilder
    private func projectsSection(_ client: CoreSalesClient) -> some View {
        Section("Proyectos (\(projects.count))") {
            if client.serviceClientId == nil {
                Text("Falta puente operativo.").foregroundColor(.secondary)
            } else {
                if projects.isEmpty {
                    Text("Sin proyectos aún.").foregroundColor(.secondary)
                } else {
                    ForEach(projects) { p in
                        projectRow(p)
                    }
                }
                if mySectors.contains(.proyecto) {
                    TextField("Nombre del proyecto", text: $projectTitle)
                    DatePicker("Inicio", selection: $projectStart, displayedComponents: .date)
                        .environment(\.locale, Locale(identifier: "es_MX"))
                    Button(busy ? "Creando…" : "Crear proyecto") {
                        Task { await createProject() }
                    }
                    .disabled(busy)
                }
            }
        }
    }

    /// Proyecto con su estatus y, con permiso, el menú para desactivarlo, reactivarlo o eliminarlo.
    private func projectRow(_ p: CoreOperationalProject) -> some View {
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(p.title).font(.subheadline.weight(.semibold))
                if p.isInactive {
                    CoreChip(icon: "pause.circle", text: "Inactivo")
                } else {
                    Text(p.statusLabel).font(.caption).foregroundColor(.secondary)
                }
            }
            Spacer(minLength: 8)
            if permisos.puedeDesactivar || permisos.puedeEliminar {
                Menu {
                    if permisos.puedeDesactivar {
                        if p.isInactive {
                            Button {
                                accion = .reactivarProyecto(id: p.id, titulo: p.title)
                            } label: {
                                Label("Reactivar proyecto", systemImage: "play.circle")
                            }
                        } else {
                            Button {
                                accion = .desactivarProyecto(id: p.id, titulo: p.title)
                            } label: {
                                Label("Desactivar proyecto", systemImage: "pause.circle")
                            }
                        }
                    }
                    if permisos.puedeEliminar {
                        Button(role: .destructive) {
                            accion = .eliminarProyecto(id: p.id, titulo: p.title)
                        } label: {
                            Label("Eliminar proyecto", systemImage: "trash")
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .imageScale(.large)
                        .accessibilityLabel("Opciones del proyecto")
                }
                .disabled(busy)
            }
        }
    }

    private func field(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundColor(.secondary)
            Text(value).font(.subheadline).textSelection(.enabled)
        }
    }

    private func nonEmpty(_ value: String?) -> String {
        let v = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return v.isEmpty ? "—" : v
    }

    private func joined(_ values: [String?]) -> String {
        let parts = values.compactMap { $0?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        return parts.isEmpty ? "—" : parts.joined(separator: " · ")
    }

    private func load() async {
        error = nil
        do {
            let c = try await ClientesRepository.shared.detail(id: clientId)
            client = c
            if let serviceId = c.serviceClientId {
                projects = (try? await ClientesRepository.shared.projects(serviceClientId: serviceId)) ?? []
            } else {
                projects = []
            }
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo cargar")
        }
        // Sin permisos confirmados no se ofrece nada: el API vuelve a decidir en cada acción.
        permisos = (try? await ClientesRepository.shared.permissions()) ?? .ninguno
    }

    private func run(_ pendiente: ClienteAccion) async {
        busy = true
        error = nil
        notice = nil
        defer { busy = false }
        do {
            switch pendiente {
            case .desactivar, .reactivar:
                let activar = pendiente == .reactivar
                let updated: CoreSalesClient?
                if activar {
                    updated = try await ClientesRepository.shared.reactivate(id: clientId)
                } else {
                    updated = try await ClientesRepository.shared.deactivate(id: clientId)
                }
                if let updated {
                    client = updated
                } else {
                    await load()
                }
                notice = activar
                    ? "Cliente reactivado."
                    : "Cliente desactivado. Sus datos y su historial se conservan."
                onChanged?()
            case .eliminar:
                try await ClientesRepository.shared.delete(id: clientId)
                onChanged?()
                dismiss()
            case .desactivarProyecto(let id, _), .reactivarProyecto(let id, _):
                let activar: Bool
                if case .reactivarProyecto = pendiente { activar = true } else { activar = false }
                try await ClientesRepository.shared.setProjectActive(id: id, active: activar)
                await reloadProjects()
                notice = activar ? "Proyecto reactivado." : "Proyecto desactivado. Sus actividades y su historial se conservan."
            case .eliminarProyecto(let id, _):
                try await ClientesRepository.shared.deleteProject(id: id)
                projects.removeAll { $0.id == id }
                await reloadProjects()
                notice = "Proyecto eliminado."
            }
        } catch {
            let fallback: String
            switch pendiente {
            case .eliminar: fallback = "No se pudo eliminar el cliente"
            case .desactivar, .reactivar: fallback = "No se pudo cambiar el estatus del cliente"
            case .eliminarProyecto: fallback = "No se pudo eliminar el proyecto"
            case .desactivarProyecto, .reactivarProyecto: fallback = "No se pudo cambiar el estatus del proyecto"
            }
            self.error = error.toUserMessage(fallback: fallback)
        }
    }

    /// Solo la lista de proyectos; si falla se conserva la que ya estaba.
    private func reloadProjects() async {
        guard let serviceId = client?.serviceClientId else { return }
        if let fresh = try? await ClientesRepository.shared.projects(serviceClientId: serviceId) {
            projects = fresh
        }
    }

    private func addSector(_ sector: ClientSector) async {
        busy = true
        error = nil
        notice = nil
        defer { busy = false }
        do {
            if let updated = try await ClientesRepository.shared.addSector(clientId: clientId, sector: sector) {
                client = updated
                if updated.clientSectors.contains(.proyecto), let serviceId = updated.serviceClientId {
                    projects = (try? await ClientesRepository.shared.projects(serviceClientId: serviceId)) ?? []
                }
            } else {
                notice = "Sin conexión: el sector se agregará al recuperar la red."
            }
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo agregar sector")
        }
    }

    private func createProject() async {
        guard let serviceId = client?.serviceClientId,
              let vendorId = session.currentUser.flatMap({ Int($0.id) }) else { return }
        let title = projectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard title.count >= 3 else {
            error = "Título muy corto"
            return
        }
        let fmt = DateFormatter()
        fmt.calendar = Calendar(identifier: .gregorian)
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.timeZone = .current
        fmt.dateFormat = "yyyy-MM-dd"
        busy = true
        error = nil
        notice = nil
        defer { busy = false }
        do {
            try await ClientesRepository.shared.createProject(
                title: title,
                serviceClientId: serviceId,
                vendorId: vendorId,
                startDate: fmt.string(from: projectStart)
            )
            projectTitle = ""
            await load()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo crear el proyecto")
        }
    }
}
