import SwiftUI

/// Estados de la hora de comida (espejo de `ComidasPanel` web).
enum LunchUI {
    static func revision(_ record: LunchRecord?) -> (label: String, color: Color)? {
        guard let estado = record?.revisionEstado, !estado.isEmpty else { return nil }
        switch estado {
        case "APROBADA": return ("✅ Justificación aprobada", CorePalette.green)
        case "RECHAZADA": return ("❌ Justificación rechazada", CorePalette.red)
        default: return ("⏳ Por aprobar", CorePalette.orange)
        }
    }

    static func estado(_ record: LunchRecord?) -> (label: String, color: Color) {
        guard let record else { return ("Sin registrar", CorePalette.slate) }
        if record.isOut { return ("🍽️ En comida", CorePalette.blue) }
        if let minutos = record.minutos { return ("✓ Comió \(minutos) min", CorePalette.green) }
        return ("✓ Ya regresó", CorePalette.green)
    }

    static func hour(_ iso: String?) -> String {
        CoreFormat.time(iso) ?? "—"
    }

    /// «Tu jefe la aprobó: «…»» o «Ana aprobó.».
    static func reviewedLine(_ record: LunchRecord, mine: Bool) -> String {
        let name = CoreFormat.shortName(record.revisadoPor)
        let approved = record.revisionEstado == "APROBADA"
        var text: String
        if mine {
            text = "\(name.isEmpty ? "Tu jefe" : name) \(approved ? "la aprobó" : "la rechazó")"
        } else {
            text = "\(name.isEmpty ? "—" : name) \(approved ? "aprobó" : "rechazó")"
        }
        if let notas = record.revisionNotas, !notas.isEmpty {
            text += ": «\(notas)»"
        } else {
            text += "."
        }
        return text
    }
}

private struct LunchReasonRequest: Identifiable {
    let id = UUID()
    let checkIn: Bool
}

private struct LunchCameraRequest: Identifiable {
    let id = UUID()
    /// `true` = salida a comer; `false` = regreso.
    let checkIn: Bool
    let reason: String?
}

private struct LunchReviewRequest: Identifiable {
    let id = UUID()
    let row: LunchTeamRow
    let record: LunchRecord
    let decision: String
}

private struct LunchFilterOption: Identifiable {
    let key: String
    let label: String
    let count: Int?
    var id: String { key }
}

/// «Comidas» de Asistencias: tu salida y regreso con foto (todos menos Dirección)
/// y, para jefes, las comidas de su gente con aprobación de las que fueron a destiempo.
struct ComidasView: View {
    @ObservedObject private var session = SessionStore.shared
    @State private var myDay: LunchMyDay?
    @State private var myDayError: String?
    @State private var team: LunchTeamResponse?
    @State private var teamError: String?
    @State private var loading = true
    @State private var fecha = Date()
    @State private var filter = "todos"
    @State private var notice: String?
    @State private var now = Date()
    @State private var reasonRequest: LunchReasonRequest?
    @State private var pendingReason: String?
    @State private var pendingCheckIn = true
    @State private var camera: LunchCameraRequest?
    /// El API dijo que ya es a destiempo: la próxima vez se pide el motivo.
    @State private var forceReason = false
    @State private var review: LunchReviewRequest?
    @State private var photo: CorePhotoItem?

    private var isCeo: Bool { CoreOrg.isCeo(session.currentUser?.email) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let notice {
                    Text(notice)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(CorePalette.green)
                }

                if isCeo {
                    Text("Dirección supervisa las comidas: no registra la suya.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else if let myDay {
                    myDayCard(myDay)
                } else if let myDayError {
                    Text(myDayError).font(.footnote).foregroundStyle(CorePalette.red)
                } else if loading {
                    ProgressView("Cargando tu comida…").frame(maxWidth: .infinity)
                }

                if let team, team.hasTeam {
                    teamSection(team)
                } else if let teamError, isCeo {
                    Text(teamError).font(.footnote).foregroundStyle(CorePalette.red)
                }
            }
            .padding()
        }
        .navigationTitle("Comidas")
        .task { await load() }
        .task { await tickEvery30s() }
        .refreshable { await load() }
        .onChange(of: fecha) { _, _ in
            Task { await loadTeam() }
        }
        .sheet(item: $reasonRequest, onDismiss: openCameraAfterReason) { request in
            LunchReasonSheet(checkIn: request.checkIn, windowText: myDay?.windowText ?? "3:00 a 4:00 p.m.") { reason in
                pendingCheckIn = request.checkIn
                pendingReason = reason
            }
        }
        .fullScreenCover(item: $camera) { request in
            GeoPhotoCaptureView(
                title: request.checkIn ? "Tu foto de salida a comer" : "Tu foto de regreso",
                confirmLabel: "✓ Registrar con esta foto",
                requireLocation: false,
                onConfirm: { captured in await register(request, photo: captured) },
                onCancel: { camera = nil }
            )
        }
        .sheet(item: $review) { request in
            LunchReviewSheet(request: request) { message in
                notice = message
                Task { await loadTeam() }
            }
        }
        .fullScreenCover(item: $photo) { item in
            CorePhotoViewer(item: item)
        }
    }

    // MARK: Mi comida

    @ViewBuilder
    private func myDayCard(_ day: LunchMyDay) -> some View {
        switch day.siguiente {
        case "salida":
            checkInCard(day)
        case "regreso":
            if let record = day.registro {
                returnCard(day, record: record)
            }
        case "listo":
            if let record = day.registro {
                doneCard(record)
            }
        default:
            EmptyView()
        }
    }

    private func outsideWindow(_ day: LunchMyDay) -> Bool {
        guard let inicio = CoreFormat.date(day.ventana?.inicio),
              let fin = CoreFormat.date(day.ventana?.fin) else { return day.salidaADestiempo }
        return now < inicio || now > fin
    }

    private func lateReturn(_ day: LunchMyDay) -> Bool {
        guard let limite = CoreFormat.date(day.ventana?.regresoLimite) else { return day.regresoADestiempo }
        return now > limite
    }

    private func checkInCard(_ day: LunchMyDay) -> some View {
        let late = outsideWindow(day)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("🍽️ Tu hora de comida").font(.headline)
                    Text("Horario: \(day.windowText) · registra tu salida y tu regreso con foto.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 4)
                CoreChip(text: late ? "⏰ Fuera de horario" : "✓ Es tu horario", color: late ? CorePalette.orange : CorePalette.green)
            }
            if late {
                Text("Si sales a comer ahora tendrás que escribir por qué; tu jefe lo aprobará o rechazará.")
                    .font(.footnote)
                    .foregroundStyle(CorePalette.orange)
            }
            Button {
                startRegister(checkIn: true, late: late)
            } label: {
                Text("🍽️ Salir a comer").bold().frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
        }
        .coreCard()
    }

    private func returnCard(_ day: LunchMyDay, record: LunchRecord) -> some View {
        let late = lateReturn(day)
        let since = CoreFormat.date(record.checkinTime) ?? now
        let minutes = max(0, Int(now.timeIntervalSince(since) / 60))
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                LunchPhotoThumb(url: record.checkinPhotoUrl, title: "Tu foto de salida", time: record.checkinTime) { photo = $0 }
                VStack(alignment: .leading, spacing: 4) {
                    Text("🍽️ Estás en tu hora de comida").font(.headline)
                    Text("Saliste a las \(LunchUI.hour(record.checkinTime)) · llevas \(minutes) min")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    if let revision = LunchUI.revision(record) {
                        CoreChip(text: revision.label, color: revision.color)
                    }
                }
            }
            if late {
                Text("⏰ Ya pasó la hora de regreso (4:00 p.m.): al registrar tendrás que escribir por qué.")
                    .font(.footnote)
                    .foregroundStyle(CorePalette.orange)
            }
            Button {
                startRegister(checkIn: false, late: late)
            } label: {
                Text("↩️ Ya regresé").bold().frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
        }
        .coreCard()
    }

    private func doneCard(_ record: LunchRecord) -> some View {
        let revision = LunchUI.revision(record)
        let minutes = record.minutos.map { " · \($0) min" } ?? ""
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                LunchPhotoThumb(url: record.checkinPhotoUrl, title: "Tu foto de salida", time: record.checkinTime) { photo = $0 }
                LunchPhotoThumb(url: record.checkoutPhotoUrl, title: "Tu foto de regreso", time: record.checkoutTime) { photo = $0 }
                VStack(alignment: .leading, spacing: 4) {
                    Text("🍽️ Comida registrada").font(.headline)
                    Text("\(LunchUI.hour(record.checkinTime)) → \(LunchUI.hour(record.checkoutTime))\(minutes)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    CoreChip(text: revision?.label ?? "A tiempo", color: revision?.color ?? CorePalette.green)
                }
            }
            if let estado = record.revisionEstado, !estado.isEmpty, estado != "PENDIENTE" {
                Text(LunchUI.reviewedLine(record, mine: true))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .coreCard(highlight: record.revisionEstado == "RECHAZADA" ? CorePalette.red : nil)
    }

    private func startRegister(checkIn: Bool, late: Bool) {
        notice = nil
        if late || forceReason {
            reasonRequest = LunchReasonRequest(checkIn: checkIn)
        } else {
            camera = LunchCameraRequest(checkIn: checkIn, reason: nil)
        }
    }

    private func openCameraAfterReason() {
        guard let reason = pendingReason else { return }
        pendingReason = nil
        camera = LunchCameraRequest(checkIn: pendingCheckIn, reason: reason)
    }

    @MainActor
    private func register(_ request: LunchCameraRequest, photo captured: CapturedGeoPhoto) async -> String? {
        do {
            let sent: Bool
            if request.checkIn {
                sent = try await LunchCoreRepository.shared.checkIn(photoDataUrl: captured.dataUrl, justificacion: request.reason)
            } else {
                sent = try await LunchCoreRepository.shared.checkOut(photoDataUrl: captured.dataUrl, justificacion: request.reason)
            }
            camera = nil
            forceReason = false
            if !sent {
                notice = CoreError.queuedOffline.errorDescription
            } else if request.checkIn {
                notice = request.reason != nil
                    ? "Registraste tu salida a comer. Tu justificación quedó por aprobar."
                    : "Registraste tu salida a comer. ¡Buen provecho!"
            } else {
                notice = request.reason != nil
                    ? "Registraste tu regreso. Tu justificación quedó por aprobar."
                    : "Registraste tu regreso de comer."
            }
            await load()
            return nil
        } catch {
            let message = error.toUserMessage(fallback: "No se pudo registrar tu comida")
            let lower = message.lowercased()
            // La API decide con su hora: si dice que ya es a destiempo, se pide el motivo.
            if request.reason == nil && (lower.contains("horario") || lower.contains("hora de regreso") || lower.contains("por qué")) {
                forceReason = true
                return message + " Cancela y vuelve a intentarlo: te pediremos el motivo."
            }
            return message
        }
    }

    // MARK: Equipo

    private func filterOptions(_ team: LunchTeamResponse) -> [LunchFilterOption] {
        let resumen = team.resumen
        return [
            LunchFilterOption(key: "todos", label: "Todos", count: resumen?.total),
            LunchFilterOption(key: "pendientes", label: "Por aprobar", count: resumen?.pendientes),
            LunchFilterOption(key: "destiempo", label: "A destiempo", count: resumen?.aDestiempo),
            LunchFilterOption(key: "comiendo", label: "En comida", count: resumen?.enComida),
            LunchFilterOption(key: "sin", label: "Sin registrar", count: resumen.map { $0.total - $0.registraron }),
        ]
    }

    private func filteredRows(_ team: LunchTeamResponse) -> [LunchTeamRow] {
        switch filter {
        case "pendientes": return team.filas.filter { $0.registro?.revisionEstado == "PENDIENTE" }
        case "destiempo": return team.filas.filter { !($0.registro?.revisionEstado ?? "").isEmpty }
        case "comiendo": return team.filas.filter { $0.registro?.isOut == true }
        case "sin": return team.filas.filter { $0.registro == nil }
        default: return team.filas
        }
    }

    private func teamSection(_ team: LunchTeamResponse) -> some View {
        let rows = filteredRows(team)
        return VStack(alignment: .leading, spacing: 12) {
            Text("Comidas de tu equipo").font(.headline)
            Text("Aprueba o rechaza las que fueron fuera de 3:00 a 4:00 p.m.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            DatePicker("Día", selection: $fecha, in: ...Date(), displayedComponents: .date)
                .font(.subheadline)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(filterOptions(team)) { option in
                        Button {
                            filter = option.key
                        } label: {
                            Text(option.count.map { "\(option.label) \($0)" } ?? option.label)
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .foregroundStyle(filter == option.key ? Color.white : Color.primary)
                                .background(
                                    filter == option.key ? Color.accentColor : Color(.secondarySystemGroupedBackground),
                                    in: Capsule()
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            if let teamError {
                Text(teamError).font(.footnote).foregroundStyle(CorePalette.red)
            }
            if rows.isEmpty {
                Text("Nadie en este filtro.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            ForEach(rows) { row in
                LunchTeamRowCard(
                    row: row,
                    onReview: { record, decision in
                        review = LunchReviewRequest(row: row, record: record, decision: decision)
                    },
                    onPhoto: { photo = $0 }
                )
            }
        }
    }

    // MARK: Carga

    @MainActor
    private func load() async {
        loading = true
        defer { loading = false }
        now = Date()
        if !isCeo {
            do {
                myDay = try await LunchCoreRepository.shared.myDay()
                myDayError = nil
            } catch {
                myDayError = error.toUserMessage(fallback: "No se pudo cargar tu comida")
            }
        }
        await loadTeam()
    }

    @MainActor
    private func loadTeam() async {
        do {
            team = try await LunchCoreRepository.shared.team(fecha: FieldOpsDayRepository.dayString(fecha))
            teamError = nil
        } catch {
            teamError = error.toUserMessage(fallback: "No se pudieron cargar las comidas del equipo")
        }
    }

    @MainActor
    private func tickEvery30s() async {
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 30_000_000_000)
            if Task.isCancelled { break }
            now = Date()
        }
    }
}

// MARK: - Piezas

private struct LunchPhotoThumb: View {
    let url: String?
    let title: String
    let time: String?
    let onPhoto: (CorePhotoItem) -> Void

    var body: some View {
        if let url, !url.isEmpty {
            Button {
                onPhoto(CorePhotoItem(title: title, url: url, time: time))
            } label: {
                AuthenticatedImage(url: url)
                    .frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Ver \(title)")
        }
    }
}

private struct LunchTeamRowCard: View {
    let row: LunchTeamRow
    let onReview: (LunchRecord, String) -> Void
    let onPhoto: (CorePhotoItem) -> Void

    private var short: String { CoreFormat.shortName(row.nombre) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            header
            if let record = row.registro {
                recordDetail(record)
            }
        }
        .coreCard(highlight: row.registro?.revisionEstado == "PENDIENTE" ? CorePalette.orange : nil)
    }

    private var header: some View {
        let estado = LunchUI.estado(row.registro)
        return HStack(alignment: .top, spacing: 10) {
            CoreAvatar(name: row.nombre, url: row.avatarUrl, size: 40)
            VStack(alignment: .leading, spacing: 4) {
                Text(row.nombre).font(.subheadline.weight(.bold))
                if let puesto = row.puesto, !puesto.isEmpty {
                    Text(puesto).font(.caption).foregroundStyle(.secondary)
                }
                CoreFlowLayout {
                    CoreChip(text: estado.label, color: estado.color)
                    if let revision = LunchUI.revision(row.registro) {
                        CoreChip(text: revision.label, color: revision.color)
                    }
                }
            }
        }
    }

    private func recordDetail(_ record: LunchRecord) -> some View {
        let back = record.isOut ? "en comida" : LunchUI.hour(record.checkoutTime)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                LunchPhotoThumb(url: record.checkinPhotoUrl, title: "\(short) · salida", time: record.checkinTime, onPhoto: onPhoto)
                LunchPhotoThumb(url: record.checkoutPhotoUrl, title: "\(short) · regreso", time: record.checkoutTime, onPhoto: onPhoto)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(LunchUI.hour(record.checkinTime)) → \(back)")
                        .font(.caption.weight(.semibold))
                    if let minutos = record.minutos {
                        Text("\(minutos) min").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
            if let text = record.checkinJustificacion, !text.isEmpty {
                Text("💬 Salida a las \(LunchUI.hour(record.checkinTime)): «\(text)»").font(.caption)
            }
            if let text = record.checkoutJustificacion, !text.isEmpty {
                Text("💬 Regreso a las \(LunchUI.hour(record.checkoutTime)): «\(text)»").font(.caption)
            }
            if let estado = record.revisionEstado, !estado.isEmpty, estado != "PENDIENTE" {
                Text(LunchUI.reviewedLine(record, mine: false))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if row.canReview {
                reviewActions(record)
            }
        }
    }

    @ViewBuilder
    private func reviewActions(_ record: LunchRecord) -> some View {
        if record.revisionEstado == "PENDIENTE" {
            HStack(spacing: 8) {
                Button("✅ Aprobar") { onReview(record, "aprobar") }
                    .buttonStyle(.borderedProminent)
                    .tint(CorePalette.green)
                Button("❌ Rechazar") { onReview(record, "rechazar") }
                    .buttonStyle(.borderedProminent)
                    .tint(CorePalette.red)
            }
            .font(.subheadline)
        } else {
            Button("Cambiar decisión") {
                onReview(record, record.revisionEstado == "APROBADA" ? "rechazar" : "aprobar")
            }
            .buttonStyle(.bordered)
            .font(.subheadline)
        }
    }
}

private struct LunchReasonSheet: View {
    let checkIn: Bool
    let windowText: String
    let onContinue: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(checkIn
                        ? "Estás fuera de tu horario de comida (\(windowText)). Escribe por qué; tu jefe lo aprobará o rechazará."
                        : "Ya pasó la hora de regreso (4:00 p.m.). Escribe por qué; tu jefe lo aprobará o rechazará.")
                        .font(.footnote)
                }
                Section("¿Por qué?") {
                    TextField("Motivo", text: $reason, axis: .vertical)
                        .lineLimit(2...6)
                }
                if let error {
                    Section {
                        Text(error).foregroundStyle(CorePalette.red)
                    }
                }
            }
            .navigationTitle(checkIn ? "Salir a comer" : "Ya regresé")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Tomar foto") { continueTapped() }
                }
            }
        }
    }

    private func continueTapped() {
        let trimmed = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= LunchCoreRepository.minReason else {
            error = "Escribe por qué (al menos 5 letras): tu jefe lo revisará."
            return
        }
        onContinue(trimmed)
        dismiss()
    }
}

private struct LunchReviewSheet: View {
    let request: LunchReviewRequest
    let onDone: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var decision = "aprobar"
    @State private var notes = ""
    @State private var saving = false
    @State private var error: String?
    @State private var didSetup = false

    private var short: String { CoreFormat.shortName(request.row.nombre) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Decisión", selection: $decision) {
                        Text("✅ Aprobar").tag("aprobar")
                        Text("❌ Rechazar").tag("rechazar")
                    }
                    .pickerStyle(.segmented)
                } footer: {
                    Text("Solo se revisan las comidas fuera de 3:00 a 4:00 p.m.")
                }
                Section("Lo que escribió") {
                    if let text = request.record.checkinJustificacion, !text.isEmpty {
                        Text("💬 Salida a las \(LunchUI.hour(request.record.checkinTime)): «\(text)»").font(.footnote)
                    }
                    if let text = request.record.checkoutJustificacion, !text.isEmpty {
                        Text("💬 Regreso a las \(LunchUI.hour(request.record.checkoutTime)): «\(text)»").font(.footnote)
                    }
                    if (request.record.checkinJustificacion ?? "").isEmpty && (request.record.checkoutJustificacion ?? "").isEmpty {
                        Text("Sin justificación escrita.").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                Section {
                    TextField(decision == "rechazar" ? "Por qué la rechazas" : "Notas (opcional)", text: $notes, axis: .vertical)
                        .lineLimit(2...6)
                } header: {
                    Text("Notas")
                } footer: {
                    if decision == "rechazar" {
                        Text("Obligatorias al rechazar (al menos 5 letras).")
                    }
                }
                if let error {
                    Section {
                        Text(error).foregroundStyle(CorePalette.red)
                    }
                }
            }
            .navigationTitle("Comida de \(short)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Guardando…" : "Guardar") {
                        Task { await submit() }
                    }
                    .disabled(saving)
                }
            }
            .interactiveDismissDisabled(saving)
            .onAppear {
                guard !didSetup else { return }
                didSetup = true
                decision = request.decision == "rechazar" ? "rechazar" : "aprobar"
            }
        }
    }

    @MainActor
    private func submit() async {
        let trimmed = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        if decision == "rechazar" && trimmed.count < LunchCoreRepository.minReason {
            error = "Escribe por qué la rechazas (al menos 5 letras)."
            return
        }
        saving = true
        error = nil
        defer { saving = false }
        do {
            try await LunchCoreRepository.shared.review(id: request.record.id, decision: decision, notas: trimmed)
            onDone(decision == "aprobar"
                ? "Aprobaste la comida a destiempo de \(short)."
                : "Rechazaste la comida a destiempo de \(short).")
            dismiss()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo guardar la revisión")
        }
    }
}
