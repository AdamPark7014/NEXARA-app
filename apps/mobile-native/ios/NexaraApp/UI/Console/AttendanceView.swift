import SwiftUI

// Asistencias de Core, con las tres pestañas de la web
// (`apps/web/app/(panels)/erp/asistencias/page.tsx`): equipo del día, comidas y
// trayectoria, todas gobernadas por un único selector de fecha.

enum AsistenciasTab: String, CaseIterable, Identifiable {
    case equipo
    case comidas
    case trayectoria

    var id: String { rawValue }

    var title: String {
        switch self {
        case .equipo: return "Equipo del día"
        case .comidas: return "Comidas"
        case .trayectoria: return "Trayectoria"
        }
    }
}

/// Una persona del equipo ya resuelta al día que se está viendo.
struct AttendanceDayRow: Identifiable {
    let member: AttendanceTeamMember
    let estado: AttendanceEstado
    let checkIn: String?
    let checkOut: String?
    let entryPunch: AttendancePunch?
    let exitPunch: AttendancePunch?
    /// Falta justificada del día que se está viendo.
    let justification: AttendanceJustification?
    let isMe: Bool

    var id: Int { member.userId }

    /// Jornada abierta: corre contra el reloj; cerrada: entrada → salida.
    func elapsed(now: Date) -> TimeInterval {
        AttendanceClock.elapsed(from: checkIn, to: estado == .presente ? nil : checkOut, now: now)
    }
}

// MARK: – ViewModel

@MainActor
final class AttendanceVM: ObservableObject {
    @Published var tab: AsistenciasTab = .equipo
    @Published var date = Date()
    @Published var filter: AttendanceEstado?

    // Equipo
    @Published var members: [AttendanceTeamMember] = []
    @Published var teamLoading = false
    @Published var teamError: String?

    // Mi jornada
    @Published var current: AttendanceCurrent?
    @Published var myPunches: [AttendancePunch] = []
    @Published var daySummary: AttendanceDaySummary?
    @Published var mineError: String?
    @Published var checkInLoading = false
    @Published var checkInNotice: String?
    /// Mis faltas justificadas de los últimos 30 días (`attendance/range`).
    @Published var myJustifications: [AttendanceJustification] = []

    // Trayectoria
    @Published var teamGps: [GpsTeamLocation] = []
    @Published var trajectory: [GpsTrajectoryPoint] = []
    @Published var trajectoryPunches: [AttendancePunch] = []
    @Published var trajectoryLoading = false
    @Published var trajectoryError: String?

    private var user: SessionUser? { SessionStore.shared.currentUser }
    private var myId: Int? { user.flatMap { Int($0.id) } }

    var mode: AttendanceViewMode { AsistenciasAccess.mode(for: user) }
    var canRegisterSelf: Bool { mode.canRegisterSelf }
    var canManageTeam: Bool { mode.canManageTeam }
    var canLiveGps: Bool { AsistenciasAccess.canLiveGps(user) }
    /// «Justificar falta»: solo Christian (y su equivalente); el API lo vuelve a exigir.
    var canJustifyAbsence: Bool { CoreOrg.isCeo(user?.email) }
    var dateString: String { AttendanceClock.dayString(date) }
    var isToday: Bool { AttendanceClock.isToday(date) }

    var tabs: [AsistenciasTab] {
        canLiveGps ? AsistenciasTab.allCases : [.equipo, .comidas]
    }

    // MARK: Equipo derivado

    var rows: [AttendanceDayRow] {
        let day = dateString
        let me = myId
        return members.map { member -> AttendanceDayRow in
            let entry = member.latest("entrada")
            let exit = member.latest("salida")
            let info = member.day(day)
            let falta = member.justification(day)
            let estado: AttendanceEstado
            if info?.isOpen == true {
                estado = .presente
            } else if entry != nil && exit != nil {
                estado = .completo
            } else if entry != nil {
                estado = .presente
            } else if falta != nil {
                estado = .justificada
            } else {
                estado = .ausente
            }
            return AttendanceDayRow(
                member: member,
                estado: estado,
                checkIn: entry?.timestamp,
                checkOut: exit?.timestamp,
                entryPunch: entry,
                exitPunch: exit,
                justification: falta,
                isMe: me != nil && me == member.userId
            )
        }
        .sorted { a, b in
            if a.isMe != b.isMe { return a.isMe }
            if a.estado.order != b.estado.order { return a.estado.order < b.estado.order }
            return a.member.displayName.localizedCaseInsensitiveCompare(b.member.displayName) == .orderedAscending
        }
    }

    var filteredRows: [AttendanceDayRow] {
        guard let filter else { return rows }
        return rows.filter { $0.estado == filter }
    }

    var counts: (total: Int, presentes: Int, completos: Int, ausentes: Int) {
        let all = rows
        return (
            all.count,
            all.filter { $0.estado == .presente }.count,
            all.filter { $0.estado == .completo }.count,
            all.filter { $0.estado == .ausente }.count
        )
    }

    /// Aparte de `counts`: una falta justificada no es «Sin checada».
    var justificadas: Int {
        rows.filter { $0.estado == .justificada }.count
    }

    func productividad(now: Date) -> TimeInterval {
        rows.reduce(0) { $0 + $1.elapsed(now: now) }
    }

    // MARK: Mi jornada derivada

    var isOpen: Bool { current?.isOpen == true }
    var lastEntryAt: String? {
        guard let raw = current?.raw else { return nil }
        let value = StockParse.str(raw["lastEntryAt"], raw["checkIn"])
        return value.isEmpty ? nil : value
    }
    var hasEntryToday: Bool { myPunches.contains { $0.isEntry } }
    var hasExitToday: Bool { myPunches.contains { !$0.isEntry } }

    /// La jornada quedó abierta de otro día: hay que cerrarla antes de abrir otra.
    var openedOnAnotherDay: Bool {
        guard isOpen, let iso = lastEntryAt, let date = CoreFormat.date(iso) else { return false }
        return !AttendanceClock.isToday(date)
    }

    /// El API contesta 400 a una segunda entrada del día: aquí se apaga el botón
    /// antes, para no mandar a nadie contra un error que ya se sabe.
    var canMarkEntry: Bool { !hasEntryToday && !isOpen }
    var canMarkExit: Bool { isOpen }

    var statusLabel: String {
        if hasEntryToday && hasExitToday && !isOpen { return "Completada" }
        if isOpen { return openedOnAnotherDay ? "Abierta (día anterior)" : "En jornada" }
        if !hasEntryToday && myJustifications.contains(where: { $0.fecha == AttendanceClock.dayString(Date()) }) {
            return AttendanceEstado.justificada.label
        }
        return "Sin checada"
    }

    /// Minutos ya cerrados de hoy, en segundos (el cronómetro suma lo abierto).
    var totalSecondsToday: TimeInterval {
        TimeInterval((daySummary?.totalMinutes ?? current?.totalMinutes ?? 0) * 60)
    }

    var routePoints: [(lat: Double, lng: Double)] {
        var out: [(lat: Double, lng: Double)] = []
        if let entry = trajectoryPunches.first(where: { $0.isEntry })?.coords {
            out.append(entry)
        }
        for point in trajectory {
            if let lat = point.latitude, let lng = point.longitude { out.append((lat, lng)) }
        }
        if let exit = trajectoryPunches.last(where: { !$0.isEntry })?.coords {
            if let last = out.last, last.lat == exit.lat, last.lng == exit.lng { return out }
            out.append(exit)
        }
        return out
    }

    // MARK: Carga

    func loadTeam(quiet: Bool) async {
        guard canManageTeam else {
            members = []
            return
        }
        if !quiet {
            teamLoading = true
            teamError = nil
        }
        defer { teamLoading = false }
        do {
            members = try await AsistenciasRepository.shared.teamDay(
                date: dateString,
                companyWide: AsistenciasAccess.companyWide(user)
            )
            teamError = nil
        } catch {
            if !quiet {
                members = []
                teamError = error.toUserMessage(fallback: "No se pudo cargar la asistencia del equipo")
            }
        }
    }

    func loadMine() async {
        guard canRegisterSelf else { return }
        let today = AttendanceClock.dayString(Date())
        do {
            current = try await ConsoleRepository.shared.attendanceCurrentItem()
            myPunches = try await AsistenciasRepository.shared.myPunches(date: today)
            daySummary = try await FieldOpsDayRepository.shared.attendanceDay(date: today)
            mineError = nil
        } catch {
            mineError = error.toUserMessage(fallback: "No se pudo leer tu jornada de hoy")
        }
    }

    /// Mis faltas justificadas de los últimos 30 días. Si falla, se queda lo que había.
    func loadMyJustifications() async {
        guard canRegisterSelf else { return }
        let today = Date()
        let from = Calendar.current.date(byAdding: .day, value: -30, to: today) ?? today
        if let list = try? await AsistenciasRepository.shared.myJustifications(
            from: AttendanceClock.dayString(from),
            to: AttendanceClock.dayString(today)
        ) {
            myJustifications = list
        }
    }

    /// `POST attendance/justificaciones` y recarga del equipo. Devuelve el error legible o `nil`.
    func justifyAbsence(userId: Int, fecha: String, motivo: String) async -> String? {
        do {
            try await AsistenciasRepository.shared.justifyAbsence(userId: userId, fecha: fecha, motivo: motivo)
            await loadTeam(quiet: true)
            return nil
        } catch {
            return error.toUserMessage(fallback: "No se pudo justificar la falta")
        }
    }

    func loadTrajectory() async {
        guard canLiveGps else { return }
        trajectoryLoading = true
        trajectoryError = nil
        defer { trajectoryLoading = false }
        do {
            teamGps = try await AsistenciasRepository.shared.gpsTeam()
        } catch {
            teamGps = []
            trajectoryError = error.toUserMessage(fallback: "No se pudo cargar el GPS del equipo")
        }
        do {
            trajectory = try await AsistenciasRepository.shared.gpsTrajectory(date: dateString)
            trajectoryPunches = (try? await AsistenciasRepository.shared.myPunches(date: dateString)) ?? []
        } catch {
            trajectory = []
            trajectoryPunches = []
            if trajectoryError == nil {
                trajectoryError = error.toUserMessage(fallback: "No se pudo cargar tu trayecto")
            }
        }
    }

    /// Lo que toca según la pestaña; `quiet` es el refresco de fondo.
    func refresh(quiet: Bool) async {
        switch tab {
        case .equipo:
            await loadMine()
            // El refresco de fondo (cada 15 s) no vuelve a pedir el mes entero.
            if !quiet { await loadMyJustifications() }
            await loadTeam(quiet: quiet)
        case .comidas:
            break
        case .trayectoria:
            await loadTrajectory()
        }
    }

    // MARK: Checada

    /// Marca con foto (el API la exige). Devuelve `nil` si quedó registrada.
    func checkIn(_ type: String, photo: CapturedGeoPhoto) async -> String? {
        checkInLoading = true
        checkInNotice = nil
        defer { checkInLoading = false }
        var coords = photo.coords
        if coords == nil { coords = await DeviceLocation.shared.current() }
        do {
            let result = try await ConsoleRepository.shared.attendanceCheckInResult(
                type: type,
                lat: coords?.latitude,
                lng: coords?.longitude,
                photoBase64: photo.dataUrl
            )
            if (result.raw["queued"] as? Bool) == true {
                checkInNotice = "Sin conexión: tu checada se enviará sola en cuanto vuelva la red."
            } else {
                let base = result.message.isEmpty
                    ? (type == "entrada" ? "Entrada registrada." : "Salida registrada.")
                    : result.message
                checkInNotice = base + gpsSuffix(coords)
                await switchShiftGps(type: type)
            }
            await loadMine()
            await loadTeam(quiet: true)
            return nil
        } catch {
            return error.toUserMessage(fallback: "No se pudo registrar tu asistencia")
        }
    }

    private func gpsSuffix(_ coords: DeviceCoords?) -> String {
        guard let coords else { return " Sin GPS: activa la ubicación." }
        return String(format: " GPS %.5f, %.5f.", coords.latitude, coords.longitude)
    }

    /// Entrada: consentimiento + seguimiento. Salida: se apaga todo.
    private func switchShiftGps(type: String) async {
        do {
            if type == "entrada" {
                try await AsistenciasRepository.shared.setGpsConsent(true)
                ShiftGpsTracker.shared.start()
                checkInNotice = (checkInNotice ?? "") + " Compartiendo ubicación mientras dure tu jornada."
            } else {
                ShiftGpsTracker.shared.stop()
                try await AsistenciasRepository.shared.setGpsConsent(false)
                checkInNotice = (checkInNotice ?? "") + " Dejaste de compartir ubicación."
            }
        } catch {
            // La checada ya quedó: el fallo de GPS se dice sin el tono de un
            // fallo de asistencia.
            checkInNotice = (checkInNotice ?? "") + " El GPS de jornada no cambió (\(error.toUserMessage()))."
        }
    }
}

// MARK: – Pantalla

struct AttendanceView: View {
    /// Los avisos de comida abren `/erp/asistencias?tab=comidas`.
    var initialTab: String?

    @StateObject private var vm = AttendanceVM()
    @State private var photoType: String?
    @State private var photo: CorePhotoItem?
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        VStack(spacing: 0) {
            controls
            Divider()
            content
        }
        .navigationTitle("Asistencias")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    Task { await vm.refresh(quiet: false) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .accessibilityLabel("Actualizar")
            }
        }
        .onAppear(perform: applyInitialTab)
        // Refresco en vivo: como la web, cada 15 s mientras la pestaña esté a la
        // vista, y al volver del segundo plano.
        .task(id: "\(vm.tab.rawValue)-\(vm.dateString)") {
            await vm.refresh(quiet: false)
            await ShiftGpsTracker.shared.resumeIfNeeded()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 15_000_000_000)
                if Task.isCancelled { break }
                await vm.refresh(quiet: true)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task {
                    await vm.refresh(quiet: true)
                    await ShiftGpsTracker.shared.resumeIfNeeded()
                }
            }
        }
        .fullScreenCover(isPresented: Binding(
            get: { photoType != nil },
            set: { if !$0 { photoType = nil } }
        )) {
            GeoPhotoCaptureView(
                title: photoType == "salida" ? "Tu foto de salida" : "Tu foto de entrada",
                confirmLabel: "Registrar con esta foto",
                requireLocation: false,
                onConfirm: { captured in
                    let type = photoType ?? "entrada"
                    let failure = await vm.checkIn(type, photo: captured)
                    if failure == nil { photoType = nil }
                    return failure
                },
                onCancel: { photoType = nil }
            )
        }
        .fullScreenCover(item: $photo) { item in
            CorePhotoViewer(item: item)
        }
    }

    private func applyInitialTab() {
        guard let initialTab, let tab = AsistenciasTab(rawValue: initialTab) else { return }
        if vm.tabs.contains(tab) { vm.tab = tab }
    }

    /// Pestañas + un solo día: la fecha manda sobre equipo, comidas y trayecto.
    private var controls: some View {
        VStack(spacing: 8) {
            Picker("Vista", selection: $vm.tab) {
                ForEach(vm.tabs) { tab in
                    Text(tab.title).tag(tab)
                }
            }
            .pickerStyle(.segmented)

            HStack {
                DatePicker("Día", selection: $vm.date, in: ...Date(), displayedComponents: .date)
                    .font(.subheadline)
                if !vm.isToday {
                    Button("Hoy") { vm.date = Date() }
                        .font(.caption.weight(.semibold))
                }
            }
        }
        .padding(.horizontal)
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private var content: some View {
        switch vm.tab {
        case .equipo:
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if vm.canRegisterSelf {
                        MiJornadaCard(
                            vm: vm,
                            onMark: { photoType = $0 },
                            onPhoto: { photo = $0 }
                        )
                    }
                    if vm.canManageTeam {
                        AsistenciasEquipoSection(vm: vm, onPhoto: { photo = $0 })
                    } else if !vm.canRegisterSelf {
                        NxEmptyState(
                            title: "Vista de equipo",
                            subtitle: "Disponible para quien tiene gente a su cargo."
                        )
                    }
                    Spacer(minLength: 16)
                }
                .padding()
            }
            .refreshable { await vm.refresh(quiet: false) }
        case .comidas:
            ComidasView(fecha: vm.date)
        case .trayectoria:
            ScrollView {
                AsistenciasTrayectoriaSection(vm: vm)
                    .padding()
            }
            .refreshable { await vm.loadTrajectory() }
        }
    }
}
