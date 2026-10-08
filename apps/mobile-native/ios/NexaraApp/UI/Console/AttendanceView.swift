import SwiftUI

// Asistencias de Core — espejo de `ConsoleAttendanceScreen.kt` de Android (que a su vez
// copia `apps/web/app/(panels)/erp/asistencias/page.tsx`): pestañas subrayadas arriba
// («Mi jornada» o «Equipo del día», «Comidas» y, solo dirección, «Trayectoria»), un
// único selector de día debajo y el contenido de la pestaña.

enum AsistenciasTab: String, CaseIterable, Identifiable {
    case equipo
    case comidas
    case trayectoria

    var id: String { rawValue }
}

/// Una persona del equipo ya resuelta al día que se está viendo (`AttendancePersona`).
struct AttendanceDayRow: Identifiable {
    let member: AttendanceTeamMember
    let estado: AttendanceEstado
    let checkIn: String?
    let checkOut: String?
    let entryPunch: AttendancePunch?
    let exitPunch: AttendancePunch?
    /// Última foto de entrada / salida que sí trae archivo.
    let fotoEntrada: String?
    let fotoSalida: String?
    /// Falta justificada del día que se está viendo (solo si el estado es «Falta justificada»).
    let justification: AttendanceJustification?
    /// «Sin conexión», «Revisar: motivo», «Fuera de sitio · N m», «Cierre automático», «Corregida».
    let avisos: [AttendanceBadge]
    /// Correcciones de sus checadas del día.
    let correcciones: [AttendanceCorreccion]
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
    /// Día elegido (`yyyy-MM-dd`, México). `nil` = hoy, y sigue siendo hoy aunque
    /// pase la medianoche con la pantalla abierta.
    @Published private(set) var fechaElegida: String?
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
    /// Mi falta justificada del día que se ve (solo se pregunta si no checé entrada).
    @Published var miJustificacion: AttendanceJustification?
    @Published var checkInLoading = false
    @Published var checkInNotice: String?
    /// La línea de la checada es un error (rojo) y no una confirmación (verde).
    @Published var checkInNoticeIsError = false
    /// 422 del servidor: la checada no se registró. Va en un aviso, no como una
    /// línea más, porque es lo único que importa en ese momento (igual que Android).
    @Published var checkInBloqueo: String?

    // Trayectoria
    @Published var teamGps: [GpsTeamLocation] = []
    @Published var trajectory: [GpsTrajectoryPoint] = []
    @Published var trajectoryPunches: [AttendancePunch] = []
    @Published var trajectoryLoading = false
    @Published var trajectoryError: String?

    /// Inicio usa este mismo modelo y pinta las horas cerradas del día
    /// (`attendance/day`); Asistencias no las necesita y no las pide.
    private let cargaResumenDelDia: Bool
    /// El equipo ya se pidió alguna vez (Inicio nunca lo pide: no se recarga tras checar).
    private var equipoPedido = false

    init(cargaResumenDelDia: Bool = true) {
        self.cargaResumenDelDia = cargaResumenDelDia
    }

    private var user: SessionUser? { SessionStore.shared.currentUser }
    private var myId: Int? { user.flatMap { Int($0.id) } }

    var mode: AttendanceViewMode { AsistenciasAccess.mode(for: user) }
    var canRegisterSelf: Bool { mode.canRegisterSelf }
    var canManageTeam: Bool { mode.canManageTeam }
    /// «Trayectoria» (GPS del equipo y mi trayecto): solo dirección, como Android.
    var canSeeTrajectory: Bool { AsistenciasAccess.canSeeTrajectory(user) }
    /// «Justificar falta»: solo Christian (y su equivalente); el API lo vuelve a exigir.
    var canJustifyAbsence: Bool { AsistenciasAccess.canJustify(user) }

    var dateString: String { fechaElegida ?? AttendanceClock.today() }
    var isToday: Bool { dateString == AttendanceClock.today() }

    /// Cambia el día que se ve; elegir hoy vuelve a «seguir a hoy».
    func setFecha(_ fecha: String) {
        let nueva: String? = fecha == AttendanceClock.today() ? nil : fecha
        guard nueva != fechaElegida else { return }
        fechaElegida = nueva
    }

    var tabs: [AsistenciasTab] {
        canSeeTrajectory ? AsistenciasTab.allCases : [.equipo, .comidas]
    }

    /// Quien no ve equipo solo tiene su jornada en esta pestaña: se llama como lo que muestra.
    func title(for tab: AsistenciasTab) -> String {
        switch tab {
        case .equipo: return canManageTeam ? "Equipo del día" : "Mi jornada"
        case .comidas: return "Comidas"
        case .trayectoria: return "Trayectoria"
        }
    }

    // MARK: Equipo derivado (`mapPersonas` de Android)

    var rows: [AttendanceDayRow] {
        let day = dateString
        let me = myId
        return members.map { member -> AttendanceDayRow in
            let entry = member.latest("entrada")
            let exit = member.latest("salida")
            let info = member.day(day)
            let falta = FaltasJustificadas.delDia(member.justificaciones, fecha: day)
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
            let fotoEntrada = member.punches.last { $0.isEntry && !$0.photoUrl.isEmpty }?.photoUrl
            let fotoSalida = member.punches.last { !$0.isEntry && !$0.photoUrl.isEmpty }?.photoUrl
            var vistos = Set<String>()
            let avisos = (AttendanceBadges.de(entry) + AttendanceBadges.de(exit)).filter { vistos.insert($0.texto).inserted }
            return AttendanceDayRow(
                member: member,
                estado: estado,
                checkIn: entry?.timestamp,
                checkOut: exit?.timestamp,
                entryPunch: entry,
                exitPunch: exit,
                fotoEntrada: fotoEntrada,
                fotoSalida: fotoSalida,
                justification: estado == .justificada ? falta : nil,
                avisos: avisos,
                correcciones: member.punches.flatMap { $0.correcciones },
                isMe: me != nil && me == member.userId
            )
        }
        .sorted { a, b in
            if a.isMe != b.isMe { return a.isMe }
            if a.estado.order != b.estado.order { return a.estado.order < b.estado.order }
            return a.member.displayName.lowercased() < b.member.displayName.lowercased()
        }
    }

    var filteredRows: [AttendanceDayRow] {
        let all = rows
        guard let filter else { return all }
        return all.filter { $0.estado == filter }
    }

    // MARK: Mi jornada derivada

    var isOpen: Bool { current?.isOpen == true }

    /// Hora de la última entrada de la jornada abierta (`AttendanceDay.lastEntryAt`).
    var lastEntryAt: String? {
        guard let raw = current?.raw else { return nil }
        let value = StockParse.str(raw["lastEntryAt"], raw["checkIn"])
        return value.isEmpty ? nil : value
    }

    /// Desde cuándo corre el cronómetro: la última entrada de la jornada o, si el
    /// API no la trae, la última checada de entrada del día.
    var inicioIso: String? {
        lastEntryAt ?? myPunches.filter { $0.isEntry }.max { $0.timestamp < $1.timestamp }?.timestamp
    }

    /// Hay entrada / salida en el día que se ve (Inicio siempre ve hoy).
    var hasEntryToday: Bool { myPunches.contains { $0.isEntry } }
    var hasExitToday: Bool { myPunches.contains { !$0.isEntry } }

    /// La jornada quedó abierta de otro día: hay que cerrarla antes de abrir otra.
    var openedOnAnotherDay: Bool {
        guard isOpen, let date = AttendanceClock.parse(lastEntryAt) else { return false }
        return !AttendanceClock.isToday(date)
    }

    /// El API contesta 400 a una segunda entrada del día: aquí se apaga antes.
    /// Solo se checa en el día de hoy (`puedeEntrada` / `puedeSalida` de Android).
    var canMarkEntry: Bool { isToday && !hasEntryToday && !isOpen }
    var canMarkExit: Bool { isToday && isOpen }

    /// Mi falta justificada, solo si ese día no hay jornada ni entrada.
    var miFalta: AttendanceJustification? {
        (!isOpen && !hasEntryToday) ? miJustificacion : nil
    }

    /// Estado de mi jornada con los textos de Android.
    var statusLabel: String {
        if isOpen { return "Jornada en curso" }
        if hasEntryToday && hasExitToday { return "Jornada completada" }
        if miFalta != nil { return AttendanceEstado.justificada.label }
        return "Sin entrada registrada"
    }

    /// Minutos ya cerrados de hoy, en segundos (lo usa Inicio: su cronómetro suma lo abierto).
    var totalSecondsToday: TimeInterval {
        // Sin entrada ni jornada abierta no hay horas: un resumen viejo no cuenta.
        guard hasEntryToday || isOpen else { return 0 }
        return TimeInterval((daySummary?.totalMinutes ?? current?.totalMinutes ?? 0) * 60)
    }

    /// Recorrido para el mapa: entrada, puntos GPS y salida del día (como la web).
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

    /// Puntos GPS del día con coordenadas (lo que traza «Ver recorrido en Maps» de Android).
    var trajectoryRoute: [(lat: Double, lng: Double)] {
        trajectory.compactMap { point in
            guard let lat = point.latitude, let lng = point.longitude else { return nil }
            return (lat, lng)
        }
    }

    // MARK: Carga

    /// Equipo del día. `initial` = carga visible (esqueleto y error a la vista);
    /// sin él es el refresco de fondo y un fallo no borra lo que ya se veía.
    func loadTeam(initial: Bool) async {
        guard canManageTeam else {
            members = []
            return
        }
        equipoPedido = true
        let fecha = dateString
        if initial {
            teamLoading = members.isEmpty
            teamError = nil
        }
        defer { teamLoading = false }
        do {
            let lista = try await AsistenciasRepository.shared.teamDay(
                date: fecha,
                companyWide: AsistenciasAccess.companyWide(user)
            )
            // Si mientras tanto se cambió de día, esta respuesta ya no sirve.
            guard fecha == dateString else { return }
            members = lista
            teamError = nil
        } catch {
            guard fecha == dateString else { return }
            if initial || members.isEmpty {
                members = []
                teamError = error.toUserMessage(fallback: "No se pudo cargar el equipo")
            }
        }
    }

    /// Mi jornada del día que se ve: jornada abierta, checadas y, si no checé
    /// entrada, mi falta justificada. Un fallo deja lo que ya había.
    func loadMine() async {
        guard canRegisterSelf else { return }
        let fecha = dateString
        do {
            current = try await ConsoleRepository.shared.attendanceCurrentItem()
            let punches = try await AsistenciasRepository.shared.myPunches(date: fecha)
            guard fecha == dateString else { return }
            myPunches = punches
            if cargaResumenDelDia && fecha == AttendanceClock.today() {
                daySummary = try? await FieldOpsDayRepository.shared.attendanceDay(date: fecha)
            }
            mineError = nil
        } catch {
            mineError = error.toUserMessage(fallback: "No se pudo leer tu jornada de hoy")
        }
        // Sin entrada ese día puede haber una falta justificada: solo entonces se pregunta.
        if !myPunches.contains(where: { $0.isEntry }) {
            if let lista = try? await AsistenciasRepository.shared.myJustifications(from: fecha, to: fecha),
               fecha == dateString {
                miJustificacion = FaltasJustificadas.delDia(lista, fecha: fecha)
            }
        } else {
            miJustificacion = nil
        }
    }

    /// `POST attendance/justificaciones` del día que se ve y recarga del equipo.
    /// Devuelve el error legible o `nil`.
    func justifyAbsence(userId: Int, motivo: String) async -> String? {
        do {
            try await AsistenciasRepository.shared.justifyAbsence(
                userId: userId,
                fecha: dateString,
                motivo: FaltasJustificadas.motivoLimpio(motivo)
            )
            await loadTeam(initial: false)
            return nil
        } catch {
            return error.toUserMessage(fallback: "No se pudo justificar la falta")
        }
    }

    /// GPS del equipo y mi trayecto del día (solo dirección).
    func loadTrajectory() async {
        guard canSeeTrajectory else { return }
        let fecha = dateString
        trajectoryLoading = true
        trajectoryError = nil
        defer { trajectoryLoading = false }
        // Como Android: si falla la lista del equipo se queda vacía; el error que se
        // dice es el del trayecto.
        let equipo = (try? await AsistenciasRepository.shared.gpsTeam()) ?? []
        do {
            let puntos = try await AsistenciasRepository.shared.gpsTrajectory(date: fecha)
            let checadas = (try? await AsistenciasRepository.shared.myPunches(date: fecha)) ?? []
            guard fecha == dateString else { return }
            teamGps = equipo
            trajectory = puntos
            trajectoryPunches = checadas
        } catch {
            guard fecha == dateString else { return }
            teamGps = equipo
            trajectory = []
            trajectoryPunches = []
            trajectoryError = error.toUserMessage(fallback: "No se pudo cargar trayectoria")
        }
    }

    /// Mi jornada y el equipo (pestaña «Equipo del día» / «Mi jornada»).
    func refresh(initial: Bool) async {
        await loadMine()
        await loadTeam(initial: initial)
    }

    // MARK: Checada

    /// Marca con foto (el API la exige). Devuelve `nil` si quedó registrada (o si el
    /// servidor la rechazó: eso se explica en el aviso «No se pudo checar»); si no,
    /// el mensaje para enseñarlo sin cerrar la cámara.
    func checkIn(_ type: String, photo: CapturedGeoPhoto) async -> String? {
        checkInLoading = true
        checkInNotice = nil
        checkInNoticeIsError = false
        checkInBloqueo = nil
        defer { checkInLoading = false }
        var coords = photo.coords
        // Por qué no hubo coordenadas (solo se manda si faltan): el jefe lo lee como
        // «Sin ubicación: …» en vez de un «Sin ubicación» a secas.
        var falla: String?
        if coords == nil {
            // La cámara ya hizo la lectura de siempre al tomar la foto y salió vacía: ahora
            // la de máxima precisión y, si tampoco, el diagnóstico.
            let lectura = await DeviceLocation.shared.lecturaChecada(previaVacia: true)
            coords = lectura.coords
            falla = lectura.falla
        }
        do {
            let result = try await ConsoleRepository.shared.attendanceCheckInResult(
                type: type,
                lat: coords?.latitude,
                lng: coords?.longitude,
                accuracyM: coords?.accuracyM,
                // Se manda aunque sea true: el servidor la rechaza y avisa a sus jefes.
                mockLocation: coords?.mock == true,
                // De cuándo es la medición: el servidor no acepta una posición guardada
                // de hace media hora como si fuera de ahora.
                fixAgeMs: coords?.fixAgeMs,
                photoBase64: photo.dataUrl,
                ubicacionFalla: coords == nil ? falla : nil
            )
            // Con la ubicación apagada o sin permiso, el servidor deja registrado ese estado
            // con la checada: se recuerda para avisar «ENCENDIDA» cuando se arregle.
            EstadoUbicacionMonitor.shared.checadaRegistrada(falla: coords == nil ? falla : nil)
            if (result.raw["queued"] as? Bool) == true {
                checkInNotice = "Sin conexión: tu checada se enviará sola en cuanto vuelva la red."
            } else {
                let base = result.message.isEmpty
                    ? (type == "entrada" ? "Entrada registrada" : "Salida registrada")
                    : result.message
                let geo = AttendanceCheckInNota.notaGps(
                    hayCoords: coords != nil,
                    accuracyM: coords?.accuracyM,
                    mock: coords?.mock == true,
                    falla: falla
                )
                let gps: String
                if type == "entrada" {
                    gps = await encenderGps()
                } else {
                    gps = await apagarGps()
                }
                let avisos = AttendanceBadges.deRegistro(result.raw).map(\.texto)
                let aviso = avisos.isEmpty ? "" : " · " + avisos.joined(separator: " · ")
                checkInNotice = base + geo + gps + aviso
            }
            await loadMine()
            if equipoPedido { await loadTeam(initial: false) }
            return nil
        } catch {
            let mensaje = error.toUserMessage(fallback: "Error al registrar")
            var codigo: Int?
            if let api = error as? ApiError, case .http(let code, _) = api { codigo = code }
            // Ubicación simulada, posición vieja, viaje imposible, fuera de la app o fin de
            // semana sin guardia: para quien está en la puerta todos significan «no se
            // registró». Van al mismo aviso; volver a disparar la foto no lo arregla.
            if ChecadaRechazo.esRechazo(codigo: codigo, mensaje: mensaje) {
                checkInBloqueo = mensaje.isEmpty ? ChecadaRechazo.mockMensaje : mensaje
                return nil
            }
            return mensaje
        }
    }

    func clearBloqueo() {
        checkInBloqueo = nil
    }

    /// Entrada: consentimiento en el API + seguimiento. Sin permiso no se enciende nada.
    private func encenderGps() async -> String {
        let tracker = ShiftGpsTracker.shared
        guard tracker.canTrack else { return " · sin permiso de ubicación: no se comparte el trayecto" }
        _ = try? await AsistenciasRepository.shared.setGpsConsent(true)
        tracker.start()
        return " · compartiendo ubicación de jornada"
    }

    /// Salida (o «Dejar de compartir»): se apagan el seguimiento y el consentimiento.
    private func apagarGps() async -> String {
        ShiftGpsTracker.shared.stop()
        _ = try? await AsistenciasRepository.shared.setGpsConsent(false)
        return " · se dejó de compartir tu ubicación"
    }

    /// «Dejar de compartir» del aviso de GPS de jornada.
    func detenerGpsManual() async {
        _ = await apagarGps()
    }
}

// MARK: – Pantalla

struct AttendanceView: View {
    /// Los avisos de comida abren `/erp/asistencias?tab=comidas`.
    var initialTab: String?

    @StateObject private var vm = AttendanceVM(cargaResumenDelDia: false)
    @ObservedObject private var pedida = AsistenciasPestanaPedida.shared
    @State private var photoType: String?
    @State private var photo: CorePhotoItem?
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        VStack(spacing: 0) {
            // Las pestañas primero: son la navegación. El día es un filtro y vive debajo.
            NxUnderlineTabs(
                tabs: vm.tabs.map { NxUnderlineTab(id: $0, title: vm.title(for: $0)) },
                selection: $vm.tab
            )
            .background(NxColors.surface)

            // El día vale para las tres pestañas: vive una sola vez, fuera de la lista.
            AsistenciasSelectorFecha(fecha: vm.dateString, onFecha: { vm.setFecha($0) })
                .padding(.horizontal, 16)
                .padding(.vertical, 8)

            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .nxScreenBackground()
        .onAppear {
            applyInitialTab()
            consumirPestanaPedida()
        }
        .onChange(of: pedida.pendiente) { _, _ in consumirPestanaPedida() }
        .task { await ShiftGpsTracker.shared.resumeIfNeeded() }
        // Equipo: carga y refresco en vivo cada 15 s mientras la pestaña está a la vista.
        // Trayectoria: carga al entrar o al cambiar de día. Comidas se carga sola.
        .task(id: "\(vm.tab.rawValue)|\(vm.dateString)") {
            switch vm.tab {
            case .equipo:
                await vm.refresh(initial: true)
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 15_000_000_000)
                    if Task.isCancelled { break }
                    await vm.refresh(initial: false)
                }
            case .trayectoria:
                await vm.loadTrajectory()
            case .comidas:
                break
            }
        }
        // …y al volver a la app, sin esperar al siguiente tic.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && vm.tab == .equipo {
                Task { await vm.refresh(initial: false) }
            }
        }
        .fullScreenCover(isPresented: Binding(
            get: { photoType != nil },
            set: { if !$0 { photoType = nil } }
        )) {
            GeoPhotoCaptureView(
                title: photoType == "salida" ? "Tu foto de salida" : "Tu foto de entrada",
                confirmLabel: photoType == "salida" ? "Registrar salida" : "Registrar entrada",
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
        .alert(
            "No se pudo checar",
            isPresented: Binding(
                get: { vm.checkInBloqueo != nil },
                set: { if !$0 { vm.clearBloqueo() } }
            ),
            presenting: vm.checkInBloqueo
        ) { _ in
            Button("Entendido", role: .cancel) { vm.clearBloqueo() }
        } message: { mensaje in
            Text(mensaje + "\n\n" + ChecadaRechazo.ayuda(mensaje))
        }
    }

    private func applyInitialTab() {
        guard let initialTab, let tab = AsistenciasTab(rawValue: initialTab) else { return }
        if vm.tabs.contains(tab) { vm.tab = tab }
    }

    private func consumirPestanaPedida() {
        guard let tab = pedida.consumir() else { return }
        if vm.tabs.contains(tab) { vm.tab = tab }
    }

    @ViewBuilder
    private var content: some View {
        switch vm.tab {
        case .equipo:
            ScrollView {
                AsistenciasEquipoTab(
                    vm: vm,
                    onMark: { photoType = $0 },
                    onPhoto: { photo = $0 }
                )
                .padding(16)
            }
            .refreshable { await vm.refresh(initial: false) }
        case .comidas:
            ComidasView(fecha: AttendanceClock.date(fromDay: vm.dateString))
        case .trayectoria:
            ScrollView {
                AsistenciasTrayectoriaSection(vm: vm)
                    .padding(16)
            }
        }
    }
}

// MARK: – Selector de día

/// El día que se está viendo (Android `SelectorFecha`): botón de contorno con
/// calendario («Hoy, jueves 17 de septiembre»), «Ir a hoy» si es otro día y un
/// calendario sin días futuros (no hay asistencia del futuro, como en la web).
struct AsistenciasSelectorFecha: View {
    let fecha: String
    let onFecha: (String) -> Void

    @State private var abierto = false
    @State private var elegido = Date()

    private var hoy: String { AttendanceClock.today() }
    private var esHoy: Bool { fecha == hoy }

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Button {
                elegido = AttendanceClock.date(fromDay: fecha) ?? Date()
                abierto = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: AsisIcono.calendario)
                        .font(.system(size: 14, weight: .regular))
                        .frame(width: 17, height: 17)
                        .accessibilityHidden(true)
                    Text(AttendanceClock.etiquetaDia(fecha, esHoy: esHoy))
                        .font(.system(size: 13, weight: .medium))
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                .foregroundStyle(NxColors.brand)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .frame(minHeight: 40)
                .overlay(Capsule().strokeBorder(NxColors.borderStrong, lineWidth: 1))
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Día: \(AttendanceClock.etiquetaDia(fecha, esHoy: esHoy))")

            if !esHoy {
                Button {
                    onFecha(hoy)
                } label: {
                    Text("Ir a hoy")
                        .font(.system(size: 13))
                        .foregroundStyle(NxColors.brand)
                        .padding(.horizontal, 8)
                        .frame(minHeight: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .sheet(isPresented: $abierto) {
            calendario
                .presentationDetents([.height(520)])
                .presentationDragIndicator(.visible)
        }
    }

    /// Calendario en la zona de la empresa, con «Cancelar» y «Aceptar» (`DatePickerDialog`).
    private var calendario: some View {
        VStack(spacing: 12) {
            DatePicker(
                "Día",
                selection: $elegido,
                in: ...Date(),
                displayedComponents: .date
            )
            .datePickerStyle(.graphical)
            .labelsHidden()
            .tint(NxColors.brand)
            .environment(\.timeZone, AttendanceClock.zone)
            .environment(\.calendar, AttendanceClock.calendar)
            .environment(\.locale, Locale(identifier: "es_MX"))

            HStack(spacing: 8) {
                Spacer()
                Button("Cancelar") { abierto = false }
                    .buttonStyle(NxPillButtonStyle(fill: .clear, foreground: NxColors.brand))
                Button("Aceptar") {
                    onFecha(AttendanceClock.dayString(elegido))
                    abierto = false
                }
                .buttonStyle(NxPillButtonStyle(fill: .clear, foreground: NxColors.brand))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 20)
        .padding(.bottom, 12)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(NxColors.card)
    }
}
