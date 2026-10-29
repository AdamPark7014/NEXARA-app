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

    private static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = mexico
        return calendar
    }

    /// «HH:mm» de un instante, en hora de México.
    static func hhmm(_ date: Date) -> String {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
    }

    /// El mismo día (en México) a la hora «HH:mm»; nil si la hora no se entiende.
    static func at(day: Date, hhmm: String) -> Date? {
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2, (0...23).contains(parts[0]), (0...59).contains(parts[1]) else { return nil }
        return calendar.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: day)
    }

    /// Hora límite que se propone al prender «Entregar a más tardar»: las 18:00 de ese día o,
    /// si ya empieza después, una hora tras el inicio.
    static func compromisoPorOmision(inicio: Date) -> Date {
        if let cierre = at(day: inicio, hhmm: "18:00"), cierre > inicio { return cierre }
        return inicio.addingTimeInterval(3600)
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
/// cliente por sector según el tipo, subtipo de tarea (catálogo por familia), complejidad
/// con la sugerencia de la IA, agenda con «Entregar a más tardar», prioridad, tiempos y
/// fotos de evidencia (2–8). Se pinta como secciones dentro de un `Form`. Solo da de alta:
/// en iOS no se edita una actividad desde aquí.
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
    @State private var withSchedule = true
    @State private var fecha = CoreSchedule.defaultStart()
    /// «Entregar a más tardar»: apagado = el límite es el fin del día, como siempre.
    @State private var conCompromiso = false
    @State private var compromiso = CoreSchedule.compromisoPorOmision(inicio: CoreSchedule.defaultStart())
    @State private var complejidad: CoreComplejidad?
    @State private var complejidadSugerida: CoreComplejidad?
    /// Quien asigna ya eligió a mano: la sugerencia ya no cambia su elección.
    @State private var complejidadAMano = false
    @State private var tiempos: CoreTiemposTipicos?
    /// Tipo de trabajo (`tiemposKey`) del que ya se pidió lo típico.
    @State private var tiemposDe = ""
    @State private var tiemposTarea: Task<Void, Never>?
    @State private var sugerencia: CoreSugerenciaComplejidad?
    @State private var pensandoSugerencia = false
    @State private var sugerenciaTarea: Task<Void, Never>?
    /// Combinación tipo + título + indicaciones para la que se programó la última espera.
    @State private var sugerenciaPara = ""
    /// Última combinación que ya se le preguntó a la IA (una sola vez por combinación).
    @State private var ultimaPregunta = ""
    /// Ya intentó guardar: desde ahí lo que falta se dice junto al campo.
    @State private var intentado = false
    @State private var estimadoHoras = 1
    @State private var estimadoMinutos = 0
    @State private var maximoHoras = 0
    @State private var maximoMinutos = 0
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

    private var tareaTipo: CoreTareaTipo? {
        guard let tareaTipoId else { return nil }
        return CoreTareaTipo.all.first(where: { $0.id == tareaTipoId })
    }

    // Entregar a más tardar: solo con día; las horas se comparan como «HH:mm» de México.
    private var horaInicio: String { CoreSchedule.hhmm(fecha) }
    private var horaCompromiso: String { scheduled && conCompromiso ? CoreSchedule.hhmm(compromiso) : "" }
    private var compromisoOk: Bool { CoreActivityRules.compromisoValido(hora: horaInicio, compromiso: horaCompromiso) }

    // Complejidad: en tarea, después de elegir su tipo; en las demás, siempre.
    private var tipoComplejidad: String? {
        CoreActivityRules.tipoParaComplejidad(kind: kind, tareaTipo: tareaTipo, ticketType: ticketType)
    }
    private var complejidadVisible: Bool { CoreActivityRules.complejidadVisible(kind: kind, tipo: tipoComplejidad) }
    private var tiemposKey: String { complejidadVisible ? "\(kind.rawValue)|\(tipoComplejidad ?? "")" : "" }
    private var preguntaSugerencia: String {
        guard complejidadVisible else { return "" }
        return "\(kind.rawValue)|\(tipoComplejidad ?? "")|\(coreClean(titulo))|\(coreClean(indicaciones))"
    }
    private var estimadoTotal: Int { estimadoHoras * 60 + estimadoMinutos }

    var body: some View {
        Group {
            Section {
                LabeledContent("AN sugerido", value: nextAn.isEmpty ? (loaded ? "Se asigna al guardar" : "Calculando…") : nextAn)
                // La complejidad se dispara desde vistas sueltas, no desde el `Group`: un
                // modificador en el `Group` se repite en cada sección.
                TextField("Título de la actividad", text: $titulo)
                    .onAppear { refrescarComplejidad() }
                    .onChange(of: titulo) { _, _ in refrescarComplejidad() }
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
                // Catálogo cerrado por familia (28-10): sin texto libre, cada tipo se puede medir.
                Section {
                    ForEach(CoreFamiliaTarea.allCases) { familia in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(familia.label)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            CoreFlowLayout(spacing: 8) {
                                ForEach(CoreTareaTipo.deFamilia(familia)) { tipo in
                                    tareaChip(tipo)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    if intentado && tareaTipo == nil {
                        Text("Elige el tipo de tarea")
                            .font(.footnote)
                            .foregroundStyle(CorePalette.red)
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

            // El tipo de trabajo y la complejidad (que pregunta por ese tipo) van juntos.
            Group {
                if kind.ticketType == nil {
                    Section("Tipo de trabajo") {
                        Picker("Tipo", selection: $ticketType) {
                            ForEach(coreTicketTypes, id: \.value) { option in
                                Text(option.label).tag(option.value)
                            }
                        }
                        .onChange(of: ticketType) { _, _ in refrescarComplejidad() }
                        if ticketType == "OTRO" {
                            TextField("Tipo personalizado (ej. Auditoría de red)", text: $ticketTypeCustom)
                        }
                    }
                }
                if complejidadVisible {
                    complejidadSection
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
                    VStack(alignment: .leading, spacing: 4) {
                        Toggle("Entregar a más tardar (opcional)", isOn: $conCompromiso)
                            .onChange(of: conCompromiso) { _, prendido in
                                if prendido { compromiso = CoreSchedule.compromisoPorOmision(inicio: fecha) }
                            }
                        Text("Sin hora, el límite es el fin del día. Con hora, la entrega cuenta a tiempo solo si llega antes.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    if conCompromiso {
                        DatePicker("Hora límite", selection: $compromiso, displayedComponents: .hourAndMinute)
                        if !compromisoOk {
                            Text("Tiene que ser después de la hora de inicio.")
                                .font(.footnote)
                                .foregroundStyle(CorePalette.red)
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("¿Cuánto tiempo toma?")
                        .font(.subheadline.weight(.semibold))
                    Text(Self.durationLabel(horas: estimadoHoras, minutos: estimadoMinutos))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    HStack {
                        Picker("Horas", selection: $estimadoHoras) {
                            ForEach(0...24, id: \.self) { Text("\($0) h").tag($0) }
                        }
                        .pickerStyle(.wheel)
                        .frame(maxWidth: .infinity)
                        .clipped()
                        Picker("Minutos", selection: $estimadoMinutos) {
                            ForEach(Array(stride(from: 0, through: 55, by: 5)), id: \.self) {
                                Text("\($0) min").tag($0)
                            }
                        }
                        .pickerStyle(.wheel)
                        .frame(maxWidth: .infinity)
                        .clipped()
                    }
                    .frame(height: 120)
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("Tope máximo (opcional)")
                        .font(.subheadline.weight(.semibold))
                    Text(Self.durationLabel(horas: maximoHoras, minutos: maximoMinutos))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    HStack {
                        Picker("Horas máx.", selection: $maximoHoras) {
                            ForEach(0...24, id: \.self) { Text("\($0) h").tag($0) }
                        }
                        .pickerStyle(.wheel)
                        .frame(maxWidth: .infinity)
                        .clipped()
                        Picker("Minutos máx.", selection: $maximoMinutos) {
                            ForEach(Array(stride(from: 0, through: 55, by: 5)), id: \.self) {
                                Text("\($0) min").tag($0)
                            }
                        }
                        .pickerStyle(.wheel)
                        .frame(maxWidth: .infinity)
                        .clipped()
                    }
                    .frame(height: 120)
                }
            } header: {
                Text(kind.requiresSchedule ? "Agenda * (hora de México)" : "Agenda (hora de México)")
            }
            .environment(\.timeZone, CoreSchedule.mexico)

            Section {
                TextField("Indicaciones generales (para todo el equipo)", text: $indicaciones, axis: .vertical)
                    .lineLimit(2...6)
                    .onChange(of: indicaciones) { _, _ in refrescarComplejidad() }
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

    // MARK: Tipo de tarea

    private func tareaChip(_ tipo: CoreTareaTipo) -> some View {
        let on = tareaTipoId == tipo.id
        return Button {
            tareaTipoId = tipo.id
            refrescarComplejidad()
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
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    // MARK: Complejidad

    /// «Complejidad» (canvas de Asignar, 28-10): cuatro niveles con el tiempo típico de cada uno,
    /// la sugerencia de la IA y lo típico de ese tipo de trabajo para usarlo como tiempo estimado.
    /// La IA solo sugiere: si nadie elige, se toma su nivel; si quien asigna cambia, se guardan las dos.
    @ViewBuilder
    private var complejidadSection: some View {
        let tipico = CoreComplejidad.tipicoPara(tiempos, complejidad)
        let texto = CoreComplejidad.textoTipico(
            tipoLabel: CoreActivityRules.etiquetaTipoTrabajo(kind: kind, tipo: tipoComplejidad),
            nivel: complejidad,
            tipico: tipico
        )
        Section {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(CoreComplejidad.allCases) { nivel in
                    complejidadBoton(nivel)
                }
            }
            .padding(.vertical, 4)

            if sugerencia != nil || pensandoSugerencia {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "sparkles")
                        .foregroundStyle(Color.accentColor)
                        .accessibilityHidden(true)
                    if let sugerencia {
                        (Text("Sugerencia: \(sugerencia.complejidad.label).").bold()
                            + Text(" " + CoreComplejidad.textoSugerencia(sugerencia, elegida: complejidad)))
                            .font(.footnote)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        Text("Revisando el título para sugerir la complejidad…")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
            }

            if let texto, let tipico {
                VStack(alignment: .leading, spacing: 6) {
                    Text(texto + (!tipico.delNivel && complejidad != nil ? " Aún no hay suficientes de este nivel." : ""))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    let minutos = CoreComplejidad.minutosParaEstimado(tipico.minutos)
                    if minutos != estimadoTotal {
                        Button("Usar \(CoreComplejidad.formatoMinutos(minutos)) como tiempo estimado") {
                            estimadoHoras = minutos / 60
                            estimadoMinutos = minutos % 60
                        }
                        .buttonStyle(.borderless)
                        .font(.footnote.weight(.semibold))
                    } else {
                        Text("Es el tiempo estimado.")
                            .font(.footnote)
                            .foregroundStyle(CorePalette.green)
                    }
                }
            }
        } header: {
            Text("Complejidad · opcional")
        } footer: {
            if let complejidad {
                Text("\(complejidad.label): \(complejidad.definicion).")
            }
        }
    }

    private func complejidadBoton(_ nivel: CoreComplejidad) -> some View {
        let on = complejidad == nivel
        let mediana = tiempos?.porComplejidad[nivel]?.medianaMin
        return Button {
            complejidadAMano = true
            complejidad = nivel
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(nivel.label)
                    .font(.subheadline.weight(.bold))
                Text(mediana.map { CoreComplejidad.formatoMinutos($0) } ?? nivel.ayuda)
                    .font(.caption)
                    .foregroundStyle(on ? Color.accentColor : Color.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .foregroundStyle(on ? Color.accentColor : Color.primary)
            .background(
                on ? Color.accentColor.opacity(0.14) : Color.secondary.opacity(0.08),
                in: RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous)
            )
        }
        .buttonStyle(.borderless)
        .accessibilityHint(nivel.definicion)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// Se llama cada vez que cambia el título, las indicaciones o el tipo de trabajo.
    ///
    /// - Lo típico se vuelve a pedir solo si cambió el tipo de trabajo.
    /// - La sugerencia se pide con un título de 6 letras o más, ~900 ms después del último
    ///   cambio y una sola vez por combinación (una llamada por título, no por letra).
    ///
    /// Si la API falla, ni pista ni sugerencia, y ningún error visible.
    private func refrescarComplejidad() {
        let claveTiempos = tiemposKey
        if claveTiempos != tiemposDe {
            tiemposDe = claveTiempos
            tiempos = nil
            tiemposTarea?.cancel()
            tiemposTarea = nil
            if complejidadVisible {
                let coreKind = kind.rawValue
                let tipo = tipoComplejidad
                tiemposTarea = Task { @MainActor in
                    let resultado = try? await CoreRepository.shared.tiemposTipicos(coreKind: coreKind, tipo: tipo)
                    guard !Task.isCancelled, tiemposDe == claveTiempos else { return }
                    tiempos = resultado
                }
            }
        }

        // Misma combinación que la ya programada (p. ej. la fila del título volvió a aparecer al
        // desplazarse): no se toca la que va en camino.
        let pregunta = preguntaSugerencia
        guard pregunta != sugerenciaPara else { return }
        sugerenciaTarea?.cancel()
        sugerenciaTarea = nil
        pensandoSugerencia = false
        sugerenciaPara = pregunta
        let tituloLimpio = coreClean(titulo)
        guard complejidadVisible, tituloLimpio.count >= 6, pregunta != ultimaPregunta else { return }
        let coreKind = kind.rawValue
        let tipo = tipoComplejidad
        let notas = coreClean(indicaciones)
        sugerenciaTarea = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 900_000_000)
            guard !Task.isCancelled else { return }
            ultimaPregunta = pregunta
            pensandoSugerencia = true
            let resultado = try? await CoreRepository.shared.sugerirComplejidad(
                coreKind: coreKind,
                tipo: tipo,
                titulo: tituloLimpio,
                indicaciones: notas.isEmpty ? nil : notas
            )
            guard !Task.isCancelled else { return }
            pensandoSugerencia = false
            // `try?` aplana el opcional: nil = falló o no hubo sugerencia (las dos se callan).
            sugerencia = resultado
            guard let nivel = resultado?.complejidad else { return }
            complejidadSugerida = nivel
            if !complejidadAMano { complejidad = nivel }
        }
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
    private static func durationLabel(horas: Int, minutos: Int) -> String {
        if horas <= 0 && minutos <= 0 { return "Sin tiempo" }
        if horas <= 0 { return "\(minutos) min" }
        if minutos <= 0 { return horas == 1 ? "1 h" : "\(horas) h" }
        return "\(horas) h \(minutos) min"
    }

    private func submit() async {
        guard !saving else { return }
        error = nil
        intentado = true

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
            guard let tipo = tareaTipo else {
                error = "Elige el tipo de tarea"
                return
            }
            custom = tipo.label
            type = "OTRO"
        } else if kind.ticketType == nil && ticketType == "OTRO" {
            let text = coreClean(ticketTypeCustom)
            guard !text.isEmpty else {
                error = "Especifica el tipo de trabajo"
                return
            }
            custom = text
        }

        if !compromisoOk {
            error = "La hora de entrega tiene que ser después de la hora de inicio"
            return
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
        // Sin compromiso, la fecha máxima es la de inicio y la API la lee como «fin del día».
        let limite: String? = scheduled
            ? CoreFormat.isoString(
                CoreSchedule.at(
                    day: fecha,
                    hhmm: CoreActivityRules.horaLimite(hora: horaInicio, compromiso: horaCompromiso)
                ) ?? fecha
            )
            : nil
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
            tiempoEstimadoMin: {
                let total = estimadoHoras * 60 + estimadoMinutos
                return total > 0 ? total : nil
            }(),
            tiempoMaximoMin: {
                let total = maximoHoras * 60 + maximoMinutos
                return total > 0 ? total : nil
            }(),
            fechaInicio: when,
            fechaEntregaEsperada: limite,
            fechaMaxima: limite,
            evidencePhotoRequired: min(8, max(2, fotos)),
            coreKind: kind.rawValue,
            assignmentCharge: charge?.rawValue,
            // Solo si se ve el campo: una tarea sin tipo no lleva complejidad.
            complejidad: complejidadVisible ? complejidad?.rawValue : nil,
            complejidadSugerida: complejidadVisible ? complejidadSugerida?.rawValue : nil,
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
    private var allowedKinds: [CoreActivityKind] {
        CoreActivityRules.kindsForAssignment(creator: me, targetEmail: me?.email)
    }

    var body: some View {
        NavigationStack {
            Form {
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
