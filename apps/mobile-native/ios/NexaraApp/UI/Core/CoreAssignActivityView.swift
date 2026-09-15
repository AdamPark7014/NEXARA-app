import SwiftUI

private func assignClean(_ text: String) -> String {
    text.trimmingCharacters(in: .whitespacesAndNewlines)
}

/// «Asignar actividad» desde el día de una persona — espejo de
/// `/erp/pizarra/[userId]/asignar`: responsable fijo, tipo válido para creador ×
/// destinatario, encargo (ejecución / despacho con cupo), puente de servicios a
/// Antonio, equipo extra y coordinadores LEAD automáticos. Crea con
/// `POST activities` y suma el equipo con `POST activities/:id/team`.
struct CoreAssignActivityView: View {
    let onDone: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var session = SessionStore.shared
    @State private var targetId: Int
    @State private var person: TeamBoardUser?
    @State private var boardUsers: [TeamBoardUser] = []
    @State private var kind: CoreActivityKind?
    @State private var charge: CoreAssignmentCharge?
    @State private var extraIds: [Int] = []
    @State private var extraNotes: [Int: String] = [:]
    @State private var leadNotes = ""
    @State private var headcount = 1
    @State private var loadError: String?

    init(userId: Int, onDone: @escaping (String) -> Void = { _ in }) {
        self.onDone = onDone
        _targetId = State(initialValue: userId)
    }

    // MARK: Reglas

    private var me: SessionUser? { session.currentUser }
    private var personEmail: String? { person?.email }
    private var displayName: String { person?.nombre ?? "Persona #\(targetId)" }
    private var shortName: String { CoreFormat.shortName(displayName) }
    private var roster: [TeamBoardUser] { boardUsers.filter { $0.id != targetId } }

    private var allowedKinds: [CoreActivityKind] {
        CoreActivityRules.kindsForAssignment(creator: me, targetEmail: personEmail)
    }

    private var despachoOnly: Bool { CoreActivityRules.forcesDespachoOnly(personEmail, kind: kind) }
    private var ejecucionOnly: Bool { CoreActivityRules.forcesEjecucionOnly(personEmail, kind: kind) }
    private var managerCanChoose: Bool { CoreActivityRules.canOfferAssignmentCharge(personEmail) }
    private var offerCharge: Bool { managerCanChoose && !despachoOnly && !ejecucionOnly }
    private var chargeReady: Bool { despachoOnly || ejecucionOnly || !managerCanChoose || charge != nil }

    private var effectiveCharge: CoreAssignmentCharge? {
        if despachoOnly { return .despacho }
        if ejecucionOnly { return .ejecucion }
        return charge
    }

    private var bridgeNeeded: Bool {
        kind == .servicio && CoreActivityRules.servicioShouldGoToBridge(creator: me, targetEmail: personEmail)
    }

    private var antonioOnBoard: TeamBoardUser? {
        boardUsers.first(where: { CoreOrg.normalized($0.email) == CoreOrg.antonioEmail })
    }

    private var targetIsAntonio: Bool { CoreOrg.normalized(personEmail) == CoreOrg.antonioEmail }

    private var teamForExtras: [TeamBoardUser] {
        if kind == .servicio && targetIsAntonio {
            let allow = Set(CoreOrg.servicioDelegateEmails)
            return roster.filter { allow.contains(CoreOrg.normalized($0.email)) }
        }
        let pool = CoreActivityRules.teamPoolEmails(managerEmail: personEmail, kind: kind, charge: effectiveCharge)
        guard !pool.isEmpty else { return roster }
        let allow = Set(pool)
        return roster.filter { allow.contains(CoreOrg.normalized($0.email)) }
    }

    private var autoPeerCoordinators: [TeamBoardUser] {
        let emails: [String] = extraIds.compactMap { id in
            let member = teamForExtras.first(where: { $0.id == id }) ?? boardUsers.first(where: { $0.id == id })
            let email = CoreOrg.normalized(member?.email)
            return email.isEmpty ? nil : email
        }
        let peers = CoreActivityRules.peerCoordinatorEmails(primaryEmail: personEmail, memberEmails: emails)
        return peers.compactMap { email in
            boardUsers.first(where: { CoreOrg.normalized($0.email) == email })
        }
    }

    private var teamHelp: String {
        if effectiveCharge == .despacho {
            if kind == .proyecto {
                return "Despacho: puedes sumar instaladores y soporte. Si mezclas ambos, se asigna también al otro coordinador además de \(shortName) y a quienes elijas."
            }
            return "Como despacho, suma a quien debe ejecutarla bajo \(shortName). Si no eliges a nadie, queda pendiente de que \(shortName) la asigne."
        }
        switch kind {
        case .servicio?:
            return targetIsAntonio
                ? "Como puente, suma a Carolina o Alejandro (día y hora ya van en el formulario)."
                : "Solo soporte (Antonio, Carolina, Alejandro)."
        case .obra?:
            return "Solo instaladores de campo (Joan, Israel, Juan José)."
        case .proyecto?:
            return "Soporte e instaladores pueden colaborar en el proyecto. Si hay ambos lados, se suman ambos coordinadores."
        default:
            return effectiveCharge == .ejecucion
                ? "Ejecución directa de \(shortName). Puedes sumar apoyo opcional."
                : "El responsable es \(displayName). Puedes sumar apoyo."
        }
    }

    private var formKey: String {
        "\(targetId)-\(kind?.rawValue ?? "")-\(effectiveCharge?.rawValue ?? "none")-\(despachoOnly ? String(headcount) : "x")"
    }

    // MARK: Vista

    var body: some View {
        Form {
            Section {
                HStack(spacing: 12) {
                    CoreAvatar(name: displayName, url: person?.avatarUrl, size: 56)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("RESPONSABLE")
                            .font(.caption2.weight(.heavy))
                            .foregroundStyle(.secondary)
                        Text(displayName).font(.headline)
                        Text(person?.puesto ?? person?.email ?? "Elige el tipo y completa los datos")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }

            if let loadError {
                Section {
                    Text(loadError).foregroundStyle(CorePalette.red)
                    Button("Reintentar") { Task { await load() } }
                }
            }

            Section {
                ForEach(allowedKinds) { option in
                    CoreKindRow(kind: option, selected: kind == option) { select(option) }
                }
            } header: {
                Text("1 · Tipo de actividad")
            } footer: {
                Text("Solo se muestran tipos válidos para \(displayName). Campo David: tarea/proyecto/obra · Soporte Antonio: tarea/proyecto/servicio · Josué (obra): todo menos servicio · Daniela/Mónica: tarea/comercial · Encargados: + comercial.")
            }

            if kind != nil && despachoOnly && !bridgeNeeded {
                Section {
                    Text("Solo en servicios: le dejas la actividad y cuántas personas ocupas; él manda a Antonio y Antonio elige al soporte.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Stepper("Personas que se ocupan: \(headcount)", value: $headcount, in: 1...50)
                    TextField("Indicaciones para \(shortName) (opcional)", text: $leadNotes, axis: .vertical)
                        .lineLimit(2...5)
                } header: {
                    Text("2 · Encargo a \(shortName): Despacho a equipo")
                }
            }

            if kind != nil && ejecucionOnly && !bridgeNeeded {
                Section {
                    Text("Actividad personal suya: la hace él, sin despacho a equipo.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    TextField("Indicaciones (opcional)", text: $leadNotes, axis: .vertical)
                        .lineLimit(2...5)
                } header: {
                    Text("2 · Encargo a \(shortName): Ejecución directa")
                }
            }

            if kind != nil && offerCharge && !bridgeNeeded {
                Section("2 · Encargo a \(shortName)") {
                    ForEach(CoreAssignmentCharge.allCases) { option in
                        Button {
                            charge = option
                        } label: {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(option.title).font(.body.weight(.bold)).foregroundStyle(Color.primary)
                                    Text(option.help).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: charge == option ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(charge == option ? Color.accentColor : Color.secondary)
                            }
                        }
                    }
                }
            }

            if bridgeNeeded {
                Section {
                    (Text("Servicios van primero a Antonio ").bold()
                        + Text("(puente de sistemas). Él agenda día y hora a Carolina o Alejandro."))
                        .font(.footnote)
                    if let antonio = antonioOnBoard {
                        Button("Ir a asignar a \(CoreFormat.shortName(antonio.nombre)) →") {
                            retarget(antonio.id)
                        }
                    } else {
                        Text("No aparece Antonio en el tablero; revisa la jerarquía.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .listRowBackground(CorePalette.orange.opacity(0.1))
            }

            if let kind, !bridgeNeeded, chargeReady {
                if !despachoOnly && !ejecucionOnly {
                    teamSection
                }
                CoreActivityFormView(
                    kind: kind,
                    charge: effectiveCharge,
                    responsableId: targetId,
                    selfAssign: false,
                    submitLabel: "Asignar actividad",
                    onCreated: { id in await afterCreate(id) }
                )
                .id(formKey)
            } else if kind != nil && !bridgeNeeded && offerCharge && charge == nil {
                Section {
                    Text("Elige el encargo (ejecución directa o despacho a equipo) para continuar.")
                        .foregroundStyle(.secondary)
                }
            } else if kind == nil {
                Section {
                    Text("Elige un tipo para continuar.").foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Asignar actividad")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: targetId) { await load() }
        .onChange(of: allowedKinds) { _, kinds in syncKind(kinds) }
        .onChange(of: teamForExtras.map(\.id)) { _, ids in
            let allowed = Set(ids)
            let kept = extraIds.filter { allowed.contains($0) }
            if kept != extraIds { extraIds = kept }
        }
    }

    @ViewBuilder
    private var teamSection: some View {
        Section {
            Text(teamHelp)
                .font(.footnote)
                .foregroundStyle(.secondary)
            let peers = autoPeerCoordinators
            if !peers.isEmpty {
                (Text("Coordinadores automáticos: ").bold()
                    + Text("además del responsable, se asignará como LEAD a \(peers.map { CoreFormat.shortName($0.nombre) }.joined(separator: ", ")) (equipo cruzado instaladores / soporte)."))
                    .font(.footnote)
                    .foregroundStyle(CorePalette.green)
            }
            if teamForExtras.isEmpty {
                Text("No hay más personas en el tablero para sumar ahora.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ForEach(teamForExtras) { member in
                Button {
                    toggleExtra(member.id)
                } label: {
                    HStack(spacing: 10) {
                        CoreAvatar(name: member.nombre, url: member.avatarUrl, size: 32)
                        Text(CoreFormat.shortName(member.nombre)).foregroundStyle(Color.primary)
                        Spacer()
                        Image(systemName: extraIds.contains(member.id) ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(extraIds.contains(member.id) ? Color.accentColor : Color.secondary)
                    }
                }
            }
            if !extraIds.isEmpty {
                TextField("Indicaciones para \(shortName) (responsable, opcional)", text: $leadNotes, axis: .vertical)
                    .lineLimit(2...5)
                ForEach(extraIds, id: \.self) { id in
                    if let member = teamForExtras.first(where: { $0.id == id }) {
                        TextField(
                            "Indicaciones para \(CoreFormat.shortName(member.nombre)) (opcional)",
                            text: Binding(
                                get: { extraNotes[id] ?? "" },
                                set: { extraNotes[id] = $0 }
                            ),
                            axis: .vertical
                        )
                        .lineLimit(1...4)
                    }
                }
            }
        } header: {
            Text("\(offerCharge ? "3" : "2") · Equipo \(effectiveCharge == .despacho ? "(ejecutor / apoyo)" : "extra (opcional)")")
        }
    }

    // MARK: Acciones

    private func select(_ option: CoreActivityKind) {
        guard kind != option else { return }
        kind = option
        charge = nil
        headcount = 1
        extraIds = []
    }

    private func syncKind(_ kinds: [CoreActivityKind]) {
        if kinds.count == 1 {
            if kind != kinds[0] { select(kinds[0]) }
        } else if let current = kind, !kinds.contains(current) {
            kind = nil
        }
    }

    private func toggleExtra(_ id: Int) {
        if let index = extraIds.firstIndex(of: id) {
            extraIds.remove(at: index)
        } else {
            extraIds.append(id)
        }
    }

    /// Servicio de Luis: se asigna a Antonio en su lugar.
    private func retarget(_ id: Int) {
        person = nil
        kind = nil
        charge = nil
        headcount = 1
        leadNotes = ""
        extraIds = []
        extraNotes = [:]
        targetId = id
    }

    @MainActor
    private func load() async {
        do {
            async let personTask = CoreRepository.shared.teamBoardUser(userId: targetId)
            let board = try? await CoreRepository.shared.teamBoard()
            person = try await personTask
            boardUsers = board?.users ?? []
            loadError = nil
            syncKind(allowedKinds)
        } catch {
            loadError = error.toUserMessage(fallback: "No se pudo cargar a la persona")
        }
    }

    /// Igual que `handleSuccess` de la web: LEAD con cupo, LEAD con indicaciones,
    /// coordinadores cruzados y el equipo elegido.
    @MainActor
    private func afterCreate(_ activityId: Int) async {
        let repo = CoreRepository.shared
        let name = shortName
        do {
            if despachoOnly {
                try await repo.addTeamMember(
                    activityId: activityId,
                    userId: targetId,
                    rol: "LEAD",
                    indicaciones: CoreActivityRules.dispatchHeadcountNote(headcount, extra: leadNotes)
                )
            } else if ejecucionOnly {
                let notes = assignClean(leadNotes)
                if !notes.isEmpty {
                    try await repo.addTeamMember(activityId: activityId, userId: targetId, rol: "LEAD", indicaciones: notes)
                }
            } else {
                let peers = autoPeerCoordinators
                let notes = assignClean(leadNotes)
                let needPrimaryLead = !notes.isEmpty || !peers.isEmpty || (effectiveCharge == .despacho && !extraIds.isEmpty)
                if needPrimaryLead {
                    let leadText: String? = notes.isEmpty
                        ? (peers.isEmpty ? nil : "Coordinación de su equipo en esta actividad.")
                        : notes
                    try await repo.addTeamMember(activityId: activityId, userId: targetId, rol: "LEAD", indicaciones: leadText)
                }
                let peerIds = Set(peers.map(\.id))
                for peer in peers where peer.id != targetId && !extraIds.contains(peer.id) {
                    try await repo.addTeamMember(
                        activityId: activityId,
                        userId: peer.id,
                        rol: "LEAD",
                        indicaciones: "Coordinación de su equipo en esta actividad cruzada (instalación / soporte)."
                    )
                }
                for id in extraIds {
                    let rol = (peerIds.contains(id) || id == targetId) ? "LEAD" : "TECNICO"
                    try await repo.addTeamMember(activityId: activityId, userId: id, rol: rol, indicaciones: extraNotes[id])
                }
            }
            onDone("✓ Actividad asignada a \(name).")
        } catch {
            onDone("Actividad creada, pero falló al sumar el equipo: \(error.toUserMessage())")
        }
        dismiss()
    }
}
