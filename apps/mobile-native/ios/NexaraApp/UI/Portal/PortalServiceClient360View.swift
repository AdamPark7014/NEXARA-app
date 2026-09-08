import SwiftUI

/// Ficha 360 del cliente de servicio — GET `service-clients/{id}/snapshot`,
/// POST `service-clients/{id}/ticket-requests`, PATCH `client-ticket-requests/{id}`.
///
/// El snapshot sólo lo tenía la web (`crm/clients/[id]/tickets`). Es la pantalla
/// que abre soporte cuando el cliente llama por teléfono: ve sus sucursales, sus
/// actividades recientes y sus solicitudes, y levanta una solicitud en su nombre
/// sin colgar. El PATCH de notas internas sí lo tenía Android
/// (`OpsRepository.patchClientTicketNotes`) y en iOS faltaba.
struct PortalServiceClient360View: View {
    /// Si llega un id se abre directo; si no, se elige cliente arriba.
    var initialClientId: Int64?

    @State private var clients: [[String: Any]] = []
    @State private var selectedId: Int64?
    @State private var snapshot: PortalServiceClientSnapshot?
    @State private var isLoading = false
    @State private var error: String?
    @State private var message: String?

    @State private var showNewRequest = false
    @State private var notesTarget: ClientTicketRequest?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Cargando ficha…")
            } else if let s = snapshot {
                List {
                    if let error { Section { Text(error).foregroundColor(.red).font(.footnote) } }
                    if let message { Section { Text(message).foregroundColor(.green).font(.footnote) } }
                    clientPickerSection
                    countsSection(s)
                    ticketRequestsSection(s)
                    branchesSection(s)
                    activitiesSection(s)
                    projectsSection(s)
                    contractsSection(s)
                }
                .listStyle(.insetGrouped)
            } else {
                List {
                    clientPickerSection
                    if let error { Section { Text(error).foregroundColor(.red).font(.footnote) } }
                    Section {
                        Text(selectedId == nil
                             ? "Elige un cliente para ver su ficha."
                             : "No se pudo cargar la ficha de este cliente.")
                            .font(.footnote).foregroundColor(.secondary)
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("Ficha de cliente")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showNewRequest = true } label: {
                    Image(systemName: "square.and.pencil")
                }
                .disabled(selectedId == nil)
                .accessibilityLabel("Nueva solicitud")
            }
        }
        .task { await bootstrap() }
        .refreshable { await loadSnapshot() }
        .sheet(isPresented: $showNewRequest) {
            if let id = selectedId {
                NavigationStack {
                    PortalServiceClientRequestSheet(
                        serviceClientId: id,
                        branches: snapshot?.branches ?? []
                    ) { created in
                        showNewRequest = false
                        if created {
                            message = "Solicitud creada"
                            Task { await loadSnapshot() }
                        }
                    }
                }
            }
        }
        .sheet(item: $notesTarget) { req in
            NavigationStack {
                PortalTicketRequestNotesSheet(request: req) { saved in
                    notesTarget = nil
                    if saved {
                        message = "Nota interna guardada"
                        Task { await loadSnapshot() }
                    }
                }
            }
        }
    }

    // MARK: Secciones

    private var clientPickerSection: some View {
        Section {
            Menu {
                ForEach(clients.indices, id: \.self) { i in
                    let c = clients[i]
                    Button(ConsoleHelpers.mapStr(c, "name", "nombre")) {
                        selectedId = ConsoleHelpers.mapInt64(c, "id")
                        Task { await loadSnapshot() }
                    }
                }
            } label: {
                HStack {
                    Text("Cliente").foregroundColor(.primary)
                    Spacer()
                    Text(pickerLabel)
                        .foregroundColor(.secondary)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.caption).foregroundColor(.secondary)
                }
            }
        }
    }

    private func countsSection(_ s: PortalServiceClientSnapshot) -> some View {
        Section {
            HStack(spacing: 6) {
                countPill("Sucursales", s.branchCount)
                countPill("Actividades", s.activityCount)
                countPill("Proyectos", s.projectCount)
            }
            HStack(spacing: 6) {
                countPill("Contratos", s.contractCount)
                countPill("Solicitudes", s.ticketRequestCount)
                Spacer().frame(maxWidth: .infinity)
            }
        } header: {
            Text(s.name.isEmpty ? "Resumen" : s.name)
        }
    }

    private func ticketRequestsSection(_ s: PortalServiceClientSnapshot) -> some View {
        Section("Solicitudes (\(s.ticketRequests.count))") {
            if s.ticketRequests.isEmpty {
                Text("Sin solicitudes registradas.").font(.footnote).foregroundColor(.secondary)
            }
            ForEach(s.ticketRequests) { req in
                VStack(alignment: .leading, spacing: 5) {
                    Text(req.displayTitle).font(.subheadline).lineLimit(3)
                    HStack(spacing: 8) {
                        OpsStatusChip(text: req.status.isEmpty ? "—" : req.status)
                        if req.isHighUrgency {
                            Text("Urgente").font(.caption2).bold().foregroundColor(.red)
                        }
                        if !req.branchName.isEmpty {
                            Text(req.branchName).font(.caption).foregroundColor(.secondary)
                        }
                    }
                    // Nota interna: es el PATCH que faltaba en iOS.
                    Button {
                        notesTarget = req
                    } label: {
                        Label("Nota interna", systemImage: "note.text")
                            .font(.caption)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
                .padding(.vertical, 3)
            }
        }
    }

    private func branchesSection(_ s: PortalServiceClientSnapshot) -> some View {
        Section("Sucursales (\(s.branches.count))") {
            if s.branches.isEmpty {
                Text("Sin sucursales.").font(.footnote).foregroundColor(.secondary)
            }
            ForEach(s.branches.indices, id: \.self) { i in
                let b = s.branches[i]
                VStack(alignment: .leading, spacing: 2) {
                    Text(ConsoleHelpers.mapStr(b, "name", "nombre")).font(.subheadline)
                    let detail = [
                        ConsoleHelpers.mapStr(b, "branchNumber"),
                        ConsoleHelpers.mapStr(b, "city", "ciudad"),
                        ConsoleHelpers.mapStr(b, "state", "estado"),
                    ].filter { !$0.isEmpty }.joined(separator: " · ")
                    if !detail.isEmpty {
                        Text(detail).font(.caption).foregroundColor(.secondary)
                    }
                }
            }
        }
    }

    private func activitiesSection(_ s: PortalServiceClientSnapshot) -> some View {
        Section("Actividades recientes") {
            if s.recentActivities.isEmpty {
                Text("Sin actividades en los últimos 90 días.")
                    .font(.footnote).foregroundColor(.secondary)
            }
            ForEach(s.recentActivities.indices, id: \.self) { i in
                let a = s.recentActivities[i]
                VStack(alignment: .leading, spacing: 3) {
                    Text(ConsoleHelpers.mapStr(a, "anNumber", "folio")).font(.caption).bold()
                    Text(ConsoleHelpers.mapStr(a, "titulo", "title"))
                        .font(.subheadline).lineLimit(2)
                    HStack(spacing: 8) {
                        let estatus = ConsoleHelpers.mapStr(a, "estatus", "status")
                        if !estatus.isEmpty { OpsStatusChip(text: estatus) }
                        let branch = ConsoleHelpers.mapStr(a, "branchName")
                        if !branch.isEmpty {
                            Text(branch).font(.caption).foregroundColor(.secondary)
                        }
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private func projectsSection(_ s: PortalServiceClientSnapshot) -> some View {
        Section("Proyectos operativos") {
            if s.operationalProjects.isEmpty {
                Text("Sin proyectos.").font(.footnote).foregroundColor(.secondary)
            }
            ForEach(s.operationalProjects.indices, id: \.self) { i in
                let p = s.operationalProjects[i]
                HStack {
                    Text(ConsoleHelpers.mapStr(p, "title", "titulo")).font(.subheadline)
                    Spacer()
                    let st = ConsoleHelpers.mapStr(p, "status", "estatus")
                    if !st.isEmpty { OpsStatusChip(text: st) }
                }
            }
        }
    }

    private func contractsSection(_ s: PortalServiceClientSnapshot) -> some View {
        Section("Contratos de mantenimiento") {
            if s.maintenanceContracts.isEmpty {
                Text("Sin contratos.").font(.footnote).foregroundColor(.secondary)
            }
            ForEach(s.maintenanceContracts.indices, id: \.self) { i in
                let c = s.maintenanceContracts[i]
                HStack {
                    Text(ConsoleHelpers.mapStr(c, "name", "nombre", "title")).font(.subheadline)
                    Spacer()
                    let st = ConsoleHelpers.mapStr(c, "status", "estatus")
                    if !st.isEmpty { OpsStatusChip(text: st) }
                }
            }
        }
    }

    private func countPill(_ label: String, _ value: Int) -> some View {
        VStack(spacing: 2) {
            Text("\(value)").font(.headline)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    /// Nombre a mostrar en el selector: el del snapshot si ya cargó, y si no el
    /// del listado. Escrito sin encadenar opcionales a propósito — sin
    /// compilador a mano no me fío de `snapshot?.name.nilIfEmpty`.
    private var pickerLabel: String {
        if let s = snapshot, !s.name.isEmpty { return s.name }
        return currentClientName
    }

    private var currentClientName: String {
        guard let id = selectedId else { return "Elegir…" }
        for c in clients where ConsoleHelpers.mapInt64(c, "id") == id {
            return ConsoleHelpers.mapStr(c, "name", "nombre")
        }
        return String(id)
    }

    // MARK: Carga

    private func bootstrap() async {
        clients = (try? await ConsoleRepository.shared.serviceClients()) ?? []
        if selectedId == nil {
            selectedId = initialClientId ?? ConsoleHelpers.mapInt64(clients.first ?? [:], "id")
        }
        await loadSnapshot()
    }

    private func loadSnapshot() async {
        guard let id = selectedId else { return }
        isLoading = true
        error = nil
        defer { isLoading = false }
        snapshot = await PortalExtraRepository.shared.serviceClientSnapshot(id: id)
        if snapshot == nil { error = "No se pudo cargar la ficha del cliente \(id)." }
    }
}

// MARK: - Alta de solicitud en nombre del cliente

/// POST `service-clients/{id}/ticket-requests`.
struct PortalServiceClientRequestSheet: View {
    let serviceClientId: Int64
    let branches: [[String: Any]]
    let onDone: (Bool) -> Void

    @State private var description = ""
    @State private var branchId: Int64?
    @State private var urgency = "MEDIUM"
    @State private var requestType = "ISSUE"
    @State private var saving = false
    @State private var error: String?

    /// Los mismos valores que manda la web; la API los valida.
    private static let urgencies = ["LOW", "MEDIUM", "HIGH"]
    private static let types = ["ISSUE", "REQUEST", "MAINTENANCE"]

    private var canSave: Bool {
        !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !saving
    }

    var body: some View {
        Form {
            if let error {
                Section { Text(error).foregroundColor(.red).font(.footnote) }
            }
            Section("Descripción") {
                TextField("Qué necesita el cliente", text: $description, axis: .vertical)
                    .lineLimit(3...8)
            }
            Section("Clasificación") {
                Picker("Urgencia", selection: $urgency) {
                    ForEach(Self.urgencies, id: \.self) { u in
                        Text(Self.urgencyLabel(u)).tag(u)
                    }
                }
                Picker("Tipo", selection: $requestType) {
                    ForEach(Self.types, id: \.self) { t in
                        Text(Self.typeLabel(t)).tag(t)
                    }
                }
                Picker("Sucursal", selection: Binding(
                    get: { branchId ?? -1 },
                    set: { branchId = $0 < 0 ? nil : $0 }
                )) {
                    Text("Sin especificar").tag(Int64(-1))
                    ForEach(branches.indices, id: \.self) { i in
                        let b = branches[i]
                        Text(ConsoleHelpers.mapStr(b, "name", "nombre"))
                            .tag(ConsoleHelpers.mapInt64(b, "id") ?? Int64(-1))
                    }
                }
            }
            Section {
                Button(saving ? "Enviando…" : "Crear solicitud") { Task { await save() } }
                    .disabled(!canSave)
            }
        }
        .navigationTitle("Nueva solicitud")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancelar") { onDone(false) }
            }
        }
    }

    private static func urgencyLabel(_ raw: String) -> String {
        switch raw {
        case "LOW": return "Baja"
        case "HIGH": return "Alta"
        default: return "Media"
        }
    }

    private static func typeLabel(_ raw: String) -> String {
        switch raw {
        case "REQUEST": return "Petición"
        case "MAINTENANCE": return "Mantenimiento"
        default: return "Incidencia"
        }
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            try await PortalExtraRepository.shared.createServiceClientTicketRequest(
                serviceClientId: serviceClientId,
                description: description,
                branchId: branchId,
                urgency: urgency,
                requestType: requestType
            )
            onDone(true)
        } catch {
            self.error = error.toUserMessage()
        }
    }
}

// MARK: - Nota interna sobre una solicitud

/// PATCH `client-ticket-requests/{id}` con `{ notes }`.
struct PortalTicketRequestNotesSheet: View {
    let request: ClientTicketRequest
    let onDone: (Bool) -> Void

    @State private var notes = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        Form {
            if let error {
                Section { Text(error).foregroundColor(.red).font(.footnote) }
            }
            Section("Solicitud") {
                Text(request.displayTitle).font(.subheadline)
                if !request.status.isEmpty {
                    Text("Estado: \(request.status)").font(.caption).foregroundColor(.secondary)
                }
            }
            Section("Nota interna") {
                TextField("Visible sólo para el equipo", text: $notes, axis: .vertical)
                    .lineLimit(3...10)
            }
            Section {
                Button(saving ? "Guardando…" : "Guardar nota") { Task { await save() } }
                    .disabled(notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || saving)
            }
        }
        .navigationTitle("Nota interna")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancelar") { onDone(false) }
            }
        }
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            try await PortalExtraRepository.shared
                .updateClientTicketNotes(id: request.id, notes: notes)
            onDone(true)
        } catch {
            self.error = error.toUserMessage()
        }
    }
}
