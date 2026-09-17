import SwiftUI

/// Última vista elegida en Actividades (misma clave que la web).
let coreActividadesVistaKey = "nx-actividades-vista"

/// «Actividades» de Core, espejo de `/erp/pizarra`:
/// - CEO: solo el tablero del equipo (asigna, no ejecuta).
/// - Quien tiene gente en su tablero: «Mis actividades» / «Mi equipo» (se recuerda la última).
/// - Los demás: su lista directo.
struct ActividadesHomeView: View {
    @ObservedObject private var session = SessionStore.shared
    @AppStorage(coreActividadesVistaKey) private var vista: String = "mias"
    @State private var board: TeamBoardResponse?
    @State private var boardError: String?
    @State private var loaded = false

    private var myId: Int? { session.currentUser.flatMap { Int($0.id) } }
    private var isCeo: Bool { CoreOrg.isCeo(session.currentUser?.email) }
    private var teamMates: [TeamBoardUser] { (board?.users ?? []).filter { $0.id != myId } }

    var body: some View {
        Group {
            if isCeo {
                TeamBoardView(board: board, error: boardError, loading: !loaded, myId: myId, onReload: { await loadBoard() })
            } else if !loaded {
                ProgressView("Cargando actividades…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if teamMates.isEmpty {
                MisActividadesView()
            } else {
                VStack(spacing: 0) {
                    Picker("Vista", selection: $vista) {
                        Text("Mis actividades").tag("mias")
                        Text("Mi equipo").tag("equipo")
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)
                    .padding(.vertical, 8)

                    if vista == "equipo" {
                        TeamBoardView(board: board, error: boardError, loading: false, myId: myId, onReload: { await loadBoard() })
                    } else {
                        MisActividadesView()
                    }
                }
            }
        }
        .navigationTitle("Actividades")
        .task {
            await loadBoard()
            // Como la web: el tablero se refresca solo cada 30 s.
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                if Task.isCancelled { break }
                await loadBoard()
            }
        }
    }

    @MainActor
    private func loadBoard() async {
        do {
            board = try await CoreRepository.shared.teamBoard()
            boardError = nil
        } catch {
            if board == nil {
                boardError = error.toUserMessage(fallback: "No se pudo cargar Actividades")
            }
        }
        loaded = true
    }
}

// MARK: - Tablero del equipo

struct TeamBoardView: View {
    let board: TeamBoardResponse?
    let error: String?
    let loading: Bool
    let myId: Int?
    let onReload: () async -> Void

    /// Uno mismo primero, como la web.
    private var users: [TeamBoardUser] {
        let list = board?.users ?? []
        guard let myId else { return list }
        return list.filter { $0.id == myId } + list.filter { $0.id != myId }
    }

    private func count(_ status: String) -> Int {
        users.filter { ($0.status ?? "sin_actividad") == status }.count
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Tú y tu equipo. Toca a alguien para ver su día.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                CoreFlowLayout {
                    ForEach(CoreStatusUI.boardStatusOrder, id: \.self) { key in
                        let ui = CoreStatusUI.boardStatus(key)
                        HStack(spacing: 6) {
                            Circle().fill(ui.color).frame(width: 8, height: 8)
                            Text("\(ui.label) \(count(key))")
                                .font(.caption.weight(.semibold))
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Color(.secondarySystemGroupedBackground), in: Capsule())
                    }
                }

                if loading && board == nil {
                    ProgressView("Cargando…")
                        .frame(maxWidth: .infinity)
                        .padding(.top, 30)
                } else if let error, board == nil {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(CorePalette.red)
                } else if users.isEmpty {
                    Text("Nadie en tu equipo por ahora.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 158), spacing: 12)], spacing: 12) {
                        ForEach(users) { user in
                            NavigationLink {
                                TeamMemberDetailView(userId: user.id, nombre: user.nombre, isSelf: user.id == myId)
                            } label: {
                                TeamPersonCard(user: user, isSelf: user.id == myId)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding()
        }
        .refreshable { await onReload() }
    }
}

private struct TeamPersonCard: View {
    let user: TeamBoardUser
    let isSelf: Bool

    /// Libre sin nada abierto: «Última: …» como la web.
    private var lastFinishedTitle: String? {
        guard let finished = user.lastFinished else { return nil }
        return "Última: \(finished.titulo ?? "Actividad")"
    }

    private func openTitle(_ activity: TeamBoardOpenActivity) -> String {
        let base = activity.titulo ?? "Actividad"
        switch activity.assignmentCharge {
        case "despacho": return base + " · Despacho"
        case "ejecucion": return base + " · Ejecución"
        default: return base
        }
    }

    var body: some View {
        let status = CoreStatusUI.boardStatus(user.status)
        let open = user.openActivities ?? []
        VStack(spacing: 10) {
            ZStack(alignment: .bottomTrailing) {
                CoreAvatar(name: user.nombre, url: user.avatarUrl, size: 64)
                Circle()
                    .fill(status.color)
                    .frame(width: 14, height: 14)
                    .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 3))
            }
            VStack(spacing: 2) {
                Text(user.nombre)
                    .font(.subheadline.weight(.bold))
                    .lineLimit(1)
                if isSelf {
                    Text("TÚ")
                        .font(.caption2.weight(.heavy))
                        .foregroundStyle(Color.accentColor)
                }
                Text(CoreBoardText.estado(user))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(status.color)
                    .multilineTextAlignment(.center)
                if user.status == "libre", let finished = user.lastFinished {
                    let termino = CoreBoardText.termino(finished)
                    Text(termino.text)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(termino.color)
                        .multilineTextAlignment(.center)
                        .padding(.top, 2)
                }
                if (user.enCorreccion ?? 0) > 0 {
                    CoreChip(icon: "arrow.uturn.backward", text: "Corrigiendo evidencia", color: CorePalette.orange)
                        .padding(.top, 2)
                }
                if let enEspera = user.enEsperaAprobacion, enEspera > 0 {
                    CoreChip(
                        icon: "hourglass",
                        text: enEspera > 1 ? "\(enEspera) en espera de aprobación" : "En espera de aprobación",
                        color: CorePalette.purple
                    )
                    .padding(.top, 2)
                }
            }
            if open.isEmpty {
                Divider()
                Text(user.currentActivity?.titulo ?? lastFinishedTitle ?? "Sin actividades hoy")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(open.prefix(3)) { activity in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(openTitle(activity))
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                            CoreProgressBar(percent: activity.progressPct ?? 0, showsLabel: false)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .padding(.horizontal, 10)
        .background(
            isSelf ? Color.accentColor.opacity(0.06) : Color(.secondarySystemGroupedBackground),
            in: RoundedRectangle(cornerRadius: 18)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(isSelf ? Color.accentColor.opacity(0.5) : Color.clear, lineWidth: 2)
        )
    }
}

// MARK: - Día de una persona (GET me/board/:userId + history)

struct TeamMemberDetailView: View {
    let userId: Int
    let nombre: String
    var isSelf: Bool = false

    @ObservedObject private var session = SessionStore.shared
    @State private var member: TeamBoardUser?
    @State private var history: [TeamBoardHistoryItem] = []
    @State private var loading = true
    @State private var error: String?
    @State private var despacho: DespachoTarget?
    @State private var reprogramar: ReprogramarTarget?
    @State private var notice: String?

    private var myEmail: String? { session.currentUser?.email }
    private var isCoordinator: Bool { CoreOrg.normalized(myEmail) == CoreOrg.serviceCoordinatorEmail }

    /// Despachos que esta persona reparte y todavía no pasa a nadie de su grupo
    /// (misma regla que `DespachoPendingPanel` en la web).
    private func pendingDispatches(_ user: TeamBoardUser) -> [TeamBoardOpenActivity] {
        let pool = Set(CoreOrg.dispatchPool(for: myEmail))
        let me = CoreOrg.normalized(myEmail)
        return (user.openActivities ?? []).filter { activity in
            guard (activity.assignmentCharge ?? "").lowercased() == "despacho", activity.reparte == true else { return false }
            guard let team = activity.teamEmails?.map({ CoreOrg.normalized($0) }) else { return true }
            if !pool.isEmpty { return !team.contains(where: { pool.contains($0) }) }
            return !team.contains(where: { $0 != me })
        }
    }

    var body: some View {
        List {
            if let notice {
                Section {
                    NxIconText(systemName: "checkmark.circle.fill", text: notice).foregroundStyle(CorePalette.green)
                }
            }
            if let member {
                Section {
                    HStack(spacing: 12) {
                        CoreAvatar(name: member.nombre, url: member.avatarUrl, size: 56)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(member.nombre).font(.headline)
                            if let puesto = member.puesto, !puesto.isEmpty {
                                Text(puesto).font(.caption).foregroundStyle(.secondary)
                            }
                            let status = CoreStatusUI.boardStatus(member.status)
                            CoreChip(text: CoreBoardText.estado(member), color: status.color)
                            if member.status == "libre", let finished = member.lastFinished {
                                let termino = CoreBoardText.termino(finished)
                                Text(termino.text)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(termino.color)
                            }
                            if (member.enCorreccion ?? 0) > 0 {
                                CoreChip(icon: "arrow.uturn.backward", text: "Corrigiendo evidencia", color: CorePalette.orange)
                            }
                            if let enEspera = member.enEsperaAprobacion, enEspera > 0 {
                                CoreChip(
                                    icon: "hourglass",
                                    text: enEspera > 1 ? "\(enEspera) en espera de aprobación" : "En espera de aprobación",
                                    color: CorePalette.purple
                                )
                            }
                        }
                    }
                    LabeledContent("Entrada", value: CoreFormat.time(member.clockInAt) ?? "Sin entrada")
                    if let worked = CoreFormat.minutes(member.workedMinutes) {
                        LabeledContent("Tiempo trabajado", value: worked)
                    }
                    if let current = member.currentActivity {
                        LabeledContent("En curso", value: current.titulo ?? "Actividad")
                    }
                    if let elapsed = CoreFormat.minutes(member.activityElapsedMinutes) {
                        LabeledContent("Lleva en ella", value: elapsed)
                    }
                }

                // Web: botón «Asignar actividad» (`/erp/pizarra/[userId]/asignar`), solo para otra persona.
                if !isSelf {
                    Section {
                        NavigationLink {
                            CoreAssignActivityView(userId: userId) { message in
                                notice = message
                                Task { await load() }
                            }
                        } label: {
                            Label("Asignar actividad", systemImage: "plus.circle.fill")
                                .font(.body.weight(.bold))
                        }
                    }
                }

                let pendientes = isSelf ? pendingDispatches(member) : []
                if !pendientes.isEmpty {
                    Section {
                        ForEach(pendientes) { activity in
                            VStack(alignment: .leading, spacing: 6) {
                                Text("\(activity.anNumber ?? "#\(activity.id)") · \(activity.titulo ?? "Actividad")")
                                    .font(.subheadline.weight(.bold))
                                if let cupo = CoreDispatch.headcount(activity.indicaciones) {
                                    Text("Despacho · se ocupan \(cupo) persona\(cupo == 1 ? "" : "s")")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                if let indicaciones = activity.indicaciones, !indicaciones.isEmpty {
                                    Text(indicaciones).font(.caption).foregroundStyle(.secondary)
                                }
                                NxIconText(systemName: "calendar", text: "Programada: \(CoreFormat.when(activity.fechaInicio) ?? "Sin fecha")")
                                    .font(.caption)
                                HStack(spacing: 8) {
                                    Button("Despachar al equipo") {
                                        despacho = DespachoTarget(
                                            id: activity.id,
                                            title: "\(activity.anNumber ?? "") · \(activity.titulo ?? "Actividad")",
                                            indicaciones: activity.indicaciones
                                        )
                                    }
                                    .buttonStyle(.borderedProminent)
                                    Button("Cambiar fecha y hora") {
                                        reprogramar = ReprogramarTarget(
                                            id: activity.id,
                                            title: activity.titulo ?? "Actividad",
                                            fechaActual: activity.fechaInicio
                                        )
                                    }
                                    .buttonStyle(.bordered)
                                }
                                .font(.caption)
                            }
                            .padding(.vertical, 4)
                        }
                    } header: {
                        Text("Pendiente de despacho")
                    } footer: {
                        Text(isCoordinator ? "Mándala a Antonio; él elige a quién del soporte." : "Elige a quién de tu equipo ejecuta.")
                    }
                }

                Section("Abiertas") {
                    let open = member.openActivities ?? []
                    if open.isEmpty {
                        Text("Sin actividades abiertas.").foregroundStyle(.secondary)
                    }
                    ForEach(open) { activity in
                        NavigationLink {
                            ActivityCoreDetailView(activityId: activity.id)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(activity.titulo ?? "Actividad").font(.subheadline.weight(.semibold))
                                HStack(spacing: 6) {
                                    Text(activity.anNumber ?? "").font(.caption).foregroundStyle(.secondary)
                                    if activity.reparte == true {
                                        CoreChip(icon: "paperplane", text: "La reparte", color: CorePalette.purple)
                                    }
                                }
                                if activity.reparte != true {
                                    CoreProgressBar(percent: activity.progressPct ?? 0)
                                }
                            }
                        }
                    }
                }
            } else if loading {
                Section { ProgressView("Cargando…") }
            } else if let error {
                Section {
                    Text(error).foregroundStyle(CorePalette.red)
                    Button("Reintentar") { Task { await load() } }
                }
            }

            if !history.isEmpty {
                Section("Historial") {
                    ForEach(history) { item in
                        NavigationLink {
                            ActivityCoreDetailView(activityId: item.id)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.titulo ?? "Actividad").font(.subheadline.weight(.semibold))
                                HStack(spacing: 6) {
                                    let estatus = CoreStatusUI.estatus(item.estatus)
                                    CoreChip(text: estatus.label, color: estatus.color)
                                    CoreChip(icon: CoreStatusUI.kindSymbol(item.coreKind), text: CoreStatusUI.kind(item.coreKind, ticketTypeCustom: item.ticketTypeCustom))
                                }
                                if let evidence = item.evidence {
                                    CoreProgressBar(percent: evidence.progressPct ?? 0)
                                }
                                if let when = CoreFormat.when(item.fechaAsignacion) {
                                    Text("Asignada \(when)").font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(CoreFormat.shortName(member?.nombre ?? nombre))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $despacho) { target in
            DespachoSheet(target: target) { message in
                notice = message
                Task { await load() }
            }
        }
        .sheet(item: $reprogramar) { target in
            ReprogramarSheet(target: target) { message in
                notice = message
                Task { await load() }
            }
        }
    }

    @MainActor
    private func load() async {
        loading = true
        defer { loading = false }
        do {
            async let memberTask = CoreRepository.shared.teamBoardUser(userId: userId)
            async let historyTask = CoreRepository.shared.teamBoardHistory(userId: userId)
            member = try await memberTask
            history = (try? await historyTask) ?? []
            error = nil
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo cargar a esta persona")
        }
    }
}
