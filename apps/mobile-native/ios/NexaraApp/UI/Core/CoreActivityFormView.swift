import SwiftUI

/// Agenda de Core: el día y la hora se eligen en hora de México, como la web.
enum CoreSchedule {
    static let mexico = TimeZone(identifier: "America/Mexico_City") ?? .current

    /// Hoy a las 9:00 (México) o, si ya pasó, mañana a las 9:00.
    static func defaultStart(now: Date = Date()) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = mexico
        let today = calendar.date(bySettingHour: 9, minute: 0, second: 0, of: now) ?? now
        if today > now { return today }
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: now) ?? now
        return calendar.date(bySettingHour: 9, minute: 0, second: 0, of: tomorrow) ?? tomorrow
    }
}

private let coreTicketTypes: [(value: String, label: String)] = [
    ("PREVENTIVO", "Preventivo"),
    ("CORRECTIVO", "Correctivo"),
    ("EMERGENCIA", "Emergencia"),
    ("INSTALACION", "Instalación"),
    ("INVENTARIO", "Inventario"),
    ("OTRO", "Otro"),
]

private func coreClean(_ text: String) -> String {
    text.trimmingCharacters(in: .whitespacesAndNewlines)
}

/// Datos de la actividad — espejo de `OpsActivityForm` en tono Core: proyecto o
/// cliente por sector según el tipo, subtipo de tarea, agenda, prioridad,
/// tiempos y fotos de evidencia (2–8). Se pinta como secciones dentro de un `Form`.
struct CoreActivityFormView: View {
    let kind: CoreActivityKind
    let charge: CoreAssignmentCharge?
    let responsableId: Int
    /// `true` = `POST me/activities` (auto-asignación); `false` = `POST activities`.
    let selfAssign: Bool
    let submitLabel: String
    /// Recibe el id creado; lo que siga (equipo, cerrar) lo decide quien lo usa.
    let onCreated: (Int) async -> Void

    @ObservedObject private var session = SessionStore.shared
    @State private var titulo = ""
    @State private var indicaciones = ""
    @State private var prioridad = "Media"
    @State private var projectId: Int?
    @State private var clientId: Int?
    @State private var ticketType = "PREVENTIVO"
    @State private var ticketTypeCustom = ""
    @State private var tareaTipoId: String?
    @State private var tareaOtro = ""
    @State private var withSchedule = true
    @State private var fecha = CoreSchedule.defaultStart()
    @State private var estimado = ""
    @State private var maximo = ""
    @State private var fotos = 4
    @State private var nextAn = ""
    @State private var projects: [CoreProjectOption] = []
    @State private var sectorClients: [CoreSectorClientOption] = []
    @State private var loaded = false
    @State private var saving = false
    @State private var error: String?

    private var needsClientPicker: Bool { kind == .servicio || kind == .comercial }
    private var filtersProjectsBySector: Bool { kind == .proyecto || kind == .obra }
    private var scheduled: Bool { kind.requiresSchedule || withSchedule }

    private var activeProjects: [CoreProjectOption] {
        let active = projects.filter { $0.status.uppercased() == "ACTIVE" }
        guard filtersProjectsBySector, !sectorClients.isEmpty else { return active }
        let allowed = Set(sectorClients.map(\.serviceClientId))
        return active.filter { project in
            guard let clientId = project.clientId else { return false }
            return allowed.contains(clientId)
        }
    }

    private var selectedProject: CoreProjectOption? {
        guard let projectId else { return nil }
        return activeProjects.first(where: { $0.id == projectId })
    }

    var body: some View {
        Group {
            Section {
                LabeledContent("AN sugerido", value: nextAn.isEmpty ? (loaded ? "Se asigna al guardar" : "Calculando…") : nextAn)
                TextField("Título de la actividad", text: $titulo)
            } header: {
                Text("Datos de la actividad")
            } footer: {
                Text(kind.withProject
                     ? "Elige proyecto, prioridad y agenda. El cliente sale del proyecto."
                     : (needsClientPicker ? "Elige el cliente de este padrón." : "Trabajo del día sin proyecto."))
            }

            if kind.withProject {
                Section("Proyecto *") {
                    Picker("Proyecto", selection: $projectId) {
                        Text("Seleccionar proyecto…").tag(Int?.none)
                        ForEach(activeProjects) { project in
                            Text(project.title).tag(Int?.some(project.id))
                        }
                    }
                    LabeledContent("Cliente", value: selectedProject.map { $0.clientName.isEmpty ? "—" : $0.clientName } ?? "Automático")
                    if loaded && activeProjects.isEmpty {
                        Text("No hay proyectos activos de tus clientes.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if kind == .tarea {
                Section {
                    CoreFlowLayout(spacing: 8) {
                        ForEach(CoreTareaTipo.all) { tipo in
                            let on = tareaTipoId == tipo.id
                            Button {
                                tareaTipoId = tipo.id
                            } label: {
                                Label(tipo.label, systemImage: tipo.symbol)
                                    .symbolRenderingMode(.hierarchical)
                                    .font(.subheadline.weight(on ? .bold : .regular))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .foregroundStyle(on ? Color.accentColor : Color.primary)
                                    .background(on ? Color.accentColor.opacity(0.14) : Color.secondary.opacity(0.08), in: Capsule())
                            }
                            .buttonStyle(.borderless)
                        }
                    }
                    .padding(.vertical, 4)
                    if tareaTipoId == "otro" {
                        TextField("Especifica el tipo (ej. Visita a proveedor)", text: $tareaOtro)
                    }
                } header: {
                    Text("Tipo de tarea *")
                }
            }

            if needsClientPicker {
                Section(kind == .servicio ? "Cliente *" : "Cliente") {
                    Picker("Cliente", selection: $clientId) {
                        Text("Seleccionar cliente…").tag(Int?.none)
                        ForEach(sectorClients) { client in
                            Text(client.name).tag(Int?.some(client.serviceClientId))
                        }
                    }
                    if loaded && sectorClients.isEmpty {
                        Text("No tienes clientes de este padrón.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if kind.ticketType == nil {
                Section("Tipo de trabajo") {
                    Picker("Tipo", selection: $ticketType) {
                        ForEach(coreTicketTypes, id: \.value) { option in
                            Text(option.label).tag(option.value)
                        }
                    }
                    if ticketType == "OTRO" {
                        TextField("Tipo personalizado (ej. Auditoría de red)", text: $ticketTypeCustom)
                    }
                }
            }

            Section("Prioridad") {
                Picker("Prioridad", selection: $prioridad) {
                    Label { Text("Alta · Urgente") } icon: {
                        Image(systemName: "exclamationmark.circle.fill").foregroundStyle(CorePalette.red)
                    }
                    .tag("Alta")
                    Label { Text("Media · Esta semana") } icon: {
                        Image(systemName: "circle.fill").foregroundStyle(CorePalette.amber)
                    }
                    .tag("Media")
                    Label { Text("Baja · Puede esperar") } icon: {
                        Image(systemName: "circle.fill").foregroundStyle(CorePalette.green)
                    }
                    .tag("Baja")
                }
                .pickerStyle(.inline)
                .labelsHidden()
            }

            Section {
                if !kind.requiresSchedule {
                    Toggle("Poner día y hora", isOn: $withSchedule)
                }
                if scheduled {
                    DatePicker("Día", selection: $fecha, displayedComponents: .date)
                    DatePicker("Hora", selection: $fecha, displayedComponents: .hourAndMinute)
                }
                TextField("¿Cuántos minutos esperas que tome?", text: $estimado)
                    .keyboardType(.numberPad)
                TextField("Tope máximo (min)", text: $maximo)
                    .keyboardType(.numberPad)
            } header: {
                Text(kind.requiresSchedule ? "Agenda * (hora de México)" : "Agenda (hora de México)")
            }
            .environment(\.timeZone, CoreSchedule.mexico)

            Section {
                TextField("Indicaciones generales (para todo el equipo)", text: $indicaciones, axis: .vertical)
                    .lineLimit(2...6)
                Stepper("Fotos de evidencia por persona: \(fotos)", value: $fotos, in: 2...8)
            } footer: {
                Text("Cada persona que la ejecute sube entre 2 y 8 fotos.")
            }

            if let error {
                Section {
                    Text(error).foregroundStyle(CorePalette.red)
                }
            }

            Section {
                Button {
                    Task { await submit() }
                } label: {
                    HStack {
                        Spacer()
                        if saving { ProgressView().padding(.trailing, 6) }
                        Text(saving ? "Guardando…" : submitLabel).bold()
                        Spacer()
                    }
                }
                .disabled(saving)
            }
        }
        .task(id: kind) { await loadMeta() }
    }

    @MainActor
    private func loadMeta() async {
        let sectors = ClientSector.forActivityKind(kind, email: session.currentUser?.email)
        async let an = CoreRepository.shared.nextActivityNumber()
        async let clients = CoreRepository.shared.sectorClients(sectors)
        // Un encargado sin permiso de OT recibe 403 aquí: no tumba el formulario.
        let loadedProjects = (try? await CoreRepository.shared.operationalProjects()) ?? []
        projects = loadedProjects
        sectorClients = await clients
        nextAn = await an
        loaded = true
    }

    @MainActor
    private func submit() async {
        guard !saving else { return }
        error = nil

        let title = coreClean(titulo)
        guard !title.isEmpty else {
            error = "El título es obligatorio"
            return
        }
        guard responsableId > 0, let me = session.currentUser.flatMap({ Int($0.id) }) else {
            error = "Sesión inválida. Vuelve a entrar."
            return
        }

        var type = kind.ticketType ?? ticketType
        var custom = kind.ticketTypeCustom
        if kind == .tarea {
            guard let tipo = tareaTipoId else {
                error = "Elige el tipo de tarea"
                return
            }
            if tipo == "otro" {
                let text = coreClean(tareaOtro)
                guard !text.isEmpty else {
                    error = "Especifica el tipo de tarea"
                    return
                }
                custom = String(text.prefix(120))
            } else {
                custom = CoreTareaTipo.all.first(where: { $0.id == tipo })?.label
            }
            type = "OTRO"
        } else if kind.ticketType == nil && ticketType == "OTRO" {
            let text = coreClean(ticketTypeCustom)
            guard !text.isEmpty else {
                error = "Especifica el tipo de trabajo"
                return
            }
            custom = text
        }

        let project = selectedProject
        if kind.withProject && project == nil {
            error = "Selecciona un proyecto"
            return
        }
        if kind == .servicio && !sectorClients.isEmpty && clientId == nil {
            error = "Elige el cliente del servicio"
            return
        }

        let when = scheduled ? CoreFormat.isoString(fecha) : nil
        let notes = coreClean(indicaciones)
        let body = CoreActivityCreateBody(
            titulo: title,
            indicaciones: notes.isEmpty ? nil : notes,
            prioridad: prioridad,
            activityType: kind.withProject ? "CLIENT" : "INTERNAL",
            ticketType: type == "INVENTARIO" ? "PREVENTIVO" : type,
            ticketTypeCustom: type == "OTRO" ? custom : nil,
            workType: type == "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
            projectId: kind.withProject ? project?.id : nil,
            clientId: kind.withProject ? (project?.clientId ?? clientId) : clientId,
            responsableId: responsableId,
            tiempoEstimadoMin: Int(coreClean(estimado)),
            tiempoMaximoMin: Int(coreClean(maximo)),
            fechaInicio: when,
            fechaEntregaEsperada: when,
            fechaMaxima: when,
            evidencePhotoRequired: min(8, max(2, fotos)),
            coreKind: kind.rawValue,
            assignmentCharge: charge?.rawValue,
            estatus: "Pendiente",
            creadoPorId: me
        )

        saving = true
        defer { saving = false }
        do {
            let id = try await CoreRepository.shared.createCoreActivity(body, selfAssign: selfAssign)
            await onCreated(id)
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo guardar la actividad")
        }
    }
}

/// Auto-asignarse (`/erp/mis-actividades/nueva`): el encargado elige el tipo que
/// puede crear y recibir, y la actividad queda a su nombre como ejecución directa.
struct CoreSelfAssignSheet: View {
    let onCreated: (Int) -> Void

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var session = SessionStore.shared
    @State private var kind: CoreActivityKind?

    private var me: SessionUser? { session.currentUser }
    /// Como la web (`isAreaManagerEmail`): solo los encargados de área se auto-asignan.
    private var isAreaManager: Bool { CoreActivityRules.isAreaManager(me?.email) }
    private var allowedKinds: [CoreActivityKind] {
        CoreActivityRules.kindsForAssignment(creator: me, targetEmail: me?.email)
    }

    var body: some View {
        NavigationStack {
            Form {
                if isAreaManager {
                    Section {
                        Text("Queda solo a tu nombre, como ejecución directa. Ponle día, hora y cuánto te va a tomar; después la acomodas en tu cola.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    Section("1 · ¿Qué tipo de actividad es?") {
                        ForEach(allowedKinds) { option in
                            CoreKindRow(kind: option, selected: kind == option) { kind = option }
                        }
                    }
                    if let kind, let myId = me.flatMap({ Int($0.id) }) {
                        CoreActivityFormView(
                            kind: kind,
                            charge: .ejecucion,
                            responsableId: myId,
                            selfAssign: true,
                            submitLabel: "Crear actividad",
                            onCreated: { id in
                                onCreated(id)
                                dismiss()
                            }
                        )
                        .id(kind)
                    } else {
                        Section {
                            Text("Elige un tipo para continuar.").foregroundStyle(.secondary)
                        }
                    }
                } else {
                    Section {
                        Text("Solo los encargados de área pueden auto-asignarse actividades. Tu encargado te las asigna.")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Auto-asignarme")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
            }
            .onAppear {
                if allowedKinds.count == 1 { kind = allowedKinds[0] }
            }
        }
    }
}

/// Renglón de tipo de actividad con palomita.
struct CoreKindRow: View {
    let kind: CoreActivityKind
    let selected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(alignment: .top, spacing: 12) {
                NxIconBadge(systemName: kind.symbol, size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(kind.title).font(.body.weight(.bold)).foregroundStyle(Color.primary)
                    Text(kind.help).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(selected ? Color.accentColor : Color.secondary)
            }
        }
    }
}
