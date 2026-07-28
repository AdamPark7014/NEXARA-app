import SwiftUI

// MARK: - Evidences

struct EvidencesView: View {
    var reviewMode: Bool = false
    var initialActivityId: Int64? = nil

    @State private var rows: [EvidenceRow] = []
    @State private var myActivities: [ActivityItem] = []
    @State private var query = ""
    @State private var statusFilter = "Todos"
    @State private var isLoading = true
    @State private var error: String?
    @State private var selectedActivityId: Int64?
    @State private var evidence: EvidenceDetail?
    @State private var uploadMessage: String?
    @State private var uploading = false
    @State private var reportData: Data?
    @State private var rejectNotes = ""
    @State private var reviewingId: Int64?
    @State private var reviewMessage: String?

    private var statuses: [String] {
        var s = Set(rows.map(\.status).filter { !$0.isEmpty })
        return ["Todos"] + s.sorted()
    }

    private var filtered: [EvidenceRow] {
        var list = rows
        if statusFilter != "Todos" {
            list = list.filter { $0.status == statusFilter }
        }
        if !query.isEmpty {
            let q = query.lowercased()
            list = list.filter {
                $0.displayTitle.lowercased().contains(q) ||
                $0.clientName.lowercased().contains(q) ||
                $0.title.lowercased().contains(q)
            }
        }
        return list
    }

    var body: some View {
        Group {
            if let actId = selectedActivityId {
                evidenceWorkflow(activityId: actId)
            } else {
                listBody
            }
        }
        .navigationTitle(reviewMode ? "Evidencias · Revisión" : "Mis evidencias")
        .task {
            await reload()
            if let initialActivityId {
                await openActivity(initialActivityId)
            }
        }
        .refreshable { await reload() }
        .sheet(item: Binding(
            get: { reportData.map { PDFSheetData(data: $0) } },
            set: { reportData = $0?.data }
        )) { item in
            NavigationStack {
                PDFViewerScreen(title: "Reporte", data: item.data)
            }
        }
    }

    private var listBody: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if !reviewMode {
                    LocationPermissionBanner(
                        message: "Las evidencias de campo adjuntan tu GPS al subir fotos.",
                        requestOnAppear: true
                    )
                    .padding(.horizontal)
                }
                if !reviewMode && !myActivities.isEmpty {
                    Text("Actividades asignadas").font(.headline)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(myActivities.prefix(12)) { act in
                                Button {
                                    Task { await openActivity(act.id) }
                                } label: {
                                    Text(act.title.isEmpty ? "Actividad" : act.title)
                                        .font(.caption).padding(.horizontal, 10).padding(.vertical, 6)
                                        .background(Color.teal.opacity(0.12)).foregroundColor(.teal)
                                        .clipShape(Capsule())
                                }
                            }
                        }
                    }
                }

                searchBar
                if statuses.count > 1 { statusChips }

                if let reviewMessage {
                    Text(reviewMessage)
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(reviewMessage.hasPrefix("✅") ? .green : .red)
                }

                if isLoading { ProgressView().frame(maxWidth: .infinity).padding(.top, 40) }
                else if let error, rows.isEmpty {
                    NxEmptyState(
                        title: "No se pudo cargar",
                        subtitle: error,
                        actionLabel: "Reintentar",
                        onAction: { Task { await reload() } }
                    )
                } else if filtered.isEmpty {
                    NxEmptyState(
                        title: "Sin evidencias",
                        subtitle: reviewMode
                            ? "No hay evidencias pendientes de revisión."
                            : "Selecciona una actividad o espera asignaciones.",
                        actionLabel: "Actualizar",
                        onAction: { Task { await reload() } }
                    )
                } else {
                    ForEach(filtered.prefix(60)) { row in
                        evidenceRow(row)
                    }
                }
            }
            .padding()
        }
    }

    private var searchBar: some View {
        HStack {
            Image(systemName: "magnifyingglass").foregroundColor(.secondary)
            TextField("Buscar AN o cliente…", text: $query).autocorrectionDisabled()
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var statusChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(statuses, id: \.self) { s in
                    Button { statusFilter = s } label: {
                        Text(s).font(.caption).bold()
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(statusFilter == s ? Color.teal : Color(.secondarySystemGroupedBackground))
                            .foregroundColor(statusFilter == s ? .white : .primary)
                            .clipShape(Capsule())
                    }
                }
            }
        }
    }

    private func evidenceRow(_ row: EvidenceRow) -> some View {
        let canReview = reviewMode && row.activityId > 0 && row.needsReview
        let acting = reviewingId == row.activityId

        return VStack(alignment: .leading, spacing: 10) {
            Button {
                if !reviewMode, row.activityId > 0 {
                    Task { await openActivity(row.activityId) }
                }
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(row.displayTitle).font(.subheadline).bold()
                        if !row.clientName.isEmpty { Text(row.clientName).font(.caption).foregroundColor(.secondary) }
                        OpsStatusChip(text: row.status.isEmpty ? "—" : row.status)
                    }
                    Spacer()
                    if !reviewMode {
                        Image(systemName: "chevron.right").foregroundColor(.secondary)
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(reviewMode)

            if canReview {
                TextField("Motivo de rechazo (requerido para rechazar)", text: $rejectNotes, axis: .vertical)
                    .lineLimit(2...4)
                    .textFieldStyle(.roundedBorder)
                    .disabled(acting == true)
                NxDecisionActions(
                    acting: acting == true,
                    onApprove: { Task { await approve(row.activityId) } },
                    onReject: { Task { await reject(row.activityId) } }
                )
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func approve(_ activityId: Int64) async {
        guard let reviewerId = Int64(SessionStore.shared.currentUser?.id ?? "") else {
            reviewMessage = "❌ Sesión inválida"
            return
        }
        reviewingId = activityId
        reviewMessage = nil
        defer { reviewingId = nil }
        do {
            try await ConsoleRepository.shared.approveEvidence(
                activityId: activityId,
                reviewerId: reviewerId
            )
            reviewMessage = "✅ Evidencia aprobada"
            rejectNotes = ""
            await reload()
        } catch {
            reviewMessage = "❌ \(error.localizedDescription)"
        }
    }

    private func reject(_ activityId: Int64) async {
        let notes = rejectNotes.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !notes.isEmpty else {
            reviewMessage = "❌ Indica el motivo del rechazo"
            return
        }
        guard let reviewerId = Int64(SessionStore.shared.currentUser?.id ?? "") else {
            reviewMessage = "❌ Sesión inválida"
            return
        }
        reviewingId = activityId
        reviewMessage = nil
        defer { reviewingId = nil }
        do {
            try await ConsoleRepository.shared.rejectEvidence(
                activityId: activityId,
                reviewerId: reviewerId,
                notes: notes
            )
            reviewMessage = "✅ Evidencia rechazada — el técnico debe corregir"
            rejectNotes = ""
            await reload()
        } catch {
            reviewMessage = "❌ \(error.localizedDescription)"
        }
    }

    @ViewBuilder
    private func evidenceWorkflow(activityId: Int64) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Button("← Lista") { selectedActivityId = nil; evidence = nil }
                    Spacer()
                    Button("PDF") { Task { await downloadReport(activityId) } }
                        .disabled(uploading)
                }

                if let uploadMessage {
                    Text(uploadMessage).font(.footnote)
                        .foregroundColor(uploadMessage.hasPrefix("❌") ? .red : .green)
                }

                if uploading { ProgressView("Subiendo…") }

                let steps = workflowSteps(evidence)
                ForEach(steps, id: \.key) { step in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Image(systemName: step.done ? "checkmark.circle.fill" : "circle")
                                .foregroundColor(step.done ? .green : .secondary)
                            Text(step.title).font(.subheadline).bold()
                        }
                        if !step.done {
                            MediaPickerBar { media in
                                Task { await submitStep(step.key, activityId: activityId, media: media) }
                            }
                        }
                    }
                    .padding()
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
            .padding()
        }
    }

    private struct WorkflowStep {
        let key: String
        let title: String
        let done: Bool
    }

    private func workflowSteps(_ ev: EvidenceDetail?) -> [WorkflowStep] {
        [
            WorkflowStep(key: "entry", title: "1. Foto de entrada", done: ev?.hasEntry == true),
            WorkflowStep(key: "photos", title: "2. Fotos de evidencia", done: ev?.hasPhotos == true),
            WorkflowStep(key: "pdf", title: "3. Hoja de servicio (PDF)", done: ev?.hasPdf == true),
            WorkflowStep(key: "data", title: "4. Completar plantilla", done: ev?.serviceSheetCompleted == true),
            WorkflowStep(key: "exit", title: "5. Foto de salida", done: ev?.hasExit == true),
        ]
    }

    private func reload() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do {
            if reviewMode {
                rows = try await ConsoleRepository.shared.evidenceReviewRows()
            } else {
                async let hist = ConsoleRepository.shared.myEvidenceRows()
                async let acts = ConsoleRepository.shared.activityItems(scope: "mine")
                rows = try await hist
                myActivities = (try? await acts) ?? []
            }
        } catch { self.error = error.localizedDescription }
    }

    private func openActivity(_ id: Int64) async {
        selectedActivityId = id
        uploadMessage = nil
        do { evidence = try await ConsoleRepository.shared.evidenceDetailItem(activityId: id) }
        catch { uploadMessage = "❌ \(error.localizedDescription)" }
    }

    private func submitStep(_ key: String, activityId: Int64, media: [CapturedMedia]) async {
        guard !media.isEmpty else { return }
        uploading = true; uploadMessage = nil
        defer { uploading = false }
        do {
            switch key {
            case "entry":
                let coord = await DeviceLocation.shared.current()
                _ = try await ConsoleRepository.shared.evidenceEntryPhoto(
                    activityId: activityId,
                    photoUrl: media[0].dataUrl,
                    lat: coord?.latitude ?? 0,
                    lng: coord?.longitude ?? 0
                )
                uploadMessage = coord == nil ? "Entrada guardada (sin GPS)." : "Entrada guardada · GPS ok."
            case "photos":
                _ = try await ConsoleRepository.shared.evidencePhotos(
                    activityId: activityId, photoUrls: media.map(\.dataUrl))
                uploadMessage = "Evidencias guardadas."
            case "pdf":
                let pdf = media.first { $0.mimeType.contains("pdf") } ?? media[0]
                _ = try await ConsoleRepository.shared.evidenceServiceSheetPdf(
                    activityId: activityId, pdfUrl: pdf.dataUrl)
                uploadMessage = "PDF guardado."
            case "data":
                _ = try await ConsoleRepository.shared.evidenceServiceSheetData(activityId: activityId)
                uploadMessage = "Plantilla completada."
            case "exit":
                let coord = await DeviceLocation.shared.current()
                _ = try await ConsoleRepository.shared.evidenceExitPhoto(
                    activityId: activityId,
                    photoUrl: media[0].dataUrl,
                    lat: coord?.latitude ?? 0,
                    lng: coord?.longitude ?? 0
                )
                uploadMessage = coord == nil ? "✅ Flujo completado (sin GPS)." : "✅ Flujo completado · GPS ok."
            default: break
            }
            evidence = try await ConsoleRepository.shared.evidenceDetailItem(activityId: activityId)
            await reload()
        } catch { uploadMessage = "❌ \(error.localizedDescription)" }
    }

    private func downloadReport(_ activityId: Int64) async {
        do {
            reportData = try await ConsoleRepository.shared.ticketReportPdf(activityId: activityId)
        } catch { uploadMessage = "❌ No se pudo descargar el PDF" }
    }
}

private struct PDFSheetData: Identifiable {
    let id = UUID()
    let data: Data
}

struct OpsStatusChip: View {
    let text: String
    var body: some View {
        Text(text).font(.caption2).bold()
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Color.orange.opacity(0.15)).foregroundColor(.orange)
            .clipShape(Capsule())
    }
}
