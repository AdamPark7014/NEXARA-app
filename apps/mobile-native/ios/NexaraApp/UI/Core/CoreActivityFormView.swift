import SwiftUI

/// Agenda de Core: el día y la hora se eligen en hora de México, como la web.
enum CoreSchedule {
    static let mexico = TimeZone(identifier: "America/Mexico_City") ?? .current

    /// Hoy a la hora de inicio por omisión (México) o, si ya pasó, mañana a esa hora. La hora es la
    /// entrada de quien ejecuta cuando se conoce (`CoreActivityRules.horaDeEntrada`); si no, 10:00.
    static func defaultStart(now: Date = Date(), hhmm: String = CoreActivityRules.horaPorOmision) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = mexico
        let today = at(day: now, hhmm: hhmm) ?? now
        if today > now { return today }
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: now) ?? now
        return at(day: tomorrow, hhmm: hhmm) ?? tomorrow
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
    /// La hora que se puso sola (la de la oficina o la entrada de quien ejecuta): si la de `fecha`
    /// ya es otra, quien asigna la movió a mano.
    @State private var horaAutomatica = CoreActivityRules.horaPorOmision
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
    /// Tiempo estándar al asignar a otro: la tabla (`GET ai/estandar/tabla`), lo que se cuenta y,
    /// si quien asigna pone otro tiempo, el motivo.
    @State private var tablaEstandar: CoreTiempoEstandar.Tabla?
    @State private var unidadEstandar = ""
    @State private var cantidadEstandar = ""
    /// La cantidad la puso la IA (se dice) hasta que alguien la toca.
    @State private var cantidadDeIA = false
    @State private var cantidadAMano = false
    @State private var cambiandoEstandar = false
    @State private var motivoEstandar = ""

    /// Autoasignación (regla de Adam, 29-10): a sí mismo, desde «Auto-asignarme» o desde su propia
    /// ficha. El tiempo, el tope, la complejidad y la entrega los calcula la API del título y el
    /// tipo (los ignoraría de todos modos): no se capturan y se enseñan en solo lectura.
    private var autoasignacion: Bool {
        selfAssign || (responsableId > 0 && responsableId == session.currentUser.flatMap { Int($0.id) })
    }

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

    // Complejidad: en tarea, después de elegir su tipo; en las demás, siempre. En la autoasignación
    // nunca: la fija el sistema, y así tampoco se piden lo típico ni la sugerencia de la IA.
    private var tipoComplejidad: String? {
        CoreActivityRules.tipoParaComplejidad(kind: kind, tareaTipo: tareaTipo, ticketType: ticketType)
    }
    private var complejidadVisible: Bool {
        !autoasignacion && CoreActivityRules.complejidadVisible(kind: kind, tipo: tipoComplejidad)
    }

    /// La pregunta de la vista previa del tiempo (solo en la autoasignación): el mismo tipo que se
    /// mandará al guardar. nil mientras falte el título (6 letras o más) o, en tarea, su tipo.
    private var pedidoTiempo: CoreTiempoCalculadoBody? {
        guard autoasignacion else { return nil }
        let title = coreClean(titulo)
        guard title.count >= 6 else { return nil }
        var type = kind.ticketType ?? ticketType
        var custom = kind.ticketTypeCustom
        if kind == .tarea {
            guard let tipo = tareaTipo else { return nil }
            custom = tipo.label
            type = "OTRO"
        } else if kind.ticketType == nil && ticketType == "OTRO" {
            let text = coreClean(ticketTypeCustom)
            custom = text.isEmpty ? nil : text
        }
        let notes = coreClean(indicaciones)
        return CoreTiempoCalculadoBody(
            titulo: title,
            indicaciones: notes.isEmpty ? nil : notes,
            coreKind: kind.rawValue,
            ticketType: type == "INVENTARIO" ? "PREVENTIVO" : type,
            ticketTypeCustom: type == "OTRO" ? custom : nil,
            fechaInicio: scheduled ? CoreFormat.isoString(fecha) : nil
        )
    }
    private var tiemposKey: String { complejidadVisible ? "\(kind.rawValue)|\(tipoComplejidad ?? "")" : "" }
    private var preguntaSugerencia: String {
        guard complejidadVisible else { return "" }
        return "\(kind.rawValue)|\(tipoComplejidad ?? "")|\(coreClean(titulo))|\(coreClean(indicaciones))"
    }
    private var estimadoTotal: Int { estimadoHoras * 60 + estimadoMinutos }

    // Tiempo estándar: solo al asignar a otro y con la complejidad a la vista (en tarea, con su tipo).
    private var reglaEstandar: CoreTiempoEstandar.Regla? {
        guard complejidadVisible else { return nil }
        let clave = CoreTiempoEstandar.clave(
            coreKind: kind.rawValue,
            ticketType: kind.ticketType ?? ticketType,
            tipoTarea: tareaTipo?.label
        )
        return CoreTiempoEstandar.reglaPara(tablaEstandar, clave: clave)
    }
    private var unidadEstandarActual: CoreTiempoEstandar.Unidad? {
        CoreTiempoEstandar.unidad(reglaEstandar, clave: unidadEstandar)
    }
    private var cantidadEstandarN: Int { Int(cantidadEstandar) ?? 0 }
    private var resultadoEstandar: CoreTiempoEstandar.Resultado? {
        guard let regla = reglaEstandar else { return nil }
        // Sin mapa en el teléfono no hay traslado: si el tipo va a otro lugar, la API completa el estándar.
        return CoreTiempoEstandar.calcular(
            regla,
            cantidad: cantidadEstandarN,
            unidad: unidadEstandarActual?.clave,
            complejidad: complejidad,
            traslado: nil,
            tope: tablaEstandar?.topeMin ?? CoreTiempoEstandar.topeMin
        )
    }
    private var envioEstandar: CoreTiempoEstandar.Envio? {
        CoreTiempoEstandar.envio(
            regla: reglaEstandar,
            resultado: resultadoEstandar,
            cantidad: cantidadEstandarN,
            unidad: unidadEstandarActual,
            cambiando: cambiandoEstandar,
            motivo: motivoEstandar
        )
    }
    /// Lo fija el estándar mientras nadie lo cambie con motivo; nil = la rueda es libre.
    private var estandarFijo: Int? { CoreTiempoEstandar.minutosFijos(envioEstandar) }

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
                if complejidadVisible {
                    estandarSection
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

            // La agenda y, en la autoasignación, lo que el sistema fija con ella (en un `Group`: el
            // bloque de arriba ya junta diez piezas, el tope de `ViewBuilder` antes de iOS 17).
            Group {
                Section {
                    if !kind.requiresSchedule {
                        Toggle("Poner día y hora", isOn: $withSchedule)
                    }
                    if scheduled {
                        DatePicker("Día", selection: $fecha, displayedComponents: .date)
                        DatePicker("Hora", selection: $fecha, displayedComponents: .hourAndMinute)
                    }
                    // Autoasignación: la entrega y los tiempos los fija el sistema (tarjeta de abajo).
                    if scheduled && !autoasignacion {
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
                    if !autoasignacion {
                        if let fijo = estandarFijo {
                            // Lo da el tiempo estándar: para otro tiempo, «Cambiar el tiempo» pide el motivo.
                            VStack(alignment: .leading, spacing: 4) {
                                Text("¿Cuánto tiempo toma?")
                                    .font(.subheadline.weight(.semibold))
                                Text(CoreComplejidad.formatoMinutos(fijo))
                                    .font(.title3.weight(.bold))
                                Text("Lo da el tiempo estándar. Para poner otro, usa «Cambiar el tiempo» arriba (pide motivo).")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .accessibilityElement(children: .combine)
                        } else {
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
                    }
                } header: {
                    Text(kind.requiresSchedule ? "Agenda * (hora de México)" : "Agenda (hora de México)")
                }
                .environment(\.timeZone, CoreSchedule.mexico)

                if autoasignacion {
                    CoreTiempoCalculadoSection(pedido: pedidoTiempo, inicio: scheduled ? fecha : nil)
                }
            }

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
        .task(id: responsableId) { await aplicarHoraEntrada() }
    }

    /// La hora de inicio por omisión es la entrada de quien ejecuta (oficina 10:00, cuadrilla
    /// 08:00), como la web; si quien asigna ya movió la hora, no se toca.
    @MainActor
    private func aplicarHoraEntrada() async {
        let entrada = CoreActivityRules.horaDeEntrada(await CoreRepository.shared.horaEntrada(userId: responsableId))
        guard CoreSchedule.hhmm(fecha) == horaAutomatica, entrada != horaAutomatica,
              let nueva = CoreSchedule.at(day: fecha, hhmm: entrada) else { return }
        fecha = nueva
        horaAutomatica = entrada
        if !conCompromiso { compromiso = CoreSchedule.compromisoPorOmision(inicio: nueva) }
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
                    if estandarFijo != nil {
                        // El tiempo estándar ya fija el tiempo: lo típico queda solo como referencia.
                        Text("Referencia: el tiempo lo da el estándar.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else if minutos != estimadoTotal {
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

    // MARK: Tiempo estándar

    /// «Tiempo estándar» al asignar a otro (`TiempoEstandarCampo` de la web y de Android): lo que se
    /// cuenta en ese tipo de trabajo, con la cantidad que propone la IA, y el total con su desglose.
    /// El total fija «¿Cuánto tiempo toma?»; cambiarlo pide motivo y queda registrado. Sin mapa en
    /// el teléfono: si el tipo va a otro lugar, la API completa el estándar con la ida y la vuelta.
    /// Sin tabla o sin regla para el tipo no se pinta y el tiempo se captura como antes.
    @ViewBuilder
    private var estandarSection: some View {
        if let regla = reglaEstandar {
            Section {
                if regla.agenda {
                    Text("\(regla.nombre): dura lo que dure la agenda, así que no hay tiempo estándar. Pon su duración en «¿Cuánto tiempo toma?».")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    estandarEntradas(regla)
                    estandarTarjeta(regla)
                }
            } header: {
                Text("Tiempo estándar · \(regla.nombre)")
            }
            .onChange(of: estandarFijo) { _, nuevo in fijarEstimado(nuevo) }
        }
    }

    @ViewBuilder
    private func estandarEntradas(_ regla: CoreTiempoEstandar.Regla) -> some View {
        let unidad = unidadEstandarActual
        let n = cantidadEstandarN
        if cantidadDeIA, n > 0, let unidad {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "sparkles")
                    .foregroundStyle(Color.accentColor)
                    .accessibilityHidden(true)
                (Text("La IA leyó el título:").bold()
                    + Text(" \(n) \(n == 1 ? unidad.singular : unidad.plural). Confírmalo o corrige la cantidad; el tiempo lo calcula la tabla, no la IA."))
                    .font(.footnote)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
        }
        if regla.unidades.count > 1 {
            Picker("Qué se cuenta", selection: unidadEstandarSeleccion) {
                ForEach(regla.unidades, id: \.clave) { u in
                    Text(String(u.plural.prefix(1)).uppercased() + String(u.plural.dropFirst())).tag(u.clave)
                }
            }
            .pickerStyle(.menu)
        }
        if let unidad {
            VStack(alignment: .leading, spacing: 6) {
                Text(unidad.pregunta)
                    .font(.subheadline.weight(.semibold))
                HStack(spacing: 12) {
                    TextField("0", text: cantidadEstandarTexto)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 96)
                    Stepper("Cantidad", value: cantidadEstandarPaso, in: 0...9999)
                        .labelsHidden()
                }
                Text("\(unidad.porUnidadMin) min por \(unidad.singular)\(regla.baseMin > 0 ? " + \(regla.baseMin) min de base" : "").")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 2)
        }
        if let texto = CoreTiempoEstandar.textoPorComplejidad(regla) {
            Text(texto)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        if regla.destino {
            let destinoIA = (sugerencia?.destino ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let leido: String = destinoIA.isEmpty ? "" : "La IA leyó el destino: «\(destinoIA)». "
            let nota: String = leido + "En el teléfono no se marca en el mapa: al guardar, el sistema completa el estándar con la ida y la vuelta."
            Text(nota)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private func estandarTarjeta(_ regla: CoreTiempoEstandar.Regla) -> some View {
        let resultado = resultadoEstandar
        let total = resultado?.totalMin
        VStack(alignment: .leading, spacing: 6) {
            Text("Tiempo estándar")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.accentColor)
            Text(total.map { CoreComplejidad.formatoMinutos($0) } ?? "—")
                .font(.title2.weight(.bold))
            ForEach(Array((resultado?.desglose ?? []).enumerated()), id: \.offset) { _, renglon in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(renglon.concepto)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    Text(CoreComplejidad.formatoMinutos(renglon.minutos)).monospacedDigit()
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            if let faltan = CoreTiempoEstandar.textoFaltan(resultado?.faltan ?? [], regla: regla) {
                Text(faltan)
                    .font(.footnote)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if resultado?.topado == true {
                Text("Pasa de 12 h: queda en el tope de 12 h.")
                    .font(.footnote)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        if let total {
            if cambiandoEstandar {
                let valido = CoreTiempoEstandar.motivoValido(motivoEstandar)
                VStack(alignment: .leading, spacing: 6) {
                    TextField("¿Por qué otro tiempo? Ej.: hay que abrir muro", text: $motivoEstandar, axis: .vertical)
                        .lineLimit(2...4)
                    Text(valido
                         ? "Ahora el tiempo lo pones tú en «¿Cuánto tiempo toma?»; el estándar queda guardado con este motivo."
                         : "Escribe el motivo (mínimo \(CoreTiempoEstandar.motivoMinimo) letras) y luego ajusta «¿Cuánto tiempo toma?».")
                        .font(.caption)
                        .foregroundStyle(!motivoEstandar.isEmpty && !valido ? CorePalette.red : Color.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button("Usar el estándar") {
                    cambiandoEstandar = false
                    motivoEstandar = ""
                    fijarEstimado(total)
                }
                .buttonStyle(.borderless)
                .font(.footnote.weight(.semibold))
            } else {
                Button("Cambiar el tiempo (pide motivo)") {
                    // Las ruedas arrancan en el estándar para ajustarlo desde ahí.
                    fijarEstimado(total)
                    cambiandoEstandar = true
                }
                .buttonStyle(.borderless)
                .font(.footnote.weight(.semibold))
            }
        }
    }

    /// La unidad que se ve elegida (la primera si nadie eligió).
    private var unidadEstandarSeleccion: Binding<String> {
        Binding(
            get: { unidadEstandarActual?.clave ?? "" },
            set: { unidadEstandar = $0 }
        )
    }

    /// Escribir la cantidad: solo dígitos (hasta 4) y desde ahí ya no la cambia la IA.
    private var cantidadEstandarTexto: Binding<String> {
        Binding(
            get: { cantidadEstandar },
            set: { nuevo in
                cantidadAMano = true
                cantidadDeIA = false
                cantidadEstandar = String(nuevo.filter { $0.isASCII && $0.isNumber }.prefix(4))
            }
        )
    }

    private var cantidadEstandarPaso: Binding<Int> {
        Binding(
            get: { cantidadEstandarN },
            set: { nuevo in
                cantidadAMano = true
                cantidadDeIA = false
                cantidadEstandar = nuevo > 0 ? String(min(9999, nuevo)) : ""
            }
        )
    }

    /// Las ruedas de «¿Cuánto tiempo toma?» en los minutos del estándar (múltiplos de 5).
    private func fijarEstimado(_ minutos: Int?) {
        guard let minutos, minutos > 0 else { return }
        let tope = min(CoreComplejidad.topeEstimadoMin, minutos)
        estimadoHoras = tope / 60
        estimadoMinutos = (tope % 60) / 5 * 5
    }

    /// La IA leyó una cantidad del título: se pone mientras nadie la haya escrito a mano.
    private func aplicarCantidadIA() {
        guard let n = sugerencia?.cantidad, n > 0, !cantidadAMano,
              let regla = reglaEstandar, !regla.unidades.isEmpty else { return }
        cantidadEstandar = String(n)
        cantidadDeIA = true
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
            // La cantidad que leyó la IA va al tiempo estándar (si nadie la escribió a mano).
            aplicarCantidadIA()
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
        // Tabla del tiempo estándar (solo al asignar a otro). Si falla, el tiempo se captura a mano.
        if !autoasignacion && tablaEstandar == nil {
            tablaEstandar = try? await CoreRepository.shared.tablaEstandar()
            aplicarCantidadIA()
        }
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

        if !autoasignacion && !compromisoOk {
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
        // Autoasignación: sin tiempo, tope, complejidad ni entrega (sí el inicio); la API los calcula
        // del título y el tipo. Sin compromiso, la fecha máxima es la de inicio y la API la lee como
        // «fin del día».
        let propia = autoasignacion
        let limite: String? = scheduled && !propia
            ? CoreFormat.isoString(
                CoreSchedule.at(
                    day: fecha,
                    hhmm: CoreActivityRules.horaLimite(hora: horaInicio, compromiso: horaCompromiso)
                ) ?? fecha
            )
            : nil
        let notes = coreClean(indicaciones)
        // Tiempo estándar al asignar a otro: cada campo solo si se calculó. Sin motivo, el estimado
        // es el estándar (la API responde 400 si difieren sin decir por qué).
        let estandar = complejidadVisible ? envioEstandar : nil
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
                guard !propia else { return nil }
                return CoreTiempoEstandar.estimadoAMandar(capturado: total > 0 ? total : nil, envio: estandar)
            }(),
            tiempoMaximoMin: {
                let total = maximoHoras * 60 + maximoMinutos
                return !propia && total > 0 ? total : nil
            }(),
            fechaInicio: when,
            fechaEntregaEsperada: limite,
            fechaMaxima: limite,
            evidencePhotoRequired: min(8, max(2, fotos)),
            coreKind: kind.rawValue,
            assignmentCharge: charge?.rawValue,
            // Solo si se ve el campo: una tarea sin tipo no lleva complejidad, y la autoasignación
            // tampoco (`complejidadVisible` ya es falso en ella).
            complejidad: complejidadVisible ? complejidad?.rawValue : nil,
            complejidadSugerida: complejidadVisible ? complejidadSugerida?.rawValue : nil,
            estatus: "Pendiente",
            creadoPorId: me,
            unidades: estandar?.unidades,
            tiempoEstandarMin: estandar?.tiempoEstandarMin,
            estandarDesglose: estandar?.desglose,
            estandarCambiadoMotivo: estandar?.motivo
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

/// «Tiempo y entrega · los fija el sistema» del alta propia (`TiempoCalculadoCard` de Android):
/// tiempo estándar con su complejidad, la entrega a más tardar, el desglose y los supuestos, en
/// solo lectura. Pide la vista previa ~0.9 s después del último cambio (`.task(id:)` cancela la
/// anterior); sin respuesta, dice que se calculan al guardar. Todo va en una sola fila para que
/// la tarea no se repita por cada renglón de la sección.
struct CoreTiempoCalculadoSection: View {
    /// nil mientras falte el título o, en tarea, el tipo.
    let pedido: CoreTiempoCalculadoBody?
    /// Inicio elegido (para decir si la entrega cae otro día); nil sin agenda.
    let inicio: Date?

    @State private var dato: CoreTiempoCalculado?
    @State private var calculadoPara: CoreTiempoCalculadoBody?
    @State private var pensando = false

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                if pedido == nil {
                    Text("Escribe el título y elige el tipo: con eso se calculan el tiempo, la complejidad y la entrega.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                } else if let dato {
                    if let resumen = dato.resumen {
                        Text(resumen)
                            .font(.subheadline.weight(.semibold))
                    }
                    if let entrega = dato.entrega(inicio: inicio) {
                        Text(entrega)
                            .font(.footnote)
                    }
                    ForEach(Array(dato.lineas.enumerated()), id: \.offset) { _, linea in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(linea.texto)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                            if let minutos = linea.minutos {
                                Text(minutos).monospacedDigit()
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                    ForEach(Array(dato.supuestosTexto.enumerated()), id: \.offset) { _, supuesto in
                        Text(supuesto)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Text("Solo tu jefe puede ajustarlo al asignarte una actividad.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .padding(.top, 2)
                } else {
                    Text(pensando ? "Calculando con el título…" : "Se calculan al guardar con el título y el tipo.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 4)
            .accessibilityElement(children: .combine)
            .task(id: pedido) { await calcular() }
        } header: {
            Text("Tiempo y entrega · los fija el sistema")
        }
    }

    /// Si la API falla o no hay red (esta ruta nunca se encola), ningún error visible: la
    /// tarjeta dice que se calculan al guardar.
    @MainActor
    private func calcular() async {
        guard let pedido else {
            dato = nil
            calculadoPara = nil
            pensando = false
            return
        }
        // La fila volvió a aparecer al desplazarse: ya está calculado para esta pregunta.
        if pedido == calculadoPara, dato != nil { return }
        try? await Task.sleep(nanoseconds: 900_000_000)
        guard !Task.isCancelled else { return }
        pensando = true
        // `try?` aplana el opcional: nil = falló o la respuesta no sirvió.
        let resultado = try? await CoreRepository.shared.tiempoCalculado(pedido)
        pensando = false
        guard !Task.isCancelled else { return }
        dato = resultado
        calculadoPara = resultado == nil ? nil : pedido
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
