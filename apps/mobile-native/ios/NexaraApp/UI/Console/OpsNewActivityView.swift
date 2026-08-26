import SwiftUI

/// Nueva OT desde mobile — paridad web `OpsActivityForm`.
struct OpsNewActivityView: View {
    var requestId: Int64? = nil
    var onDone: (Int) -> Void = { _ in }
    @Environment(\.dismiss) private var dismiss

    @State private var loading = true
    @State private var saving = false
    @State private var error: String?
    @State private var success: String?
    @State private var nextAn = ""
    @State private var projects: [OperationalProjectItem] = []
    @State private var users: [[String: Any]] = []
    @State private var tickets: [ClientTicketRequest] = []
    @State private var titulo = ""
    @State private var indicaciones = ""
    @State private var prioridad = "Media"
    @State private var projectId: Int?
    @State private var responsableId: Int?
    @State private var tiempoEstimado = ""
    @State private var fecha = ""
    @State private var branchName = ""
    @State private var pendingRequestId: Int64?

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView("Preparando formulario…")
                } else {
                    Form {
                        if !tickets.isEmpty {
                            Section("Tickets aprobados") {
                                ForEach(tickets.prefix(5)) { t in
                                    VStack(alignment: .leading) {
                                        Text("\(t.clientName) · \(t.branchName)").font(.subheadline.bold())
                                        if !t.description.isEmpty {
                                            Text(t.description).font(.caption)
                                        }
                                        Button("Usar solicitud") { prefill(t) }
                                    }
                                }
                            }
                        }
                        Section("OT") {
                            TextField("Título", text: $titulo)
                            Picker("Proyecto", selection: Binding(
                                get: { projectId ?? 0 },
                                set: { projectId = $0 > 0 ? $0 : nil },
                            )) {
                                Text("Seleccionar…").tag(0)
                                ForEach(activeProjects, id: \.id) { p in
                                    Text(p.title).tag(Int(p.id))
                                }
                            }
                            Picker("Responsable", selection: Binding(
                                get: { responsableId ?? 0 },
                                set: { responsableId = $0 > 0 ? $0 : nil },
                            )) {
                                Text("Seleccionar…").tag(0)
                                ForEach(users.indices, id: \.self) { idx in
                                    let u = users[idx]
                                    Text(ConsoleHelpers.mapStr(u, "nombre")).tag(ConsoleHelpers.mapInt(u, "id"))
                                }
                            }
                            TextField("Prioridad", text: $prioridad)
                            TextField("Fecha (YYYY-MM-DD)", text: $fecha)
                            TextField("Tiempo estimado (min)", text: $tiempoEstimado)
                            TextField("Indicaciones", text: $indicaciones, axis: .vertical)
                            if pendingRequestId != nil {
                                TextField("Sucursal", text: $branchName)
                            }
                        }
                        if let error {
                            Section { Text(error).foregroundStyle(.red) }
                        }
                        if let success {
                            Section { Text(success).foregroundStyle(.green) }
                        }
                    }
                }
            }
            .navigationTitle("Nueva OT")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "…" : "Asignar") { Task { await save() } }
                        .disabled(saving || titulo.isEmpty)
                }
            }
            .safeAreaInset(edge: .bottom) {
                if !nextAn.isEmpty {
                    Text("AN sugerido: \(nextAn)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .background(Color(.secondarySystemGroupedBackground))
                }
            }
            .task { await load() }
        }
    }

    private var activeProjects: [OperationalProjectItem] {
        projects.filter { $0.status.uppercased() == "ACTIVE" }
    }

    private func load() async {
        loading = true
        error = nil
        do {
            projects = try await ConsoleRepository.shared.operationalProjectItems()
            users = try await ConsoleRepository.shared.users()
            nextAn = try await ConsoleRepository.shared.nextAnNumber()
            tickets = try await OpsRepository.shared.clientTicketRequestItems(status: "APPROVED")
            if let requestId {
                if let t = tickets.first(where: { $0.id == requestId }) { prefill(t) }
            }
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func prefill(_ t: ClientTicketRequest) {
        pendingRequestId = t.id
        titulo = t.branchName.isEmpty ? "Ticket cliente" : "Ticket \(t.branchName)"
        indicaciones = t.description
        prioridad = t.urgency.uppercased() == "HIGH" ? "Alta" : (t.urgency.uppercased() == "LOW" ? "Baja" : "Media")
        branchName = t.branchName
        if let cid = t.clientId {
            let match = activeProjects.filter { $0.clientId == cid }
            if match.count == 1 { projectId = Int(match.first!.id) }
        }
        success = "Solicitud precargada"
    }

    private func save() async {
        guard let projectId, let responsableId else {
            error = "Proyecto y responsable son obligatorios"
            return
        }
        guard let uid = SessionStore.shared.currentUser?.id, let creadoPorId = Int(uid) else {
            error = "Sesión inválida"
            return
        }
        let project = activeProjects.first { Int($0.id) == projectId }
        var body: [String: Any] = [
            "titulo": titulo.trimmingCharacters(in: .whitespacesAndNewlines),
            "prioridad": prioridad,
            "projectId": projectId,
            "responsableId": responsableId,
            "creadoPorId": creadoPorId,
            "estatus": "Pendiente",
            "activityType": "INTERNAL",
            "ticketType": "PREVENTIVO",
            "workType": "ISSUE",
        ]
        if let clientId = project?.clientId { body["clientId"] = Int(clientId) }
        if let indicaciones = indicaciones.nilIfEmpty { body["indicaciones"] = indicaciones }
        if let mins = Int(tiempoEstimado) { body["tiempoEstimadoMin"] = mins }
        if !fecha.isEmpty { body["fechaInicio"] = "\(fecha)T08:00:00.000Z" }
        if let branchName = branchName.nilIfEmpty { body["branchName"] = branchName }
        saving = true
        error = nil
        do {
            let newId = try await ConsoleRepository.shared.createActivity(body: body)
            if let pendingRequestId {
                try await OpsRepository.shared.assignClientTicket(requestId: pendingRequestId, activityId: newId)
            }
            success = "OT asignada"
            onDone(Int(newId))
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
        saving = false
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
