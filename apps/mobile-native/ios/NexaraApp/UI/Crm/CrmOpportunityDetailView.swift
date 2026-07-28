import PhotosUI
import SwiftUI

struct CrmOpportunityDetailView: View {
    let oppId: Int
    let onBack: () -> Void

    @State private var detail = CrmOpportunityDetail()
    @State private var isLoading = true
    @State private var error: String?
    @State private var tab = 0
    @State private var noteText = ""
    @State private var savingNote = false
    @State private var uploading = false
    @State private var actionError: String?
    @State private var pickerItem: PhotosPickerItem?
    @State private var showEdit = false
    @State private var editForm = OpportunityFormState()
    @State private var savingEdit = false
    @State private var showDeleteConfirm = false
    @State private var pdfData: Data?
    @State private var pdfTitle = ""

    private let tabs = ["Resumen", "Notas", "Adjuntos", "Cotizaciones", "Historial"]

    var body: some View {
        Group {
            if let pdfData {
                VStack(spacing: 0) {
                    HStack {
                        Button("Cerrar") { self.pdfData = nil }
                        Text(pdfTitle.isEmpty ? "Cotización PDF" : pdfTitle)
                            .font(.headline)
                            .lineLimit(1)
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    PDFViewerView(data: pdfData)
                }
            } else {
                detailBody
            }
        }
        .navigationBarHidden(true)
        .task { await reload() }
        .sheet(isPresented: $showEdit) {
            OpportunityFormSheet(
                title: "Editar oportunidad",
                state: $editForm,
                saving: savingEdit,
                error: actionError,
                onDismiss: { showEdit = false },
                onSave: { Task { await saveEdit() } }
            )
        }
        .alert("Eliminar oportunidad", isPresented: $showDeleteConfirm) {
            Button("Eliminar", role: .destructive) { Task { await deleteOpp() } }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("¿Eliminar esta oportunidad del pipeline?")
        }
    }

    private var detailBody: some View {
        VStack(spacing: 0) {
            HStack {
                Button("← Volver", action: onBack)
                Text(detail.displayTitle)
                    .font(.headline)
                    .lineLimit(1)
                Spacer()
                Button("Editar") {
                    editForm = OpportunityFormState.from(detail.raw)
                    actionError = nil
                    showEdit = true
                }
                Button("Eliminar", role: .destructive) { showDeleteConfirm = true }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)

            Picker("Sección", selection: $tab) {
                ForEach(0..<tabs.count, id: \.self) { i in
                    Text(tabs[i]).tag(i)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)

            Group {
                if isLoading {
                    Spacer(); ProgressView(); Spacer()
                } else if let error, detail.isEmpty {
                    NxEmptyState(
                        title: "No se pudo cargar",
                        subtitle: error,
                        actionLabel: "Reintentar",
                        onAction: { Task { await reload() } }
                    )
                } else {
                    switch tab {
                    case 0: summaryTab
                    case 1: notesTab
                    case 2: attachmentsTab
                    case 3: quotesTab
                    default: historialTab
                    }
                }
            }
        }
    }

    private var summaryTab: some View {
        List {
            Section {
                CrmStageChip(text: detail.stageKey)
            }
            Section("Datos") {
                oppRow("Valor", crmMxn(detail.value))
                if detail.probability > 0 {
                    oppRow("Probabilidad", "\(Int(detail.probability))%")
                }
                oppRow("Cliente", detail.clientName)
                oppRow("Cierre", String(detail.expectedCloseDate.prefix(10)))
                oppRow("Descripción", detail.description)
            }
        }
        .listStyle(.insetGrouped)
    }

    private var notesTab: some View {
        VStack(spacing: 0) {
            List {
                if let actionError {
                    Text(actionError).foregroundColor(.red).font(.footnote)
                }
                if detail.notes.isEmpty {
                    NxEmptyState(
                        title: "Sin notas",
                        subtitle: "Agrega notas de seguimiento para el equipo comercial."
                    )
                } else {
                    ForEach(detail.notes) { note in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(note.message)
                            Text(String(note.createdAt.prefix(16)))
                                .font(.caption2).foregroundColor(.secondary)
                        }
                    }
                }
            }
            VStack(spacing: 8) {
                TextField("Nueva nota de seguimiento…", text: $noteText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(2...4)
                    .padding(.horizontal)
                Button(savingNote ? "Guardando…" : "Agregar nota") {
                    Task { await addNote() }
                }
                .disabled(savingNote || noteText.trimmingCharacters(in: .whitespaces).isEmpty)
                .padding(.horizontal)
                .padding(.bottom, 8)
            }
        }
    }

    private var attachmentsTab: some View {
        List {
            if uploading { ProgressView() }
            if let actionError {
                Text(actionError).foregroundColor(.red).font(.footnote)
            }
            Section("Subir archivo") {
                PhotosPicker(selection: $pickerItem, matching: .any(of: [.images, .not(.livePhotos)])) {
                    Label("Foto o imagen", systemImage: "photo")
                }
                .onChange(of: pickerItem) { item in
                    Task {
                        guard let item,
                              let raw = try? await item.loadTransferable(type: Data.self) else { return }
                        await upload(data: raw, name: "evidencia.jpg", mime: "image/jpeg")
                    }
                }
            }
            if detail.attachments.isEmpty {
                NxEmptyState(
                    title: "Sin adjuntos",
                    subtitle: "Sube fotos o documentos vinculados a esta oportunidad."
                )
            } else {
                ForEach(detail.attachments) { ev in
                    VStack(alignment: .leading) {
                        Text(ev.displayName).font(.headline)
                        Text(ApiUrls.absoluteAsset(ev.url))
                            .font(.caption).foregroundColor(.secondary)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var quotesTab: some View {
        List {
            if detail.quotes.isEmpty {
                NxEmptyState(
                    title: "Sin cotizaciones",
                    subtitle: "Las cotizaciones vinculadas a esta oportunidad aparecerán aquí."
                )
            } else {
                ForEach(detail.quotes) { q in
                    Button {
                        if !q.pdfUrl.isEmpty {
                            Task { await openQuotePdf(url: q.pdfUrl, title: q.displayLabel) }
                        }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(q.displayLabel).font(.headline)
                            if !q.pdfUrl.isEmpty {
                                Text("Toca para ver PDF").font(.caption).foregroundColor(.accentColor)
                            }
                            Text(String(q.createdAt.prefix(16)))
                                .font(.caption).foregroundColor(.secondary)
                        }
                    }
                    .disabled(q.pdfUrl.isEmpty)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var historialTab: some View {
        Group {
            if detail.history.isEmpty {
                NxEmptyState(
                    title: "Sin historial",
                    subtitle: "Los cambios de etapa y actividad se registrarán aquí."
                )
            } else {
                List(Array(detail.history.prefix(50))) { h in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(h.displayAction).font(.subheadline).bold()
                            Spacer()
                            if !h.createdAt.isEmpty {
                                Text(String(h.createdAt.prefix(16)))
                                    .font(.caption2).foregroundColor(.secondary)
                            }
                        }
                        if !h.userName.isEmpty {
                            Text("Por: \(h.userName)").font(.caption).foregroundColor(.secondary)
                        }
                        if !h.detail.isEmpty {
                            Text(h.detail).font(.caption).foregroundColor(.secondary).lineLimit(3)
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    private func oppRow(_ label: String, _ value: String) -> some View {
        Group {
            if !value.isEmpty && value != "—" {
                HStack {
                    Text(label).foregroundColor(.secondary)
                    Spacer()
                    Text(value)
                }
            }
        }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            detail = try await CrmRepository.shared.opportunityDetail(id: oppId)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func addNote() async {
        savingNote = true
        defer { savingNote = false }
        do {
            try await CrmRepository.shared.addOpportunityNote(id: oppId, message: noteText.trimmingCharacters(in: .whitespaces))
            noteText = ""
            await reload()
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func upload(data fileData: Data, name: String, mime: String) async {
        uploading = true
        defer { uploading = false }
        do {
            try await CrmRepository.shared.uploadOpportunityEvidences(id: oppId, fileData: fileData, fileName: name, mimeType: mime)
            pickerItem = nil
            await reload()
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func saveEdit() async {
        savingEdit = true
        defer { savingEdit = false }
        do {
            _ = try await CrmRepository.shared.updateOpportunity(id: oppId, fields: editForm.toPayload())
            showEdit = false
            await reload()
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func deleteOpp() async {
        do {
            try await CrmRepository.shared.deleteOpportunity(id: oppId)
            onBack()
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func openQuotePdf(url: String, title: String) async {
        do {
            let bytes = try await CrmRepository.shared.downloadAssetBytes(url)
            pdfTitle = title
            pdfData = bytes
        } catch {
            actionError = error.localizedDescription
        }
    }
}
