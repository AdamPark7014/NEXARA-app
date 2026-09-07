import SwiftUI

/// Visitantes: recurrentes (principal), citas puntuales y alta. Paridad `IntegraVisitorsScreen`.
struct IntegraVisitorsView: View {
    @StateObject private var vm = IntegraVisitorsVM()
    @State private var showCreate = false

    var body: some View {
        Group {
            if vm.loading && vm.recurring.isEmpty && vm.appointments.isEmpty {
                ProgressView("Cargando visitantes…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = vm.error, vm.recurring.isEmpty {
                NxEmptyState(title: "No se pudieron cargar", subtitle: error, actionLabel: "Reintentar") {
                    Task { await vm.refresh() }
                }
            } else {
                listBody
            }
        }
        .navigationTitle("Visitantes")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showCreate = true } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .task { await vm.refresh() }
        .refreshable { await vm.refresh(initial: false) }
        .sheet(isPresented: $showCreate) {
            IntegraCreateRecurringVisitorSheet(
                doors: vm.doors,
                sending: vm.creating,
                error: vm.createError,
                onCreate: { draft in
                    Task {
                        if await vm.create(draft) {
                            showCreate = false
                        }
                    }
                },
                onDismiss: { if !vm.creating { showCreate = false } }
            )
        }
        .confirmationDialog(
            "Cancelar visita recurrente",
            isPresented: Binding(
                get: { vm.cancelTarget != nil },
                set: { if !$0 && !vm.cancelling { vm.cancelTarget = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Cancelar acceso", role: .destructive) {
                Task { await vm.confirmCancel() }
            }
            Button("Conservar", role: .cancel) {
                if !vm.cancelling { vm.cancelTarget = nil }
            }
        } message: {
            Text("Apaga el acceso de esta persona en las puertas asignadas. No se puede deshacer desde el teléfono.")
        }
    }

    private var listBody: some View {
        List {
            Section {
                Picker("Vista", selection: $vm.tab) {
                    Text("Recurrentes").tag(0)
                    Text("Citas").tag(1)
                }
                .pickerStyle(.segmented)
            }

            if let message = vm.message {
                Section {
                    NxAlertBanner(alert: NxAlert(
                        id: "msg",
                        title: message,
                        tone: vm.messageIsError ? .danger : .success
                    ))
                }
            }

            if vm.tab == 0 {
                recurringSections
            } else {
                appointmentsSections
            }
        }
    }

    @ViewBuilder
    private var recurringSections: some View {
        if !vm.note.isEmpty {
            Section {
                NxAlertBanner(alert: NxAlert(id: "note", title: vm.note, tone: .info))
            }
        }
        Section {
            HStack {
                Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                TextField("Nombre, anfitrión o teléfono", text: $vm.query)
                    .autocorrectionDisabled()
            }
            Text("\(vm.filteredRecurring.count) de \(vm.recurring.count)")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        if vm.filteredRecurring.isEmpty {
            Section {
                NxEmptyState(
                    title: "Sin visitantes",
                    subtitle: "No hay visitas recurrentes. Usa + para dar de alta (camino principal en sitios ISAPI)."
                )
            }
        } else {
            ForEach(vm.filteredRecurring) { row in
                visitorRow(row)
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            vm.cancelTarget = row
                        } label: {
                            Text("Cancelar")
                        }
                    }
            }
        }
    }

    @ViewBuilder
    private var appointmentsSections: some View {
        if !vm.appointmentsNote.isEmpty {
            Section {
                NxAlertBanner(alert: NxAlert(
                    id: "appt-note",
                    title: vm.appointmentsNote,
                    subtitle: "En sitios ISAPI las citas puntuales suelen no estar disponibles; usa recurrentes.",
                    tone: .warning
                ))
            }
        }
        if vm.appointments.isEmpty {
            Section {
                NxEmptyState(
                    title: "Sin citas",
                    subtitle: vm.appointmentsNote.isEmpty
                        ? "No hay citas puntuales en las últimas 8 h."
                        : "Las citas cloud no contestaron en este sitio."
                )
            }
        } else {
            ForEach(vm.appointments) { row in
                appointmentRow(row)
            }
        }
    }

    private func visitorRow(_ row: IntegraRow) -> some View {
        let name = IntegraDict.str(row.raw, "visitorName", "name", "personName").nilIfEmpty ?? row.id
        let host = IntegraDict.str(row.raw, "hostName", "host")
        let phone = IntegraDict.str(row.raw, "phone")
        let weekdays = IntegraVisitorRules.weekdaysLabel(from: row.raw)
        let window = [
            IntegraDict.str(row.raw, "timeFrom", "from"),
            IntegraDict.str(row.raw, "timeTo", "to"),
        ].filter { !$0.isEmpty }.joined(separator: " – ")
        let valid = [
            IntegraDict.str(row.raw, "validFrom"),
            IntegraDict.str(row.raw, "validTo"),
        ].filter { !$0.isEmpty }.joined(separator: " → ")

        return VStack(alignment: .leading, spacing: 4) {
            Text(name).font(.subheadline.weight(.semibold))
            if !host.isEmpty {
                Text("Anfitrión: \(host)").font(.caption).foregroundColor(.secondary)
            }
            if !phone.isEmpty {
                Text(phone).font(.caption).foregroundColor(.secondary)
            }
            if !weekdays.isEmpty || !window.isEmpty {
                Text([weekdays, window].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            if !valid.isEmpty {
                Text(valid).font(.caption2).foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private func appointmentRow(_ row: IntegraRow) -> some View {
        let name = IntegraDict.str(row.raw, "visitorName", "name", "personName").nilIfEmpty ?? row.id
        let when = IntegraDict.str(row.raw, "visitStartTime", "startTime", "visitEndTime")
        let host = IntegraDict.str(row.raw, "hostName", "receptionistName")
        return VStack(alignment: .leading, spacing: 4) {
            Text(name).font(.subheadline.weight(.semibold))
            if !host.isEmpty {
                Text(host).font(.caption).foregroundColor(.secondary)
            }
            if !when.isEmpty {
                Text(when).font(.caption2).foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

enum IntegraVisitorRules {
    static let weekdays: [(String, String)] = [
        ("Monday", "Lun"), ("Tuesday", "Mar"), ("Wednesday", "Mié"),
        ("Thursday", "Jue"), ("Friday", "Vie"), ("Saturday", "Sáb"), ("Sunday", "Dom"),
    ]
    static let laborales = Array(weekdays.prefix(5).map(\.0))

    static func weekdaysLabel(from raw: [String: Any]) -> String {
        var dias: [String] = []
        if let arr = raw["weekdays"] as? [String] {
            dias = arr
        } else if let arr = raw["days"] as? [String] {
            dias = arr
        } else {
            let s = IntegraDict.str(raw, "weekdays", "days")
            if !s.isEmpty { dias = s.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) } }
        }
        let norm = dias.compactMap { d in weekdays.first { $0.0.caseInsensitiveCompare(d) == .orderedSame }?.0 }
        if norm.count == 7 { return "Todos los días" }
        if Set(norm) == Set(laborales) { return "Lun–Vie" }
        let orden = weekdays.map(\.0)
        return norm.sorted { (orden.firstIndex(of: $0) ?? 99) < (orden.firstIndex(of: $1) ?? 99) }
            .compactMap { d in weekdays.first { $0.0 == d }?.1 }
            .joined(separator: " · ")
    }
}

struct IntegraRecurringVisitorDraft {
    var nombre: String
    var telefono: String
    var anfitrion: String
    var puertas: [String]
    var dias: [String]
    var horaDesde: String
    var horaHasta: String
    var validFrom: String
    var validTo: String
}

@MainActor
final class IntegraVisitorsVM: ObservableObject {
    @Published var recurring: [IntegraRow] = []
    @Published var appointments: [IntegraRow] = []
    @Published var doors: [IntegraRow] = []
    @Published var note = ""
    @Published var appointmentsNote = ""
    @Published var query = ""
    @Published var tab = 0
    @Published var loading = true
    @Published var creating = false
    @Published var cancelling = false
    @Published var error: String?
    @Published var message: String?
    @Published var messageIsError = false
    @Published var createError: String?
    @Published var cancelTarget: IntegraRow?

    private let repo = IntegraRepository.shared

    var filteredRecurring: [IntegraRow] {
        recurring.filter {
            IntegraDict.matchesQuery(
                $0.raw, query: query,
                "visitorName", "name", "personName", "hostName", "host", "phone"
            )
        }
    }

    func refresh(initial: Bool = true) async {
        if initial && recurring.isEmpty { loading = true }
        error = nil
        do {
            let result = try await repo.recurringVisitors()
            note = result.note
            recurring = result.items.enumerated().map { idx, raw in
                let id = IntegraDict.str(raw, "id").nilIfEmpty ?? "vis-\(idx)"
                return IntegraRow(id: id, raw: raw)
            }
            let doorResult = try? await repo.doors()
            doors = (doorResult?.items ?? []).compactMap { raw in
                let id = IntegraDict.str(raw, "id", "doorIndexCode", "doorId")
                guard !id.isEmpty else { return nil }
                return IntegraRow(id: id, raw: raw)
            }
            do {
                let citas = try await repo.visitorAppointments()
                appointments = citas.enumerated().map { idx, raw in
                    let id = IntegraDict.str(raw, "orderId", "appointRecordId", "id").nilIfEmpty ?? "appt-\(idx)"
                    return IntegraRow(id: id, raw: raw)
                }
                appointmentsNote = ""
            } catch {
                appointments = []
                appointmentsNote = error.toUserMessage(
                    fallback: "Las citas puntuales no están disponibles en este sitio"
                )
            }
            loading = false
        } catch {
            loading = false
            self.error = error.toUserMessage(fallback: "No se pudieron cargar los visitantes")
        }
    }

    func create(_ draft: IntegraRecurringVisitorDraft) async -> Bool {
        let nombre = draft.nombre.trimmingCharacters(in: .whitespacesAndNewlines)
        guard nombre.count >= 2 else {
            createError = "El nombre necesita al menos 2 caracteres."
            return false
        }
        guard !draft.dias.isEmpty else {
            createError = "Elige al menos un día de la semana."
            return false
        }
        creating = true
        createError = nil
        defer { creating = false }
        do {
            _ = try await repo.createRecurringVisitor(
                visitorName: nombre,
                weekdays: draft.dias,
                timeFrom: draft.horaDesde,
                timeTo: draft.horaHasta,
                validFrom: draft.validFrom,
                validTo: draft.validTo,
                phone: draft.telefono.nilIfEmpty,
                hostName: draft.anfitrion.nilIfEmpty,
                doorIndexCodes: draft.puertas
            )
            message = "Visita recurrente creada"
            messageIsError = false
            await refresh(initial: false)
            return true
        } catch {
            createError = error.toUserMessage(fallback: "No se pudo crear la visita")
            return false
        }
    }

    func confirmCancel() async {
        guard !cancelling, let target = cancelTarget else { return }
        cancelling = true
        defer { cancelling = false }
        do {
            _ = try await repo.cancelRecurringVisitor(id: target.id)
            message = "Visita cancelada"
            messageIsError = false
            cancelTarget = nil
            await refresh(initial: false)
        } catch {
            message = error.toUserMessage(fallback: "No se pudo cancelar la visita")
            messageIsError = true
            cancelTarget = nil
        }
    }
}

private struct IntegraCreateRecurringVisitorSheet: View {
    let doors: [IntegraRow]
    let sending: Bool
    let error: String?
    let onCreate: (IntegraRecurringVisitorDraft) -> Void
    let onDismiss: () -> Void

    @State private var nombre = ""
    @State private var telefono = ""
    @State private var anfitrion = ""
    @State private var puertas: Set<String> = []
    @State private var dias: Set<String> = Set(IntegraVisitorRules.laborales)
    @State private var horaDesde = "09:00"
    @State private var horaHasta = "18:00"
    @State private var validFrom = IntegraCoreFormat.dateOnly(Date())
    @State private var validTo = IntegraCoreFormat.dateOnly(
        Calendar.current.date(byAdding: .day, value: 90, to: Date()) ?? Date()
    )

    var body: some View {
        NavigationStack {
            Form {
                Section("Visitante") {
                    TextField("Nombre", text: $nombre).disabled(sending)
                    TextField("Teléfono", text: $telefono).disabled(sending)
                    TextField("Anfitrión", text: $anfitrion).disabled(sending)
                }
                Section("Horario") {
                    TextField("Desde (HH:mm)", text: $horaDesde)
                        .disabled(sending)
                        .textInputAutocapitalization(.never)
                    TextField("Hasta (HH:mm)", text: $horaHasta)
                        .disabled(sending)
                        .textInputAutocapitalization(.never)
                    TextField("Vigencia desde (YYYY-MM-DD)", text: $validFrom)
                        .disabled(sending)
                        .textInputAutocapitalization(.never)
                    TextField("Vigencia hasta (YYYY-MM-DD)", text: $validTo)
                        .disabled(sending)
                        .textInputAutocapitalization(.never)
                }
                Section("Días") {
                    HStack {
                        Button("Lun–Vie") { dias = Set(IntegraVisitorRules.laborales) }
                            .disabled(sending)
                        Button("Todos") { dias = Set(IntegraVisitorRules.weekdays.map(\.0)) }
                            .disabled(sending)
                        Button("Ninguno") { dias = [] }
                            .disabled(sending)
                    }
                    .buttonStyle(.bordered)
                    ForEach(IntegraVisitorRules.weekdays, id: \.0) { key, label in
                        Toggle(label, isOn: Binding(
                            get: { dias.contains(key) },
                            set: { on in
                                if on { dias.insert(key) } else { dias.remove(key) }
                            }
                        ))
                        .disabled(sending)
                    }
                }
                if !doors.isEmpty {
                    Section("Puertas") {
                        ForEach(doors) { door in
                            let name = IntegraDict.str(door.raw, "name", "doorName").nilIfEmpty ?? door.id
                            Toggle(name, isOn: Binding(
                                get: { puertas.contains(door.id) },
                                set: { on in
                                    if on { puertas.insert(door.id) } else { puertas.remove(door.id) }
                                }
                            ))
                            .disabled(sending)
                        }
                    }
                }
                if let error {
                    Section {
                        Text(error).font(.caption).foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Visita recurrente")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar", action: onDismiss).disabled(sending)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if sending {
                        ProgressView()
                    } else {
                        Button("Crear") {
                            onCreate(IntegraRecurringVisitorDraft(
                                nombre: nombre,
                                telefono: telefono,
                                anfitrion: anfitrion,
                                puertas: Array(puertas),
                                dias: Array(dias),
                                horaDesde: horaDesde,
                                horaHasta: horaHasta,
                                validFrom: validFrom,
                                validTo: validTo
                            ))
                        }
                        .disabled(nombre.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 || dias.isEmpty)
                    }
                }
            }
            .onAppear {
                if puertas.isEmpty {
                    puertas = Set(doors.prefix(4).map(\.id))
                }
            }
        }
        .interactiveDismissDisabled(sending)
    }
}
