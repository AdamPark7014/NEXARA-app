import SwiftUI

enum CoreDetailTab: String, CaseIterable, Identifiable {
    case detalle, evidencias, historial

    var id: String { rawValue }

    var title: String {
        switch self {
        case .detalle: return "Detalle"
        case .evidencias: return "Evidencias"
        case .historial: return "Historial"
        }
    }

    /// Acepta las claves viejas del detalle OPS (`info`, `operacion`, …) como Detalle.
    static func from(_ key: String?) -> CoreDetailTab {
        switch (key ?? "").lowercased() {
        case "evidencias", "evidences": return .evidencias
        case "historial", "history": return .historial
        default: return .detalle
        }
    }
}

/// Detalle de actividad en Core (espejo de `/erp/actividades/:id`):
/// Detalle · Evidencias (captura del ejecutor + evidencias del equipo) · Historial.
struct ActivityCoreDetailView: View {
    let activityId: Int
    var initialTab: String? = nil

    @ObservedObject private var session = SessionStore.shared
    @State private var tab: CoreDetailTab = .detalle
    @State private var didApplyInitialTab = false
    @State private var raw: [String: Any] = [:]
    @State private var loading = true
    @State private var error: String?
    @State private var events: [ActivityTimelineEvent] = []
    @State private var eventsLoaded = false
    @State private var eventsError: String?
    @State private var teamRefresh = 0
    @State private var despacho: DespachoTarget?
    @State private var reprogramar: ReprogramarTarget?
    @State private var notice: String?
    /// Cancelar / pasar a otro compañero (solo superiores de quien la ejecuta).
    @State private var acciones: ActivitySuperiorActions?
    @State private var cancelar: ActivitySuperiorTarget?
    @State private var pasar: ActivitySuperiorTarget?
    /// Flujo de evidencia propio (v2): alimenta la lista de pasos y el dock. `nil` = sin empezar.
    @State private var flow: EvidenceFlowState?
    /// Dock inferior (v2): «Iniciar», «Reanudar» y «Pausar» con su motivo.
    @State private var iniciando = false
    @State private var reanudando = false
    @State private var dockError: String?
    @State private var pidiendoPausa = false
    @State private var motivoPausa = ""

    // MARK: Datos derivados

    private var myId: Int? { session.currentUser.flatMap { Int($0.id) } }
    /// En demo la persona sí captura evidencia de SUS actividades (con foto de muestra).
    private var isCeo: Bool { !DemoMode.isActive && CoreOrg.isCeo(session.currentUser?.email) }

    private func text(_ key: String) -> String {
        ActivityParse.str(raw[key])
    }

    private var titulo: String { text("titulo") }
    private var coreKind: String? {
        let kind = text("coreKind")
        return kind.isEmpty ? nil : kind
    }
    private var photoRequired: Int? { ActivityParse.int(raw["evidencePhotoRequired"]) }
    private var isDespacho: Bool { text("assignmentCharge").lowercased() == "despacho" }
    private var isClosed: Bool {
        let s = text("estatus").lowercased()
        return s.contains("finaliz") || s.contains("complet") || s.contains("cancel") || s.contains("aprobada")
    }
    private var responsableId: Int? {
        ActivityParse.int(raw["responsableId"]) ?? ActivityParse.int((raw["responsable"] as? [String: Any])?["id"])
    }
    private var assignees: [[String: Any]] { raw["assignees"] as? [[String: Any]] ?? [] }

    private func userId(of row: [String: Any]) -> Int? {
        ActivityParse.int(row["userId"]) ?? ActivityParse.int((row["user"] as? [String: Any])?["id"])
    }

    private func isActive(_ row: [String: Any]) -> Bool {
        let retired = row["retiradoAt"]
        return retired == nil || retired is NSNull
    }

    private var myAssigneeRow: [String: Any]? {
        guard let myId else { return nil }
        return assignees.first { userId(of: $0) == myId && isActive($0) }
    }

    private var isResponsable: Bool { myId != nil && responsableId == myId }

    /// En despacho el LEAD (o el responsable sin fila de equipo) solo reparte.
    private var splits: Bool {
        guard isDespacho else { return false }
        if let row = myAssigneeRow {
            return ActivityParse.str(row["rol"]).uppercased() == "LEAD"
        }
        return isResponsable
    }

    /// Solo quien la ejecuta captura (miembro del equipo o responsable). El CEO nunca.
    private var canCapture: Bool {
        !isCeo && !splits && (myAssigneeRow != nil || isResponsable)
    }

    /// Ya la pasó a alguien (hay miembros que él asignó).
    private var alreadyPassed: Bool {
        guard let myId else { return false }
        return assignees.contains { row in
            ActivityParse.int(row["asignadoPorId"]) == myId && userId(of: row) != myId
        }
    }

    /// «Cancelada por X · motivo» (`cancelReason` y `cancelledBy.nombre`).
    private var cancelNotice: String? {
        ActivityCancelNotice.text(
            motivo: text("cancelReason"),
            canceladaPor: ActivityParse.str((raw["cancelledBy"] as? [String: Any])?["nombre"])
        )
    }

    // MARK: Rediseño v2: cabecera, sitio, pasos y dock

    private var folio: String { text("anNumber") }

    /// Mi reloj en esta actividad (solo con fila propia; el CEO no ejecuta).
    private var sesionPropia: SesionActividad? {
        guard !isCeo, let mine = myAssigneeRow else { return nil }
        return SesionActividad(fila: mine)
    }

    private var fotosRequeridas: Int { max(1, photoRequired ?? 4) }

    /// Regla del 18-09: quien la recibe no la acepta ni la rechaza, únicamente la inicia.
    /// Aquí cae el push de «actividad nueva», así que el botón también vive en el detalle.
    private var puedeIniciar: Bool {
        guard !isCeo, let mine = myAssigneeRow else { return false }
        return ActivityDockRules.puedeIniciar(
            aceptacion: ActivityParse.str(mine["aceptacion"]),
            inicioRealAt: ActivityParse.str(mine["inicioRealAt"]),
            despachador: splits,
            estatus: text("estatus")
        )
    }

    private var dock: ActivityDockRules.Dock? {
        guard !raw.isEmpty else { return nil }
        return ActivityDockRules.principal(
            puedeIniciar: puedeIniciar,
            sesion: sesionPropia,
            despachador: splits,
            estatus: text("estatus"),
            captura: canCapture,
            flow: flow,
            coreKind: coreKind,
            fotosRequeridas: fotosRequeridas
        )
    }

    private var lugarTitulo: String {
        ActivityParse.nestedName(raw["client"], raw["clienteNombre"], raw["branchName"])
    }

    private var lugarDetalle: String {
        let titulo = lugarTitulo
        let partes = [text("branchName"), text("branchCity"), text("branchState")]
            .filter { !$0.isEmpty && $0 != titulo }
        return partes.isEmpty ? text("branchAddress") : partes.joined(separator: " · ")
    }

    private var lugarMapa: URL? {
        ActivityParse.mapsUrl(
            lat: ActivityParse.double(raw["branchLatitude"]),
            lng: ActivityParse.double(raw["branchLongitude"])
        )
    }

    private func superiorTarget(_ acciones: ActivitySuperiorActions) -> ActivitySuperiorTarget {
        var enActividad = Set(assignees.filter { isActive($0) }.compactMap { userId(of: $0) })
        if let responsableId { enActividad.insert(responsableId) }
        let folio = text("anNumber")
        let nombre = titulo.isEmpty ? "Actividad" : titulo
        return ActivitySuperiorTarget(
            id: activityId,
            title: folio.isEmpty ? nombre : "\(folio) · \(nombre)",
            acciones: acciones,
            excluded: enActividad
        )
    }

    // MARK: Vista

    var body: some View {
        VStack(spacing: 0) {
            // Cabecera v2: tipo, estado y título grande arriba de las pestañas.
            if !raw.isEmpty {
                ActivityHeaderV2(
                    titulo: titulo,
                    folio: folio,
                    coreKind: coreKind,
                    ticketTypeCustom: text("ticketTypeCustom"),
                    estatus: text("estatus"),
                    prioridad: text("prioridad"),
                    sesion: sesionPropia,
                    isDespacho: isDespacho
                )
                .padding(.horizontal)
                .padding(.top, 8)
            }
            Picker("Sección", selection: $tab) {
                ForEach(CoreDetailTab.allCases) { item in
                    Text(item.title).tag(item)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.vertical, 8)

            Group {
                if loading && raw.isEmpty {
                    NxLoadingState(text: "Cargando actividad…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error, raw.isEmpty {
                    NxErrorState(message: error) { Task { await load() } }
                } else {
                    switch tab {
                    case .detalle:
                        detalleTab
                    case .evidencias:
                        evidenciasTab
                    case .historial:
                        historialTab
                    }
                }
            }
            .frame(maxHeight: .infinity)
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        // Dock inferior fijo (v2): la acción principal al alcance del pulgar.
        .safeAreaInset(edge: .bottom, spacing: 0) { dockView }
        .navigationTitle(folio.isEmpty ? (titulo.isEmpty ? "Actividad" : titulo) : folio)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            guard !didApplyInitialTab else { return }
            didApplyInitialTab = true
            tab = CoreDetailTab.from(initialTab)
        }
        .task { await load() }
        // Pasos y dock: el flujo propio se relee al cambiar de pestaña o al capturar algo.
        .task(id: "\(tab.rawValue)-\(teamRefresh)-\(canCapture)") {
            guard canCapture else { return }
            if let next = try? await CoreRepository.shared.evidenceFlow(activityId: activityId) {
                flow = next
            }
        }
        .alert(SesionActividad.tituloPausaPropia, isPresented: $pidiendoPausa) {
            TextField("Motivo (opcional)", text: $motivoPausa)
            Button("Cancelar", role: .cancel) {}
            Button("Pausar") { Task { await pausar() } }
        } message: {
            Text(SesionActividad.textoPausaPropia)
        }
        .task(id: tab) {
            if tab == .historial && !eventsLoaded {
                await loadTimeline()
            }
        }
        .sheet(item: $despacho) { target in
            DespachoSheet(target: target) { message in
                notice = message
                teamRefresh += 1
                Task { await load() }
            }
        }
        .sheet(item: $reprogramar) { target in
            ReprogramarSheet(target: target) { message in
                notice = message
                Task { await load() }
            }
        }
        .sheet(item: $cancelar) { target in
            ActivityCancelSheet(target: target) { message in
                afterSuperiorAction(message)
            }
        }
        .sheet(item: $pasar) { target in
            ActivityReassignSheet(target: target) { message in
                afterSuperiorAction(message)
            }
        }
    }

    /// Tras cancelar o pasarla: aviso, detalle, evidencias e historial al día.
    private func afterSuperiorAction(_ message: String) {
        notice = message
        teamRefresh += 1
        eventsLoaded = false
        Task {
            await load()
            if tab == .historial { await loadTimeline() }
        }
    }

    // MARK: Detalle

    @ViewBuilder
    private func infoRow(_ label: String, _ value: String?) -> some View {
        if let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            LabeledContent(label) {
                Text(value).multilineTextAlignment(.trailing)
            }
        }
    }

    private var detalleTab: some View {
        List {
            if let notice {
                Section {
                    NxIconText(systemName: "checkmark.circle.fill", text: notice).foregroundStyle(CorePalette.green)
                }
            }

            // Tipo, estado, folio y despacho van en la cabecera v2 (arriba de las pestañas);
            // la prioridad sigue aquí, con su bandera.
            Section {
                CoreFlowLayout {
                    let priority = CoreStatusUI.priority(text("prioridad"))
                    CoreChip(icon: "flag.fill", text: priority.label, color: priority.color)
                    if let por = ActivityParse.nestedName(raw["asignadoPor"]).nilIfEmpty {
                        CoreChip(icon: "person", text: "De \(CoreFormat.shortName(por))")
                    }
                }
                .padding(.vertical, 2)
            }

            if let cancelNotice {
                Section {
                    NxIconText(systemName: "xmark.circle.fill", text: cancelNotice, tint: CorePalette.red)
                        .font(.subheadline.weight(.semibold))
                }
            }

            if !lugarTitulo.isEmpty {
                Section {
                    ActivityPlaceCardV2(titulo: lugarTitulo, detalle: lugarDetalle, mapsURL: lugarMapa)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
            }

            // «Iniciar actividad» vive en el dock; aquí solo se explica (regla del 18-09).
            if puedeIniciar {
                Section {
                    NxIconText(
                        systemName: "hand.raised",
                        text: "Te asignaron esta actividad. Iníciala cuando empieces: queda registrada tu hora real de inicio. Si no puedes hacerla, habla con tu jefe para que la reasigne.",
                        tint: NxTone.info.fg
                    )
                    .font(.footnote)
                }
            }

            // Tu reloj: «Reanudar» y «Pausar» están en el dock; aquí queda el porqué de la pausa.
            if let sesion = sesionPropia, let texto = sesion.textoPausa(miId: myId, propia: true) {
                Section {
                    NxIconText(systemName: "pause.circle.fill", text: texto, tint: CorePalette.orange)
                        .font(.footnote)
                } header: {
                    Text("Tu reloj")
                } footer: {
                    Text(SesionActividad.ayudaReanudar)
                }
            }

            if canCapture {
                Section {
                    ActivityStepsCardV2(
                        pasos: ActivityDockRules.pasos(flow: flow, coreKind: coreKind, fotosRequeridas: fotosRequeridas)
                    ) {
                        tab = .evidencias
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            }

            if let acciones, acciones.hayAlgo, !isClosed {
                Section {
                    if acciones.puedePasar {
                        Button {
                            pasar = superiorTarget(acciones)
                        } label: {
                            Label("Pasar a otro compañero", systemImage: "arrow.left.arrow.right")
                        }
                    }
                    if acciones.puedeCancelar {
                        Button(role: .destructive) {
                            cancelar = superiorTarget(acciones)
                        } label: {
                            Label("Cancelar actividad", systemImage: "xmark.circle")
                        }
                    }
                } header: {
                    Text("Como superior")
                } footer: {
                    Text("Las dos piden motivo y quedan en el historial.")
                }
            }

            if splits && !isClosed {
                Section {
                    Text("Tu parte es pasarla a quien la ejecuta.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    if !alreadyPassed {
                        Button("Despachar al equipo") {
                            despacho = DespachoTarget(
                                id: activityId,
                                title: "\(text("anNumber")) · \(titulo)",
                                indicaciones: myAssigneeRow.map { ActivityParse.str($0["indicaciones"]) }
                            )
                        }
                    }
                    Button("Cambiar fecha y hora") {
                        reprogramar = ReprogramarTarget(
                            id: activityId,
                            title: titulo,
                            fechaActual: text("fechaInicio").isEmpty ? nil : text("fechaInicio")
                        )
                    }
                } header: {
                    Text("Tú repartes esta actividad")
                }
            }

            Section("Información") {
                infoRow("Descripción", text("descripcion"))
                infoRow("Indicaciones", text("indicaciones"))
                if let mine = myAssigneeRow {
                    infoRow("Tus indicaciones", ActivityParse.str(mine["indicaciones"]))
                }
                infoRow("Responsable", ActivityParse.nestedName(raw["responsable"]))
                infoRow("Creada por", ActivityParse.nestedName(raw["creador"]))
                infoRow("Cliente", ActivityParse.nestedName(raw["client"], raw["clienteNombre"], raw["branchName"]))
                infoRow("Proyecto", ActivityParse.str((raw["project"] as? [String: Any])?["title"]))
            }

            Section("Fechas y tiempos") {
                infoRow("Programada", CoreFormat.when(text("fechaInicio")))
                // Varios días: la frase del periodo la manda la API («Día 3 de 10 · termina vie 25 sep»).
                infoRow("Periodo", ActivityParse.str((raw["periodo"] as? [String: Any])?["etiqueta"]))
                infoRow("Fecha máxima", CoreFormat.when(text("fechaMaxima")))
                infoRow("Finalizada", CoreFormat.when(text("fechaFinalizacion")))
                infoRow("Tiempo estimado", CoreFormat.minutes(ActivityParse.int(raw["tiempoEstimadoMin"])))
                infoRow("Tiempo máximo", CoreFormat.minutes(ActivityParse.int(raw["tiempoMaximoMin"])))
                if let photoRequired {
                    infoRow("Fotos de evidencia", "\(photoRequired) como mínimo")
                }
            }

            if !assignees.isEmpty {
                Section("Equipo") {
                    ForEach(Array(assignees.enumerated()), id: \.offset) { _, row in
                        let user = row["user"] as? [String: Any] ?? [:]
                        let rol = ActivityParse.str(row["rol"]).uppercased()
                        VStack(alignment: .leading, spacing: 2) {
                            Text(ActivityParse.nestedName(user)).font(.subheadline.weight(.semibold))
                            Text(rol == "LEAD" ? (isDespacho ? "La reparte" : "Encargado") : (rol == "APOYO" ? "Apoyo" : "La ejecuta"))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            // El checklist va antes del trabajo: sin palomearlo, `iniciar` da 400.
            // Sin encabezado propio: la vista se pinta entera o no se pinta (OT sin
            // herramientas, o quien mira no la tiene asignada).
            Section {
                ActivityToolChecklistView(activityId: activityId, refreshToken: teamRefresh)
            }

            Section {
                TeamEvidenceCompactView(activityId: activityId, refreshToken: teamRefresh) {
                    tab = .evidencias
                }
            } header: {
                Text("Evidencias del equipo")
            }
        }
        .listStyle(.insetGrouped)
        .refreshable {
            await load()
            teamRefresh += 1
        }
    }

    // MARK: Evidencias

    private var evidenciasTab: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if splits {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Tú repartes esta actividad").font(.headline)
                        Text("En despacho tu parte es pasarla a quien la ejecuta; no subes evidencias. El registro de a quién se la pasaste está en la pestaña Historial.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    .coreCard()
                }

                if canCapture {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Captura de evidencias").font(.headline)
                        Text(CoreEvidence.isComercial(coreKind)
                             ? "Inicio de actividad, evidencias, cotización y conclusión de actividad. La conclusión lleva tu ubicación; no tiene que registrarse donde iniciaste."
                             : "Foto de entrada, evidencias en sitio, hoja de servicio y foto de salida. La foto de salida lleva tu ubicación; en servicio, proyecto, obra y tarea tiene que tomarse donde iniciaste.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        EvidenceCaptureFlowView(
                            activityId: activityId,
                            fallbackCoreKind: coreKind,
                            fallbackPhotoRequired: photoRequired,
                            embedded: true,
                            onChanged: { teamRefresh += 1 }
                        )
                    }
                }

                TeamEvidenceView(activityId: activityId, refreshToken: teamRefresh)
            }
            .padding()
        }
        .refreshable { teamRefresh += 1 }
    }

    // MARK: Historial

    private var historialTab: some View {
        List {
            if !eventsLoaded {
                ProgressView("Cargando historial…")
            } else if let eventsError {
                Text(eventsError).foregroundStyle(CorePalette.red)
                Button("Reintentar") { Task { await loadTimeline() } }
            } else if events.isEmpty {
                Text("Aún no hay movimientos registrados en esta actividad.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(events) { event in
                    VStack(alignment: .leading, spacing: 3) {
                        Text("\(event.icon ?? "•") \(event.title ?? "Evento")")
                            .font(.subheadline.weight(.semibold))
                        if let subtitle = event.subtitle, !subtitle.isEmpty {
                            Text(subtitle).font(.caption).foregroundStyle(.secondary)
                        }
                        if let when = CoreFormat.when(event.at) {
                            Text(when).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await loadTimeline() }
    }

    // MARK: Dock (v2)

    /// En Evidencias la captura trae sus propios botones: ahí el dock solo sale
    /// para «Iniciar» o «Reanudar», sin los que el reloj no corre.
    @ViewBuilder
    private var dockView: some View {
        if let dock, tab != .evidencias || dock.kind == .iniciar || dock.kind == .reanudar {
            ActivityDockBar(
                label: dock.label,
                systemImage: dock.systemImage,
                loading: iniciando || reanudando,
                hint: dock.hint,
                error: dockError,
                secondary: dock.pausable
                    ? [ActivityDockSecondary(label: "Pausar", systemImage: "pause") { pedirPausa() }]
                    : [],
                onPrimary: { primaria(dock) }
            )
        }
    }

    private func primaria(_ dock: ActivityDockRules.Dock) {
        switch dock.kind {
        case .iniciar: Task { await iniciar() }
        case .reanudar: Task { await reanudar() }
        case .evidencias, .ver: tab = .evidencias
        case .pausar: pedirPausa()
        }
    }

    private func pedirPausa() {
        dockError = nil
        motivoPausa = ""
        pidiendoPausa = true
    }

    /// Guarda la hora real de inicio; lo siguiente es la foto de entrada.
    @MainActor
    private func iniciar() async {
        iniciando = true
        dockError = nil
        defer { iniciando = false }
        do {
            try await CoreRepository.shared.iniciarActividad(activityId: activityId)
            notice = "Actividad iniciada. Sigue con la foto de entrada."
            teamRefresh += 1
            await load()
            tab = .evidencias
        } catch {
            dockError = error.toUserMessage(fallback: "No se pudo iniciar la actividad")
        }
    }

    @MainActor
    private func reanudar() async {
        reanudando = true
        dockError = nil
        defer { reanudando = false }
        do {
            try await CoreRepository.shared.reanudarActividad(activityId: activityId)
            notice = "Tu reloj volvió a correr"
            teamRefresh += 1
            await load()
        } catch {
            dockError = error.toUserMessage(fallback: "No se pudo reanudar la actividad")
        }
    }

    @MainActor
    private func pausar() async {
        if let invalido = SesionActividad.errorMotivoPropio(motivoPausa) {
            dockError = invalido
            return
        }
        dockError = nil
        do {
            try await CoreRepository.shared.pausarActividad(activityId: activityId, motivo: motivoPausa)
            notice = "Actividad en pausa"
            teamRefresh += 1
            await load()
        } catch {
            dockError = error.toUserMessage(fallback: "No se pudo pausar la actividad")
        }
    }

    // MARK: Carga

    @MainActor
    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let map = try await CoreRepository.shared.activityDetail(activityId: activityId)
            if map.isEmpty {
                error = "Actividad no encontrada"
            } else {
                raw = map
                error = nil
            }
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo cargar la actividad")
        }
        // Sin respuesta (o sin permiso) no se ofrece nada: el API vuelve a validar al guardar.
        acciones = try? await CoreRepository.shared.superiorActions(activityId: activityId)
    }

    @MainActor
    private func loadTimeline() async {
        do {
            events = try await CoreRepository.shared.timeline(activityId: activityId)
            eventsError = nil
        } catch {
            eventsError = error.toUserMessage(fallback: "No se pudo cargar el historial")
        }
        eventsLoaded = true
    }
}
