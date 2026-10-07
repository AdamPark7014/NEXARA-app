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

/// Detalle de actividad de Core (`/erp/actividades/:id`), espejo de
/// `ActivityDetailScreen.kt` de Android: barra teal «Detalle de actividad», cabecera
/// con tipo/estado/folio, aviso de cancelada, acciones de superior, pestañas
/// subrayadas Detalle · Evidencias · Historial y el dock inferior fijo con la acción
/// grande al alcance del pulgar. Toda la captura vive en `EvidenceCaptureFlowView`;
/// el dock solo lleva ahí o repite su botón.
struct ActivityCoreDetailView: View {
    let activityId: Int
    var initialTab: String? = nil

    @ObservedObject private var session = SessionStore.shared
    @State private var tab: CoreDetailTab = .detalle
    @State private var didApplyInitialTab = false
    @State private var raw: [String: Any] = [:]
    @State private var loading = true
    @State private var error: String?
    /// Sube tras iniciar, reanudar, pausar, cancelar o pasar: se vuelve a pedir el
    /// detalle, las acciones de superior y el flujo (Android `recarga`).
    @State private var recarga = 0
    @State private var teamRefresh = 0
    /// Cancelar / pasar a otro compañero (solo superiores de quien la ejecuta).
    @State private var acciones: ActivitySuperiorActions?
    @State private var cancelar: ActivitySuperiorTarget?
    @State private var pasar: ActivitySuperiorTarget?
    /// Flujo de evidencia propio: alimenta la lista de pasos y el dock. `nil` = sin empezar.
    @State private var flow: EvidenceFlowState?
    @State private var flowTick = 0
    /// Lo que publica el flujo de captura mientras la pestaña Evidencias está en pantalla.
    @State private var dockEvidencias: EvidenceDockAction?
    @State private var iniciando = false
    @State private var reanudando = false
    @State private var dockError: String?
    @State private var pausando = false
    /// Aviso corto abajo (Android snackbar).
    @State private var snack: String?
    // «Editar» (estatus, prioridad, fechas…), igual que `ActivityInfoTab`.
    @State private var editing = false
    @State private var saving = false
    @State private var saveError: String?
    @State private var editEstatus = ""
    @State private var editPrioridad = ""
    @State private var editDescripcion = ""
    @State private var editIndicaciones = ""
    @State private var editFechaInicio: Date?
    @State private var editFechaEntrega: Date?
    @State private var editFechaFin: Date?
    // Historial (se vuelve a pedir cada vez que se abre la pestaña, como Android).
    @State private var events: [ActivityTimelineEvent] = []
    @State private var eventsLoading = false
    @State private var eventsError: String?

    // MARK: Datos derivados

    private var myId: Int? { session.currentUser.flatMap { Int($0.id) } }

    private func text(_ key: String) -> String {
        ActivityParse.str(raw[key])
    }

    private func nested(_ key: String, _ field: String) -> String {
        ActivityParse.str((raw[key] as? [String: Any])?[field])
    }

    private var titulo: String { text("titulo") }
    private var folio: String { text("anNumber") }
    private var estatus: String { text("estatus") }
    private var coreKind: String? {
        let kind = text("coreKind")
        return kind.isEmpty ? nil : kind
    }
    private var fotosRequeridas: Int { ActivityDockRules.fotosRequeridas(ActivityParse.int(raw["evidencePhotoRequired"])) }
    private var isDespacho: Bool { text("assignmentCharge").lowercased() == "despacho" }
    /// Android `detail.responsable?.id ?: detail.responsableId`.
    private var responsableId: Int? {
        ActivityParse.int((raw["responsable"] as? [String: Any])?["id"]) ?? ActivityParse.int(raw["responsableId"])
    }
    private var assignees: [[String: Any]] { raw["assignees"] as? [[String: Any]] ?? [] }

    private func userId(of row: [String: Any]) -> Int? {
        ActivityParse.int((row["user"] as? [String: Any])?["id"]) ?? ActivityParse.int(row["userId"])
    }

    private func isActive(_ row: [String: Any]) -> Bool {
        ActivityParse.str(row["retiradoAt"]).trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// Mi fila activa del equipo (Android `miFila`).
    private var miFila: [String: Any]? {
        guard let myId else { return nil }
        return assignees.first { userId(of: $0) == myId && isActive($0) }
    }

    private var soyResponsable: Bool { myId != nil && responsableId == myId }

    /// El LEAD de un despacho solo reparte (Android `despachador`).
    private var despachador: Bool {
        isDespacho && ActivityParse.str(miFila?["rol"]).uppercased() == "LEAD"
    }

    /// `CoreActivityRules.captureRole`: en despacho el LEAD (o el responsable sin fila)
    /// solo reparte; captura quien es del equipo o el responsable; el CEO nunca.
    private var reparte: Bool {
        guard myId != nil, isDespacho else { return false }
        if ActivityParse.str(miFila?["rol"]).uppercased() == "LEAD" { return true }
        return soyResponsable && miFila == nil
    }

    private var captura: Bool {
        guard myId != nil, !reparte else { return false }
        if !DemoMode.isActive && CoreOrg.isCeo(session.currentUser?.email) { return false }
        return miFila != nil || soyResponsable
    }

    /// Mi reloj en esta actividad (solo con fila propia).
    private var sesion: SesionActividad? {
        guard let mine = miFila else { return nil }
        return SesionActividad(fila: mine)
    }

    /// Regla del 18-09: quien la recibe no la acepta ni la rechaza, únicamente la inicia.
    /// Aquí cae el push de «actividad nueva», así que el botón también vive en el detalle.
    private var puedeIniciar: Bool {
        guard let mine = miFila else { return false }
        return ActivityDockRules.puedeIniciar(
            aceptacion: ActivityParse.str(mine["aceptacion"]),
            inicioRealAt: ActivityParse.str(mine["inicioRealAt"]),
            despachador: despachador,
            estatus: estatus
        )
    }

    private var dockDetalle: ActivityDockRules.Dock? {
        guard !raw.isEmpty else { return nil }
        return ActivityDockRules.principal(
            puedeIniciar: puedeIniciar,
            sesion: sesion,
            despachador: despachador,
            estatus: estatus,
            captura: captura,
            flow: flow,
            coreKind: coreKind,
            fotosRequeridas: fotosRequeridas
        )
    }

    private var pausable: Bool {
        ActivityDockRules.pausable(sesion: sesion, despachador: despachador, estatus: estatus)
    }

    // Permisos de «Editar» (Android: `activities.manage`/`console.admin` o la tengo asignada).
    private var canManage: Bool {
        guard let user = session.currentUser else { return false }
        return user.isSuperAdmin || user.permissions.contains("activities.manage") || user.permissions.contains("console.admin")
    }

    private var canExecute: Bool { soyResponsable && !canManage }
    private var canEdit: Bool { canManage || canExecute }

    /// «Adjuntar archivo» (espejo de `ActivityAttachmentsService.agregar`): su equipo
    /// —responsable, quien la creó, asignados activos— o quien gestiona actividades y
    /// dirección. El API vuelve a validar y contesta 403 con su mensaje.
    private var puedeAdjuntar: Bool {
        guard let user = session.currentUser, let myId else { return false }
        let creadorId = ActivityParse.int((raw["creador"] as? [String: Any])?["id"]) ?? ActivityParse.int(raw["creadoPorId"])
        if soyResponsable || creadorId == myId || miFila != nil { return true }
        if user.isSuperAdmin || user.roleKey == "ceo" || CoreOrg.isCeo(user.email) { return true }
        if CoreOrg.normalized(user.email) == CoreOrg.developerEmail { return true }
        return user.permissions.contains("activities.manage")
    }

    private var cancelAviso: String? {
        ActivityDetailRules.avisoCancelada(
            estatus: estatus,
            cancelledAt: text("cancelledAt"),
            canceladaPor: nested("cancelledBy", "nombre"),
            motivo: text("cancelReason")
        )
    }

    private var lugarTitulo: String {
        let cliente = nested("client", "name").trimmingCharacters(in: .whitespacesAndNewlines)
        if !cliente.isEmpty { return cliente }
        return text("branchName").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var lugarDetalle: String {
        let titulo = lugarTitulo
        let partes = [text("branchName"), text("branchCity"), text("branchState")]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .enumerated()
            .filter { index, value in !value.isEmpty && !(index == 0 && value == titulo) }
            .map(\.element)
        return partes.isEmpty ? text("branchAddress").trimmingCharacters(in: .whitespacesAndNewlines) : partes.joined(separator: " · ")
    }

    private var lugarMapa: URL? {
        ActivityParse.mapsUrl(
            lat: ActivityParse.double(raw["branchLatitude"]),
            lng: ActivityParse.double(raw["branchLongitude"])
        )
    }

    private var facts: [ActivityFact] {
        let plan = ActivityDetailFormat.minutes(ActivityParse.double(raw["minutosPlan"]))
        let real = ActivityDetailFormat.minutes(ActivityParse.double(raw["minutosReales"]))
        let entregaRaw = text("fechaEntregaEsperada").trimmingCharacters(in: .whitespaces)
        let maximaRaw = text("fechaMaxima").trimmingCharacters(in: .whitespaces)
        let entrega: String? = !entregaRaw.isEmpty
            ? ActivityDetailFormat.date(entregaRaw)
            : (!maximaRaw.isEmpty ? ActivityDetailFormat.when(maximaRaw) : nil)
        let desdeRaw = ActivityDetailFormat.clock(sesion?.sesionAbiertaDesde)
        let desde: String? = desdeRaw == "—" ? nil : desdeRaw
        let corriendo = sesion?.enCurso == true && desde != nil
        return [
            ActivityFact(etiqueta: "Plan", valor: plan),
            ActivityFact(etiqueta: corriendo ? "Desde" : "Real", valor: corriendo ? (desde ?? "—") : real),
            ActivityFact(etiqueta: "Entrega", valor: entrega ?? "—"),
        ]
    }

    private func superiorTarget(_ acciones: ActivitySuperiorActions) -> ActivitySuperiorTarget {
        let nombre = titulo.isEmpty ? "Actividad" : titulo
        return ActivitySuperiorTarget(
            id: activityId,
            title: folio.isEmpty ? nombre : "\(folio) · \(nombre)",
            acciones: acciones,
            excluded: []
        )
    }

    // MARK: Vista

    var body: some View {
        Group {
            if raw.isEmpty {
                if loading {
                    NxLoadingState(text: "Cargando actividad…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    // Un solo camino claro: reintentar (volver ya está en la barra superior).
                    VStack(spacing: 12) {
                        NxErrorBlock(message: error ?? "Actividad no encontrada") { recarga += 1 }
                        Spacer(minLength: 0)
                    }
                    .padding(16)
                }
            } else {
                contenido
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .overlay(alignment: .bottom) {
            if let snack {
                ActivitySnackbar(text: snack)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .onTapGesture { self.snack = nil }
            }
        }
        .animation(.easeOut(duration: 0.2), value: snack)
        // Dock inferior fijo: la acción principal al alcance del pulgar.
        .safeAreaInset(edge: .bottom, spacing: 0) { dockView }
        .background(NxColors.surface.ignoresSafeArea())
        .nxBrandNavBar(title: "Detalle de actividad")
        // Android `conBarraInferior = false`: el detalle lleva su dock; la barra de pestañas estorba.
        .nxOcultaBarraInferior()
        .onAppear {
            guard !didApplyInitialTab else { return }
            didApplyInitialTab = true
            tab = CoreDetailTab.from(initialTab)
        }
        .task(id: recarga) { await load() }
        // Pasos y dock: el flujo propio se relee al cambiar de pestaña, al recargar o al capturar algo.
        .task(id: "\(recarga)-\(flowTick)-\(captura)-\(tab.rawValue)") {
            guard captura else { return }
            // El 404 del API es «todavía no hay foto de entrada» (nil), no un error;
            // si la red falla se queda lo que ya había.
            do {
                let next = try await CoreRepository.shared.evidenceFlow(activityId: activityId)
                if !Task.isCancelled { flow = next }
            } catch {}
        }
        .task(id: tab) {
            if tab == .historial { await loadTimeline() }
        }
        .task(id: snack) {
            guard snack != nil else { return }
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            if !Task.isCancelled { snack = nil }
        }
        // Al volver a Detalle, la lista de pasos refleja lo capturado en Evidencias.
        .onChange(of: dockEvidencias?.label) { _, _ in flowTick += 1 }
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
        .sheet(isPresented: $pausando) {
            PausarPropiaSheet(activityId: activityId) { mensaje in
                pausando = false
                teamRefresh += 1
                recarga += 1
                snack = mensaje
            }
        }
    }

    private var contenido: some View {
        VStack(spacing: 0) {
            // Sin «← Volver» propio: la barra teal ya trae la flecha.
            ActivityHeaderV2(
                activityId: activityId,
                titulo: titulo,
                folio: folio,
                coreKind: coreKind,
                ticketTypeCustom: text("ticketTypeCustom"),
                estatus: estatus,
                prioridad: text("prioridad"),
                semaforo: text("semaforo"),
                asignadoPor: nested("asignadoPor", "nombre"),
                minutosPlan: ActivityParse.double(raw["minutosPlan"]),
                minutosReales: ActivityParse.double(raw["minutosReales"]),
                sesion: sesion,
                isDespacho: isDespacho
            )
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            // Cancelada por un superior: quién y por qué, visible en las tres pestañas.
            if let aviso = cancelAviso {
                HStack(alignment: .center, spacing: 8) {
                    Image(systemName: "nosign")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(NxColors.danger)
                        .frame(width: 18, height: 18)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(aviso)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(NxColors.dangerText)
                            .fixedSize(horizontal: false, vertical: true)
                        if let cuando = ActivityDetailFormat.when(text("cancelledAt")) {
                            Text(cuando)
                                .font(.system(size: 11.5))
                                .foregroundStyle(NxColors.muted)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(NxColors.dangerSoft, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
            }

            if let acciones, acciones.hayAlgo {
                ActivitySuperiorActionsBar(
                    acciones: acciones,
                    onPasar: { pasar = superiorTarget(acciones) },
                    onCancelar: { cancelar = superiorTarget(acciones) }
                )
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
            }

            NxUnderlineTabs(
                tabs: CoreDetailTab.allCases.map { NxUnderlineTab(id: $0, title: $0.title) },
                selection: $tab
            )

            switch tab {
            case .detalle: detalleTab
            case .evidencias: evidenciasTab
            case .historial: historialTab
            }
        }
    }

    /// Tras cancelar o pasarla: aviso, detalle, acciones, evidencias e historial al día.
    private func afterSuperiorAction(_ message: String) {
        snack = message
        teamRefresh += 1
        recarga += 1
        if tab == .historial { Task { await loadTimeline() } }
    }

    // MARK: Detalle

    private var detalleTab: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 10) {
                    if !lugarTitulo.isEmpty {
                        ActivityPlaceCard(titulo: lugarTitulo, detalle: lugarDetalle, mapsURL: lugarMapa)
                    }
                    ActivityFactsStrip(celdas: facts)
                    // «Iniciar actividad» vive en el dock; aquí solo se explica (regla del 18-09).
                    if puedeIniciar {
                        ActivitySoftNote(
                            text: "Iníciala cuando empieces: queda registrada tu hora real de inicio. "
                                + "Si no puedes hacerla, habla con tu jefe para que la reasigne.",
                            title: "Te asignaron esta actividad",
                            color: NxColors.azul
                        )
                    }
                    // El checklist va antes del trabajo: sin palomearlo, `iniciar` da 400.
                    ActivityToolChecklistView(activityId: activityId, refreshToken: recarga)
                    if captura {
                        ActivityStepsCard(
                            pasos: ActivityDockRules.pasos(flow: flow, coreKind: coreKind, fotosRequeridas: fotosRequeridas)
                        ) {
                            tab = .evidencias
                        }
                    }
                }

                if canEdit && !editing {
                    HStack(alignment: .center) {
                        Text("Datos de la actividad")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(NxColors.fg)
                        Spacer(minLength: 8)
                        Button("Editar") { empezarEdicion() }
                            .buttonStyle(NxPillButtonStyle(fill: .clear, foreground: NxColors.brand, border: NxColors.borderStrong))
                    }
                }

                if editing {
                    ActivityEditPanels(
                        showManagerFields: canManage,
                        saving: saving,
                        saveError: saveError,
                        estatus: $editEstatus,
                        prioridad: $editPrioridad,
                        descripcion: $editDescripcion,
                        indicaciones: $editIndicaciones,
                        fechaInicio: $editFechaInicio,
                        fechaEntrega: $editFechaEntrega,
                        fechaFin: $editFechaFin,
                        onCancel: {
                            editing = false
                            saveError = nil
                        },
                        onSave: { Task { await guardarEdicion() } }
                    )
                } else {
                    datosCard
                    if !text("descripcion").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        textoCard("Descripción", text("descripcion"))
                    }
                    if !text("indicaciones").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        textoCard("Indicaciones", text("indicaciones"))
                    }
                    NxPanelShell {
                        Text("Evidencias del equipo")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(NxColors.fg)
                        TeamEvidenceCompactView(activityId: activityId, refreshToken: teamRefresh) {
                            tab = .evidencias
                        }
                    }
                    // Comercial: la propuesta en Excel, la minuta en Word, el PDF del cliente.
                    if CoreEvidence.isComercial(coreKind) {
                        ActivityAdjuntosSection(
                            activityId: activityId,
                            puedeAdjuntar: puedeAdjuntar,
                            refreshToken: recarga,
                            onAviso: { snack = $0 }
                        )
                    }
                }
            }
            .padding(16)
        }
        .refreshable {
            recarga += 1
            teamRefresh += 1
        }
    }

    /// Tarjeta de datos (Android `Card` de Material con `ADetailRow`): #E8EDF4, radio 12.
    private var datosCard: some View {
        let sucursal = [text("branchName"), text("branchCity"), text("branchState")]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
        let ticketType = text("ticketType").trimmingCharacters(in: .whitespacesAndNewlines)
        let equipo = assignees
            .filter { isActive($0) }
            .map { ActivityParse.nestedName($0["user"]) }
            .filter { !$0.isEmpty }
        return VStack(alignment: .leading, spacing: 8) {
            ActivityDetailRow(label: "AN / Folio", value: folio)
            ActivityDetailRow(label: "Responsable", value: nested("responsable", "nombre"))
            ActivityDetailRow(label: "Creador", value: nested("creador", "nombre"))
            ActivityDetailRow(label: "Cliente", value: nested("client", "name"))
            // La web también enseña el proyecto y, con varias personas, el equipo.
            ActivityDetailRow(label: "Proyecto", value: nested("project", "title"))
            if equipo.count > 1 {
                ActivityDetailRow(label: "Equipo", value: equipo.joined(separator: ", "))
            }
            ActivityDetailRow(label: "Sucursal", value: sucursal)
            ActivityDetailRow(label: "Dirección", value: text("branchAddress"))
            ActivityDetailRow(label: "Prioridad", value: ActivityDetailRules.priorityLabel(text("prioridad")) ?? "")
            if !ticketType.isEmpty {
                ActivityDetailRow(label: "Tipo de servicio", value: ActivityDetailRules.humanize(ticketType))
            }
            ActivityDetailRow(label: "Asignación", value: ActivityDetailFormat.dateTime(text("fechaAsignacion")))
            ActivityDetailRow(label: "Inicio", value: ActivityDetailFormat.dateTime(text("fechaInicio")))
            // Varios días: la frase la manda la API («Día 3 de 10 · termina vie 25 sep»).
            ActivityDetailRow(label: "Periodo", value: nested("periodo", "etiqueta"))
            ActivityDetailRow(label: "Entrega esperada", value: ActivityDetailFormat.date(text("fechaEntregaEsperada")))
            ActivityDetailRow(label: "Finalización", value: ActivityDetailFormat.dateTime(text("fechaFinalizacion")))
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Self.cardFill, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
    }

    /// `surfaceContainerHighest` del tema de Android: el fondo de las `Card` sin color propio.
    private static let cardFill = NxColors.rgb(0xE8EDF4)

    private func textoCard(_ titulo: String, _ cuerpo: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(titulo)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(NxColors.fg)
            Text(cuerpo)
                .font(.system(size: 13))
                .foregroundStyle(NxColors.fg)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Self.cardFill, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
    }

    private func empezarEdicion() {
        editEstatus = estatus
        editPrioridad = text("prioridad").uppercased()
        editDescripcion = text("descripcion")
        editIndicaciones = text("indicaciones")
        editFechaInicio = ActivityDetailFormat.parse(text("fechaInicio"))
        editFechaEntrega = ActivityDetailFormat.parse(text("fechaEntregaEsperada"))
        editFechaFin = ActivityDetailFormat.parse(text("fechaFinalizacion"))
        saveError = nil
        editing = true
    }

    @MainActor
    private func guardarEdicion() async {
        guard !editEstatus.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        saving = true
        saveError = nil
        defer { saving = false }
        do {
            let encolada = try await ActivityEditRepository.guardar(
                activityId: activityId,
                comoResponsable: canManage,
                estatus: editEstatus,
                prioridad: editPrioridad,
                descripcion: editDescripcion,
                indicaciones: editIndicaciones,
                fechaInicio: editFechaInicio,
                fechaEntrega: editFechaEntrega,
                fechaFin: editFechaFin
            )
            editing = false
            snack = encolada ? (CoreError.queuedOffline.errorDescription ?? "Actividad actualizada") : "Actividad actualizada"
            recarga += 1
        } catch {
            saveError = error.toUserMessage(fallback: "No se pudo guardar")
        }
    }

    // MARK: Evidencias

    private var evidenciasTab: some View {
        // Columna con scroll (no perezosa) a propósito: el borrador de fotos del flujo
        // vive en el estado de la vista y una lista perezosa lo tiraría al salir de pantalla.
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if reparte {
                    NxPanelShell(spacing: 4) {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Image(systemName: "paperplane")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(NxColors.fg)
                            Text("Tú repartes esta actividad")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(NxColors.fg)
                        }
                        Text("En despacho tu parte es pasarla a quien la ejecuta; no subes evidencias. "
                            + "El registro de a quién se la pasaste está en la pestaña Historial.")
                            .font(.system(size: 13.5))
                            .foregroundStyle(NxColors.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if captura {
                    EvidenceCaptureFlowView(
                        activityId: activityId,
                        fallbackCoreKind: coreKind,
                        fallbackPhotoRequired: ActivityParse.int(raw["evidencePhotoRequired"]),
                        fallbackIndicaciones: text("indicaciones"),
                        fallbackPrioridad: text("prioridad"),
                        embedded: true,
                        onChanged: {
                            teamRefresh += 1
                            flowTick += 1
                        },
                        dockHost: { accion in
                            if accion == nil || !(accion?.sameLook(dockEvidencias) ?? false) {
                                dockEvidencias = accion
                            }
                        }
                    )
                }
                NxPanelShell {
                    TeamEvidenceView(activityId: activityId, refreshToken: teamRefresh)
                }
                Spacer().frame(height: 24)
            }
            .padding(16)
        }
        .refreshable {
            teamRefresh += 1
            recarga += 1
        }
    }

    // MARK: Historial

    private var historialTab: some View {
        let cerrada = !text("fechaFinalizacion").trimmingCharacters(in: .whitespaces).isEmpty
        return ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center, spacing: 8) {
                    CoreChip(icon: "calendar", text: "\(events.count) evento\(events.count == 1 ? "" : "s")")
                    CoreChip(
                        text: cerrada ? "Finalizada" : (estatus.isEmpty ? "Sin estado" : estatus),
                        color: cerrada ? NxColors.verde : NxColors.azul
                    )
                    Spacer(minLength: 8)
                    Button("↻") { Task { await loadTimeline() } }
                        .buttonStyle(NxPillButtonStyle(fill: .clear, foreground: NxColors.brand, border: NxColors.borderStrong))
                        .disabled(eventsLoading)
                        .accessibilityLabel("Actualizar historial")
                }
                if eventsLoading && events.isEmpty {
                    NxLoadingState(text: "Cargando historial…")
                } else if let eventsError, events.isEmpty {
                    NxErrorBlock(message: eventsError) { Task { await loadTimeline() } }
                } else if events.isEmpty {
                    NxEmptyState(
                        title: "Sin eventos",
                        subtitle: "Aún no hay movimientos registrados en esta actividad."
                    )
                }
                ForEach(Array(events.enumerated()), id: \.offset) { index, event in
                    ActivityTimelineEventCard(event: event, highlighted: index == 0)
                }
                Spacer().frame(height: 24)
            }
            .padding(16)
        }
        .refreshable { await loadTimeline() }
    }

    // MARK: Dock

    /// En Evidencias el dock lo manda el flujo de captura, salvo «Iniciar» y
    /// «Reanudar», sin los que el reloj no corre (entonces la captura queda como secundaria).
    @ViewBuilder
    private var dockView: some View {
        if !raw.isEmpty {
            let detalle = dockDetalle
            let dockSesion: ActivityDockRules.Dock? = (detalle?.kind == .iniciar || detalle?.kind == .reanudar) ? detalle : nil
            if tab == .evidencias && dockSesion == nil {
                if let accion = dockEvidencias {
                    ActivityDockBar(
                        label: accion.label,
                        systemImage: accion.systemImage,
                        enabled: accion.enabled,
                        hint: accion.hint,
                        secondary: secundariasEvidencias(accion),
                        onPrimary: accion.onPrimary
                    )
                }
            } else if let d = detalle {
                ActivityDockBar(
                    label: d.label,
                    systemImage: d.systemImage,
                    loading: iniciando || reanudando,
                    hint: d.hint,
                    error: dockError,
                    secondary: secundariasDetalle(d),
                    onPrimary: { primaria(d) }
                )
            } else if pausable {
                // Con el reloj corriendo pero sin captura propia (p. ej. dirección con
                // fila activa): el panel viejo ofrecía «Pausar»; el dock lo conserva.
                ActivityDockBar(
                    label: "Pausar actividad",
                    systemImage: "pause",
                    hint: textoCorriendo,
                    onPrimary: { pedirPausa() }
                )
            }
        }
    }

    private var pausarSecundaria: ActivityDockSecondary {
        ActivityDockSecondary(label: "Pausar", systemImage: "pause") { pedirPausa() }
    }

    private func secundariasEvidencias(_ accion: EvidenceDockAction) -> [ActivityDockSecondary] {
        var lista: [ActivityDockSecondary] = []
        if let etiqueta = accion.secondaryLabel, let accionSecundaria = accion.onSecondary {
            lista.append(ActivityDockSecondary(label: etiqueta, systemImage: accion.secondarySystemImage, action: accionSecundaria))
        }
        if pausable { lista.append(pausarSecundaria) }
        return lista
    }

    private func secundariasDetalle(_ dock: ActivityDockRules.Dock) -> [ActivityDockSecondary] {
        var lista: [ActivityDockSecondary] = []
        if dock.pausable { lista.append(pausarSecundaria) }
        if tab == .evidencias, let capturaDock = dockEvidencias, capturaDock.enabled {
            lista.append(ActivityDockSecondary(label: capturaDock.label, systemImage: capturaDock.systemImage, action: capturaDock.onPrimary))
        }
        return lista
    }

    /// «Reloj corriendo desde las 09:30.» en hora de México.
    private var textoCorriendo: String {
        let hora = ActivityDetailFormat.clock(sesion?.sesionAbiertaDesde)
        return hora == "—" ? "Reloj corriendo." : "Reloj corriendo desde las \(hora)."
    }

    private func primaria(_ dock: ActivityDockRules.Dock) {
        switch dock.kind {
        case .iniciar: Task { await iniciar() }
        case .reanudar: Task { await reanudar() }
        case .evidencias, .ver: tab = .evidencias
        }
    }

    private func pedirPausa() {
        dockError = nil
        pausando = true
    }

    /// Guarda la hora real de inicio; lo siguiente es la foto de entrada.
    @MainActor
    private func iniciar() async {
        iniciando = true
        dockError = nil
        defer { iniciando = false }
        do {
            try await CoreRepository.shared.iniciarActividad(activityId: activityId)
            recarga += 1
            tab = .evidencias
            snack = "Actividad iniciada"
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
            recarga += 1
            snack = "Tu reloj volvió a correr"
        } catch {
            dockError = error.toUserMessage(fallback: "No se pudo reanudar la actividad")
        }
    }

    // MARK: Carga

    @MainActor
    private func load() async {
        let primera = raw.isEmpty
        loading = true
        defer { loading = false }
        do {
            let map = try await CoreRepository.shared.activityDetail(activityId: activityId)
            if map.isEmpty {
                if primera { error = "Actividad no encontrada" }
            } else {
                raw = map
                error = nil
            }
        } catch {
            if Task.isCancelled { return }
            if primera {
                self.error = error.toUserMessage(fallback: "No se pudo cargar la actividad")
            } else {
                // Sin estado de error propio: se avisa y se sigue viendo lo de antes.
                snack = recarga == 0
                    ? "No se pudo cargar el detalle completo — mostrando lo que ya tenías"
                    : "No se pudo actualizar la actividad — sigue viendo lo anterior"
            }
        }
        // Opcional: sin respuesta (403, sin red) no se ofrece nada; el API vuelve a validar al guardar.
        acciones = try? await CoreRepository.shared.superiorActions(activityId: activityId)
    }

    @MainActor
    private func loadTimeline() async {
        eventsLoading = true
        defer { eventsLoading = false }
        do {
            events = try await CoreRepository.shared.timeline(activityId: activityId)
            eventsError = nil
        } catch {
            if !Task.isCancelled {
                eventsError = error.toUserMessage(fallback: "No se pudo cargar el historial")
            }
        }
    }
}

// MARK: - Historial: tarjeta de evento

/// Tarjeta de la línea de tiempo (Android `TimelineEventCard`): raya de color de 3
/// a la izquierda, «icono título», hace cuánto, chip del tipo, detalle y fecha completa.
private struct ActivityTimelineEventCard: View {
    let event: ActivityTimelineEvent
    let highlighted: Bool

    var body: some View {
        let icono = (event.icon ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let color = ActivityDetailRules.timelineColor(event.kind)
        let subtitle = (event.subtitle ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 8) {
                Text("\(icono.isEmpty ? "•" : icono) \(event.title ?? "")")
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                Text(ActivityDetailFormat.relative(event.at))
                    .font(.system(size: 11))
                    .foregroundStyle(NxColors.muted)
            }
            CoreChip(text: ActivityDetailRules.timelineKindLabel(event.kind), color: color)
            if !subtitle.isEmpty {
                Text(subtitle)
                    .font(.system(size: 12.5))
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let completa = ActivityDetailFormat.full(event.at) {
                Text(completa)
                    .font(.system(size: 11.5))
                    .foregroundStyle(NxColors.muted)
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, 12)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(alignment: .leading) {
            Rectangle().fill(color ?? NxColors.brand).frame(width: 3)
        }
        .background(highlighted ? NxColors.brandSoft.opacity(0.35) : NxColors.card)
        .clipShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                .strokeBorder(NxColors.border, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Editar

/// «Editar» del detalle (Android `ActivityInfoTab` en modo edición): estado y
/// prioridad, entrega/descripción/indicaciones (solo quien administra) y
/// programación. Las fechas se eligen en hora de México.
private struct ActivityEditPanels: View {
    let showManagerFields: Bool
    let saving: Bool
    let saveError: String?
    @Binding var estatus: String
    @Binding var prioridad: String
    @Binding var descripcion: String
    @Binding var indicaciones: String
    @Binding var fechaInicio: Date?
    @Binding var fechaEntrega: Date?
    @Binding var fechaFin: Date?
    let onCancel: () -> Void
    let onSave: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            NxPanelShell {
                NxSectionHeader(title: "Estado y prioridad")
                chips(ActivityDetailRules.estatuses, seleccion: $estatus) { $0.replacingOccurrences(of: "_", with: " ") }
                    .padding(.top, 8)
                if showManagerFields {
                    Text("Prioridad")
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.fg)
                        .padding(.top, 8)
                    chips(ActivityDetailRules.prioridades, seleccion: $prioridad) { $0 }
                        .padding(.top, 4)
                }
            }
            if showManagerFields {
                NxPanelShell(spacing: 8) {
                    NxSectionHeader(title: "Detalle")
                    ActivityDateField(label: "Entrega esperada", value: $fechaEntrega, conHora: false)
                    campo("Descripción", texto: $descripcion)
                    campo("Indicaciones", texto: $indicaciones)
                }
            }
            NxPanelShell(spacing: 8) {
                NxSectionHeader(title: "Programación")
                ActivityDateField(label: "Inicio programado", value: $fechaInicio, conHora: true)
                ActivityDateField(label: "Finalización", value: $fechaFin, conHora: true)
                if let saveError, !saveError.isEmpty {
                    Text(saveError)
                        .font(.system(size: 13))
                        .foregroundStyle(NxColors.danger)
                }
                HStack(spacing: 8) {
                    NxSecondaryButton("Cancelar", fullWidth: true, action: onCancel)
                    NxPrimaryButton(
                        saving ? "Guardando…" : "Guardar",
                        enabled: !saving && !estatus.trimmingCharacters(in: .whitespaces).isEmpty,
                        action: onSave
                    )
                }
                .padding(.top, 2)
            }
        }
    }

    /// `FilterChip` de Material: radio 8, 32 de alto, palomita y fondo suave al elegir.
    private func chips(_ opciones: [String], seleccion: Binding<String>, etiqueta: @escaping (String) -> String) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(opciones, id: \.self) { opcion in
                    let on = seleccion.wrappedValue.caseInsensitiveCompare(opcion) == .orderedSame
                    Button {
                        seleccion.wrappedValue = opcion
                    } label: {
                        HStack(spacing: 4) {
                            if on {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 11, weight: .bold))
                            }
                            Text(etiqueta(opcion))
                                .font(NxType.labelSmall)
                                .lineLimit(1)
                        }
                        .foregroundStyle(on ? NxColors.brandDeep : NxColors.fg2)
                        .padding(.horizontal, 12)
                        .frame(height: 32)
                        .background(on ? NxColors.brandSoft2 : Color.clear, in: RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous)
                                .strokeBorder(on ? Color.clear : NxColors.borderStrong, lineWidth: 1)
                        )
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(saving)
                    .accessibilityAddTraits(on ? AccessibilityTraits.isSelected : [])
                }
            }
            .padding(.vertical, 1)
        }
    }

    private func campo(_ etiqueta: String, texto: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(etiqueta)
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
            TextField(etiqueta, text: texto, axis: .vertical)
                .font(NxType.bodyLarge)
                .lineLimit(2...6)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .overlay(
                    RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous)
                        .strokeBorder(NxColors.borderStrong, lineWidth: 1)
                )
                .disabled(saving)
        }
    }
}

/// Campo de fecha (o fecha y hora) en hora de México, con «Limpiar» y
/// «Seleccionar fecha» cuando va vacío (Android `DatePickerField` / `DateTimePickerField`).
private struct ActivityDateField: View {
    let label: String
    @Binding var value: Date?
    let conHora: Bool

    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = ActivityDetailFormat.mexico
        return c
    }

    /// Hoy en México (a las 9:00 si lleva hora, como Android).
    private var porOmision: Date {
        let hoy = calendar.startOfDay(for: Date())
        return conHora ? (calendar.date(bySettingHour: 9, minute: 0, second: 0, of: hoy) ?? hoy) : hoy
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
            HStack(spacing: 8) {
                if value != nil {
                    DatePicker(
                        label,
                        selection: Binding(get: { value ?? porOmision }, set: { value = $0 }),
                        displayedComponents: conHora ? [.date, .hourAndMinute] : [.date]
                    )
                    .labelsHidden()
                    .environment(\.timeZone, ActivityDetailFormat.mexico)
                    .environment(\.locale, Locale(identifier: "es_MX"))
                    .tint(NxColors.brand)
                    Spacer(minLength: 0)
                    Button {
                        value = nil
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(NxColors.muted)
                            .nxTapTarget()
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Limpiar")
                } else {
                    Button {
                        value = porOmision
                    } label: {
                        HStack {
                            Text(conHora ? "Seleccionar fecha y hora" : "Seleccionar fecha")
                                .font(NxType.bodyLarge)
                                .foregroundStyle(NxColors.muted)
                            Spacer(minLength: 0)
                            Image(systemName: "calendar")
                                .foregroundStyle(NxColors.muted)
                        }
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 52)
            .overlay(
                RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous)
                    .strokeBorder(NxColors.borderStrong, lineWidth: 1)
            )
        }
    }
}

/// `PATCH activities/:id` (quien administra) o `PATCH activities/:id/execute`
/// (su propia OT), con los mismos campos que Android. Lo que va vacío no se manda.
private enum ActivityEditRepository {
    private struct Manage: Encodable {
        let estatus: String?
        let prioridad: String?
        let descripcion: String?
        let indicaciones: String?
        let fechaInicio: String?
        let fechaEntregaEsperada: String?
        let fechaFinalizacion: String?
    }

    private struct Execute: Encodable {
        let estatus: String?
        let fechaInicio: String?
        let fechaFinalizacion: String?
    }

    private static func limpio(_ text: String) -> String? {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }

    /// Entrega esperada: el día de México a mediodía UTC (como Android `T12:00:00.000Z`).
    private static func entregaISO(_ date: Date?) -> String? {
        guard let date else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = ActivityDetailFormat.mexico
        let p = calendar.dateComponents([.year, .month, .day], from: date)
        let y = p.year ?? 2026
        let m = p.month ?? 1
        let d = p.day ?? 1
        return String(format: "%04d-%02d-%02dT12:00:00.000Z", y, m, d)
    }

    /// Devuelve `true` si quedó en la cola sin conexión.
    static func guardar(
        activityId: Int,
        comoResponsable: Bool,
        estatus: String,
        prioridad: String,
        descripcion: String,
        indicaciones: String,
        fechaInicio: Date?,
        fechaEntrega: Date?,
        fechaFin: Date?
    ) async throws -> Bool {
        let inicio = fechaInicio.map { ActivityDetailFormat.isoString($0) }
        let fin = fechaFin.map { ActivityDetailFormat.isoString($0) }
        let data: Data
        if comoResponsable {
            data = try await ApiClient.shared.patchJSON(
                "activities/\(activityId)",
                body: Manage(
                    estatus: limpio(estatus),
                    prioridad: limpio(prioridad),
                    descripcion: limpio(descripcion),
                    indicaciones: limpio(indicaciones),
                    fechaInicio: inicio,
                    fechaEntregaEsperada: entregaISO(fechaEntrega),
                    fechaFinalizacion: fin
                )
            )
        } else {
            data = try await ApiClient.shared.patchJSON(
                "activities/\(activityId)/execute",
                body: Execute(estatus: limpio(estatus), fechaInicio: inicio, fechaFinalizacion: fin)
            )
        }
        return CoreRepository.isQueuedOffline(data)
    }
}
