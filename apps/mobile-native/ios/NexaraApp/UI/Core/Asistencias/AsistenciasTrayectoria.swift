import SwiftUI
import MapKit

/// «Trayectoria» (Android `TrayectoriaTab`): «GPS del equipo» —quién comparte su
/// ubicación ahora, con coordenadas y «Ver en mapa»— y «Mi trayecto · N puntos» con
/// «Ver recorrido en Maps». Solo dirección (el API contesta 403 a los demás).
struct AsistenciasTrayectoriaSection: View {
    @ObservedObject var vm: AttendanceVM
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if vm.trajectoryLoading && vm.teamGps.isEmpty && vm.trajectory.isEmpty {
                NxSkeletonList(itemCount: 4, itemHeight: 56)
            } else {
                if let error = vm.trajectoryError {
                    NxErrorBlock(message: error) { Task { await vm.loadTrajectory() } }
                }

                NxDenseSectionHeader(title: "GPS del equipo", hint: "Unidades con jornada abierta.")
                if vm.teamGps.isEmpty {
                    NxEmptyState(title: "Sin ubicaciones", subtitle: "Nadie comparte GPS ahora.")
                } else {
                    equipo
                }

                NxDenseSectionHeader(
                    title: "Mi trayecto · \(vm.trajectory.count) puntos",
                    hint: "Entrada, GPS y salida del día que estás viendo."
                )
                .padding(.top, 6)
                if vm.trajectory.isEmpty {
                    NxEmptyState(title: "Sin puntos", subtitle: "No hay recorrido registrado para este día.")
                } else {
                    let puntos = vm.routePoints
                    if puntos.count > 1 {
                        // El recorrido dibujado, como la vista previa de la web.
                        TrajectoryMap(points: puntos)
                    }
                    if let url = AttendanceClock.routeUrl(vm.trajectoryRoute) {
                        Button {
                            openURL(url)
                        } label: {
                            Text("Ver recorrido en Maps")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(NxColors.brand)
                                .padding(.horizontal, 16)
                                .frame(minHeight: 40)
                                .overlay(Capsule().strokeBorder(NxColors.borderStrong, lineWidth: 1))
                                .contentShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            Spacer(minLength: 24)
        }
    }

    /// Una superficie con filas separadas por una línea: nombre, coordenadas y «Ver en mapa».
    private var equipo: some View {
        VStack(spacing: 0) {
            ForEach(Array(vm.teamGps.enumerated()), id: \.offset) { index, punto in
                if index > 0 { NxRowDivider() }
                GpsEquipoRow(punto: punto) { url in openURL(url) }
            }
        }
        .background(NxColors.card)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(NxColors.border, lineWidth: 1)
        )
    }
}

private struct GpsEquipoRow: View {
    let punto: GpsTeamLocation
    let onAbrir: (URL) -> Void

    private var url: URL? { AttendanceClock.mapUrl(lat: punto.latitude, lng: punto.longitude) }

    var body: some View {
        let fila = HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(punto.nombre.isEmpty ? "Usuario #\(punto.usuarioId)" : punto.nombre)
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(1)
                Text(coordenadas)
                    .font(.system(size: 11.5, design: .monospaced))
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if url != nil {
                Text("Ver en mapa")
                    .font(.system(size: 12.5))
                    .foregroundStyle(NxColors.brand)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .contentShape(Rectangle())

        if let url {
            Button { onAbrir(url) } label: { fila }
                .buttonStyle(.plain)
        } else {
            fila
        }
    }

    private var coordenadas: String {
        guard let lat = punto.latitude, let lng = punto.longitude else { return "Sin coordenadas" }
        return String(format: "%.5f, %.5f", lat, lng)
    }
}

/// Mapa del recorrido: línea del día con inicio y fin marcados.
private struct TrajectoryMap: View {
    let points: [(lat: Double, lng: Double)]

    var body: some View {
        let coords = points.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) }
        Map(initialPosition: .automatic) {
            if coords.count > 1 {
                MapPolyline(coordinates: coords)
                    .stroke(NxColors.azul, lineWidth: 4)
            }
            if let first = coords.first {
                Marker("Inicio", coordinate: first).tint(NxColors.verde)
            }
            if coords.count > 1, let last = coords.last {
                Marker("Fin", coordinate: last).tint(NxColors.rojo)
            }
        }
        .frame(height: 220)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(NxColors.border, lineWidth: 1)
        )
        // `initialPosition` solo encuadra al construirse: si cambia el día, el
        // mapa se rehace para que el encuadre siga al recorrido nuevo.
        .id(coords.count)
    }
}
