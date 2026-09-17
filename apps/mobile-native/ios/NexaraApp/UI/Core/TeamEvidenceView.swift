import SwiftUI

/// Foto de evidencia a ver en grande.
struct CorePhotoItem: Identifiable {
    let id = UUID()
    let title: String
    let url: String
    var latitude: Double? = nil
    var longitude: Double? = nil
    var time: String? = nil
}

/// Revisión a abrir: a quién, con qué decisión y (opcional) qué pasos ya marcados.
struct TeamEvidenceReviewRequest: Identifiable {
    let id = UUID()
    let member: TeamEvidenceMember
    let decision: String
    var pasos: [String] = []
}

/// Reglas de pantalla de las evidencias del equipo (espejo de `EquipoEvidencias` web).
enum TeamEvidenceUI {
    /// `icon` es un SF Symbol para `CoreChip(icon:)`.
    static func estado(_ evidence: TeamEvidenceData?) -> (label: String, icon: String, color: Color)? {
        guard let evidence else { return nil }
        if evidence.reviewStatus == "APPROVED" { return ("Aprobada", "checkmark.seal", CorePalette.green) }
        if evidence.reviewStatus == "REJECTED" { return ("Corrigiendo", "arrow.uturn.backward", CorePalette.orange) }
        if evidence.status == CoreEvidence.completed {
            if !(evidence.correctionSubmittedAt ?? "").isEmpty {
                return ("Corrección por revisar", "arrow.triangle.2.circlepath", CorePalette.orange)
            }
            return ("Por revisar", "text.magnifyingglass", CorePalette.orange)
        }
        return ("En curso", "hourglass", CorePalette.blue)
    }

    /// Ya la envió, nadie la ha aprobado ni devuelto y a mí me toca revisarla.
    static func pendingReview(_ member: TeamEvidenceMember) -> Bool {
        guard member.canReview, let evidence = member.evidence else { return false }
        return evidence.status == CoreEvidence.completed
            && evidence.reviewStatus != "APPROVED"
            && evidence.reviewStatus != "REJECTED"
    }

    static func decision(_ raw: String) -> (label: String, icon: String, color: Color) {
        switch raw {
        case "APROBADA": return ("Aprobada", "checkmark.seal", CorePalette.green)
        case "DEVUELTA_TODO": return ("Devolvió todo", "arrow.uturn.left", CorePalette.orange)
        default: return ("Devolvió pasos", "arrow.uturn.left", CorePalette.orange)
        }
    }

    // Nombre de cada foto, igual en miniaturas, visor e historial.
    static let entryLabel = "Entrada"
    static let exitLabel = "Salida"
    static func evidenceLabel(_ index: Int) -> String { "Evidencia \(index + 1)" }

    static func stepList(_ steps: [String]) -> String {
        steps.map { CoreEvidence.label($0) }.joined(separator: ", ")
    }

    static func loadMessage(_ error: Error) -> String {
        if let apiError = error as? ApiError, case .http(let code, _) = apiError, code == 403 || code == 404 {
            return "No tienes acceso a las evidencias de esta actividad."
        }
        return error.toUserMessage(fallback: "No se pudieron cargar las evidencias del equipo")
    }
}

// MARK: - Vista completa (pestaña Evidencias)

/// Evidencias por persona: fotos, PDF, formulario, revisión e historial.
/// Va dentro de un ScrollView (no pone el suyo).
struct TeamEvidenceView: View {
    let activityId: Int
    var refreshToken: Int = 0

    @State private var data: TeamEvidenceResponse?
    @State private var loading = true
    @State private var error: String?
    @State private var notice: String?
    @State private var review: TeamEvidenceReviewRequest?
    @State private var photo: CorePhotoItem?
    @State private var pdf: CorePdfItem?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Evidencias del equipo").font(.headline)
            if let data {
                summary(data)
                if let notice {
                    NxIconText(systemName: "checkmark.circle.fill", text: notice)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(CorePalette.green)
                }
                if data.members.isEmpty {
                    Text("Todavía nadie tiene esta actividad asignada.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                ForEach(data.members) { member in
                    TeamEvidenceMemberCard(
                        member: member,
                        coreKind: data.activity.coreKind,
                        onReview: { decision, pasos in
                            review = TeamEvidenceReviewRequest(member: member, decision: decision, pasos: pasos)
                        },
                        onPhoto: { photo = $0 },
                        onPdf: { pdf = $0 }
                    )
                }
            } else if loading {
                ProgressView("Cargando evidencias…")
                    .frame(maxWidth: .infinity)
            } else if let error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(CorePalette.red)
                Button("Reintentar") { Task { await load() } }
            }
        }
        .task(id: refreshToken) { await load() }
        .sheet(item: $review) { request in
            TeamEvidenceReviewSheet(activityId: activityId, request: request, coreKind: data?.activity.coreKind) { response, message in
                data = response
                notice = message
            }
        }
        .fullScreenCover(item: $photo) { item in
            CorePhotoViewer(item: item)
        }
        .sheet(item: $pdf) { item in
            NavigationStack {
                AuthenticatedPDFScreen(title: item.title, url: item.url)
            }
        }
    }

    private func summary(_ data: TeamEvidenceResponse) -> some View {
        let resumen = data.resumen
        return VStack(alignment: .leading, spacing: 6) {
            CoreFlowLayout {
                CoreChip(icon: "person.2", text: "\(resumen.ejecutores) ejecutan")
                CoreChip(icon: "paperplane", text: "\(resumen.terminaron) enviaron", color: CorePalette.blue)
                CoreChip(icon: "checkmark.seal", text: "\(resumen.aprobadas) aprobadas", color: CorePalette.green)
                if resumen.porRevisarMias > 0 {
                    CoreChip(icon: "text.magnifyingglass", text: "\(resumen.porRevisarMias) por revisar", color: CorePalette.orange)
                }
            }
            if data.soloLectura == true && data.alcance != "propio" {
                Text("Solo lectura: puedes ver todo, no revisar.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @MainActor
    private func load() async {
        loading = true
        defer { loading = false }
        do {
            data = try await CoreRepository.shared.teamEvidence(activityId: activityId)
            error = nil
        } catch {
            if !Task.isCancelled {
                self.error = TeamEvidenceUI.loadMessage(error)
            }
        }
    }
}

// MARK: - Resumen compacto (pestaña Detalle)

struct TeamEvidenceCompactView: View {
    let activityId: Int
    var refreshToken: Int = 0
    let onOpen: () -> Void

    @State private var data: TeamEvidenceResponse?
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let data {
                CoreFlowLayout {
                    CoreChip(icon: "paperplane", text: "\(data.resumen.terminaron)/\(data.resumen.ejecutores) enviaron", color: CorePalette.blue)
                    CoreChip(icon: "checkmark.seal", text: "\(data.resumen.aprobadas) aprobadas", color: CorePalette.green)
                    if data.resumen.porRevisarMias > 0 {
                        CoreChip(icon: "text.magnifyingglass", text: "\(data.resumen.porRevisarMias) por revisar", color: CorePalette.orange)
                    }
                }
                if data.members.isEmpty {
                    Text("Todavía nadie sube evidencias.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                ForEach(data.members.prefix(4)) { member in
                    HStack(spacing: 8) {
                        CoreAvatar(name: member.nombre, url: member.avatarUrl, size: 28)
                        Text(CoreFormat.shortName(member.nombre))
                            .font(.caption.weight(.semibold))
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        if member.splits {
                            CoreChip(icon: "paperplane", text: "La reparte", color: CorePalette.purple)
                        } else if let estado = TeamEvidenceUI.estado(member.evidence) {
                            CoreChip(icon: estado.icon, text: estado.label, color: estado.color)
                        } else {
                            CoreChip(text: "Sin evidencia")
                        }
                    }
                }
                Button(data.resumen.porRevisarMias > 0 ? "Revisar evidencias →" : "Ver fotos, PDF y formularios →", action: onOpen)
                    .font(.subheadline.weight(.semibold))
            } else if loading {
                ProgressView()
            } else if let error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .task(id: refreshToken) { await load() }
    }

    @MainActor
    private func load() async {
        loading = true
        defer { loading = false }
        do {
            data = try await CoreRepository.shared.teamEvidence(activityId: activityId)
            error = nil
        } catch {
            if !Task.isCancelled {
                self.error = TeamEvidenceUI.loadMessage(error)
            }
        }
    }
}

// MARK: - Tarjeta por persona

private struct TeamEvidenceMemberCard: View {
    let member: TeamEvidenceMember
    let coreKind: String?
    let onReview: (String, [String]) -> Void
    let onPhoto: (CorePhotoItem) -> Void
    let onPdf: (CorePdfItem) -> Void

    @State private var expanded: Bool? = nil

    private var isExpanded: Bool { expanded ?? !member.splits }
    private var evidence: TeamEvidenceData? { member.evidence }

    /// Última devolución (las revisiones llegan de la más reciente a la más vieja).
    private var lastReturn: TeamEvidenceReview? {
        member.revisiones?.first { $0.decision != "APROBADA" }
    }

    /// Ya reenvió lo que se le devolvió y falta revisar la corrección.
    private var isCorrectionReview: Bool {
        guard let ev = evidence, !(ev.correctionSubmittedAt ?? "").isEmpty else { return false }
        return ev.status == CoreEvidence.completed && ev.reviewStatus != "APPROVED" && lastReturn != nil
    }

    /// Pasos que rehízo (se resaltan para revisar eso primero).
    private var correctedSteps: [String] {
        isCorrectionReview ? (lastReturn?.pasos ?? []) : []
    }

    /// Pasos devueltos que todavía está corrigiendo.
    private var stepsToFix: [String] {
        evidence?.reviewStatus == "REJECTED" ? (member.rejectedSteps ?? []) : []
    }

    private var pendingText: String {
        guard isCorrectionReview else {
            return "Ya envió su evidencia. Revísala, califícala y apruébala o devuélvela."
        }
        var text = "Corrigió lo que se le devolvió"
        if !correctedSteps.isEmpty && lastReturn?.decision != "DEVUELTA_TODO" {
            text += " (\(TeamEvidenceUI.stepList(correctedSteps)))"
        } else {
            text += " (rehízo toda la actividad)"
        }
        if let when = CoreFormat.when(evidence?.correctionSubmittedAt) {
            text += " · \(when)"
        }
        return text + ". Revisa la corrección y apruébala o devuélvela de nuevo."
    }

    private var roleLabel: String {
        if member.splits { return "La reparte" }
        return member.rol == "APOYO" ? "Apoyo" : "La ejecuta"
    }

    private var roleSymbol: String {
        if member.splits { return "paperplane" }
        return member.rol == "APOYO" ? "person.2" : "person.crop.circle.badge.checkmark"
    }

    /// «Devolver este paso» solo con la evidencia enviada y si me toca revisarla.
    private var returnStepAction: ((String) -> Void)? {
        guard member.canReview, evidence?.status == CoreEvidence.completed else { return nil }
        let review = onReview
        return { step in review("devolver", [step]) }
    }

    /// Resumen de salidas de zona para la cabecera (se ve aunque la tarjeta esté plegada).
    private var zoneChip: (text: String, color: Color)? {
        let alerts = member.zoneAlerts
        guard !alerts.isEmpty else { return nil }
        let count = alerts.count
        let base = count == 1 ? "1 salida de zona" : "\(count) salidas de zona"
        if alerts.contains(where: { $0.abierta }) {
            return ("\(base) · fuera ahora", CorePalette.red)
        }
        let pending = alerts.filter { !$0.isJustified }.count
        if pending > 0 {
            return ("\(base) · \(pending) sin justificar", CorePalette.orange)
        }
        return (base, CorePalette.slate)
    }

    private var receivedText: String? {
        guard let when = CoreFormat.when(member.asignadoAt) else { return nil }
        guard let por = member.asignadoPor, !por.isEmpty, por != member.nombre else {
            return "Recibió \(when)"
        }
        return "Recibió \(when) de \(CoreFormat.shortName(por))"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            if !member.splits {
                CoreProgressBar(percent: member.progressPct ?? 0)
            }
            chainLines
            reviewPrompt
            if isExpanded {
                detail
            }
            Button(isExpanded ? "Ocultar" : "Ver detalle") {
                expanded = !isExpanded
            }
            .font(.caption.weight(.semibold))
            .buttonStyle(.borderless)
        }
        .coreCard(highlight: TeamEvidenceUI.pendingReview(member) ? CorePalette.orange : nil)
        .opacity(member.retiradoAt != nil ? 0.75 : 1)
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 10) {
            CoreAvatar(name: member.nombre, url: member.avatarUrl, size: 44)
            VStack(alignment: .leading, spacing: 4) {
                Text(member.nombre).font(.subheadline.weight(.bold))
                if let puesto = member.puesto, !puesto.isEmpty {
                    Text(puesto).font(.caption).foregroundStyle(.secondary)
                }
                CoreFlowLayout {
                    CoreChip(icon: roleSymbol, text: roleLabel, color: member.splits ? CorePalette.purple : CorePalette.blue)
                    if !member.splits, let estado = TeamEvidenceUI.estado(evidence) {
                        CoreChip(icon: estado.icon, text: estado.label, color: estado.color)
                    }
                    if let score = member.eficienciaScore, score > 0 {
                        CoreStars(value: score)
                    }
                    if member.retiradoAt != nil {
                        CoreChip(text: "Salió del equipo")
                    }
                    if let zone = zoneChip {
                        CoreChip(icon: "location.slash", text: zone.text, color: zone.color)
                    }
                }
            }
        }
    }

    private var chainLines: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let receivedText {
                NxIconText(systemName: "tray.and.arrow.down", text: receivedText)
            }
            ForEach(Array((member.pasoA ?? []).enumerated()), id: \.offset) { _, passed in
                NxIconText(systemName: "arrowshape.turn.up.right", text: "La pasó a \(CoreFormat.shortName(passed.nombre)) · \(CoreFormat.when(passed.at) ?? "")")
            }
            if let ev = evidence, ev.status == CoreEvidence.completed, let sent = CoreFormat.when(ev.completedAt) {
                NxIconText(systemName: "paperplane", text: "Envió \(sent)")
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }

    @ViewBuilder
    private var reviewPrompt: some View {
        if TeamEvidenceUI.pendingReview(member) {
            VStack(alignment: .leading, spacing: 8) {
                NxIconText(
                    systemName: isCorrectionReview ? "arrow.triangle.2.circlepath" : "text.magnifyingglass",
                    text: pendingText,
                    tint: CorePalette.orange
                )
                .font(.footnote.weight(.semibold))
                HStack(spacing: 8) {
                    Button { onReview("aprobar", []) } label: { Label("Aprobar", systemImage: "checkmark") }
                        .buttonStyle(.borderedProminent)
                        .tint(CorePalette.green)
                    Button { onReview("devolver", []) } label: { Label("Devolver", systemImage: "arrow.uturn.backward") }
                        .buttonStyle(.borderedProminent)
                        .tint(CorePalette.orange)
                }
                .font(.subheadline)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(CorePalette.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        } else if member.canReview, let ev = evidence, ev.reviewStatus == "APPROVED" {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                NxIconText(systemName: "checkmark.seal.fill", text: approvedText(ev), tint: CorePalette.green)
                    .font(.footnote)
                Spacer(minLength: 4)
                Button { onReview("devolver", []) } label: { Label("Devolver", systemImage: "arrow.uturn.backward") }
                    .buttonStyle(.bordered)
                    .font(.caption)
            }
        }
        if let ev = evidence, ev.reviewStatus == "REJECTED" {
            NxIconText(systemName: "arrow.uturn.backward", text: correctingText(ev), tint: CorePalette.orange)
                .font(.footnote)
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(CorePalette.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
        }
    }

    private func approvedText(_ ev: TeamEvidenceData) -> String {
        var text = "Aprobada"
        if let by = ev.reviewedBy, !by.isEmpty {
            text += " por \(CoreFormat.shortName(by))"
        }
        if let when = CoreFormat.when(ev.reviewedAt) {
            text += " · \(when)"
        }
        return text + ". ¿Encontraste algo mal?"
    }

    private func correctingText(_ ev: TeamEvidenceData) -> String {
        let steps = TeamEvidenceUI.stepList(member.rejectedSteps ?? [])
        var text = "Está corrigiendo: \(steps.isEmpty ? "toda la actividad" : steps)"
        if let notes = ev.reviewNotes, !notes.isEmpty {
            text += " · «\(notes)»"
        }
        if member.canReview || !(member.revisiones ?? []).isEmpty {
            text += ". Cuando envíe la corrección podrás aprobarla o devolverla otra vez."
        }
        return text
    }

    private var detail: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let indicaciones = member.indicaciones, !indicaciones.isEmpty {
                NxIconText(systemName: "text.bubble", text: indicaciones).font(.footnote)
            }
            if member.splits {
                Text("Su parte es pasarla a quien la ejecuta; no sube evidencias.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else if let ev = evidence {
                TeamEvidenceContent(
                    evidence: ev,
                    coreKind: coreKind,
                    nombre: member.nombre,
                    onReturnStep: returnStepAction,
                    correctedSteps: correctedSteps,
                    stepsToFix: stepsToFix,
                    onPhoto: onPhoto,
                    onPdf: onPdf
                )
            } else {
                Text("Aún no sube evidencia.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if !member.zoneAlerts.isEmpty {
                zoneAlertsSection
            }
            if let reviews = member.revisiones, !reviews.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Historial de revisiones").font(.caption.weight(.bold))
                    ForEach(reviews) { item in
                        TeamEvidenceReviewRow(review: item, coreKind: coreKind, nombre: member.nombre, onPhoto: onPhoto, onPdf: onPdf)
                    }
                }
            }
        }
    }

    /// Salidas de la zona de 100 m alrededor de su foto de entrada, la más reciente primero.
    private var zoneAlertsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "location.slash")
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(CorePalette.red)
                    .accessibilityHidden(true)
                Text("Salidas de zona").font(.caption.weight(.bold))
                Spacer(minLength: 4)
                Text("Radio de \(member.zoneAlerts.first?.radioM ?? ActivityGeofence.radioM) m")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            ForEach(member.zoneAlerts) { alert in
                ActivityGeofenceAlertRow(
                    alert: alert,
                    firstPerson: false,
                    photoTitle: "\(CoreFormat.shortName(member.nombre)) · Justificación de salida",
                    onPhoto: onPhoto
                )
            }
        }
    }
}

// MARK: - Contenido de una evidencia (actual o copia guardada)

private struct TeamEvidenceContent: View {
    let evidence: TeamEvidenceData
    let coreKind: String?
    let nombre: String
    var onReturnStep: ((String) -> Void)? = nil
    /// Pasos que rehízo en la corrección por revisar («Corregido · hora»).
    var correctedSteps: [String] = []
    /// Pasos devueltos que todavía está corrigiendo.
    var stepsToFix: [String] = []
    let onPhoto: (CorePhotoItem) -> Void
    let onPdf: (CorePdfItem) -> Void

    private var short: String { CoreFormat.shortName(nombre) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            stepChecklist
            section("Entrada", time: evidence.entryPhotoUploadedAt, step: CoreEvidence.entryPhoto) {
                photoThumb(
                    evidence.entryPhotoUrl,
                    title: TeamEvidenceUI.entryLabel,
                    latitude: evidence.entryLatitude?.value,
                    longitude: evidence.entryLongitude?.value,
                    time: evidence.entryPhotoUploadedAt
                )
            }
            section("Fotos en sitio (\(evidence.photos.count))", time: evidence.evidencePhotosUploadedAt, step: CoreEvidence.evidencePhotos) {
                sitePhotos
            }
            if CoreEvidence.requiresServiceSheetPdf(coreKind) || evidence.hasPdf {
                section("Hoja de servicio", time: evidence.serviceSheetUploadedAt, step: CoreEvidence.serviceSheetPdf) {
                    pdfButton
                }
            }
            section("Formulario", time: evidence.serviceSheetCompletedAt, step: CoreEvidence.serviceSheetData) {
                formView
            }
            section("Salida", time: evidence.exitPhotoUploadedAt, step: CoreEvidence.exitPhoto) {
                photoThumb(
                    evidence.exitPhotoUrl,
                    title: TeamEvidenceUI.exitLabel,
                    latitude: evidence.exitLatitude?.value,
                    longitude: evidence.exitLongitude?.value,
                    time: evidence.exitPhotoUploadedAt
                )
            }
        }
    }

    /// Pasos con su estado (icono SF Symbol): hecho · hora, por corregir, corregido · hora, pendiente.
    private var stepChecklist: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 128), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(CoreEvidence.steps(for: coreKind), id: \.self) { step in
                stepChip(step)
            }
        }
    }

    private func stepChip(_ step: String) -> some View {
        let time = evidence.stepTime(step)
        let done = time != nil
        let toFix = stepsToFix.contains(step)
        let corrected = !toFix && done && correctedSteps.contains(step)
        let tone: Color? = toFix ? CorePalette.orange : (corrected ? CorePalette.blue : (done ? CorePalette.green : nil))
        let icon = toFix
            ? "arrow.uturn.backward.circle.fill"
            : (corrected ? "arrow.triangle.2.circlepath.circle.fill" : (done ? "checkmark.circle.fill" : "circle"))
        let when = CoreFormat.when(time) ?? ""
        let detail: String
        if toFix {
            detail = "Por corregir"
        } else if corrected {
            detail = when.isEmpty ? "Corregido" : "Corregido · \(when)"
        } else if done {
            detail = when.isEmpty ? "Hecho" : when
        } else {
            detail = "Pendiente"
        }
        let detailColor: Color = toFix ? CorePalette.orange : (corrected ? CorePalette.blue : Color.secondary)
        return VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(tone ?? Color.secondary)
                Text(CoreEvidence.label(step))
            }
            .font(.caption.weight(.semibold))
            .lineLimit(1)
            Text(detail)
                .font(.caption2.weight(corrected ? .semibold : .regular))
                .foregroundStyle(detailColor)
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background((tone ?? Color.clear).opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke((tone ?? Color.secondary).opacity(0.35), lineWidth: 1)
        )
    }

    private func section<Content: View>(_ title: String, time: String?, step: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(title).font(.caption.weight(.bold))
                if let when = CoreFormat.when(time) {
                    Text(when).font(.caption2).foregroundStyle(.secondary)
                }
                Spacer(minLength: 4)
                if let onReturnStep {
                    Button { onReturnStep(step) } label: {
                        Label("Devolver este paso", systemImage: "arrow.uturn.backward")
                    }
                        .font(.caption2.weight(.semibold))
                        .buttonStyle(.borderless)
                }
            }
            content()
        }
    }

    @ViewBuilder
    private var sitePhotos: some View {
        if evidence.photos.isEmpty {
            missing("Sin fotos en sitio")
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(evidence.photos.enumerated()), id: \.offset) { index, url in
                        sitePhoto(index: index, url: url)
                    }
                }
            }
        }
    }

    private func sitePhoto(index: Int, url: String) -> some View {
        let geo = evidence.geo(at: index)
        return photoThumb(
            url,
            title: TeamEvidenceUI.evidenceLabel(index),
            latitude: geo?.latitude?.value,
            longitude: geo?.longitude?.value,
            time: geo?.capturedAt ?? evidence.evidencePhotosUploadedAt,
            showsPin: true
        )
    }

    @ViewBuilder
    private var pdfButton: some View {
        if let url = evidence.serviceSheetPdfUrl, !url.isEmpty {
            Button {
                onPdf(CorePdfItem(title: "Hoja de servicio · \(short)", url: url))
            } label: {
                Label("Ver PDF", systemImage: "doc.richtext")
            }
            .buttonStyle(.bordered)
        } else {
            missing("Sin PDF")
        }
    }

    private func formRows() -> [(label: String, value: String)] {
        let values = evidence.serviceSheetData?.objectValue ?? [:]
        let fields = CoreEvidence.formFields(for: coreKind)
        var rows: [(label: String, value: String)] = []
        for field in fields {
            if let text = values[field.key]?.displayText {
                rows.append((field.label, text))
            }
        }
        let known = Set(fields.map(\.key))
        for key in values.keys.sorted() where !known.contains(key) {
            if let text = values[key]?.displayText {
                rows.append((key, text))
            }
        }
        return rows
    }

    @ViewBuilder
    private var formView: some View {
        let rows = formRows()
        if rows.isEmpty {
            missing("Sin formulario")
        } else {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    (Text("\(row.label): ").bold() + Text(row.value))
                        .font(.caption)
                }
            }
        }
    }

    @ViewBuilder
    private func photoThumb(
        _ url: String?,
        title: String,
        latitude: Double?,
        longitude: Double?,
        time: String?,
        showsPin: Bool = false
    ) -> some View {
        if let url, !url.isEmpty {
            Button {
                onPhoto(CorePhotoItem(title: "\(short) · \(title)", url: url, latitude: latitude, longitude: longitude, time: time))
            } label: {
                VStack(alignment: .leading, spacing: 3) {
                    AuthenticatedImage(url: url)
                        .frame(width: 96, height: 96)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(alignment: .bottomTrailing) {
                            if showsPin && CoreMaps.url(latitude: latitude, longitude: longitude) != nil {
                                Image(systemName: "mappin.circle.fill")
                                    .font(.caption)
                                    .foregroundStyle(Color.white, CorePalette.red)
                                    .padding(4)
                            }
                        }
                    Text(title)
                        .font(.caption2.weight(.semibold))
                        .lineLimit(1)
                        .frame(width: 96, alignment: .leading)
                }
            }
            .buttonStyle(.plain)
        } else {
            missing("Sin foto · \(title)")
        }
    }

    private func missing(_ text: String) -> some View {
        NxIconText(systemName: "tray", text: text)
            .font(.caption)
            .foregroundStyle(.secondary)
    }
}

// MARK: - Historial

private struct TeamEvidenceReviewRow: View {
    let review: TeamEvidenceReview
    let coreKind: String?
    let nombre: String
    let onPhoto: (CorePhotoItem) -> Void
    let onPdf: (CorePdfItem) -> Void

    @State private var showsSnapshot = false

    private var byline: String {
        let who = CoreFormat.shortName(review.revisor)
        let when = CoreFormat.when(review.at) ?? ""
        if who.isEmpty { return when }
        return when.isEmpty ? who : "\(who) · \(when)"
    }

    var body: some View {
        let decision = TeamEvidenceUI.decision(review.decision)
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                CoreChip(icon: decision.icon, text: decision.label, color: decision.color)
                if let score = review.calificacion, score > 0 {
                    CoreStars(value: score)
                }
            }
            if review.decision == "DEVUELTA_PASOS" && !review.pasos.isEmpty {
                Text("Pasos: \(TeamEvidenceUI.stepList(review.pasos))").font(.caption)
            }
            if !review.observaciones.isEmpty {
                Text(review.observaciones).font(.footnote)
            }
            if !byline.isEmpty {
                Text(byline).font(.caption2).foregroundStyle(.secondary)
            }
            if let snapshot = review.snapshot {
                Button(showsSnapshot ? "Ocultar lo que había" : "Ver lo que había") {
                    showsSnapshot.toggle()
                }
                .font(.caption.weight(.semibold))
                .buttonStyle(.borderless)
                if showsSnapshot {
                    TeamEvidenceContent(evidence: snapshot, coreKind: coreKind, nombre: nombre, onPhoto: onPhoto, onPdf: onPdf)
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Hoja de revisión

private struct TeamEvidenceReviewSheet: View {
    let activityId: Int
    let request: TeamEvidenceReviewRequest
    let coreKind: String?
    let onDone: (TeamEvidenceResponse, String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var decision = "aprobar"
    @State private var todo = false
    @State private var marked: Set<String> = []
    @State private var rating = 0
    @State private var notes = ""
    @State private var saving = false
    @State private var error: String?
    @State private var didSetup = false

    private var steps: [String] { CoreEvidence.steps(for: coreKind) }
    private var name: String { CoreFormat.shortName(request.member.nombre) }
    private var trimmedNotes: String { notes.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var markedSteps: [String] { steps.filter { marked.contains($0) } }

    private var missing: [String] {
        var list: [String] = []
        if decision == "devolver" && !todo && markedSteps.isEmpty {
            list.append("marca qué pasos debe corregir")
        }
        if rating == 0 {
            list.append("califica su eficiencia")
        }
        if trimmedNotes.count < 5 {
            list.append(decision == "aprobar" ? "escribe por qué la apruebas" : "escribe qué debe corregir")
        }
        return list
    }

    private var submitLabel: String {
        if decision == "aprobar" { return "Aprobar" }
        if todo { return "Devolver todo" }
        let count = markedSteps.count
        let number = count > 0 ? " \(count)" : ""
        let plural = count == 1 ? "" : "s"
        return "Devolver\(number) paso\(plural)"
    }

    private func stepBinding(_ step: String) -> Binding<Bool> {
        Binding(
            get: { marked.contains(step) },
            set: { isOn in
                if isOn {
                    marked.insert(step)
                } else {
                    marked.remove(step)
                }
            }
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Decisión", selection: $decision) {
                        Text("Aprobar").tag("aprobar")
                        Text("Devolver").tag("devolver")
                    }
                    .pickerStyle(.segmented)
                } footer: {
                    Text("Tu decisión, la calificación y tus observaciones le llegan y quedan en el historial.")
                }

                if decision == "devolver" {
                    Section("¿Qué debe corregir?") {
                        Toggle(isOn: $todo) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Toda la actividad").font(.subheadline.weight(.semibold))
                                Text("Sus evidencias se vacían y las vuelve a subir desde cero. Lo que había queda guardado en el historial.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        if !todo {
                            ForEach(steps, id: \.self) { step in
                                Toggle(CoreEvidence.label(step), isOn: stepBinding(step))
                            }
                        }
                    }
                }

                Section("Eficiencia") {
                    HStack(spacing: 6) {
                        ForEach(1...5, id: \.self) { value in
                            Button {
                                rating = value
                            } label: {
                                Image(systemName: value <= rating ? "star.fill" : "star")
                                    .font(.title2)
                                    .foregroundStyle(value <= rating ? CorePalette.amber : Color.secondary)
                            }
                            .buttonStyle(.borderless)
                            .accessibilityLabel("\(value) de 5: \(CoreEvidence.ratingLabel(value))")
                        }
                        Spacer()
                        Text(CoreEvidence.ratingLabel(rating))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    TextField(
                        decision == "aprobar" ? "Por qué la apruebas" : "Qué debe corregir",
                        text: $notes,
                        axis: .vertical
                    )
                    .lineLimit(3...8)
                } header: {
                    Text("Observaciones")
                } footer: {
                    Text("Mínimo 5 caracteres.")
                }

                if let error {
                    Section {
                        Text(error).foregroundStyle(CorePalette.red)
                    }
                }
            }
            .navigationTitle("Revisar a \(name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Enviando…" : submitLabel) {
                        Task { await submit() }
                    }
                    .disabled(saving)
                }
            }
            .interactiveDismissDisabled(saving)
            .onAppear(perform: setup)
        }
    }

    private func setup() {
        guard !didSetup else { return }
        didSetup = true
        decision = request.decision == "devolver" ? "devolver" : "aprobar"
        marked = Set(request.pasos)
    }

    private func doneMessage(returning: Bool) -> String {
        if !returning { return "Aprobaste la evidencia de \(name)." }
        if todo { return "Le devolviste toda la actividad a \(name)." }
        let count = markedSteps.count
        return "Le devolviste \(count) paso\(count == 1 ? "" : "s") a \(name)."
    }

    @MainActor
    private func submit() async {
        let faltan = missing
        guard faltan.isEmpty else {
            error = "Falta: \(faltan.joined(separator: ", "))."
            return
        }
        saving = true
        error = nil
        defer { saving = false }
        let returning = decision == "devolver"
        let pasos: [String]? = returning && !todo ? markedSteps : nil
        let input = ReviewEvidenceInput(
            decision: decision,
            pasos: pasos,
            todo: returning ? todo : nil,
            observaciones: trimmedNotes,
            calificacion: rating
        )
        do {
            let response = try await CoreRepository.shared.reviewTeamEvidence(
                activityId: activityId,
                userId: request.member.userId,
                input: input
            )
            onDone(response, doneMessage(returning: returning))
            dismiss()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo guardar la revisión")
        }
    }
}

// MARK: - Visor de foto

struct CorePhotoViewer: View {
    let item: CorePhotoItem
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                AuthenticatedImage(url: item.url, contentMode: .fit)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                HStack {
                    if let when = CoreFormat.when(item.time) {
                        Text(when).font(.caption)
                    }
                    Spacer()
                    if let mapUrl = CoreMaps.url(latitude: item.latitude, longitude: item.longitude, label: item.title) {
                        Link(destination: mapUrl) {
                            Label("Ver en mapa", systemImage: "mappin.and.ellipse")
                        }
                        .font(.caption.weight(.semibold))
                    }
                }
                .padding(.horizontal)
            }
            .padding(.vertical)
            .navigationTitle(item.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
    }
}
