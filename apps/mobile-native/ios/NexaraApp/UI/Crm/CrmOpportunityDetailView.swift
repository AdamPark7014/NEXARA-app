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
    @State private var activities: [CrmActivity] = []
    @State private var loadingActivities = false
    @State private var completingActivity = false
    @State private var showStagePicker = false
    @State private var pickedStage = "DISCOVERY"
    @State private var updatingStage = false

    // Alta / edición / borrado de tareas CRM. Antes sólo se podía marcar
    // completada: reprogramar una llamada —lo que de verdad se hace desde la
    // calle— obligaba a abrir la web.
    @State private var activityForm: CrmActivityFormTarget?
    @State private var activitySubject = ""
    @State private var activityNotes = ""
    @State private var activityType = "CALL"
    @State private var activityDue = Date()
    @State private var savingActivity = false
    @State private var pendingDeleteActivity: CrmActivity?

    private let tabs = ["Resumen", "Notas", "Actividades", "Adjuntos", "Cotizaciones", "Historial"]

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
        .confirmationDialog("Cambiar etapa", isPresented: $showStagePicker, titleVisibility: .visible) {
            ForEach(opportunityStages, id: \.id) { s in
                Button(s.label) {
                    pickedStage = s.id
                    Task { await updateStage() }
                }
            }
            Button("Cancelar", role: .cancel) {}
        }
        .alert("Eliminar oportunidad", isPresented: $showDeleteConfirm) {
            Button("Eliminar", role: .destructive) { Task { await deleteOpp() } }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("¿Eliminar esta oportunidad del pipeline?")
        }
        .sheet(item: $activityForm) { target in
            activitySheet(target)
        }
        .alert(
            "Eliminar tarea",
            isPresented: Binding(
                get: { pendingDeleteActivity != nil },
                set: { if !$0 { pendingDeleteActivity = nil } }
            )
        ) {
            Button("Eliminar", role: .destructive) { Task { await deleteActivity() } }
            Button("Cancelar", role: .cancel) { pendingDeleteActivity = nil }
        } message: {
            Text("Se borra «\(pendingDeleteActivity?.displayTitle ?? "la tarea")». No hay papelera.")
        }
    }

    /// Formulario compartido por alta y edición: sólo cambia el título y a qué
    /// endpoint va al guardar.
    private func activitySheet(_ target: CrmActivityFormTarget) -> some View {
        NavigationStack {
            Form {
                Section("Tarea") {
                    TextField("Asunto", text: $activitySubject)
                    Picker("Tipo", selection: $activityType) {
                        ForEach(crmActivityTypes, id: \.key) { t in
                            Text(t.label).tag(t.key)
                        }
                    }
                    DatePicker("Vence", selection: $activityDue)
                }
                Section("Notas") {
                    TextField("Detalle (opcional)", text: $activityNotes, axis: .vertical)
                        .lineLimit(2...5)
                }
                if let actionError {
                    Section { Text(actionError).font(.footnote).foregroundColor(.red) }
                }
            }
            .navigationTitle(target.isNew ? "Nueva tarea" : "Editar tarea")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { activityForm = nil }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(savingActivity ? "Guardando…" : "Guardar") {
                        Task { await saveActivity(target) }
                    }
                    .disabled(
                        savingActivity ||
                        activitySubject.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    )
                }
            }
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
            .onChange(of: tab) { newTab in
                if newTab == 2 && activities.isEmpty && !loadingActivities {
                    Task { await loadActivities() }
                }
            }

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
                    case 2: activitiesTab
                    case 3: attachmentsTab
                    case 4: quotesTab
                    default: historialTab
                    }
                }
            }
        }
    }

    private var summaryTab: some View {
        List {
            Section {
                Button {
                    pickedStage = detail.stageKey.isEmpty ? "DISCOVERY" : detail.stageKey
                    showStagePicker = true
                } label: {
                    HStack {
                        CrmStageChip(text: detail.stageKey)
                        Spacer()
                        Text(updatingStage ? "Actualizando…" : "Cambiar etapa")
                            .font(.caption)
                            .foregroundColor(.accentColor)
                    }
                }
                .disabled(updatingStage)
            }
            if let actionError {
                Section { Text(actionError).foregroundColor(.red).font(.footnote) }
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

    private var activitiesTab: some View {
        List {
            if let actionError {
                Section { Text(actionError).foregroundColor(.red).font(.footnote) }
            }
            Section {
                Button {
                    prepareNewActivity()
                } label: {
                    Label("Nueva tarea", systemImage: "plus.circle")
                }
                .disabled(oppId <= 0)
            }
            if loadingActivities {
                ProgressView()
            } else if activities.isEmpty {
                NxEmptyState(
                    title: "Sin actividades",
                    subtitle: "Las tareas CRM vinculadas a esta oportunidad aparecerán aquí."
                )
            } else {
                ForEach(activities) { act in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(act.displayTitle).font(.subheadline.bold())
                            Spacer()
                            Text(act.status).font(.caption2).foregroundColor(.secondary)
                        }
                        if !act.activityType.isEmpty {
                            Text(act.activityType).font(.caption).foregroundColor(.secondary)
                        }
                        if !act.dueDate.isEmpty {
                            Text(String(act.dueDate.prefix(16)))
                                .font(.caption2)
                                .foregroundColor(act.isOverdue ? .red : .secondary)
                        }
                        if act.isPending {
                            Button(completingActivity ? "Completando…" : "Marcar completada") {
                                Task { await completeActivity(act.id) }
                            }
                            .font(.caption)
                            .disabled(completingActivity)
                        }
                    }
                    .padding(.vertical, 2)
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            pendingDeleteActivity = act
                        } label: {
                            Label("Eliminar", systemImage: "trash")
                        }
                        Button {
                            prepareEditActivity(act)
                        } label: {
                            Label("Editar", systemImage: "pencil")
                        }
                        .tint(.blue)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await loadActivities() }
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
            if tab == 2 { await loadActivities() }
        } catch {
            self.error = error.toUserMessage()
        }
    }

    private func loadActivities() async {
        loadingActivities = true
        defer { loadingActivities = false }
        do {
            activities = try await CrmRepository.shared.crmActivitiesForOpportunity(opportunityId: Int64(oppId))
            actionError = nil
        } catch {
            actionError = error.toUserMessage()
        }
    }

    private func completeActivity(_ id: Int64) async {
        completingActivity = true
        defer { completingActivity = false }
        do {
            try await CrmRepository.shared.completeCrmActivity(id: id, outcome: "Completada desde móvil")
            await loadActivities()
        } catch {
            actionError = error.toUserMessage()
        }
    }

    // MARK: – Tareas CRM: alta, edición y borrado

    private func prepareNewActivity() {
        activitySubject = ""
        activityNotes = ""
        activityType = "CALL"
        // Por defecto mañana a la misma hora: casi ninguna tarea que se crea
        // desde la calle es para hoy mismo.
        activityDue = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
        actionError = nil
        activityForm = CrmActivityFormTarget(activityId: nil)
    }

    private func prepareEditActivity(_ act: CrmActivity) {
        activitySubject = act.displayTitle
        activityNotes = act.notes
        activityType = act.activityType.isEmpty ? "TASK" : act.activityType.uppercased()
        activityDue = CrmActivityFormTarget.parseDate(act.dueDate) ?? Date()
        actionError = nil
        activityForm = CrmActivityFormTarget(activityId: act.id)
    }

    private func saveActivity(_ target: CrmActivityFormTarget) async {
        savingActivity = true
        defer { savingActivity = false }
        let iso = ISO8601DateFormatter().string(from: activityDue)
        do {
            if let id = target.activityId {
                _ = try await CrmRepository.shared.updateCrmActivity(
                    id: id,
                    subject: activitySubject,
                    dueDate: iso,
                    activityType: activityType,
                    description: activityNotes
                )
            } else {
                _ = try await CrmRepository.shared.createCrmActivity(
                    opportunityId: Int64(oppId),
                    subject: activitySubject,
                    dueDate: iso,
                    activityType: activityType,
                    description: activityNotes
                )
            }
            actionError = nil
            activityForm = nil
            await loadActivities()
        } catch {
            actionError = error.toUserMessage()
        }
    }

    private func deleteActivity() async {
        guard let act = pendingDeleteActivity, act.id > 0 else { pendingDeleteActivity = nil; return }
        defer { pendingDeleteActivity = nil }
        do {
            try await CrmRepository.shared.deleteCrmActivity(id: act.id)
            actionError = nil
            await loadActivities()
        } catch {
            actionError = error.toUserMessage()
        }
    }

    private func updateStage() async {
        updatingStage = true
        defer { updatingStage = false }
        do {
            _ = try await CrmRepository.shared.updateOpportunityStage(id: oppId, stage: pickedStage)
            showStagePicker = false
            await reload()
        } catch {
            actionError = error.toUserMessage()
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
            actionError = error.toUserMessage()
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
            actionError = error.toUserMessage()
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
            actionError = error.toUserMessage()
        }
    }

    private func deleteOpp() async {
        do {
            try await CrmRepository.shared.deleteOpportunity(id: oppId)
            onBack()
        } catch {
            actionError = error.toUserMessage()
        }
    }

    private func openQuotePdf(url: String, title: String) async {
        do {
            let bytes = try await CrmRepository.shared.downloadAssetBytes(url)
            pdfTitle = title
            pdfData = bytes
        } catch {
            actionError = error.toUserMessage()
        }
    }
}

/// Identifica qué está editando la hoja de tarea CRM: `nil` = alta nueva.
///
/// Existe sólo para poder usar `.sheet(item:)`, que exige `Identifiable`, sin
/// arrastrar un segundo booleano de estado que se desincronice con el id.
struct CrmActivityFormTarget: Identifiable {
    let activityId: Int64?

    var id: String { activityId.map(String.init) ?? "nueva" }
    var isNew: Bool { activityId == nil }

    /// El backend serializa `dueDate` como ISO-8601, a veces con milisegundos y
    /// a veces sin ellos. Se prueban las dos variantes antes de rendirse.
    static func parseDate(_ raw: String) -> Date? {
        guard !raw.isEmpty else { return nil }
        let withFractional = ISO8601DateFormatter()
        withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = withFractional.date(from: raw) { return d }
        if let d = ISO8601DateFormatter().date(from: raw) { return d }
        let plain = DateFormatter()
        plain.locale = Locale(identifier: "en_US_POSIX")
        plain.dateFormat = "yyyy-MM-dd"
        return plain.date(from: String(raw.prefix(10)))
    }
}

/// Valores de `CrmActivityType` en Prisma. El backend rechaza cualquier otro,
/// así que el picker no puede ser texto libre.
let crmActivityTypes: [(key: String, label: String)] = [
    ("CALL", "Llamada"),
    ("EMAIL", "Correo"),
    ("MEETING", "Reunión"),
    ("VISIT", "Visita"),
    ("WHATSAPP", "WhatsApp"),
    ("TASK", "Tarea"),
    ("NOTE", "Nota"),
]
