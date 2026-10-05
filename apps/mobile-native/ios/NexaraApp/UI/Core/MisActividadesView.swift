import SwiftUI

private struct PendingMove: Identifiable {
    let id = UUID()
    let item: MyActivityItem
    let from: Int
    let to: Int
}

/// Mis actividades (GET me/activities), Android `MisActividadesContent`: cola
/// numerada con «Empieza por aquí», un solo botón lleno (la #1), reordenar con
/// motivo (encargados), auto-asignarse, repartir despachos, seguimiento y hechas hoy.
struct MisActividadesView: View {
    /// Abre el detalle en la pestaña indicada (nil = Detalle).
    let onOpenActivity: (Int, String?) -> Void
    /// «Repartir» lleva al día de uno mismo, donde está el panel de despacho.
    let onOpenPerson: (Int) -> Void

    @ObservedObject private var session = SessionStore.shared
    @State private var data: MyActivitiesResponse?
    @State private var loading = true
    @State private var error: String?
    @State private var pendingMove: PendingMove?
    @State private var highlightId: Int?
    @State private var showDone = false
    @State private var showSelfAssign = false
    // Regla del 18-09: lo que te asignan no se acepta ni se rechaza, únicamente se inicia.
    @State private var iniciandoId: Int?
    @State private var iniciarError: String?
    @State private var iniciarErrorId: Int?

    private var open: [MyActivityItem] { data?.open ?? [] }
    private var done: [MyActivityItem] { data?.doneToday ?? [] }
    private var seguimiento: [MyActivityItem] { data?.seguimiento ?? [] }
    private var urgentes: Int { open.filter { ActividadesUx.esUrgente($0.prioridad) }.count }
    private var canReorder: Bool { data?.canReorder == true && open.count > 1 }
    private var canSelfAssign: Bool { data?.canSelfAssign == true }
    private var myId: Int? { session.currentUser.flatMap { Int($0.id) } }
    private var firstName: String { ActividadesTexto.primerNombre(session.currentUser?.nombre) }
    private var hayAlgo: Bool { !open.isEmpty || !done.isEmpty || !seguimiento.isEmpty }

    private var estado: ActividadesPantalla {
        .de(cargando: loading && data == nil, error: error, hayDatos: hayAlgo)
    }

    private var metricas: [NxMetric] {
        ActividadesUx.metricas(porHacer: open.count, urgentes: urgentes, hechasHoy: done.count, seguimiento: seguimiento.count)
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                encabezado
                // Regla 7: sin nada que contar, la tira no se pinta.
                if !metricas.isEmpty {
                    NxMetricStrip(items: metricas)
                }
                // Cola vacía pero hay hechas hoy o seguimiento: la pantalla no está
                // «vacía», así que el botón del estado vacío no sale. Este sí.
                if ActividadesUx.autoasignarProminente(canSelfAssign, porHacer: open.count) && estado == .contenido {
                    NxPrimaryButton("Auto-asignarme una actividad") { showSelfAssign = true }
                }
                cuerpo
                Color.clear.frame(height: 24)
            }
            .padding(16)
        }
        .background(NxColors.surface)
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $pendingMove) { move in
            ReorderReasonSheet(move: move, openIds: open.map(\.id)) { next, movedId in
                if let next {
                    data = next
                } else {
                    // Quedó en la cola sin conexión: se vuelve a leer cuando haya red.
                    Task { await load() }
                }
                highlightId = movedId
            }
        }
        .sheet(isPresented: $showSelfAssign) {
            CoreSelfAssignSheet { newId in
                highlightId = newId
                Task { await load() }
            }
        }
    }

    // MARK: Encabezado

    /// Dos renglones: saludo y qué hacer ahora. Lo primero que se tiene que ver
    /// es la actividad, no la bienvenida.
    private var encabezado: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(firstName.isEmpty ? "Tu día" : "Hola, \(firstName)")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                Text(ActividadesUx.instruccionDia(porHacer: open.count, cargando: loading && data == nil))
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.fg2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            // Siempre visible: con cola es secundario (el primario es la #1).
            if ActividadesUx.muestraAutoasignar(canSelfAssign) {
                Button { showSelfAssign = true } label: {
                    Text("Auto-asignarme")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(NxColors.fg2)
                        .padding(.horizontal, 8)
                        .frame(minHeight: NxMetrics.minTap)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: Estados

    @ViewBuilder
    private var cuerpo: some View {
        switch estado {
        case .cargando:
            NxSkeletonList(itemCount: 3, itemHeight: 128)
        case .error:
            NxErrorBlock(message: error) { Task { await load() } }
        case .vacio:
            NxEmptyState(
                title: "Todo al día",
                subtitle: "Cuando te asignen algo aparecerá aquí.",
                actionLabel: canSelfAssign ? "Auto-asignarme una actividad" : nil,
                onAction: accionVacia
            )
        case .contenido:
            notaDeOrden
            cola
            if !seguimiento.isEmpty {
                NxDenseSectionHeader(
                    title: "En seguimiento (\(seguimiento.count))",
                    hint: "Ya las repartiste: aquí ves a quién y cómo va quien las ejecuta."
                )
                .padding(.top, 6)
                ForEach(seguimiento) { s in
                    SeguimientoCard(
                        s: s,
                        onOpenHistory: { onOpenActivity(s.id, "historial") },
                        onReprogramado: { Task { await load() } }
                    )
                }
            }
            if !done.isEmpty {
                NxDenseSectionHeader(title: "Hechas hoy (\(done.count))") {
                    Button { showDone.toggle() } label: {
                        Text(showDone ? "Ocultar" : "Ver")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(NxColors.brand)
                            .padding(.horizontal, 8)
                            .frame(minHeight: NxMetrics.minTap)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 6)
                if showDone {
                    hechas
                }
            }
        }
    }

    private var accionVacia: (() -> Void)? {
        guard canSelfAssign else { return nil }
        return { showSelfAssign = true }
    }

    @ViewBuilder
    private var notaDeOrden: some View {
        if canReorder {
            Text("Tú decides el orden: usa «Subir» y «Bajar». Cada cambio pide un motivo corto.")
                .font(.system(size: 12.5))
                .foregroundStyle(NxColors.muted)
        } else if open.count > 1 {
            Text("El orden sale de la prioridad y la fecha. Si algo no cuadra, avísale a tu encargado.")
                .font(.system(size: 12.5))
                .foregroundStyle(NxColors.muted)
        }
    }

    private var cola: some View {
        ForEach(Array(open.enumerated()), id: \.element.id) { index, a in
            OpenActivityCard(
                a: a,
                index: index,
                total: open.count,
                highlighted: highlightId == a.id,
                canReorder: canReorder,
                iniciando: iniciandoId == a.id,
                iniciarError: iniciarErrorId == a.id ? iniciarError : nil,
                onIniciar: { tab in Task { await iniciar(a, tab: tab) } },
                onOpen: { tab in onOpenActivity(a.id, tab) },
                onRepartir: { if let myId { onOpenPerson(myId) } },
                onMove: { from, to in
                    if open.indices.contains(to) && to != from {
                        pendingMove = PendingMove(item: a, from: from, to: to)
                    }
                }
            )
        }
    }

    /// Una sola superficie con filas separadas por una línea.
    private var hechas: some View {
        VStack(spacing: 0) {
            ForEach(Array(done.enumerated()), id: \.element.id) { i, a in
                if i > 0 {
                    Rectangle().fill(NxColors.borderSubtle).frame(height: 1)
                }
                Button { onOpenActivity(a.id, nil) } label: {
                    HStack(alignment: .center, spacing: 10) {
                        ActLineaIcono(
                            systemName: "checkmark.circle",
                            text: a.titulo ?? "",
                            color: NxColors.fg,
                            fontSize: 13,
                            lineLimit: 1,
                            iconColor: NxColors.verde
                        )
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Text(a.fechaFinalizacion != nil ? ActividadesTexto.hora(a.fechaFinalizacion) : (a.estatus ?? ""))
                            .font(.system(size: 13))
                            .foregroundStyle(NxColors.muted)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .background(NxColors.card)
        .clipShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                .strokeBorder(NxColors.border, lineWidth: 1)
        )
    }

    // MARK: Acciones

    /// «Iniciar actividad»: guarda la hora real y abre la pestaña indicada.
    @MainActor
    private func iniciar(_ a: MyActivityItem, tab: String?) async {
        guard iniciandoId == nil else { return }
        iniciandoId = a.id
        iniciarError = nil
        defer { iniciandoId = nil }
        do {
            try await CoreRepository.shared.iniciarActividad(activityId: a.id)
            onOpenActivity(a.id, tab)
            await load()
        } catch {
            if !NetworkMonitor.shared.isOnline || error is URLError {
                // Sin señal no se inventa la hora: la foto de entrada marca el inicio al subirse.
                onOpenActivity(a.id, tab)
            } else {
                iniciarErrorId = a.id
                iniciarError = error.toUserMessage(fallback: "No se pudo iniciar la actividad")
            }
        }
    }

    @MainActor
    private func load() async {
        do {
            data = try await CoreRepository.shared.myActivities()
            error = nil
        } catch {
            if !Task.isCancelled {
                self.error = error.toUserMessage(fallback: "No se pudieron cargar tus actividades")
            }
        }
        loading = false
    }
}

// MARK: - Una actividad de la cola

/// El orden de lectura es el del técnico: número y título arriba y grandes,
/// enseguida el botón que dice el siguiente paso, y solo después el estado y los
/// datos. Los estados van como punto y palabra; el color, solo si pide acción.
private struct OpenActivityCard: View {
    let a: MyActivityItem
    let index: Int
    let total: Int
    let highlighted: Bool
    let canReorder: Bool
    let iniciando: Bool
    let iniciarError: String?
    let onIniciar: (String?) -> Void
    let onOpen: (String?) -> Void
    let onRepartir: () -> Void
    let onMove: (Int, Int) -> Void

    private var first: Bool { index == 0 }
    private var accion: ActividadesUx.PrimaryAction { ActividadesUx.primaryAction(a) }
    private var etiqueta: String { iniciando ? "Iniciando…" : accion.label }
    private var prColor: Color { ActividadesUx.colorPrioridad(a.prioridad) ?? NxColors.borderStrong }
    private var forma: RoundedRectangle { RoundedRectangle(cornerRadius: 14, style: .continuous) }

    private var filo: Color {
        if highlighted { return NxColors.brand }
        if first { return NxColors.brand.opacity(0.45) }
        return NxColors.border
    }

    private var tipoFolio: String {
        let folio = ActividadesTexto.limpio(a.anNumber).map { "Folio \($0)" }
        return [CoreStatusUI.kind(a.coreKind, ticketTypeCustom: a.ticketTypeCustom), folio]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    /// Varios días: «Día 3 de 10 · termina vie 25 sep» en vez de la hora del primer día.
    private var cuando: String {
        a.periodo?.texto ?? ActividadesTexto.cuando(a.fechaInicio ?? a.fechaMaxima) ?? "Sin fecha"
    }

    private var tiempo: String? {
        if let planReal = ActividadesSemaforo.planRealTexto(plan: a.minutosPlan?.value, real: a.minutosReales?.value) {
            return planReal
        }
        guard let est = a.tiempoEstimadoMin, est > 0 else { return nil }
        var tope = ""
        if let maximo = a.tiempoMaximoMin, maximo > 0 {
            tope = " · tope \(ActividadesTexto.minutos(Double(maximo)))"
        }
        return ActividadesTexto.minutos(Double(est)) + tope
    }

    private var lugar: String? {
        ActividadesTexto.limpio(a.cliente) ?? ActividadesTexto.limpio(a.proyecto)
    }

    /// Quién la mandó: dato de contexto, no otro chip de colores.
    private var quien: String? {
        if a.autoAsignada == true { return "Auto-asignada" }
        return ActividadesSemaforo.asignadaPorTexto(a.quienAsigno?.nombre)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            cabecera
            botones
            if let iniciarError {
                Text(iniciarError)
                    .font(.system(size: 12.5))
                    .foregroundStyle(NxColors.rojo)
            }
            estados
            meta
            if let quien {
                ActLineaIcono(systemName: "person", text: quien)
            }
            // Nota con una línea de margen en vez de un recuadro relleno.
            if let indicaciones = ActividadesTexto.limpio(a.indicaciones) {
                ActNotaConMargen(text: indicaciones)
            }
            if let porQue = ActividadesTexto.limpio(a.ordenJustificacion) {
                ActLineaIcono(systemName: "doc.text", text: "Por qué va aquí: \(porQue)")
            }
            if canReorder {
                reordenar
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, 12)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        // La barra de prioridad del borde izquierdo, igual que en la web.
        .background(alignment: .leading) {
            ZStack(alignment: .leading) {
                NxColors.card
                prColor.frame(width: 4)
            }
        }
        .clipShape(forma)
        .overlay(forma.strokeBorder(filo, lineWidth: highlighted || first ? 1.5 : 1))
    }

    private var cabecera: some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(index + 1)")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(first ? Color.white : NxColors.brand)
                .frame(width: 28, height: 28)
                .background(first ? NxColors.brand : NxColors.brandSoft, in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                if first {
                    Text("EMPIEZA POR AQUÍ")
                        .font(.system(size: 10.5, weight: .bold))
                        .tracking(1)
                        .foregroundStyle(NxColors.brand)
                }
                Text(a.titulo ?? "")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                // El tipo, con su ícono: distingue una obra de un trámite de un vistazo.
                ActLineaIcono(
                    systemName: CoreStatusUI.kindSymbol(a.coreKind),
                    text: tipoFolio,
                    fontSize: 12,
                    lineLimit: 1
                )
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// Una acción principal que dice el siguiente paso; el detalle queda como
    /// secundaria. Regla 4: solo la #1 lleva el botón lleno.
    private var botones: some View {
        HStack(alignment: .center, spacing: 8) {
            Group {
                if first {
                    Button(action: alPulsar) {
                        Text(etiqueta).font(.system(size: 14, weight: .bold))
                    }
                    .buttonStyle(NxPillButtonStyle(fill: NxColors.brand, foreground: .white))
                } else {
                    Button(action: alPulsar) {
                        Text(etiqueta).font(.system(size: 14, weight: .medium))
                    }
                    .buttonStyle(NxPillButtonStyle(fill: .clear, foreground: NxColors.brand, border: NxColors.borderStrong))
                }
            }
            .disabled(iniciando)
            .frame(minHeight: NxMetrics.minTap)
            if accion.kind != .abrir {
                Button { onOpen(nil) } label: {
                    Text("Detalle")
                        .font(.system(size: 13))
                        .foregroundStyle(NxColors.fg2)
                        .padding(.horizontal, 8)
                        .frame(minHeight: NxMetrics.minTap)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func alPulsar() {
        if accion.kind == .repartir {
            onRepartir()
        } else if accion.kind == .abrir {
            onOpen(nil)
        } else if accion.marcaInicio {
            onIniciar(accion.tab)
        } else {
            onOpen(accion.tab)
        }
    }

    /// Estado: punto y palabra. Gris para el flujo normal, color solo si pide acción.
    private var estados: some View {
        ActividadesFlow {
            if a.porRepartir == true {
                NxStatusDot(text: "Te toca repartirla", color: NxColors.naranja, fontWeight: .bold)
            }
            if let luz = ActividadesSemaforo.luz(a.semaforo) {
                NxStatusDot(text: luz.etiqueta, color: ActividadesUx.colorSemaforo(a.semaforo))
            }
            NxStatusDot(text: CoreStatusUI.estatus(a.estatus).label, color: ActividadesUx.colorEstatus(a.estatus))
            NxStatusDot(text: CoreStatusUI.priority(a.prioridad).label, color: ActividadesUx.colorPrioridad(a.prioridad))
        }
    }

    /// Cuándo, cuánto y dónde: tres datos con su ícono, en una sola línea si caben.
    private var meta: some View {
        ActividadesFlow {
            ActLineaIcono(systemName: "calendar", text: cuando)
            if let tiempo {
                ActLineaIcono(
                    systemName: "clock",
                    text: tiempo,
                    color: tiempo.hasPrefix("Plan") && a.excedida == true ? NxColors.rojo : NxColors.muted
                )
            }
            if let lugar {
                ActLineaIcono(systemName: "mappin", text: lugar)
            }
        }
    }

    private var reordenar: some View {
        HStack(spacing: 4) {
            botonOrden("↑ Subir", activo: index > 0) { onMove(index, index - 1) }
            botonOrden("↓ Bajar", activo: index < total - 1) { onMove(index, index + 1) }
            if index > 1 {
                botonOrden("Hacerla primero", activo: true) { onMove(index, 0) }
            }
        }
    }

    private func botonOrden(_ texto: String, activo: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(texto)
                .font(.system(size: 13))
                .foregroundStyle(activo ? NxColors.fg2 : NxColors.fg4)
                .padding(.horizontal, 8)
                .frame(minHeight: NxMetrics.minTap)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!activo)
    }
}

// MARK: - En seguimiento

/// Lo que ya repartí: a quién se la pasé y cómo va quien la ejecuta.
private struct SeguimientoCard: View {
    let s: MyActivityItem
    let onOpenHistory: () -> Void
    let onReprogramado: () -> Void

    private var pasadas: [MyActivityPassedTo] { s.passedTo }
    private var ejecutor: MyActivityPassedTo? {
        pasadas.last { ($0.rol ?? "").uppercased() != "LEAD" }
    }

    private var tipoFolio: String {
        let folio = ActividadesTexto.limpio(s.anNumber).map { "Folio \($0)" }
        return [CoreStatusUI.kind(s.coreKind, ticketTypeCustom: s.ticketTypeCustom), folio]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    private var enviada: String {
        let cadena = pasadas.map { CoreFormat.shortName($0.nombre) }.joined(separator: " → ")
        let cuando = ActividadesTexto.cuando(pasadas.first?.at).map { " · \($0)" } ?? ""
        return "Enviada a \(cadena)\(cuando)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(s.titulo ?? "")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                    ActLineaIcono(
                        systemName: CoreStatusUI.kindSymbol(s.coreKind),
                        text: tipoFolio,
                        fontSize: 12,
                        lineLimit: 1
                    )
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Button(action: onOpenHistory) {
                    Text("Ver registro")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(NxColors.brand)
                        .padding(.horizontal, 8)
                        .frame(minHeight: NxMetrics.minTap)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            ActividadesFlow {
                NxStatusDot(text: CoreStatusUI.estatus(s.estatus).label, color: ActividadesUx.colorEstatus(s.estatus))
                if let ejecutor {
                    NxStatusDot(
                        text: "\(CoreFormat.shortName(ejecutor.nombre)): \(CoreStatusUI.avance(ejecutor.evidenceStatus).label)",
                        color: ejecutor.evidenceStatus == CoreEvidence.completed ? NxColors.verde : nil
                    )
                } else {
                    NxStatusDot(text: "Falta que la asignen", color: NxColors.naranja)
                }
            }
            if !pasadas.isEmpty {
                ActLineaIcono(systemName: "paperplane", text: enviada)
            }
            if let r = s.ultimaReprogramacion {
                let por = CoreFormat.shortName(r.por)
                ActLineaIcono(
                    systemName: "clock",
                    text: "Reprogramada por \(por.isEmpty ? "alguien" : por) · \(ActividadesTexto.cuando(r.at) ?? "")"
                )
            }
            ReprogramarDespachoInline(activityId: s.id, fechaActual: s.fechaInicio, onDone: onReprogramado)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                .strokeBorder(NxColors.border, lineWidth: 1)
        )
    }
}

// MARK: - Reordenar (PATCH me/activities/order)

/// Android `ReorderDialog`: motivo obligatorio de al menos 10 caracteres.
private struct ReorderReasonSheet: View {
    static let minimo = 10

    let move: PendingMove
    let openIds: [Int]
    /// nil = quedó en la cola sin conexión.
    let onSaved: (MyActivitiesResponse?, Int) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""
    @State private var saving = false
    @State private var error: String?

    private var trimmedCount: Int {
        reason.trimmingCharacters(in: .whitespacesAndNewlines).count
    }

    private var puedeGuardar: Bool { !saving && trimmedCount >= Self.minimo }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("CAMBIAR ORDEN")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(NxColors.muted)
                Text("«\(move.item.titulo ?? "")» pasa del lugar #\(move.from + 1) al #\(move.to + 1)")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(NxColors.fg)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("¿Por qué la harás en ese lugar?")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(error != nil ? NxColors.rojo : NxColors.fg2)
                TextField(
                    "Ej. El cliente la necesita antes de las 12; la otra puede esperar a la tarde.",
                    text: Binding(get: { reason }, set: { reason = String($0.prefix(500)) }),
                    axis: .vertical
                )
                .lineLimit(3...6)
                .font(.system(size: 15))
                .padding(12)
                .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                        .strokeBorder(error != nil ? NxColors.rojo : NxColors.borderStrong, lineWidth: 1)
                )
                .disabled(saving)
                // La duda se resuelve bajo el control, al capturar, no después del error.
                Text(error ?? "Mínimo \(Self.minimo) caracteres · queda guardado junto a la actividad.")
                    .font(.system(size: 11.5))
                    .foregroundStyle(error != nil ? NxColors.rojo : NxColors.muted)
            }
            HStack(spacing: 8) {
                Spacer()
                Button { dismiss() } label: {
                    Text("Cancelar")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(NxColors.fg2)
                        .padding(.horizontal, 10)
                        .frame(minHeight: NxMetrics.minTap)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(saving)
                Button { Task { await save() } } label: {
                    Text(saving ? "Guardando…" : "Guardar orden")
                }
                .buttonStyle(NxPillButtonStyle(fill: NxColors.brand, foreground: .white))
                .disabled(!puedeGuardar)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.surface)
        .presentationDetents([.medium, .large])
        .interactiveDismissDisabled(saving)
    }

    @MainActor
    private func save() async {
        let text = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.count >= Self.minimo else {
            error = "Escribe al menos \(Self.minimo) caracteres: por qué la harás en ese lugar."
            return
        }
        var ids = openIds
        guard ids.indices.contains(move.from) else { return }
        let moved = ids.remove(at: move.from)
        ids.insert(moved, at: min(max(0, move.to), ids.count))
        saving = true
        error = nil
        defer { saving = false }
        do {
            let next = try await CoreRepository.shared.reorderMyActivities(
                activityIds: ids,
                movedActivityId: moved,
                justificacion: String(text.prefix(500))
            )
            onSaved(next, moved)
            dismiss()
        } catch CoreError.queuedOffline {
            onSaved(nil, moved)
            dismiss()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo guardar el orden")
        }
    }
}
