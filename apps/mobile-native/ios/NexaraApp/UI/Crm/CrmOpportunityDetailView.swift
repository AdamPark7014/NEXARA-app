import PhotosUI
import SwiftUI

struct CrmOpportunityDetailView: View {
    let oppId: Int
    let onBack: () -> Void

    @State private var data: [String: Any] = [:]
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
                Text(oppStr(data, "title", "name", "titulo").isEmpty ? "Oportunidad" : oppStr(data, "title", "name", "titulo"))
                    .font(.headline)
                    .lineLimit(1)
                Spacer()
                Button("Editar") {
                    editForm = OpportunityFormState.from(data)
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
                } else if let error, data.isEmpty {
                    VStack(spacing: 12) {
                        Text(error).foregroundColor(.red)
                        Button("Reintentar") { Task { await reload() } }
                    }
                    .padding()
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
                CrmStageChip(text: oppStr(data, "stage", "etapa", "status"))
            }
            Section("Datos") {
                oppRow("Valor", crmMxn(oppDouble(data, "value", "amount") ?? 0))
                oppRow("Probabilidad", "\(oppStr(data, "probability", "probabilidad"))%")
                oppRow("Cliente", oppStr(data, "clientName") + nestedClient(data))
                oppRow("Cierre", String(oppStr(data, "expectedCloseDate", "closeDate").prefix(10)))
                oppRow("Descripción", oppStr(data, "description", "descripcion"))
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
                let notes = nestedMaps(data, "notes") + nestedMaps(data, "notas")
                if notes.isEmpty {
                    Text("Sin notas de seguimiento").foregroundColor(.secondary)
                } else {
                    ForEach(Array(notes.enumerated()), id: \.offset) { _, note in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(oppStr(note, "message", "mensaje", "content"))
                            Text(String(oppStr(note, "createdAt", "fecha").prefix(16)))
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
            let evidences = nestedMaps(data, "evidences") + nestedMaps(data, "evidencias")
            if evidences.isEmpty {
                Text("Sin archivos adjuntos").foregroundColor(.secondary)
            } else {
                ForEach(Array(evidences.enumerated()), id: \.offset) { _, ev in
                    VStack(alignment: .leading) {
                        Text(oppStr(ev, "name", "nombre", "fileName").isEmpty ? "Archivo" : oppStr(ev, "name", "nombre", "fileName"))
                            .font(.headline)
                        Text(ApiUrls.absoluteAsset(oppStr(ev, "url", "fileUrl")))
                            .font(.caption).foregroundColor(.secondary)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var quotesTab: some View {
        List {
            let quotes = nestedMaps(data, "quotes") + nestedMaps(data, "cotizaciones")
            if quotes.isEmpty {
                Text("Sin cotizaciones vinculadas").foregroundColor(.secondary)
            } else {
                ForEach(Array(quotes.enumerated()), id: \.offset) { _, q in
                    let pdfUrl = oppStr(q, "pdfUrl", "url")
                    let label = oppStr(q, "versionLabel", "folio", "name").isEmpty ? "Cotización" : oppStr(q, "versionLabel", "folio", "name")
                    Button {
                        if !pdfUrl.isEmpty { Task { await openQuotePdf(url: pdfUrl, title: label) } }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(label).font(.headline)
                            if !pdfUrl.isEmpty {
                                Text("Toca para ver PDF").font(.caption).foregroundColor(.accentColor)
                            }
                            Text(String(oppStr(q, "createdAt", "fecha").prefix(16)))
                                .font(.caption).foregroundColor(.secondary)
                        }
                    }
                    .disabled(pdfUrl.isEmpty)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var historialTab: some View {
        let history = nestedMaps(data, "history")
            + nestedMaps(data, "historial")
            + nestedMaps(data, "activityLog")
            + nestedMaps(data, "changelog")
        return Group {
            if history.isEmpty {
                VStack { Spacer(); Text("Sin historial de cambios").foregroundColor(.secondary); Spacer() }
            } else {
                List(Array(history.prefix(50).enumerated()), id: \.offset) { _, h in
                    let action  = oppStr(h, "action", "accion", "event", "type")
                    let by      = oppStr(h, "userName", "createdByName", "usuario")
                    let date    = String(oppStr(h, "createdAt", "timestamp", "fecha").prefix(16))
                    let detail  = oppStr(h, "detail", "description", "changes", "mensaje")
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(action.isEmpty ? "Cambio" : action).font(.subheadline).bold()
                            Spacer()
                            if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
                        }
                        if !by.isEmpty { Text("Por: \(by)").font(.caption).foregroundColor(.secondary) }
                        if !detail.isEmpty { Text(detail).font(.caption).foregroundColor(.secondary).lineLimit(3) }
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    private func oppRow(_ label: String, _ value: String) -> some View {
        Group {
            if !value.isEmpty && value != "—" && value != "0%" {
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
            data = try await CrmRepository.shared.getOpportunity(id: oppId)
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

    private func oppStr(_ m: [String: Any], _ keys: String...) -> String {
        for k in keys {
            if let s = m[k] as? String, !s.isEmpty { return s }
            if let n = m[k] { let s = "\(n)"; if s != "nil" && !s.isEmpty { return s } }
        }
        return ""
    }

    private func oppDouble(_ m: [String: Any], _ keys: String...) -> Double? {
        for k in keys {
            if let n = m[k] as? Double { return n }
            if let n = m[k] as? Int { return Double(n) }
            if let s = m[k] as? String { return Double(s) }
        }
        return nil
    }

    private func nestedMaps(_ m: [String: Any], _ key: String) -> [[String: Any]] {
        guard let arr = m[key] as? [[String: Any]] else { return [] }
        return arr
    }

    private func nestedClient(_ m: [String: Any]) -> String {
        guard let c = m["client"] as? [String: Any] else { return "" }
        let n = oppStr(c, "name", "nombre")
        return n.isEmpty ? "" : " (\(n))"
    }
}
