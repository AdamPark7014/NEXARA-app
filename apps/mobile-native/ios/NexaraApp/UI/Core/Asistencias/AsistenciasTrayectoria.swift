import SwiftUI
import MapKit

/// «Trayectoria»: GPS en vivo del equipo (`gps/team`) y mi recorrido del día
/// (`gps/trajectory?date=`). Solo para `gps.manage`, igual que la web.
struct AsistenciasTrayectoriaSection: View {
    @ObservedObject var vm: AttendanceVM

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let error = vm.trajectoryError {
                NxAlertBanner(
                    alert: NxAlert(id: "att-gps", title: "No se pudo cargar la trayectoria", subtitle: error, tone: .danger),
                    actionLabel: "Reintentar",
                    onAction: { Task { await vm.loadTrajectory() } }
                )
            }

            Text("GPS del equipo").font(.headline)
            Text("Unidades con jornada abierta que están compartiendo ubicación.")
                .font(.caption).foregroundStyle(.secondary)

            if vm.trajectoryLoading && vm.teamGps.isEmpty {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 16)
            } else if vm.teamGps.isEmpty {
                NxEmptyState(title: "Sin ubicaciones", subtitle: "Nadie comparte GPS en este momento.")
            } else {
                ForEach(vm.teamGps) { item in
                    GpsTeamCard(item: item)
                }
            }

            Divider().padding(.vertical, 4)

            Text("Mi trayecto · \(vm.trajectory.count) punto\(vm.trajectory.count == 1 ? "" : "s")")
                .font(.headline)
            Text("Entrada, recorrido y salida del día seleccionado.")
                .font(.caption).foregroundStyle(.secondary)

            let puntos = vm.routePoints
            if puntos.isEmpty {
                NxEmptyState(
                    title: "Sin trayecto",
                    subtitle: "Ese día no se guardaron puntos: la checada no traía GPS o la ubicación estaba apagada."
                )
            } else {
                TrajectoryMap(points: puntos)
                if let url = AttendanceClock.routeUrl(puntos) {
                    Link("Ver el recorrido trazado en Maps", destination: url)
                        .font(.caption.weight(.semibold))
                }
                trajectoryList
            }
        }
    }

    @ViewBuilder
    private var trajectoryList: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(Array(vm.trajectory.enumerated()), id: \.element.id) { index, point in
                if let lat = point.latitude, let lng = point.longitude {
                    HStack(spacing: 8) {
                        Text(AttendanceClock.time(point.updatedAt))
                            .font(.caption2.monospaced())
                            .frame(width: 64, alignment: .leading)
                        Text(String(format: "%.5f, %.5f", lat, lng))
                            .font(.caption2.monospaced())
                            .foregroundStyle(.secondary)
                        Spacer()
                        if index == 0 {
                            Text("INICIO").font(.caption2.weight(.bold)).foregroundStyle(CorePalette.green)
                        } else if index == vm.trajectory.count - 1 {
                            Text("FIN").font(.caption2.weight(.bold)).foregroundStyle(CorePalette.blue)
                        }
                    }
                    .padding(.vertical, 4)
                    .padding(.horizontal, 8)
                    .background(Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 6))
                }
            }
        }
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
                    .stroke(CorePalette.blue, lineWidth: 4)
            }
            if let first = coords.first {
                Marker("Inicio", coordinate: first).tint(CorePalette.green)
            }
            if coords.count > 1, let last = coords.last {
                Marker("Fin", coordinate: last).tint(CorePalette.red)
            }
        }
        .frame(height: 240)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        // `initialPosition` solo encuadra al construirse: si cambia el día, el
        // mapa se rehace para que el encuadre siga al recorrido nuevo.
        .id(coords.count)
    }
}

private struct GpsTeamCard: View {
    let item: GpsTeamLocation

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(item.nombre.isEmpty ? "—" : item.nombre).font(.subheadline.weight(.bold))
                Spacer()
                CoreChip(
                    text: item.isActive ? "En vivo" : "Detenido",
                    color: item.isActive ? CorePalette.green : CorePalette.slate
                )
            }
            if !item.detalle.isEmpty {
                Text(item.detalle).font(.caption2).foregroundStyle(.secondary)
            }
            HStack(spacing: 10) {
                if let lat = item.latitude, let lng = item.longitude {
                    Text(String(format: "%.5f, %.5f", lat, lng))
                        .font(.caption.monospaced())
                } else {
                    Text("Sin coordenadas").font(.caption).foregroundStyle(.secondary)
                }
                if let url = AttendanceClock.mapUrl(lat: item.latitude, lng: item.longitude) {
                    Link("Ver en mapa", destination: url).font(.caption.weight(.semibold))
                }
            }
            if !item.updatedAt.isEmpty {
                Text("Actualizado \(AttendanceClock.time(item.updatedAt))")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
        .coreCard(highlight: item.isActive ? CorePalette.blue : nil)
    }
}
