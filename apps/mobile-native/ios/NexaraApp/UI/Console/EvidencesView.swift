import SwiftUI

// MARK: - Evidences

struct EvidencesView: View {
    var reviewMode: Bool = false

    @State private var rows: [[String: Any]] = []
    @State private var myActivities: [[String: Any]] = []
    @State private var query = ""
    @State private var statusFilter = "Todos"
    @State private var isLoading = true
    @State private var error: String?
    @State private var selectedActivityId: Int64?
    @State private var evidence: [String: Any]?
    @State private var uploadMessage: String?
    @State private var uploading = false
    @State private var reportData: Data?

    private var statuses: [String] {
        var s = Set(rows.compactMap { ConsoleHelpers.mapStr($0, "status", "estado").ifEmptyNil })
        return ["Todos"] + s.sorted()
    }

    private var filtered: [[String: Any]] {
        var list = rows
        if statusFilter != "Todos" {
            list = list.filter { ConsoleHelpers.mapStr($0, "status", "estado") == statusFilter }
        }
        if !query.isEmpty {
            let q = query.lowercased()
            list = list.filter {
                ConsoleHelpers.mapStr($0, "activityAn", "anNumber", "titulo").lowercased().contains(q) ||
                ConsoleHelpers.mapStr($0, "clientName", "cliente").lowercased().contains(q)
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
        .task { await reload() }
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
                if !reviewMode && !myActivities.isEmpty {
                    Text("Actividades asignadas").font(.headline)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(myActivities.prefix(12), id: \.actKey) { act in
                                Button {
                                    if let id = ConsoleHelpers.mapInt64(act, "id") {
                                        Task { await openActivity(id) }
                                    }
                                } label: {
                                    Text(ConsoleHelpers.mapStr(act, "titulo", "anNumber") )
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

                if isLoading { ProgressView().frame(maxWidth: .infinity).padding(.top, 40) }
                else if let error, rows.isEmpty {
                    Text(error).foregroundColor(.red).frame(maxWidth: .infinity).padding()
                } else if filtered.isEmpty {
                    Text("Sin evidencias").foregroundColor(.secondary).frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    ForEach(filtered.prefix(60), id: \.evKey) { row in
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

    private func evidenceRow(_ row: [String: Any]) -> some View {
        let an = ConsoleHelpers.mapStr(row, "activityAn", "anNumber", "titulo")
        let client = ConsoleHelpers.mapStr(row, "clientName", "cliente")
        let status = ConsoleHelpers.mapStr(row, "status", "estado")
        return Button {
            if let id = ConsoleHelpers.mapInt64(row, "activityId", "id") {
                Task { await openActivity(id) }
            }
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(an.isEmpty ? "Actividad" : an).font(.subheadline).bold()
                    if !client.isEmpty { Text(client).font(.caption).foregroundColor(.secondary) }
                    OpsStatusChip(text: status.isEmpty ? "—" : status)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundColor(.secondary)
            }
            .padding(12)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
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

    private func workflowSteps(_ ev: [String: Any]?) -> [WorkflowStep] {
        let e = ev ?? [:]
        return [
            WorkflowStep(key: "entry", title: "1. Foto de entrada", done: e["entryPhotoUrl"] != nil),
            WorkflowStep(key: "photos", title: "2. Fotos de evidencia", done: (e["evidencePhotoUrls"] as? [Any])?.isEmpty == false),
            WorkflowStep(key: "pdf", title: "3. Hoja de servicio (PDF)", done: e["serviceSheetPdfUrl"] != nil),
            WorkflowStep(key: "data", title: "4. Completar plantilla", done: e["serviceSheetCompleted"] as? Bool == true),
            WorkflowStep(key: "exit", title: "5. Foto de salida", done: e["exitPhotoUrl"] != nil),
        ]
    }

    private func reload() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do {
            if reviewMode {
                rows = try await ConsoleRepository.shared.evidenceReviewHistory()
            } else {
                async let hist = ConsoleRepository.shared.myEvidenceHistory()
                async let acts = ConsoleRepository.shared.activities(scope: "mine")
                rows = try await hist
                myActivities = (try? await acts) ?? []
            }
        } catch { self.error = error.localizedDescription }
    }

    private func openActivity(_ id: Int64) async {
        selectedActivityId = id
        uploadMessage = nil
        do { evidence = try await ConsoleRepository.shared.evidenceDetail(activityId: id) }
        catch { uploadMessage = "❌ \(error.localizedDescription)" }
    }

    private func submitStep(_ key: String, activityId: Int64, media: [CapturedMedia]) async {
        guard !media.isEmpty else { return }
        uploading = true; uploadMessage = nil
        defer { uploading = false }
        do {
            switch key {
            case "entry":
                _ = try await ConsoleRepository.shared.evidenceEntryPhoto(
                    activityId: activityId, photoUrl: media[0].dataUrl)
                uploadMessage = "Entrada guardada."
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
                _ = try await ConsoleRepository.shared.evidenceExitPhoto(
                    activityId: activityId, photoUrl: media[0].dataUrl)
                uploadMessage = "✅ Flujo completado."
            default: break
            }
            evidence = try await ConsoleRepository.shared.evidenceDetail(activityId: activityId)
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

extension String {
    fileprivate var ifEmptyNil: String? { isEmpty ? nil : self }
}

extension [String: Any] {
    fileprivate var evKey: String {
        if let id = self["activityId"] ?? self["id"] { return "ev-\(id)" }
        return UUID().uuidString
    }
    fileprivate var actKey: String {
        if let id = self["id"] { return "act-\(id)" }
        return UUID().uuidString
    }
}
