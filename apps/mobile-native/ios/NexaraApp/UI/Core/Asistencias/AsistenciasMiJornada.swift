import SwiftUI

/// Mi jornada, en una tarjeta que cabe en un pulgar (Android `MiJornadaCard`): el
/// estado con su punto y el cronómetro comparten renglón, el botón de checar es lo
/// único grande, y debajo van las checadas del día con sus avisos.
struct MiJornadaCard: View {
    @ObservedObject var vm: AttendanceVM
    /// `entrada` / `salida`: abre la cámara.
    let onMark: (String) -> Void

    private var abierta: Bool { vm.isOpen }
    private var hayEntrada: Bool { vm.hasEntryToday }
    private var haySalida: Bool { vm.hasExitToday }
    private var esHoy: Bool { vm.isToday }

    /// El API contesta 400 a la segunda entrada del día: aquí se apaga antes.
    private var siguiente: String? {
        if vm.canMarkEntry { return "entrada" }
        if vm.canMarkExit { return "salida" }
        return nil
    }

    private var estadoTexto: String {
        if abierta { return "Jornada en curso" }
        if haySalida && hayEntrada { return "Jornada completada" }
        if vm.miFalta != nil { return FaltasJustificadas.etiqueta }
        return "Sin entrada registrada"
    }

    private var estadoColor: Color? {
        if abierta { return NxColors.verde }
        if haySalida && hayEntrada { return NxColors.azul }
        if vm.miFalta != nil { return NxColors.morado }
        return nil
    }

    private var subtitulo: String {
        if abierta, let inicio = vm.inicioIso { return "Desde las \(AttendanceClock.time(inicio))" }
        if !esHoy { return "Solo se puede checar en el día de hoy." }
        return "Se toma una foto y tu ubicación."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    NxStatusDot(text: estadoTexto, color: estadoColor, fontSize: 15, fontWeight: .bold)
                    Text(subtitulo)
                        .font(.system(size: 12))
                        .foregroundStyle(NxColors.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if abierta, let inicio = vm.inicioIso {
                    // Cifras de ancho fijo: el reloj no baila mientras corre.
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        Text(AttendanceClock.hms(AttendanceClock.elapsed(from: inicio, to: nil, now: context.date)))
                            .font(.system(size: 22, weight: .bold, design: .monospaced))
                            .foregroundStyle(AttendanceEstado.presente.color)
                            .lineLimit(1)
                    }
                }
            }

            if let falta = vm.miFalta {
                FaltaJustificadaNota(justificacion: falta)
            }

            boton

            if let notice = vm.checkInNotice, !notice.isEmpty {
                AsisIconText(
                    text: notice,
                    systemImage: vm.checkInNoticeIsError ? AsisIcono.error : AsisIcono.aprobado,
                    fontSize: 12,
                    color: vm.checkInNoticeIsError ? NxColors.danger : AttendanceEstado.presente.color,
                    iconSize: 15
                )
            }

            if !vm.myPunches.isEmpty {
                NxRowDivider()
                ForEach(vm.myPunches.sorted { $0.timestamp < $1.timestamp }) { punch in
                    checada(punch)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(abierta ? AttendanceEstado.presente.color.opacity(0.45) : NxColors.border, lineWidth: 1)
        )
    }

    /// El único botón primario de la pantalla: lo que la persona vino a hacer.
    @ViewBuilder
    private var boton: some View {
        if siguiente != nil || vm.checkInLoading {
            Button {
                if let siguiente { onMark(siguiente) }
            } label: {
                HStack(spacing: 8) {
                    if vm.checkInLoading {
                        ProgressView()
                            .controlSize(.small)
                            .tint(.white)
                            .frame(width: 18, height: 18)
                        Text("Registrando…")
                            .font(.system(size: 14, weight: .bold))
                    } else {
                        Image(systemName: siguiente == "salida" ? AsisIcono.salida : AsisIcono.entrada)
                            .font(.system(size: 16, weight: .regular))
                            .frame(width: 20, height: 20)
                            .accessibilityHidden(true)
                        Text(siguiente == "salida" ? "Registrar salida" : "Registrar entrada")
                            .font(.system(size: 15, weight: .bold))
                    }
                }
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(siguiente != nil && !vm.checkInLoading ? NxColors.brand : NxColors.brand.opacity(0.55))
                )
                .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(NxPressableStyle())
            .disabled(siguiente == nil || vm.checkInLoading)
        } else if esHoy && hayEntrada && !haySalida {
            Text("Ya registraste tu entrada de hoy.")
                .font(.system(size: 12))
                .foregroundStyle(NxColors.muted)
        }
    }

    /// Una checada del día: tipo con icono, hora, avisos y correcciones.
    private func checada(_ punch: AttendancePunch) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                AsisIconText(
                    text: punch.isEntry ? "Entrada" : "Salida",
                    systemImage: punch.isEntry ? AsisIcono.entrada : AsisIcono.salida,
                    fontSize: 12.5,
                    color: NxColors.fg2,
                    iconSize: 15
                )
                Spacer(minLength: 8)
                Text(AttendanceClock.time(punch.timestamp))
                    .font(.system(size: 12.5, design: .monospaced))
                    .foregroundStyle(NxColors.fg)
            }
            let avisos = AttendanceBadges.de(punch)
            if !avisos.isEmpty {
                AvisosChecada(avisos: avisos)
            }
            ForEach(Array(punch.correcciones.enumerated()), id: \.offset) { _, correccion in
                Text(AttendanceBadges.correccionTexto(correccion))
                    .font(.system(size: 11.5))
                    .foregroundStyle(AttendanceBadges.morado)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// Rastreo activo: se dice en pantalla, no solo en el indicador del sistema
/// (Android `GpsJornadaAviso`).
struct GpsJornadaAviso: View {
    let onDetener: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                AsisIconText(
                    text: "Compartiendo ubicación de jornada",
                    systemImage: AsisIcono.gps,
                    fontSize: 13,
                    weight: .semibold,
                    color: NxColors.fg,
                    iconSize: 16
                )
                Text("Se apaga sola al registrar tu salida.")
                    .font(.system(size: 11.5))
                    .foregroundStyle(NxColors.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: onDetener) {
                Text("Dejar de compartir")
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(NxColors.brand)
                    .padding(.horizontal, 8)
                    .frame(minHeight: 40)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.infoSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}
