import SwiftUI

struct IntegraEspacioCard: Identifiable, Hashable {
    let id: String
    var name: String
    var policyKey: String
    var policyLabel: String?
    var peopleCount: Int
    var doorId: String?
}

struct IntegraSpaceTemplate: Identifiable, Hashable {
    var id: String { key }
    let key: String
    var label: String
    var description: String?
}

struct IntegraSpaceBooking: Identifiable, Hashable {
    let id: Int64
    var title: String
    var startsAt: String?
    var endsAt: String?
    var hostName: String?
    var status: String?
    var phase: String?
}

/// Espacios / puertas con política. No es un mapa de planta.
struct IntegraEspaciosView: View {
    var onOpenSchedules: ((String) -> Void)? = nil

    @State private var spaces: [IntegraEspacioCard] = []
    @State private var templates: [IntegraSpaceTemplate] = []
    @State private var selected: IntegraEspacioCard?
    @State private var bookings: [IntegraSpaceBooking] = []
    @State private var policyKey = "INDEFINITE"
    @State private var query = ""
    @State private var isLoading = true
    @State private var detailLoading = false
    @State private var errorText: String?
    @State private var message: String?
    @State private var bookingTitle = ""
    @State private var bookingStart = ""
    @State private var bookingEnd = ""
    @State private var bookingNotes = ""
    @State private var saving = false

    private var filtered: [IntegraEspacioCard] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return spaces }
        return spaces.filter { $0.name.lowercased().contains(q) }
    }

    var body: some View {
        Group {
            if let selected {
                detail(selected)
            } else if isLoading {
                ProgressView("Cargando espacios…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorText, spaces.isEmpty {
                VStack(spacing: 12) {
                    Text(errorText).foregroundStyle(.secondary)
                    Button("Reintentar") { Task { await reload() } }
                }
            } else {
                listBody
            }
        }
        .navigationTitle(SchedulesRoutes.titleEspacios)
        .task { await reload() }
        .refreshable { await reload() }
    }

    private var listBody: some View {
        List {
            Section {
                Text("Política de acceso y ventanas de uso. No es un mapa de planta.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextField("Buscar espacio…", text: $query)
            }
            if filtered.isEmpty {
                NxEmptyState(
                    title: "Sin espacios",
                    subtitle: "El sitio no devolvió espacios o puertas con política."
                )
            } else {
                ForEach(filtered) { s in
                    Button {
                        Task { await openDetail(s) }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(s.name).font(.headline)
                                Text(s.policyLabel ?? s.policyKey)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            NxStatusChip(text: "\(s.peopleCount) pers.", tone: .neutral)
                        }
                    }
                }
            }
        }
    }

    private func detail(_ s: IntegraEspacioCard) -> some View {
        Form {
            if detailLoading {
                ProgressView()
            } else {
                Section {
                    Button("Volver") {
                        selected = nil
                        bookings = []
                        message = nil
                    }
                    Text(s.name).font(.title3.weight(.semibold))
                    Text(s.policyLabel ?? s.policyKey).foregroundStyle(.secondary)
                }
                Section("Acceso") {
                    Text("\(s.peopleCount) personas con acceso")
                    if let doorId = s.doorId {
                        if let onOpenSchedules {
                            Button("Ver horarios de esta puerta") {
                                onOpenSchedules(doorId)
                            }
                        }
                    }
                }
                Section("Política") {
                    Picker("Plantilla", selection: $policyKey) {
                        ForEach(templates) { t in
                            Text(t.label).tag(t.key)
                        }
                    }
                    Button(saving ? "Guardando…" : "Guardar política") {
                        Task { await savePolicy(doorId: s.id) }
                    }
                    .disabled(saving)
                }
                Section("Nueva reserva") {
                    TextField("Título", text: $bookingTitle)
                    TextField("Inicio (AAAA-MM-DD HH:MM, México)", text: $bookingStart)
                        .textInputAutocapitalization(.never)
                    TextField("Fin (AAAA-MM-DD HH:MM, México)", text: $bookingEnd)
                        .textInputAutocapitalization(.never)
                    TextField("Notas", text: $bookingNotes)
                    Button(saving ? "Creando…" : "Crear ventana") {
                        Task { await createBooking(doorId: s.id) }
                    }
                    .disabled(saving || bookingTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                } footer: {
                    Text("Las horas son reloj de pared de México; se envían convertidas a UTC.")
                }
                Section("Reservas") {
                    if bookings.isEmpty {
                        Text("Sin ventanas de uso.").foregroundStyle(.secondary)
                    } else {
                        ForEach(bookings) { b in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(b.title).font(.subheadline.weight(.semibold))
                                    Spacer()
                                    if let phase = b.phase ?? b.status {
                                        NxStatusChip(text: phase, tone: .info)
                                    }
                                }
                                Text([b.startsAt, b.endsAt].compactMap { $0 }.joined(separator: " → "))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                if let host = b.hostName {
                                    Text(host).font(.caption2).foregroundStyle(.secondary)
                                }
                                Button("Cancelar reserva", role: .destructive) {
                                    Task { await cancelBooking(b.id, doorId: s.id) }
                                }
                                .font(.caption)
                            }
                        }
                    }
                }
                if let message {
                    Section { Text(message).foregroundStyle(NxTone.success.fg) }
                }
                if let errorText {
                    Section { Text(errorText).foregroundStyle(NxTone.danger.fg) }
                }
            }
        }
    }

    private func reload() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }
        do {
            let root = try await IntegraSchedulesRepository.shared.spacesOverview()
            templates = (IntegraJSON.asMapList(root["templates"]) ?? []).compactMap { m in
                guard let key = m.integraStr("key") else { return nil }
                return IntegraSpaceTemplate(
                    key: key,
                    label: m.integraStr("label") ?? key,
                    description: m.integraStr("description")
                )
            }
            let list = IntegraJSON.asMapList(root["spaces"]) ?? IntegraJSON.itemsOf(root)
            spaces = list.compactMap { m in
                guard let id = m.integraStr("id", "doorId", "doorIndexCode") else { return nil }
                let policy = IntegraJSON.asMap(m["policy"])
                let counts = IntegraJSON.asMap(m["accessCounts"])
                return IntegraEspacioCard(
                    id: id,
                    name: m.integraStr("name", "doorName") ?? id,
                    policyKey: policy?.integraStr("templateKey") ?? "INDEFINITE",
                    policyLabel: policy?.integraStr("label"),
                    peopleCount: counts?.integraInt("total")
                        ?? m.integraInt("peopleCount", "personCount")
                        ?? 0,
                    doorId: m.integraStr("doorId", "id", "doorIndexCode")
                )
            }
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func openDetail(_ s: IntegraEspacioCard) async {
        selected = s
        policyKey = s.policyKey
        message = nil
        errorText = nil
        detailLoading = true
        defer { detailLoading = false }
        do {
            let detail = try await IntegraSchedulesRepository.shared.spaceDetail(doorId: s.id)
            if let policy = IntegraJSON.asMap(detail["policy"]),
               let key = policy.integraStr("templateKey") {
                policyKey = key
            }
            let windows = IntegraJSON.asMapList(detail["windows"])
                ?? IntegraJSON.asMapList(detail["bookings"])
                ?? []
            bookings = windows.compactMap { m in
                guard let id = m.integraInt64("id") else { return nil }
                return IntegraSpaceBooking(
                    id: id,
                    title: m.integraStr("title") ?? "Ventana de uso",
                    startsAt: m.integraStr("startsAt"),
                    endsAt: m.integraStr("endsAt"),
                    hostName: m.integraStr("hostName"),
                    status: m.integraStr("status"),
                    phase: m.integraStr("phase")
                )
            }
            if templates.isEmpty {
                templates = (IntegraJSON.asMapList(detail["templates"]) ?? []).compactMap { m in
                    guard let key = m.integraStr("key") else { return nil }
                    return IntegraSpaceTemplate(
                        key: key,
                        label: m.integraStr("label") ?? key,
                        description: m.integraStr("description")
                    )
                }
            }
        } catch {
            errorText = error.localizedDescription
            bookings = []
        }
    }

    private func savePolicy(doorId: String) async {
        saving = true
        errorText = nil
        defer { saving = false }
        do {
            try await IntegraSchedulesRepository.shared.saveSpacePolicy(
                doorId: doorId,
                templateKey: policyKey
            )
            message = "Plantilla del espacio guardada."
            await reload()
            if let updated = spaces.first(where: { $0.id == doorId }) {
                selected = updated
            }
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func createBooking(doorId: String) async {
        saving = true
        errorText = nil
        defer { saving = false }
        guard let startUtc = mexicoWallToUtcIso(bookingStart),
              let endUtc = mexicoWallToUtcIso(bookingEnd) else {
            errorText = "Revisa inicio/fin. Formato: AAAA-MM-DD HH:MM (hora México)."
            return
        }
        do {
            try await IntegraSchedulesRepository.shared.createBooking(
                doorId: doorId,
                title: bookingTitle.trimmingCharacters(in: .whitespacesAndNewlines),
                startsAtUtc: startUtc,
                endsAtUtc: endUtc,
                notes: bookingNotes.isEmpty ? nil : bookingNotes
            )
            message = "Ventana de uso creada."
            bookingTitle = ""
            bookingNotes = ""
            if let s = selected {
                await openDetail(s)
            }
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func cancelBooking(_ id: Int64, doorId: String) async {
        do {
            try await IntegraSchedulesRepository.shared.cancelBooking(bookingId: id)
            message = "Reserva cancelada."
            if let s = selected ?? spaces.first(where: { $0.id == doorId }) {
                await openDetail(s)
            }
        } catch {
            errorText = error.localizedDescription
        }
    }

    /// Wall-clock México → ISO UTC, parity with Android AcsTime.
    private func mexicoWallToUtcIso(_ text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = trimmed.split(whereSeparator: { $0 == " " || $0 == "T" })
        guard parts.count >= 2 else { return nil }
        let dateBits = parts[0].split(separator: "-").compactMap { Int($0) }
        let timeBits = parts[1].split(separator: ":").compactMap { Int($0) }
        guard dateBits.count == 3, timeBits.count >= 2 else { return nil }
        var comps = DateComponents()
        comps.year = dateBits[0]
        comps.month = dateBits[1]
        comps.day = dateBits[2]
        comps.hour = timeBits[0]
        comps.minute = timeBits[1]
        comps.second = timeBits.count > 2 ? timeBits[2] : 0
        comps.timeZone = TimeZone(identifier: "America/Mexico_City")
        guard let date = Calendar(identifier: .gregorian).date(from: comps) else { return nil }
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime]
        fmt.timeZone = TimeZone(secondsFromGMT: 0)
        return fmt.string(from: date)
    }
}
