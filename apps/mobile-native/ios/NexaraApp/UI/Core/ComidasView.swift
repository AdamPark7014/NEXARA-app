import SwiftUI
import UIKit

/// Estados de la hora de comida (espejo de `ComidasPanel` web).
enum LunchUI {
    /// `icon` es un SF Symbol para `CoreChip(icon:)`.
    static func revision(_ record: LunchRecord?) -> (label: String, icon: String, color: Color)? {
        guard let estado = record?.revisionEstado, !estado.isEmpty else { return nil }
        switch estado {
        case "APROBADA": return ("Justificación aprobada", "checkmark.circle", CorePalette.green)
        case "RECHAZADA": return ("Justificación rechazada", "xmark.circle", CorePalette.red)
        default: return ("Por aprobar", "hourglass", CorePalette.orange)
        }
    }

    static func estado(_ record: LunchRecord?) -> (label: String, icon: String, color: Color) {
        guard let record else { return ("Sin registrar", "minus.circle", CorePalette.slate) }
        if record.isOut { return ("En comida", "fork.knife", CorePalette.blue) }
        if let minutos = record.minutos { return ("Comió \(minutos) min", "checkmark", CorePalette.green) }
        return ("Ya regresó", "checkmark", CorePalette.green)
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

private struct LunchCameraRequest: Identifiable {
    let id = UUID()
    /// `true` = salida a comer; `false` = regreso.
    let checkIn: Bool
    /// El horario ya dice que va a destiempo: se toma la foto igual y el motivo
    /// se escribe después, con la foto ya guardada.
    let askReason: Bool
}

/// Foto ya tomada que espera el motivo antes de mandarse.
private struct LunchPendingPhoto: Identifiable {
    let id = UUID()
    let checkIn: Bool
    let photo: CapturedGeoPhoto
    /// Lo que contestó el API cuando fue él quien dijo que era a destiempo.
    let serverMessage: String?
}

private enum LunchRegisterOutcome {
    case done
    case needsReason(String)
    case failed(String)
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
    /// Día que impone la pantalla de Asistencias cuando esta vista va dentro de
    /// su pestaña «Comidas»; `nil` cuando se abre sola (aviso o enlace).
    let externalFecha: Date?

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
    @State private var camera: LunchCameraRequest?
    @State private var pendingPhoto: LunchPendingPhoto?
    @State private var reasonRequest: LunchPendingPhoto?
    /// El API dijo que ya es a destiempo: la próxima vez se pide el motivo.
    @State private var forceReason = false
    @State private var review: LunchReviewRequest?
    @State private var photo: CorePhotoItem?
    /// `mi-dia.ahora` menos el reloj del teléfono.
    @State private var clockOffset: TimeInterval = 0

    init(fecha: Date? = nil) {
        externalFecha = fecha
        _fecha = State(initialValue: fecha ?? Date())
    }

    private var isCeo: Bool { CoreOrg.isCeo(session.currentUser?.email) }
    private var effectiveFecha: Date { externalFecha ?? fecha }
    private var isToday: Bool { AttendanceClock.isToday(effectiveFecha) }

    /// Hora del **servidor**: el reloj del teléfono puede ir adelantado y una
    /// comida a tiempo acababa pidiendo justificación por esos minutos.
    private func serverNow() -> Date { Date().addingTimeInterval(clockOffset) }

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
                } else if !isToday {
                    Text("Tu comida de ese día no se puede cambiar.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else if let myDay, myDay.debeRegistrar {
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
        .onChange(of: externalFecha) { _, _ in
            Task { await load() }
        }
        .fullScreenCover(item: $camera, onDismiss: openReasonAfterCamera) { request in
            GeoPhotoCaptureView(
                title: request.checkIn ? "Tu foto de salida a comer" : "Tu foto de regreso",
                confirmLabel: request.askReason ? "Continuar" : "Registrar con esta foto",
                requireLocation: false,
                onConfirm: { captured in
                    if request.askReason {
                        pendingPhoto = LunchPendingPhoto(checkIn: request.checkIn, photo: captured, serverMessage: nil)
                        camera = nil
                        return nil
                    }
                    switch await register(checkIn: request.checkIn, photo: captured, reason: nil) {
                    case .done:
                        camera = nil
                        return nil
                    case .needsReason(let message):
                        // El API decidió con su reloj: la foto no se tira.
                        pendingPhoto = LunchPendingPhoto(checkIn: request.checkIn, photo: captured, serverMessage: message)
                        camera = nil
                        return nil
                    case .failed(let message):
                        return message
                    }
                },
                onCancel: { camera = nil }
            )
        }
        .sheet(item: $reasonRequest) { pending in
            LunchReasonSheet(pending: pending, windowText: myDay?.windowText ?? "3:00 a 4:00 p.m.") { reason in
                await register(checkIn: pending.checkIn, photo: pending.photo, reason: reason)
            }
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
                    NxIconText(systemName: "fork.knife", text: "Tu hora de comida", tint: NxBrand.primary)
                        .font(.headline)
                    Text("Horario: \(day.windowText) · registra tu salida y tu regreso con foto.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 4)
                CoreChip(
                    icon: late ? "clock.badge.exclamationmark" : "checkmark.circle",
                    text: late ? "Fuera de horario" : "Es tu horario",
                    color: late ? CorePalette.orange : CorePalette.green
                )
            }
            if late {
                Text("Si sales a comer ahora tendrás que escribir por qué; tu jefe lo aprobará o rechazará.")
                    .font(.footnote)
                    .foregroundStyle(CorePalette.orange)
            }
            Button {
                startRegister(checkIn: true, late: late)
            } label: {
                Label("Salir a comer", systemImage: "fork.knife").bold().frame(maxWidth: .infinity)
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
                    NxIconText(systemName: "fork.knife", text: "Estás en tu hora de comida", tint: NxBrand.primary)
                        .font(.headline)
                    Text("Saliste a las \(LunchUI.hour(record.checkinTime)) · llevas \(minutes) min")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    if let revision = LunchUI.revision(record) {
                        CoreChip(icon: revision.icon, text: revision.label, color: revision.color)
                    }
                }
            }
            if late {
                NxIconText(systemName: "clock.badge.exclamationmark", text: "Ya pasó la hora de regreso (4:00 p.m.): al registrar tendrás que escribir por qué.")
                    .font(.footnote)
                    .foregroundStyle(CorePalette.orange)
            }
            Button {
                startRegister(checkIn: false, late: late)
            } label: {
                Label("Ya regresé", systemImage: "arrow.uturn.backward").bold().frame(maxWidth: .infinity)
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
                    NxIconText(systemName: "fork.knife", text: "Comida registrada", tint: NxBrand.primary)
                        .font(.headline)
                    Text("\(LunchUI.hour(record.checkinTime)) → \(LunchUI.hour(record.checkoutTime))\(minutes)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    CoreChip(
                        icon: revision?.icon ?? "checkmark.circle",
                        text: revision?.label ?? "A tiempo",
                        color: revision?.color ?? CorePalette.green
                    )
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

    /// La foto va primero: pedir el motivo antes obligaba a escribirlo, salir a
    /// la cámara y volver, y un tropiezo en medio perdía las dos cosas.
    private func startRegister(checkIn: Bool, late: Bool) {
        notice = nil
        camera = LunchCameraRequest(checkIn: checkIn, askReason: late || forceReason)
    }

    /// La cámara ya se cerró: si la foto quedó esperando motivo, se pide ahora.
    private func openReasonAfterCamera() {
        guard let pending = pendingPhoto else { return }
        pendingPhoto = nil
        reasonRequest = pending
    }

    @MainActor
    private func register(checkIn: Bool, photo captured: CapturedGeoPhoto, reason: String?) async -> LunchRegisterOutcome {
        do {
            let sent: Bool
            if checkIn {
                sent = try await LunchCoreRepository.shared.checkIn(
                    photoDataUrl: captured.dataUrl,
                    justificacion: reason,
                    at: serverNow()
                )
            } else {
                sent = try await LunchCoreRepository.shared.checkOut(
                    photoDataUrl: captured.dataUrl,
                    justificacion: reason,
                    at: serverNow()
                )
            }
            forceReason = false
            if !sent {
                notice = CoreError.queuedOffline.errorDescription
            } else if checkIn {
                notice = reason != nil
                    ? "Registraste tu salida a comer. Tu justificación quedó por aprobar."
                    : "Registraste tu salida a comer. ¡Buen provecho!"
            } else {
                notice = reason != nil
                    ? "Registraste tu regreso. Tu justificación quedó por aprobar."
                    : "Registraste tu regreso de comer."
            }
            await load()
            return .done
        } catch {
            let message = error.toUserMessage(fallback: "No se pudo registrar tu comida")
            let lower = message.lowercased()
            // La API decide con su hora: si dice que ya es a destiempo, se
            // conserva la foto y solo se pide el motivo.
            if reason == nil && (lower.contains("horario") || lower.contains("hora de regreso") || lower.contains("por qué")) {
                forceReason = true
                return .needsReason(message)
            }
            return .failed(message)
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
            if let pendientes = team.resumen?.pendientes, pendientes > 0 {
                NxIconText(systemName: "hourglass", text: "Tienes \(pendientes) comida\(pendientes == 1 ? "" : "s") a destiempo por aprobar.")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(CorePalette.orange)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10)
                    .background(CorePalette.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
            }
            // Dentro de Asistencias manda el día de esa pantalla; suelta, el suyo.
            if externalFecha == nil {
                DatePicker("Día", selection: $fecha, in: ...Date(), displayedComponents: .date)
                    .font(.subheadline)
            }
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
        now = serverNow()
        // `mi-dia` solo existe para hoy: un día pasado ya no se registra.
        if !isCeo && isToday {
            do {
                let day = try await LunchCoreRepository.shared.myDay()
                myDay = day
                if let ahora = CoreFormat.date(day.ahora) {
                    clockOffset = ahora.timeIntervalSince(Date())
                    now = serverNow()
                }
                myDayError = nil
            } catch {
                myDayError = error.toUserMessage(fallback: "No se pudo cargar tu comida")
            }
        } else {
            myDay = nil
        }
        await loadTeam()
    }

    @MainActor
    private func loadTeam() async {
        do {
            team = try await LunchCoreRepository.shared.team(fecha: FieldOpsDayRepository.dayString(effectiveFecha))
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
            now = serverNow()
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
                    CoreChip(icon: estado.icon, text: estado.label, color: estado.color)
                    if let revision = LunchUI.revision(row.registro) {
                        CoreChip(icon: revision.icon, text: revision.label, color: revision.color)
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
                NxIconText(systemName: "text.bubble", text: "Salida a las \(LunchUI.hour(record.checkinTime)): «\(text)»").font(.caption)
            }
            if let text = record.checkoutJustificacion, !text.isEmpty {
                NxIconText(systemName: "text.bubble", text: "Regreso a las \(LunchUI.hour(record.checkoutTime)): «\(text)»").font(.caption)
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
                Button { onReview(record, "aprobar") } label: { Label("Aprobar", systemImage: "checkmark") }
                    .buttonStyle(.borderedProminent)
                    .tint(CorePalette.green)
                Button { onReview(record, "rechazar") } label: { Label("Rechazar", systemImage: "xmark") }
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

/// El motivo, con la foto ya tomada delante: se registra desde aquí, sin
/// volver a la cámara.
private struct LunchReasonSheet: View {
    let pending: LunchPendingPhoto
    let windowText: String
    let onSubmit: (String) async -> LunchRegisterOutcome

    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""
    @State private var error: String?
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(alignment: .top, spacing: 12) {
                        Image(uiImage: pending.photo.image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 72, height: 72)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        Text(pending.serverMessage ?? (pending.checkIn
                            ? "Estás fuera de tu horario de comida (\(windowText)). Escribe por qué; tu jefe lo aprobará o rechazará."
                            : "Ya pasó la hora de regreso (4:00 p.m.). Escribe por qué; tu jefe lo aprobará o rechazará."))
                            .font(.footnote)
                    }
                } footer: {
                    Text("Tu foto ya está tomada: no hay que repetirla.")
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
            .navigationTitle(pending.checkIn ? "Salir a comer" : "Ya regresé")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Registrando…" : "Registrar") {
                        Task { await submit() }
                    }
                    .disabled(saving)
                }
            }
            .interactiveDismissDisabled(saving)
        }
    }

    @MainActor
    private func submit() async {
        let trimmed = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= LunchCoreRepository.minReason else {
            error = "Escribe por qué (al menos 5 letras): tu jefe lo revisará."
            return
        }
        saving = true
        error = nil
        defer { saving = false }
        switch await onSubmit(trimmed) {
        case .done:
            dismiss()
        case .needsReason(let message), .failed(let message):
            error = message
        }
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
                        Text("Aprobar").tag("aprobar")
                        Text("Rechazar").tag("rechazar")
                    }
                    .pickerStyle(.segmented)
                } footer: {
                    Text("Solo se revisan las comidas fuera de 3:00 a 4:00 p.m.")
                }
                Section("Lo que escribió") {
                    if let text = request.record.checkinJustificacion, !text.isEmpty {
                        NxIconText(systemName: "text.bubble", text: "Salida a las \(LunchUI.hour(request.record.checkinTime)): «\(text)»").font(.footnote)
                    }
                    if let text = request.record.checkoutJustificacion, !text.isEmpty {
                        NxIconText(systemName: "text.bubble", text: "Regreso a las \(LunchUI.hour(request.record.checkoutTime)): «\(text)»").font(.footnote)
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
