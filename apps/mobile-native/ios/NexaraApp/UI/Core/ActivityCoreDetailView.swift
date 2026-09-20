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

    // MARK: Datos derivados

    private var myId: Int? { session.currentUser.flatMap { Int($0.id) } }
    private var isCeo: Bool { CoreOrg.isCeo(session.currentUser?.email) }

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
                    ProgressView("Cargando actividad…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error, raw.isEmpty {
                    ContentUnavailableView {
                        Label("No se pudo cargar", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Reintentar") { Task { await load() } }
                    }
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
        .navigationTitle(titulo.isEmpty ? "Actividad" : titulo)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            guard !didApplyInitialTab else { return }
            didApplyInitialTab = true
            tab = CoreDetailTab.from(initialTab)
        }
        .task { await load() }
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

            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(titulo.isEmpty ? "Actividad" : titulo).font(.headline)
                    let folio = text("anNumber")
                    if !folio.isEmpty {
                        Text("Folio \(folio)").font(.caption).foregroundStyle(.secondary)
                    }
                    CoreFlowLayout {
                        let estatus = CoreStatusUI.estatus(text("estatus"))
                        let priority = CoreStatusUI.priority(text("prioridad"))
                        CoreChip(text: estatus.label, color: estatus.color)
                        CoreChip(icon: "flag.fill", text: priority.label, color: priority.color)
                        CoreChip(icon: CoreStatusUI.kindSymbol(coreKind), text: CoreStatusUI.kind(coreKind, ticketTypeCustom: text("ticketTypeCustom")))
                        if isDespacho {
                            CoreChip(icon: "paperplane", text: "Despacho", color: CorePalette.purple)
                        }
                    }
                }
                .padding(.vertical, 4)
            }

            if let cancelNotice {
                Section {
                    NxIconText(systemName: "xmark.circle.fill", text: cancelNotice, tint: CorePalette.red)
                        .font(.subheadline.weight(.semibold))
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
                        Text("Foto de entrada, evidencias en sitio, hoja de servicio y foto de salida. La salida se registra a \(ActivityGeofence.radioM) m o menos de donde iniciaste.")
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
