import SwiftUI

private let coreMinReason = 10

private struct PendingMove: Identifiable {
    let id = UUID()
    let item: MyActivityItem
    let from: Int
    let to: Int
}

/// Mis actividades (GET me/activities), espejo de `MisActividadesView` web:
/// cola numerada, «Empieza por aquí», reordenar con justificación (encargados),
/// auto-asignarse, repartir despachos, seguimiento y hechas hoy.
struct MisActividadesView: View {
    @ObservedObject private var session = SessionStore.shared
    @State private var data: MyActivitiesResponse?
    @State private var loading = true
    @State private var error: String?
    @State private var pendingMove: PendingMove?
    @State private var highlightId: Int?
    @State private var showDone = false
    @State private var showSelfAssign = false
    @State private var despacho: DespachoTarget?
    @State private var reprogramar: ReprogramarTarget?
    @State private var notice: String?
    @State private var iniciandoId: Int?

    private var open: [MyActivityItem] { data?.open ?? [] }
    private var done: [MyActivityItem] { data?.doneToday ?? [] }
    private var seguimiento: [MyActivityItem] { data?.seguimiento ?? [] }
    private var canReorder: Bool { (data?.canReorder ?? false) && open.count > 1 }
    private var firstName: String {
        (session.currentUser?.nombre ?? "").split(separator: " ").first.map { String($0) } ?? ""
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                header
                statsRow
                if let error {
                    Text(error).font(.footnote).foregroundStyle(CorePalette.red)
                }
                if let notice {
                    NxIconText(systemName: "checkmark.circle.fill", text: notice).font(.footnote).foregroundStyle(CorePalette.green)
                }
                orderNote
                if !loading && open.isEmpty && error == nil {
                    emptyState
                }
                ForEach(Array(open.enumerated()), id: \.element.id) { index, item in
                    openCard(item, index: index)
                }
                if !seguimiento.isEmpty {
                    seguimientoSection
                }
                if !done.isEmpty {
                    doneSection
                }
            }
            .padding()
        }
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $pendingMove) { move in
            ReorderReasonSheet(move: move, openIds: open.map(\.id)) { next, movedId in
                data = next
                highlightId = movedId
                notice = "Orden guardado."
            }
        }
        .sheet(isPresented: $showSelfAssign) {
            CoreSelfAssignSheet { newId in
                highlightId = newId
                notice = "Actividad creada a tu nombre."
                Task { await load() }
            }
        }
        .sheet(item: $despacho) { target in
            DespachoSheet(target: target) { message in
                notice = message
                Task { await load() }
            }
        }
        .sheet(item: $reprogramar) { target in
            ReprogramarSheet(target: target) { message in
                notice = message
                Task { await load() }
            }
        }
    }

    // MARK: Encabezado

    private var subtitle: String {
        if loading && data == nil { return "Cargando tus actividades…" }
        return open.isEmpty ? "No tienes pendientes por ahora." : "Tienes \(open.count) por hacer. Empieza por la #1."
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("MIS ACTIVIDADES")
                .font(.caption2.weight(.heavy))
                .foregroundStyle(.secondary)
            Text(firstName.isEmpty ? "Tu día" : "Hola, \(firstName)")
                .font(.title2.weight(.heavy))
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                Button {
                    Task { await load() }
                } label: {
                    Label("Actualizar", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                if data?.canSelfAssign == true {
                    Button {
                        showSelfAssign = true
                    } label: {
                        Label("Auto-asignarme", systemImage: "plus")
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .font(.subheadline)
        }
        .coreCard()
    }

    private var statsRow: some View {
        let urgentes = open.filter { CoreStatusUI.priority($0.prioridad).label == "Urgente" }.count
        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 10)], spacing: 10) {
            CoreStatCard(label: "Por hacer", value: open.count)
            CoreStatCard(label: "Urgentes", value: urgentes, color: urgentes > 0 ? CorePalette.red : nil)
            CoreStatCard(label: "Hechas hoy", value: done.count, color: done.isEmpty ? nil : CorePalette.green)
            if !seguimiento.isEmpty {
                CoreStatCard(label: "En seguimiento", value: seguimiento.count)
            }
        }
    }

    @ViewBuilder
    private var orderNote: some View {
        if canReorder {
            (Text("Tú decides el orden. ").bold()
                + Text("Usa «Subir» y «Bajar». Cada cambio te pide un motivo corto de por qué la harás en ese lugar."))
                .font(.footnote)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.accentColor.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
        } else if !loading && open.count > 1 && data?.canReorder != true {
            Text("El orden sale de la prioridad y la fecha. Si algo no cuadra, avísale a tu encargado.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            NxIconBadge(systemName: "checkmark.circle", tint: CorePalette.green, size: 56, circle: true)
            Text("Todo al día").font(.headline)
            Text("Cuando te asignen algo aparecerá aquí.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            if data?.canSelfAssign == true {
                Button { showSelfAssign = true } label: {
                    Label("Auto-asignarme una actividad", systemImage: "plus")
                }
                    .buttonStyle(.borderedProminent)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
    }

    // MARK: Cola

    private func assignedLabel(_ item: MyActivityItem) -> String {
        if item.autoAsignada == true { return "Auto-asignada" }
        if let by = item.asignadaPor?.nombre, !by.isEmpty { return "De \(CoreFormat.shortName(by))" }
        return "Asignada"
    }

    private func openCard(_ item: MyActivityItem, index: Int) -> some View {
        let priority = CoreStatusUI.priority(item.prioridad)
        let estatus = CoreStatusUI.estatus(item.estatus)
        let first = index == 0
        let lugar = item.cliente ?? item.proyecto ?? ""
        let whenText = CoreFormat.when(item.fechaInicio ?? item.fechaMaxima) ?? "Sin fecha"
        let estimate = CoreFormat.minutes(item.tiempoEstimadoMin)
        let cap = CoreFormat.minutes(item.tiempoMaximoMin)
        let timeText = estimate.map { $0 + (cap.map { " · tope " + $0 } ?? "") }
        let highlight: Color? = highlightId == item.id ? Color.accentColor : (first ? Color.accentColor.opacity(0.4) : nil)

        return HStack(alignment: .top, spacing: 12) {
            Text("\(index + 1)")
                .font(.headline.weight(.heavy))
                .frame(width: 38, height: 38)
                .foregroundStyle(first ? Color.white : Color.accentColor)
                .background(first ? Color.accentColor : Color.accentColor.opacity(0.12), in: Circle())

            VStack(alignment: .leading, spacing: 8) {
                if first {
                    Text("EMPIEZA POR AQUÍ")
                        .font(.caption2.weight(.heavy))
                        .foregroundStyle(Color.accentColor)
                }
                Text(item.displayTitle).font(.headline)
                Text("Folio \(item.folio)").font(.caption).foregroundStyle(.secondary)

                CoreFlowLayout {
                    if item.porRepartir == true {
                        CoreChip(icon: "paperplane", text: "Te toca repartirla", color: CorePalette.orange)
                    }
                    CoreChip(text: estatus.label, color: estatus.color)
                    CoreChip(icon: "flag.fill", text: priority.label, color: priority.color)
                    CoreChip(icon: CoreStatusUI.kindSymbol(item.coreKind), text: CoreStatusUI.kind(item.coreKind, ticketTypeCustom: item.ticketTypeCustom))
                    CoreChip(icon: item.autoAsignada == true ? "person.crop.circle.badge.checkmark" : "person", text: assignedLabel(item))
                }

                VStack(alignment: .leading, spacing: 3) {
                    NxIconText(systemName: "calendar", text: whenText)
                    if let timeText {
                        NxIconText(systemName: "timer", text: timeText)
                    }
                    if !lugar.isEmpty {
                        NxIconText(systemName: "mappin.and.ellipse", text: lugar)
                    }
                }
                .font(.footnote)
                .foregroundStyle(.secondary)

                if let indicaciones = item.indicaciones, !indicaciones.isEmpty {
                    Text(indicaciones)
                        .font(.footnote)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                }
                if let why = item.ordenJustificacion, !why.isEmpty {
                    (Text(Image(systemName: "text.bubble")) + Text(" Por qué va aquí: ").bold() + Text(why))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                HStack(spacing: 8) {
                    // Quien la recibe no la acepta ni la rechaza: únicamente la inicia.
                    if item.puedeIniciar {
                        Button(iniciandoId == item.id ? "Iniciando…" : MyActivityItem.accionIniciar) {
                            Task { await iniciar(item) }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(CorePalette.green)
                        .disabled(iniciandoId != nil)
                    }
                    if item.porRepartir == true {
                        Button("Repartir →") {
                            despacho = DespachoTarget(
                                id: item.id,
                                title: "\(item.folio) · \(item.displayTitle)",
                                indicaciones: item.indicaciones
                            )
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    NavigationLink {
                        ActivityCoreDetailView(activityId: item.id)
                    } label: {
                        Text("Abrir →")
                    }
                    .buttonStyle(.bordered)
                }
                .font(.subheadline)

                if canReorder {
                    HStack(spacing: 6) {
                        Button("↑ Subir") { askMove(index, index - 1) }
                            .disabled(index == 0)
                        Button("↓ Bajar") { askMove(index, index + 1) }
                            .disabled(index == open.count - 1)
                        if index > 1 {
                            Button("⤒ Hacerla primero") { askMove(index, 0) }
                        }
                    }
                    .buttonStyle(.bordered)
                    .font(.caption)
                }
            }
        }
        .coreCard(highlight: highlight)
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 2)
                .fill(priority.color)
                .frame(width: 4)
                .padding(.vertical, 14)
        }
    }

    /// Guarda la hora real de inicio; lo siguiente es la foto de entrada en «Abrir →».
    @MainActor
    private func iniciar(_ item: MyActivityItem) async {
        iniciandoId = item.id
        defer { iniciandoId = nil }
        do {
            try await CoreRepository.shared.iniciarActividad(activityId: item.id)
            error = nil
            notice = "Actividad iniciada. Sigue con la foto de entrada en «Abrir»."
            await load()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo iniciar la actividad")
        }
    }

    private func askMove(_ from: Int, _ to: Int) {
        guard open.indices.contains(from), open.indices.contains(to), from != to else { return }
        pendingMove = PendingMove(item: open[from], from: from, to: to)
    }

    // MARK: Seguimiento

    private var seguimientoSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            NxIconText(systemName: "eye", text: "En seguimiento (\(seguimiento.count))", tint: NxBrand.primary)
                .font(.headline)
            Text("Ya las repartiste: aquí ves a quién se las pasaste y cómo va quien las ejecuta.")
                .font(.caption)
                .foregroundStyle(.secondary)
            ForEach(seguimiento) { item in
                seguimientoCard(item)
            }
        }
    }

    private func seguimientoCard(_ item: MyActivityItem) -> some View {
        let estatus = CoreStatusUI.estatus(item.estatus)
        let passed = item.passedTo
        let executor = passed.last(where: { ($0.rol ?? "") != "LEAD" })
        let avance = executor.map { CoreStatusUI.avance($0.evidenceStatus) }
        let chain = passed.map { CoreFormat.shortName($0.nombre) }.joined(separator: " → ")
        let firstAt = passed.first.flatMap { CoreFormat.when($0.at) }
        let sentText = "Enviada a " + chain + (firstAt.map { " · " + $0 } ?? "")

        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.displayTitle).font(.subheadline.weight(.bold))
                    Text("Folio \(item.folio)").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                NavigationLink {
                    ActivityCoreDetailView(activityId: item.id, initialTab: "historial")
                } label: {
                    Text("Ver registro →").font(.caption)
                }
                .buttonStyle(.bordered)
            }
            CoreFlowLayout {
                CoreChip(text: estatus.label, color: estatus.color)
                CoreChip(icon: CoreStatusUI.kindSymbol(item.coreKind), text: CoreStatusUI.kind(item.coreKind, ticketTypeCustom: item.ticketTypeCustom))
                if let avance, let executor {
                    CoreChip(text: "\(CoreFormat.shortName(executor.nombre)): \(avance.label)", color: avance.color)
                } else {
                    CoreChip(text: "Falta que la asignen", color: CorePalette.orange)
                }
            }
            NxIconText(systemName: "paperplane", text: sentText)
                .font(.footnote)
                .foregroundStyle(.secondary)
            if let change = item.ultimaReprogramacion {
                let by = CoreFormat.shortName(change.por)
                NxIconText(systemName: "calendar.badge.clock", text: "Reprogramada por \(by.isEmpty ? "alguien" : by) · \(CoreFormat.when(change.at) ?? "")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            HStack {
                NxIconText(systemName: "calendar", text: "Programada: \(CoreFormat.when(item.fechaInicio) ?? "Sin fecha")")
                    .font(.caption)
                Spacer()
                Button("Cambiar fecha y hora") {
                    reprogramar = ReprogramarTarget(id: item.id, title: item.displayTitle, fechaActual: item.fechaInicio)
                }
                .buttonStyle(.bordered)
                .font(.caption)
            }
        }
        .coreCard()
    }

    // MARK: Hechas hoy

    private var doneSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation { showDone.toggle() }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.circle.fill")
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(CorePalette.green)
                    Text("Hechas hoy (\(done.count))")
                    Image(systemName: showDone ? "chevron.up" : "chevron.down")
                        .imageScale(.small)
                }
                .font(.subheadline.weight(.semibold))
            }
            .buttonStyle(.bordered)

            if showDone {
                ForEach(done) { item in
                    NavigationLink {
                        ActivityCoreDetailView(activityId: item.id)
                    } label: {
                        HStack {
                            NxIconText(systemName: "checkmark", text: item.displayTitle, tint: CorePalette.green)
                                .lineLimit(1)
                            Spacer()
                            Text(CoreFormat.time(item.fechaFinalizacion) ?? (item.estatus ?? ""))
                                .foregroundStyle(.secondary)
                        }
                        .font(.footnote)
                        .coreCard()
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @MainActor
    private func load() async {
        do {
            data = try await CoreRepository.shared.myActivities()
            error = nil
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudieron cargar tus actividades")
        }
        loading = false
    }
}

// MARK: - Reordenar (PATCH me/activities/order)

private struct ReorderReasonSheet: View {
    let move: PendingMove
    let openIds: [Int]
    let onSaved: (MyActivitiesResponse, Int) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""
    @State private var saving = false
    @State private var error: String?

    private var trimmedCount: Int {
        reason.trimmingCharacters(in: .whitespacesAndNewlines).count
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("«\(move.item.displayTitle)» pasa del lugar #\(move.from + 1) al #\(move.to + 1)")
                        .font(.headline)
                }
                Section {
                    TextField(
                        "Ej. El cliente la necesita antes de las 12; la otra puede esperar a la tarde.",
                        text: $reason,
                        axis: .vertical
                    )
                    .lineLimit(3...6)
                } header: {
                    Text("¿Por qué la harás en ese lugar? *")
                } footer: {
                    Text("\(min(trimmedCount, coreMinReason))/\(coreMinReason) caracteres mínimo · queda guardado junto a la actividad.")
                }
                if let error {
                    Section {
                        Text(error).foregroundStyle(CorePalette.red)
                    }
                }
            }
            .navigationTitle("Cambiar orden")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Guardando…" : "Guardar orden") { Task { await save() } }
                        .disabled(saving || trimmedCount < coreMinReason)
                }
            }
        }
    }

    @MainActor
    private func save() async {
        let text = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.count >= coreMinReason else {
            error = "Escribe al menos \(coreMinReason) caracteres: por qué la harás en ese lugar."
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
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo guardar el orden")
        }
    }
}
