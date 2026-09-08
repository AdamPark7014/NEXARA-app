import SwiftUI

/// GPS de campo — `gps/me`, `gps/team`, `gps/trajectory`, `gps/consent`.
/// Paridad con `ConsoleGpsScreen.kt` de Android.
///
/// Antes esta pantalla listaba `GET gps` (todos los puntos que el usuario podía
/// ver) y no sabía nada de consentimiento. Eso es justo lo que el dueño llama
/// "un clic": aparecías en el mapa sin haber aceptado nada. Ahora:
///
///  - el consentimiento se lee y se escribe de verdad (`gps/consent`);
///  - si no hay permiso de ubicación **se dice** y el botón de enviar no manda
///    nada — no existe camino que produzca un `0,0`;
///  - el trayecto del día se pide por fecha y usuario, como en la web.
struct GpsMapView: View {
    @StateObject private var vm = GpsMapVM()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if vm.isLoading && vm.myLocation == nil && vm.team.isEmpty {
                    ProgressView("Cargando GPS…")
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                } else {
                    if let err = vm.loadError {
                        Text(err)
                            .font(.caption).foregroundColor(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(10)
                            .background(Color.red.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .padding(.horizontal)
                    }

                    consentCard
                    sendCard
                    mapBlock
                    trajectoryBlock
                    teamBlock
                }
                Spacer(minLength: 24)
            }
            .padding(.vertical)
        }
        .navigationTitle(vm.isTeamViewer ? "GPS · equipo" : "GPS")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { Task { await vm.load() } } label: { Image(systemName: "arrow.clockwise") }
            }
        }
        .refreshable { await vm.load() }
        .task { await vm.load() }
    }

    // MARK: – Consentimiento

    private var consentCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle(isOn: Binding(
                get: { vm.consent == true },
                set: { newValue in Task { await vm.setConsent(newValue) } }
            )) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Compartir mi ubicación").font(.subheadline.bold())
                    Text(vm.consentLabel)
                        .font(.caption)
                        .foregroundColor(vm.consent == true ? .green : .secondary)
                }
            }
            .disabled(vm.consentToggling)

            // El consentimiento es del usuario, no del dispositivo: se dice qué
            // implica antes de que lo active, no después.
            Text("Mientras esté activo, tus envíos de posición quedan en el historial de la empresa y tu equipo puede verte en el mapa.")
                .font(.caption2).foregroundColor(.secondary)
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }

    // MARK: – Envío manual

    @ViewBuilder
    private var sendCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !vm.hasLocationPermission {
                // Ni se ofrece el botón: sin permiso no hay coordenada, y una
                // coordenada inventada es peor que no mandar nada.
                LocationPermissionBanner(
                    message: "Sin permiso de ubicación no se puede enviar tu GPS. Nada se manda a medias.",
                    requestOnAppear: false
                )
                Button("Volver a comprobar el permiso") { vm.refreshPermission() }
                    .buttonStyle(.bordered)
                    .font(.caption)
            } else if vm.consent != true {
                Text("Activa el interruptor de arriba para poder enviar tu ubicación.")
                    .font(.caption).foregroundColor(.secondary)
            } else {
                Button {
                    Task { await vm.sendMyLocation() }
                } label: {
                    Label(vm.posting ? "Enviando…" : "Enviar mi ubicación ahora",
                          systemImage: "paperplane.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.teal)
                .disabled(vm.posting)
            }

            if let msg = vm.sendMessage {
                Text(msg).font(.caption).foregroundColor(vm.sendFailed ? .orange : .green)
            }
        }
        .padding(.horizontal)
    }

    // MARK: – Mapa

    @ViewBuilder
    private var mapBlock: some View {
        let pins = vm.mapPins
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 0) {
                GpsKpiChip(label: "Mi GPS",
                           value: vm.myLocation?.hasRealCoords == true ? "Ok" : "—",
                           color: vm.myLocation?.hasRealCoords == true ? .green : .secondary)
                Divider().frame(height: 34)
                GpsKpiChip(label: "Equipo", value: "\(vm.team.count)", color: .primary)
                Divider().frame(height: 34)
                GpsKpiChip(label: "Puntos del día", value: "\(vm.trajectory.count)", color: .teal)
            }
            .padding(.vertical, 6)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            if pins.isEmpty {
                Text("Sin coordenadas válidas que mostrar.")
                    .font(.caption).foregroundColor(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
            } else {
                NexaraMapView(pins: pins)
                    .frame(height: 300)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }
        }
        .padding(.horizontal)
    }

    // MARK: – Trayecto

    @ViewBuilder
    private var trajectoryBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Trayecto del día").font(.headline)

            DatePicker("Fecha", selection: Binding(
                get: { vm.trajectoryDate },
                set: { newValue in Task { await vm.setTrajectoryDate(newValue) } }
            ), displayedComponents: .date)
                .font(.subheadline)

            if vm.isTeamViewer && !vm.userOptions.isEmpty {
                Picker("Usuario", selection: Binding(
                    get: { vm.selectedUserId },
                    set: { newValue in Task { await vm.setTrajectoryUser(newValue) } }
                )) {
                    Text("Mi trayecto").tag(Int64(0))
                    ForEach(vm.userOptions) { u in
                        Text(u.name).tag(u.id)
                    }
                }
                .pickerStyle(.menu)
            }

            if vm.loadingTrajectory {
                HStack { ProgressView(); Text("Cargando trayecto…").font(.caption).foregroundColor(.secondary) }
            } else if vm.trajectory.isEmpty {
                Text("Sin puntos registrados ese día.")
                    .font(.caption).foregroundColor(.secondary)
            } else {
                // Se enseña la lista de puntos y no una polilínea porque
                // `NexaraMapView` (compartido con otros módulos) solo acepta
                // pines; el trayecto se ve como primer y último punto en el mapa
                // y en detalle aquí abajo.
                ForEach(vm.trajectory.prefix(50)) { pt in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(pt.timeLabel).font(.caption.weight(.medium))
                            Text(pt.coordsLabel).font(.caption2).foregroundColor(.secondary)
                        }
                        Spacer()
                        if let url = ActivityParse.mapsUrl(lat: pt.latitude, lng: pt.longitude), pt.hasRealCoords {
                            Link("Mapa", destination: url).font(.caption2)
                        }
                    }
                    .padding(10)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                if vm.trajectory.count > 50 {
                    Text("Mostrando 50 de \(vm.trajectory.count) puntos.")
                        .font(.caption2).foregroundColor(.secondary)
                }
            }
        }
        .padding(.horizontal)
    }

    // MARK: – Equipo

    @ViewBuilder
    private var teamBlock: some View {
        if vm.isTeamViewer {
            VStack(alignment: .leading, spacing: 8) {
                Text("Equipo en campo (\(vm.team.count))").font(.headline)
                if vm.teamDenied {
                    Text("No tienes permiso `gps.manage`, así que no se listan las ubicaciones del equipo.")
                        .font(.caption).foregroundColor(.secondary)
                } else if vm.team.isEmpty {
                    Text("Nadie del equipo ha reportado ubicación.")
                        .font(.caption).foregroundColor(.secondary)
                } else {
                    ForEach(vm.team) { GpsLocationRow(point: $0) }
                }
            }
            .padding(.horizontal)
        }
    }
}

// MARK: – ViewModel

@MainActor
final class GpsMapVM: ObservableObject {
    @Published var consent: Bool?
    @Published var myLocation: GpsPoint?
    @Published var team: [GpsPoint] = []
    @Published var trajectory: [GpsPoint] = []
    @Published var userOptions: [OpsAssignableUser] = []
    @Published var selectedUserId: Int64 = 0
    @Published var trajectoryDate = Date()

    @Published var isLoading = true
    @Published var loadingTrajectory = false
    @Published var consentToggling = false
    @Published var posting = false
    @Published var loadError: String?
    @Published var sendMessage: String?
    @Published var sendFailed = false
    @Published var teamDenied = false
    @Published var hasLocationPermission = DeviceLocation.shared.hasPermission

    private let repo = FieldOpsGpsRepository.shared

    /// Ver al equipo exige `gps.manage`; el resto solo se ve a sí mismo.
    var isTeamViewer: Bool {
        guard let u = SessionStore.shared.currentUser else { return false }
        return u.isSuperAdmin
            || u.permissions.contains("gps.manage")
            || u.permissions.contains("console.admin")
    }

    /// `nil` no es "no": es "el servidor no lo dijo". Se distingue en el texto
    /// para no acusar al usuario de haber rechazado algo que nunca contestó.
    var consentLabel: String {
        switch consent {
        case .some(true): return "Activo · el equipo puede verte"
        case .some(false): return "Inactivo · no se envía tu posición"
        case .none: return "Sin respuesta del servidor"
        }
    }

    /// Pines del mapa: el trayecto manda cuando hay uno cargado (primer y último
    /// punto); si no, las posiciones vivas. Solo entran coordenadas reales.
    var mapPins: [MapPin] {
        let live = ([myLocation].compactMap { $0 } + team)
            .filter(\.hasRealCoords)
            .map { p in
                MapPin(id: "live-\(p.usuarioId)-\(p.id)",
                       latitude: p.latitude ?? 0,
                       longitude: p.longitude ?? 0,
                       title: p.displayName,
                       subtitle: p.timeLabel)
            }
        let path = trajectory.filter(\.hasRealCoords)
        guard let first = path.first else { return live }
        var pins = [MapPin(id: "traj-inicio-\(first.id)",
                           latitude: first.latitude ?? 0,
                           longitude: first.longitude ?? 0,
                           title: "Inicio",
                           subtitle: first.timeLabel)]
        if let last = path.last, last.id != first.id {
            pins.append(MapPin(id: "traj-fin-\(last.id)",
                               latitude: last.latitude ?? 0,
                               longitude: last.longitude ?? 0,
                               title: "Fin",
                               subtitle: last.timeLabel))
        }
        return pins
    }

    private var dateString: String { FieldOpsGpsRepository.dayString(trajectoryDate) }

    func refreshPermission() {
        hasLocationPermission = DeviceLocation.shared.hasPermission
    }

    func load() async {
        isLoading = true
        loadError = nil
        refreshPermission()
        defer { isLoading = false }

        do {
            let me = try await repo.me()
            consent = me.consent
            myLocation = me.location
        } catch {
            loadError = error.toUserMessage(fallback: "No se pudo leer tu estado de GPS")
        }

        if isTeamViewer {
            do {
                team = try await repo.team()
                teamDenied = false
                // Las opciones del selector salen del propio equipo: son los
                // usuarios que de verdad tienen puntos, no el directorio entero.
                userOptions = team
                    .map { OpsAssignableUser(id: $0.usuarioId, name: $0.displayName) }
                    .reduce(into: [OpsAssignableUser]()) { acc, u in
                        if !acc.contains(where: { $0.id == u.id }) { acc.append(u) }
                    }
                    .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            } catch {
                team = []
                teamDenied = true
            }
        }

        await loadTrajectory()
    }

    func loadTrajectory() async {
        loadingTrajectory = true
        defer { loadingTrajectory = false }
        trajectory = (try? await repo.trajectory(
            date: dateString,
            userId: selectedUserId > 0 ? selectedUserId : nil
        )) ?? []
    }

    func setTrajectoryDate(_ date: Date) async {
        trajectoryDate = date
        await loadTrajectory()
    }

    func setTrajectoryUser(_ userId: Int64) async {
        selectedUserId = userId
        await loadTrajectory()
    }

    func setConsent(_ enabled: Bool) async {
        consentToggling = true
        loadError = nil
        defer { consentToggling = false }
        do {
            let confirmed = try await repo.setConsent(enabled)
            // Se toma lo que confirmó el servidor. Si no confirmó nada, el
            // interruptor no se queda en verde por su cuenta.
            consent = confirmed ?? enabled
            if !enabled { sendMessage = nil }
        } catch {
            loadError = error.toUserMessage(fallback: "No se pudo actualizar el consentimiento")
        }
    }

    func sendMyLocation() async {
        posting = true
        sendMessage = nil
        sendFailed = false
        defer { posting = false }
        do {
            let coords = try await repo.postCurrentLocation(consentGranted: consent)
            sendMessage = "Ubicación enviada\(coords.messageSuffix)"
            // Se relee `gps/me` para enseñar lo que el servidor guardó, no lo
            // que creemos haber mandado.
            if let me = try? await repo.me() {
                consent = me.consent
                myLocation = me.location
            }
        } catch {
            sendFailed = true
            sendMessage = error.toUserMessage(fallback: "No se pudo enviar tu ubicación")
            refreshPermission()
        }
    }
}

// MARK: – Subvistas

private struct GpsKpiChip: View {
    let label: String
    let value: String
    let color: Color

    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).bold().foregroundColor(color)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
    }
}

private struct GpsLocationRow: View {
    let point: GpsPoint

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: point.hasRealCoords ? "mappin.circle.fill" : "mappin.slash.circle")
                .font(.title2)
                .foregroundColor(point.hasRealCoords ? .teal : .secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(point.displayName).font(.subheadline).bold()
                Text(point.coordsLabel).font(.caption).foregroundColor(.secondary)
                if !point.activityTitle.isEmpty {
                    Text(point.activityTitle).font(.caption2).foregroundColor(.secondary).lineLimit(1)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text(point.timeLabel).font(.caption2).foregroundColor(.secondary)
                if let url = ActivityParse.mapsUrl(lat: point.latitude, lng: point.longitude),
                   point.hasRealCoords {
                    Link("Mapa", destination: url).font(.caption2)
                }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
