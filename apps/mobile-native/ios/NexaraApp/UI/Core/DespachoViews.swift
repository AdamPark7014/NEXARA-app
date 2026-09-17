import SwiftUI

struct DespachoTarget: Identifiable {
    /// Id de la actividad.
    let id: Int
    let title: String
    let indicaciones: String?
}

struct ReprogramarTarget: Identifiable {
    /// Id de la actividad.
    let id: Int
    let title: String
    let fechaActual: String?
}

enum CoreDispatch {
    /// «Cupo: 3 personas» → 3 (espejo de `parseDispatchHeadcount`).
    static func headcount(_ text: String?) -> Int? {
        guard let text, let range = text.range(of: "cupo", options: .caseInsensitive) else { return nil }
        let digits = text[range.upperBound...]
            .drop(while: { !$0.isNumber })
            .prefix(while: { $0.isNumber })
        guard let value = Int(digits), value > 0 else { return nil }
        return value
    }
}

/// Quien reparte un despacho lo pasa a gente de su equipo
/// (POST me/activities/:id/despacho). El API valida el grupo y decide el rol.
struct DespachoSheet: View {
    let target: DespachoTarget
    let onDone: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var session = SessionStore.shared
    @State private var roster: [TeamBoardUser] = []
    @State private var selected: Set<Int> = []
    @State private var loading = true
    @State private var saving = false
    @State private var message: String?

    private var myEmail: String? { session.currentUser?.email }
    private var myId: Int? { session.currentUser.flatMap { Int($0.id) } }
    private var isCoordinator: Bool { CoreOrg.normalized(myEmail) == CoreOrg.serviceCoordinatorEmail }

    private var candidates: [TeamBoardUser] {
        let others = roster.filter { $0.id != myId }
        let pool = Set(CoreOrg.dispatchPool(for: myEmail))
        guard !pool.isEmpty else { return others }
        return others.filter { pool.contains(CoreOrg.normalized($0.email)) }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(target.title).font(.headline)
                    if let cupo = CoreDispatch.headcount(target.indicaciones) {
                        Text("Despacho · se ocupan \(cupo) persona\(cupo == 1 ? "" : "s")")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    if let indicaciones = target.indicaciones, !indicaciones.isEmpty {
                        Text(indicaciones).font(.caption).foregroundStyle(.secondary)
                    }
                } footer: {
                    Text(isCoordinator ? "Mándala a Antonio; él elige a quién del soporte." : "Elige a quién de tu equipo ejecuta.")
                }

                Section {
                    if loading {
                        ProgressView()
                    } else if candidates.isEmpty {
                        Text("No hay gente de tu equipo en el tablero. Actualiza o revisa la jerarquía.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(candidates) { user in
                            Button {
                                if selected.contains(user.id) {
                                    selected.remove(user.id)
                                } else {
                                    selected.insert(user.id)
                                }
                            } label: {
                                HStack {
                                    Image(systemName: selected.contains(user.id) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(selected.contains(user.id) ? Color.accentColor : Color.secondary)
                                    Text(user.nombre).foregroundStyle(Color.primary)
                                    Spacer()
                                    if let puesto = user.puesto, !puesto.isEmpty {
                                        Text(puesto).font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .disabled(saving)
                        }
                    }
                } header: {
                    Text(isCoordinator ? "Elige a Antonio" : "Elige a quién asignas")
                }

                if let message {
                    Section {
                        Text(message).foregroundStyle(CorePalette.red)
                    }
                }
            }
            .navigationTitle("Despachar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Asignando…" : "Asignar") { Task { await submit() } }
                        .disabled(saving || selected.isEmpty)
                }
            }
            .task { await loadRoster() }
        }
    }

    @MainActor
    private func loadRoster() async {
        loading = true
        defer { loading = false }
        do {
            roster = try await CoreRepository.shared.teamBoard().users
        } catch {
            message = error.toUserMessage(fallback: "No se pudo cargar el equipo")
        }
    }

    @MainActor
    private func submit() async {
        guard !selected.isEmpty else {
            message = "Elige al menos a una persona de tu equipo"
            return
        }
        saving = true
        message = nil
        defer { saving = false }
        let notes = (target.indicaciones ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let assigned = try await CoreRepository.shared.dispatchActivity(
                activityId: target.id,
                userIds: selected.sorted(),
                indicaciones: notes.isEmpty ? nil : notes
            )
            let count = assigned > 0 ? assigned : selected.count
            onDone("Asignado a \(count) persona(s)")
            dismiss()
        } catch {
            message = error.toUserMessage(fallback: "No se pudo asignar")
        }
    }
}

/// Quien reparte un despacho cambia su día y hora
/// (PATCH me/activities/:id/reprogramar); queda en el Historial.
struct ReprogramarSheet: View {
    let target: ReprogramarTarget
    let onDone: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var fecha = Date()
    @State private var motivo = ""
    @State private var saving = false
    @State private var error: String?
    @State private var didSetInitial = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(target.title).font(.headline)
                    NxIconText(systemName: "calendar", text: "Programada: \(CoreFormat.when(target.fechaActual) ?? "Sin fecha")")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Section("Nueva fecha") {
                    // Como la web: se puede registrar una fecha pasada (se corrige lo que ya ocurrió).
                    DatePicker("Día y hora", selection: $fecha, displayedComponents: [.date, .hourAndMinute])
                        .environment(\.timeZone, CoreSchedule.mexico)
                }
                Section("Motivo (opcional)") {
                    TextField("Ej. El cliente pidió cambiar la visita", text: $motivo, axis: .vertical)
                        .lineLimit(2...5)
                }
                if let error {
                    Section {
                        Text(error).foregroundStyle(CorePalette.red)
                    }
                }
            }
            .navigationTitle("Cambiar fecha y hora")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Guardando…" : "Guardar") { Task { await save() } }
                        .disabled(saving)
                }
            }
            .onAppear {
                guard !didSetInitial else { return }
                didSetInitial = true
                fecha = initialDate()
            }
        }
    }

    private func initialDate() -> Date {
        if let current = CoreFormat.date(target.fechaActual), current > Date() {
            return current
        }
        let calendar = Calendar.current
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: Date()) ?? Date()
        return calendar.date(bySettingHour: 9, minute: 0, second: 0, of: tomorrow) ?? tomorrow
    }

    @MainActor
    private func save() async {
        guard fecha.timeIntervalSinceNow > -60 else {
            error = "La nueva fecha no puede quedar en el pasado"
            return
        }
        saving = true
        error = nil
        defer { saving = false }
        let reason = motivo.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await CoreRepository.shared.reprogramar(
                activityId: target.id,
                fecha: fecha,
                motivo: reason.isEmpty ? nil : String(reason.prefix(500))
            )
            onDone("Reprogramada para \(CoreFormat.when(fecha))")
            dismiss()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo reprogramar")
        }
    }
}
