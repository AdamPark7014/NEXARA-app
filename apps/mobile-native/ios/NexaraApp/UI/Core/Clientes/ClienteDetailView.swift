import SwiftUI

/// Lo que se confirma antes de tocar el estatus del cliente o de uno de sus
/// proyectos. Textos de `ClientRules` de Android (= diálogo de `/erp/clientes/:id`).
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

    /// Desactivar y eliminar se confirman en rojo; reactivar no.
    var rol: ButtonRole? {
        switch self {
        case .reactivar, .reactivarProyecto: return nil
        case .desactivar, .eliminar, .desactivarProyecto, .eliminarProyecto: return .destructive
        }
    }

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
            return "¿Eliminar «\(titulo)»? Dejará de aparecer en las listas y esta acción no se puede deshacer. Si solo está detenido, mejor desactívalo."
        }
    }
}

/// Ficha de cliente — igual que `ClientDetailScreen` de Android: encabezado con
/// el nombre, «Encargado: …» y el menú ⋮ (desactivar / reactivar y eliminar,
/// solo con permiso del API: hoy, solo Christian); paneles «Fiscal»,
/// «Sectores» (con «+ sector» de los que manejas) y, en PROYECTO, «Proyectos
/// (N)» con su menú y el alta rápida (nombre y fecha de inicio).
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
    @State private var loading = true
    @State private var error: String?
    @State private var busy = false
    @State private var projectTitle = ""
    @State private var projectStart = NxHoraMexico.hoy()

    private var mySectors: [ClientSector] { ClientSector.sectors(for: session.currentUser?.email) }

    /// Sectores que puedo sumar: los míos que el cliente aún no tiene.
    private var addable: [ClientSector] {
        let current = Set(client?.clientSectors ?? [])
        return mySectors.filter { !current.contains($0) }
    }

    /// Hay algo que mostrar en el menú ⋮.
    private var showOwnerActions: Bool { permisos.puedeDesactivar || permisos.puedeEliminar }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: NxSpacing.m) {
                if loading && client == nil {
                    NxLoadingState(text: "Cargando cliente…")
                }
                if let error {
                    NxErrorBlock(message: error) { Task { await load() } }
                }
                if let client {
                    encabezado(client)
                    if client.isInactive || busy {
                        HStack(spacing: NxSpacing.s) {
                            if client.isInactive {
                                NxStatusChip(text: "Inactivo", tone: .warning, systemImage: "nosign")
                            }
                            if busy {
                                Text("Guardando…")
                                    .font(NxType.bodySmall)
                                    .foregroundStyle(NxColors.muted)
                            }
                        }
                    }
                    fiscal(client)
                    sectores(client)
                    if client.clientSectors.contains(.proyecto) {
                        proyectos(client)
                    }
                }
                Spacer().frame(height: NxSpacing.l)
            }
            .padding(NxSpacing.l)
        }
        .nxScreenBackground()
        .scrollDismissesKeyboard(.interactively)
        .task { await load() }
        .alert(
            accion?.titulo ?? "",
            isPresented: Binding(
                get: { accion != nil },
                set: { if !$0 { accion = nil } }
            ),
            presenting: accion
        ) { pendiente in
            Button("Cancelar", role: .cancel) {}
            Button(pendiente.boton, role: pendiente.rol) {
                Task { await run(pendiente) }
            }
        } message: { pendiente in
            Text(pendiente.mensaje(Self.nombre(client?.name)))
        }
    }

    // MARK: Encabezado

    private func encabezado(_ client: CoreSalesClient) -> some View {
        NxSectionHeader(
            title: Self.nombre(client.name),
            subtitle: "Encargado: \(Self.texto(client.owner?.nombre) ?? "—")"
        ) {
            if showOwnerActions {
                menuDueno(
                    toggleLabel: client.isInactive ? "Reactivar cliente" : "Desactivar cliente",
                    deleteLabel: "Eliminar cliente",
                    descripcion: "Opciones del cliente",
                    inactivo: client.isInactive,
                    enabled: !busy,
                    onToggle: { accion = client.isInactive ? .reactivar : .desactivar },
                    onDelete: { accion = .eliminar }
                )
            }
        }
    }

    /// Menú ⋮ del dueño (cliente o proyecto), con el permiso de cada acción.
    private func menuDueno(
        toggleLabel: String,
        deleteLabel: String,
        descripcion: String,
        inactivo: Bool,
        enabled: Bool,
        onToggle: @escaping () -> Void,
        onDelete: @escaping () -> Void
    ) -> some View {
        Menu {
            if permisos.puedeDesactivar {
                Button(action: onToggle) {
                    Label(toggleLabel, systemImage: inactivo ? "arrow.counterclockwise" : "nosign")
                }
            }
            if permisos.puedeEliminar {
                Button(role: .destructive, action: onDelete) {
                    Label(deleteLabel, systemImage: "trash")
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .rotationEffect(.degrees(90))
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(NxColors.muted)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .disabled(!enabled)
        .accessibilityLabel(descripcion)
    }

    // MARK: Fiscal

    private func fiscal(_ client: CoreSalesClient) -> some View {
        NxPanelShell {
            tituloPanel("Fiscal")
            Spacer().frame(height: 6)
            dato("Razón social", client.legalName)
            dato("RFC", client.taxId)
            dato("Dirección", client.fiscalAddress)
            dato("CP / régimen", Self.unir([client.fiscalZipCode, client.fiscalRegime]))
            dato("Contacto", Self.unir([client.billingEmail, client.billingPhone]))
        }
    }

    /// `ClientFactRow`: etiqueta 12,5 a la izquierda, valor 14 SemiBold a la derecha.
    private func dato(_ etiqueta: String, _ valor: String?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(etiqueta)
                .font(NxType.bodySmall)
                .foregroundStyle(NxColors.fg)
            Spacer(minLength: 0)
            Text(Self.texto(valor) ?? "—")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(NxColors.fg)
                .multilineTextAlignment(.trailing)
                .textSelection(.enabled)
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }

    // MARK: Sectores

    private func sectores(_ client: CoreSalesClient) -> some View {
        NxPanelShell {
            tituloPanel("Sectores")
            Spacer().frame(height: NxSpacing.s)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: NxSpacing.s) {
                    ForEach(client.clientSectors) { s in
                        NxStatusChip(text: s.padronEtiqueta, tone: .brand, systemImage: s.padronSimbolo)
                    }
                }
            }
            if !addable.isEmpty {
                Spacer().frame(height: NxSpacing.s)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: NxSpacing.s) {
                        ForEach(addable) { s in
                            NxBotonContorno(title: "+ \(s.padronEtiqueta)", enabled: !busy) {
                                Task { await addSector(s) }
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: Proyectos

    private func proyectos(_ client: CoreSalesClient) -> some View {
        NxPanelShell {
            tituloPanel("Proyectos (\(projects.count))")
            Spacer().frame(height: 6)
            if client.serviceClientId == nil {
                Text("Falta puente operativo.")
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.fg)
            } else {
                if projects.isEmpty {
                    Text("Sin proyectos aún.")
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.fg)
                } else {
                    ForEach(projects) { p in
                        filaProyecto(p)
                        Spacer().frame(height: 6)
                    }
                }
                if mySectors.contains(.proyecto) {
                    Spacer().frame(height: NxSpacing.s)
                    NxOutlinedCampo(label: "Nombre del proyecto", text: $projectTitle)
                    Spacer().frame(height: NxSpacing.s)
                    NxFechaCampo(label: "Inicio", value: $projectStart)
                    Spacer().frame(height: NxSpacing.s)
                    NxBotonPildora(title: "Crear proyecto", enabled: !busy) {
                        Task { await createProject() }
                    }
                }
            }
        }
    }

    /// Proyecto con su estatus y, con permiso, el menú para desactivarlo, reactivarlo o eliminarlo.
    private func filaProyecto(_ p: CoreOperationalProject) -> some View {
        let titulo = p.title.trimmingCharacters(in: .whitespaces)
        let nombre = titulo.isEmpty ? "Proyecto \(p.id)" : titulo
        return NxListRow(
            title: nombre,
            subtitle: p.isInactive ? nil : Self.estatusProyecto(p.status),
            chipText: p.isInactive ? "Inactivo" : nil,
            chipTone: .warning,
            trailing: {
                if showOwnerActions {
                    menuDueno(
                        toggleLabel: p.isInactive ? "Reactivar proyecto" : "Desactivar proyecto",
                        deleteLabel: "Eliminar proyecto",
                        descripcion: "Opciones del proyecto",
                        inactivo: p.isInactive,
                        enabled: !busy,
                        onToggle: {
                            accion = p.isInactive
                                ? .reactivarProyecto(id: p.id, titulo: Self.nombreProyecto(p.title))
                                : .desactivarProyecto(id: p.id, titulo: Self.nombreProyecto(p.title))
                        },
                        onDelete: { accion = .eliminarProyecto(id: p.id, titulo: Self.nombreProyecto(p.title)) }
                    )
                }
            }
        )
    }

    private func tituloPanel(_ texto: String) -> some View {
        Text(texto)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(NxColors.fg)
            .accessibilityAddTraits(.isHeader)
    }

    // MARK: Reglas de texto (`ClientRules` de Android)

    private static func texto(_ value: String?) -> String? {
        let v = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return v.isEmpty ? nil : v
    }

    private static func nombre(_ value: String?) -> String { texto(value) ?? "Sin nombre" }

    private static func nombreProyecto(_ value: String?) -> String { texto(value) ?? "Proyecto sin nombre" }

    private static func unir(_ values: [String?]) -> String {
        values.compactMap { texto($0) }.joined(separator: " · ")
    }

    /// `projectStatusLabel`: ACTIVE → Activo, ON_HOLD → Inactivo, COMPLETED → Terminado.
    private static func estatusProyecto(_ status: String?) -> String {
        let s = (status ?? "").trimmingCharacters(in: .whitespaces)
        switch s.uppercased() {
        case "ACTIVE": return "Activo"
        case "ON_HOLD": return "Inactivo"
        case "COMPLETED": return "Terminado"
        case "": return "Sin estatus"
        default: return s
        }
    }

    // MARK: Datos

    private func load() async {
        loading = true
        error = nil
        // Sin permisos no hay menú ⋮; un fallo aquí no tumba la ficha.
        async let permisosTask = try? ClientesRepository.shared.permissions()
        do {
            let c = try await ClientesRepository.shared.detail(id: clientId)
            client = c
            // Los proyectos cuelgan del puente operativo; sin él no hay nada que pedir.
            if let serviceId = c.serviceClientId {
                projects = (try? await ClientesRepository.shared.projects(serviceClientId: serviceId)) ?? []
            } else {
                projects = []
            }
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo cargar el cliente")
        }
        if let fresh = await permisosTask { permisos = fresh }
        loading = false
    }

    private func run(_ pendiente: ClienteAccion) async {
        busy = true
        error = nil
        do {
            switch pendiente {
            case .desactivar, .reactivar:
                let activar = pendiente == .reactivar
                if activar {
                    _ = try await ClientesRepository.shared.reactivate(id: clientId)
                } else {
                    _ = try await ClientesRepository.shared.deactivate(id: clientId)
                }
                busy = false
                onChanged?()
                await load()
            case .eliminar:
                try await ClientesRepository.shared.delete(id: clientId)
                busy = false
                onChanged?()
                dismiss()
            case .desactivarProyecto(let id, _), .reactivarProyecto(let id, _):
                let activar: Bool
                if case .reactivarProyecto = pendiente { activar = true } else { activar = false }
                try await ClientesRepository.shared.setProjectActive(id: id, active: activar)
                busy = false
                await load()
            case .eliminarProyecto(let id, _):
                try await ClientesRepository.shared.deleteProject(id: id)
                // Se quita de la lista sin esperar la recarga.
                projects.removeAll { $0.id == id }
                busy = false
                await load()
            }
        } catch {
            busy = false
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

    private func addSector(_ sector: ClientSector) async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            if let updated = try await ClientesRepository.shared.addSector(clientId: clientId, sector: sector) {
                client = updated
                if updated.clientSectors.contains(.proyecto), let serviceId = updated.serviceClientId {
                    projects = (try? await ClientesRepository.shared.projects(serviceClientId: serviceId)) ?? projects
                }
            } else {
                error = "Sin conexión: el sector se agregará al recuperar la red."
            }
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo agregar el sector")
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
        busy = true
        error = nil
        do {
            try await ClientesRepository.shared.createProject(
                title: title,
                serviceClientId: serviceId,
                vendorId: vendorId,
                startDate: projectStart.isEmpty ? NxHoraMexico.hoy() : projectStart
            )
            projectTitle = ""
            busy = false
            await load()
        } catch {
            busy = false
            self.error = error.toUserMessage(fallback: "No se pudo crear el proyecto")
        }
    }
}
