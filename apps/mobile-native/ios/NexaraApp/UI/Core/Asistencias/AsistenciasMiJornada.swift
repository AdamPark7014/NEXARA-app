import SwiftUI
import UIKit

/// Mi jornada: entrada y salida con foto + GPS, cronómetro y las checadas de hoy.
/// Espejo de `apps/web/components/AttendanceForm.tsx` (modo compacto).
struct MiJornadaCard: View {
    @ObservedObject var vm: AttendanceVM
    @ObservedObject private var tracker = ShiftGpsTracker.shared
    let onMark: (String) -> Void
    let onPhoto: (CorePhotoItem) -> Void

    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if let notice = vm.checkInNotice {
                Text(notice)
                    .font(.footnote)
                    .foregroundStyle(notice.hasPrefix("Error") ? CorePalette.red : CorePalette.green)
            }
            if let error = vm.mineError {
                Text(error).font(.footnote).foregroundStyle(CorePalette.red)
            }
            buttons
            hints
            gpsCard
            history
        }
        .coreCard()
    }

    // MARK: Cabecera y cronómetro

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Mi jornada").font(.headline)
                Text("Entrada o salida · foto + GPS")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 4) {
                CoreChip(text: vm.statusLabel, color: vm.isOpen ? CorePalette.green : nil)
                timer
            }
        }
    }

    /// Cronómetro desde la entrada: segundo a segundo, como la web.
    @ViewBuilder
    private var timer: some View {
        if vm.isOpen || vm.totalSecondsToday > 0 {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let live = AttendanceClock.elapsed(from: vm.lastEntryAt, to: nil, now: context.date)
                Text(AttendanceClock.hms(vm.totalSecondsToday + (vm.isOpen ? live : 0)))
                    .font(.system(.title3, design: .monospaced).weight(.bold))
                    .foregroundStyle(vm.isOpen ? CorePalette.green : Color.primary)
            }
        }
    }

    private var buttons: some View {
        HStack(spacing: 12) {
            Button { onMark("entrada") } label: {
                Label("Entrada", systemImage: "arrow.right.circle.fill").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(CorePalette.green)
            .disabled(vm.checkInLoading || !vm.canMarkEntry)

            Button { onMark("salida") } label: {
                Label("Salida", systemImage: "arrow.left.circle.fill").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(CorePalette.blue)
            .disabled(vm.checkInLoading || !vm.canMarkExit)
        }
    }

    @ViewBuilder
    private var hints: some View {
        if vm.checkInLoading {
            ProgressView().frame(maxWidth: .infinity)
        } else if vm.canMarkEntry {
            Text("Toca Entrada → foto → se guarda con tu GPS.")
                .font(.caption).foregroundStyle(.secondary)
        } else if vm.canMarkExit {
            Text(vm.openedOnAnotherDay
                 ? "Jornada abierta desde otro día: marca Salida para cerrarla."
                 : "Toca Salida → foto → cierra la jornada y deja de compartir tu ubicación.")
                .font(.caption)
                .foregroundStyle(vm.openedOnAnotherDay ? CorePalette.orange : .secondary)
        } else if vm.hasEntryToday {
            Text("Jornada completada: entrada y salida registradas.")
                .font(.caption).foregroundStyle(CorePalette.green)
        }
    }

    // MARK: GPS de jornada

    /// El permiso se explica **antes** de pedirlo: seguir a alguien en segundo
    /// plano sin decirle para qué es lo que hace que lo niegue (y con razón).
    @ViewBuilder
    private var gpsCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("📡 GPS de jornada").font(.subheadline.weight(.semibold))
            Text("Mientras tu jornada esté abierta, la app manda tu ubicación a tu encargado cada ~100 m, aunque la tengas cerrada. Al marcar Salida se detiene.")
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                CoreChip(
                    text: tracker.isTracking ? "Enviando" : "Detenido",
                    color: tracker.isTracking ? CorePalette.green : CorePalette.slate
                )
                CoreChip(
                    text: tracker.authorizationLabel,
                    color: tracker.isAlways ? CorePalette.green : CorePalette.orange
                )
                if let at = tracker.lastSentAt {
                    Text("Último punto \(AttendanceClock.time(CoreFormat.isoString(at)))")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            if tracker.isDenied {
                Button("Abrir Ajustes de ubicación") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                }
                .font(.caption.weight(.semibold))
            } else if !tracker.isAlways {
                Button("Permitir ubicación «Siempre»") {
                    tracker.requestAlwaysAuthorization()
                }
                .font(.caption.weight(.semibold))
            }
            if let error = tracker.lastError, tracker.isTracking {
                Text(error).font(.caption2).foregroundStyle(CorePalette.orange)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: Checadas de hoy

    @ViewBuilder
    private var history: some View {
        if !vm.myPunches.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text("Hoy").font(.caption.weight(.bold)).foregroundStyle(.secondary)
                ForEach(vm.myPunches) { punch in
                    HStack(spacing: 10) {
                        Text(punch.isEntry ? "📍 Entrada" : "🏁 Salida")
                            .font(.caption.weight(.semibold))
                        Text(AttendanceClock.time(punch.timestamp))
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                        Spacer()
                        if !punch.photoUrl.isEmpty {
                            Button {
                                onPhoto(CorePhotoItem(
                                    title: punch.isEntry ? "Tu foto de entrada" : "Tu foto de salida",
                                    url: punch.photoUrl,
                                    latitude: punch.coords?.lat,
                                    longitude: punch.coords?.lng,
                                    time: punch.timestamp
                                ))
                            } label: {
                                AuthenticatedImage(url: punch.photoUrl)
                                    .frame(width: 40, height: 40)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                            .buttonStyle(.plain)
                        }
                        if let url = AttendanceClock.mapUrl(lat: punch.coords?.lat, lng: punch.coords?.lng) {
                            Link("Mapa", destination: url).font(.caption2.weight(.semibold))
                        }
                    }
                }
            }
        }
    }
}
