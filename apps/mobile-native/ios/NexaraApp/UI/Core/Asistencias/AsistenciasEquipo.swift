import SwiftUI

/// Persona a la que Christian le está justificando la falta.
private struct AttendanceJustifyTarget: Identifiable {
    let userId: Int
    let nombre: String

    var id: Int { userId }
}

/// Pestaña «Equipo del día» / «Mi jornada» (Android `EquipoTab`): mi jornada si
/// checo, y si administro gente la tira de cifras, una sola barra de filtros y la
/// lista densa del equipo —una fila por persona, separadas por una línea— cuyo
/// detalle se abre al tocarla.
struct AsistenciasEquipoTab: View {
    @ObservedObject var vm: AttendanceVM
    @ObservedObject private var tracker = ShiftGpsTracker.shared
    let onMark: (String) -> Void
    let onPhoto: (CorePhotoItem) -> Void

    /// Fila abierta: el detalle se ve a petición, para que la lista siga siendo lista.
    @State private var expandida: Int?
    @State private var justificando: AttendanceJustifyTarget?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if vm.canRegisterSelf {
                LocationPermissionBanner(
                    message: "La asistencia registra tu GPS al marcar entrada o salida.",
                    requestOnAppear: true
                )
                MiJornadaCard(vm: vm, onMark: onMark)
                if tracker.isTracking {
                    GpsJornadaAviso(onDetener: { Task { await vm.detenerGpsManual() } })
                }
            }

            if vm.canManageTeam {
                equipo
            } else if !vm.canRegisterSelf {
                NxEmptyState(
                    title: "Vista de equipo",
                    subtitle: "Disponible para dirección, RRHH y coordinadores."
                )
            }

            Spacer(minLength: 24)
        }
        .sheet(item: $justificando) { target in
            JustificarFaltaSheet(
                nombre: target.nombre,
                dia: AttendanceClock.etiquetaDia(vm.dateString, esHoy: vm.isToday)
            ) { motivo in
                await vm.justifyAbsence(userId: target.userId, motivo: motivo)
            }
        }
    }

    // MARK: Equipo

    /// Carga, error, vacío y contenido: cuatro caminos que no se cruzan.
    @ViewBuilder
    private var equipo: some View {
        let rows = vm.rows
        if !rows.isEmpty {
            contenido(rows)
        } else if vm.teamLoading {
            NxSkeletonList(itemCount: 5, itemHeight: 64)
        } else if let error = vm.teamError, !error.isEmpty {
            NxErrorBlock(message: error) { Task { await vm.loadTeam(initial: true) } }
        } else {
            NxEmptyState(
                title: "Sin registros",
                subtitle: "Nadie en tu alcance para \(Self.minuscula(AttendanceClock.etiquetaDia(vm.dateString, esHoy: vm.isToday))).",
                actionLabel: "Actualizar",
                onAction: { Task { await vm.loadTeam(initial: true) } }
            )
        }
    }

    @ViewBuilder
    private func contenido(_ rows: [AttendanceDayRow]) -> some View {
        let visibles = vm.filter.map { f in rows.filter { $0.estado == f } } ?? rows
        // La tira solo aparece cuando hay gente que contar; cada celda filtra.
        NxMetricStrip(
            items: AttendanceUx.metricas(rows),
            seleccion: AttendanceUx.metricaDeEstado(vm.filter),
            onSelect: { clave in
                let estado = AttendanceUx.estadoDeMetrica(clave)
                vm.filter = (estado == nil || vm.filter == estado) ? nil : estado
            }
        )
        // Una sola fila de filtros, sin caja y sin fondo.
        NxFilterBar(horizontalPadding: 0) {
            ForEach(AttendanceUx.filtros(rows)) { f in
                NxFilterPill(
                    label: f.etiqueta,
                    count: f.conteo,
                    selected: vm.filter == f.estado,
                    color: f.color,
                    onClick: { vm.filter = vm.filter == f.estado ? nil : f.estado }
                )
            }
        }
        NxDenseSectionHeader(
            title: AttendanceUx.tituloLista(vm.filter, visibles: visibles.count),
            hint: "Toca una fila para ver fotos, mapa y avisos."
        )
        if visibles.isEmpty {
            NxEmptyState(
                title: "Nadie en este filtro",
                subtitle: "Nadie de tu equipo está en «\(vm.filter?.label ?? "")».",
                actionLabel: "Ver a todos",
                onAction: { vm.filter = nil }
            )
        } else {
            // Una superficie con filas separadas por una línea, no una tarjeta por persona.
            VStack(spacing: 0) {
                ForEach(Array(visibles.enumerated()), id: \.element.id) { index, row in
                    if index > 0 { NxRowDivider() }
                    PersonaRow(
                        row: row,
                        expandida: expandida == row.id,
                        onToggle: {
                            withAnimation(.easeOut(duration: 0.15)) {
                                expandida = expandida == row.id ? nil : row.id
                            }
                        },
                        onPhoto: onPhoto,
                        onJustificar: justificar(row)
                    )
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

    /// «Justificar falta»: solo Christian, en un día sin entrada que no sea futuro.
    private func justificar(_ row: AttendanceDayRow) -> (() -> Void)? {
        let ofrece = FaltasJustificadas.ofrecerJustificar(
            puede: vm.canJustifyAbsence,
            hayEntrada: row.checkIn != nil,
            yaJustificada: row.justification != nil,
            fecha: vm.dateString,
            hoy: AttendanceClock.today()
        ) && row.estado == .ausente
        guard ofrece else { return nil }
        return { justificando = AttendanceJustifyTarget(userId: row.member.userId, nombre: row.member.displayName) }
    }

    /// «Hoy, jueves…» → «hoy, jueves…» dentro de una frase.
    static func minuscula(_ texto: String) -> String {
        texto.prefix(1).lowercased() + texto.dropFirst()
    }
}

// MARK: - Fila de una persona

/// Nombre, estado, horas y cronómetro en una fila que se lee de un vistazo. Lo demás
/// —horas exactas, avisos, correcciones, fotos, mapas y «Justificar falta»— se
/// despliega al tocarla (Android `PersonaRow`).
private struct PersonaRow: View {
    let row: AttendanceDayRow
    let expandida: Bool
    let onToggle: () -> Void
    let onPhoto: (CorePhotoItem) -> Void
    let onJustificar: (() -> Void)?

    @Environment(\.openURL) private var openURL

    private var subtitulo: String {
        row.member.roleLine.isEmpty ? "—" : row.member.roleLine
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onToggle) {
                HStack(alignment: .center, spacing: 10) {
                    avatar
                    VStack(alignment: .leading, spacing: 1) {
                        Text(row.member.displayName)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(NxColors.fg)
                            .lineLimit(1)
                        Text("\(row.estado.label) · \(subtitulo)")
                            .font(.system(size: 11.5))
                            .foregroundStyle(NxColors.muted)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(alignment: .trailing, spacing: 1) {
                        Text("\(AttendanceClock.shortTime(row.checkIn)) → \(AttendanceClock.shortTime(row.checkOut))")
                            .font(.system(size: 11.5, design: .monospaced))
                            .foregroundStyle(NxColors.muted)
                            .lineLimit(1)
                        cronometro
                    }
                    Image(systemName: expandida ? "chevron.up" : "chevron.down")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(NxColors.muted)
                        .frame(width: 20, height: 20)
                        .accessibilityLabel(expandida ? "Ocultar detalle" : "Ver detalle")
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if expandida {
                detalle
                    .padding(.horizontal, 12)
                    .padding(.bottom, 12)
            }
        }
    }

    /// Iniciales sobre marca suave con el estado pegado como punto.
    private var avatar: some View {
        ZStack {
            Circle().fill(NxColors.brandSoft)
            Text(NxAvatar.iniciales(row.member.displayName))
                .font(.system(size: 12.5, weight: .bold))
                .foregroundStyle(NxColors.brand)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(width: 38, height: 38)
        .overlay(alignment: .bottomTrailing) {
            Circle()
                .fill(row.estado.color)
                .frame(width: 9, height: 9)
                .padding(2)
                .background(Circle().fill(NxColors.card))
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var cronometro: some View {
        if row.estado == .ausente || row.estado == .justificada {
            textoCronometro("—")
        } else if row.estado == .presente {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                textoCronometro(AttendanceClock.hms(row.elapsed(now: context.date)))
            }
        } else {
            textoCronometro(AttendanceClock.hms(row.elapsed(now: Date())))
        }
    }

    private func textoCronometro(_ texto: String) -> some View {
        Text(texto)
            .font(.system(size: 14, weight: .bold, design: .monospaced))
            .foregroundStyle(row.estado.color)
            .lineLimit(1)
    }

    // MARK: Detalle

    private var detalle: some View {
        VStack(alignment: .leading, spacing: 10) {
            if row.estado == .justificada, let falta = row.justification {
                // Ni «sin checada» ni horas en cero: el día está justificado.
                FaltaJustificadaNota(justificacion: falta)
            } else {
                HStack(alignment: .top, spacing: 24) {
                    horaDetalle("Entrada", row.checkIn)
                    horaDetalle("Salida", row.checkOut)
                }
            }

            if !row.avisos.isEmpty {
                AvisosChecada(avisos: row.avisos)
            }
            ForEach(Array(row.correcciones.enumerated()), id: \.offset) { _, correccion in
                Text(AttendanceBadges.correccionTexto(correccion))
                    .font(.system(size: 12))
                    .foregroundStyle(AttendanceBadges.morado)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if row.fotoEntrada != nil || row.fotoSalida != nil {
                HStack(spacing: 10) {
                    if let url = row.fotoEntrada {
                        foto("Entrada", url: url, systemImage: AsisIcono.entrada, punch: row.entryPunch)
                    }
                    if let url = row.fotoSalida {
                        foto("Salida", url: url, systemImage: AsisIcono.salida, punch: row.exitPunch)
                    }
                }
            }

            acciones
        }
    }

    /// «ENTRADA · 08:15:03».
    private func horaDetalle(_ etiqueta: String, _ iso: String?) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(etiqueta.uppercased())
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(NxColors.muted)
            Text(AttendanceClock.time(iso))
                .font(.system(size: 15, weight: .bold, design: .monospaced))
                .foregroundStyle(NxColors.fg)
        }
    }

    /// Foto de 62 con su etiqueta: una cara sin decir si entra o sale no sirve.
    private func foto(_ etiqueta: String, url: String, systemImage: String, punch: AttendancePunch?) -> some View {
        VStack(alignment: .center, spacing: 3) {
            Button {
                onPhoto(CorePhotoItem(
                    title: "\(CoreFormat.shortName(row.member.displayName)) · \(etiqueta)",
                    url: url,
                    latitude: punch?.coords?.lat,
                    longitude: punch?.coords?.lng,
                    time: punch?.timestamp
                ))
            } label: {
                AuthenticatedImage(url: url, background: NxColors.sunken)
                    .frame(width: 62, height: 62)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Foto de \(etiqueta.lowercased())")
            AsisIconText(text: etiqueta, systemImage: systemImage, fontSize: 10, color: NxColors.muted, iconSize: 13)
        }
    }

    /// «Mapa entrada», «Mapa salida», «Justificar falta» y, como en la web, «Ver qué
    /// está haciendo» (la pizarra de la persona).
    private var acciones: some View {
        let entrada = AttendanceClock.mapUrl(lat: row.entryPunch?.coords?.lat, lng: row.entryPunch?.coords?.lng)
        let salida = AttendanceClock.mapUrl(lat: row.exitPunch?.coords?.lat, lng: row.exitPunch?.coords?.lng)
        return AsisFlowLayout(horizontal: 4, vertical: 0) {
            if let entrada {
                textoBoton("Mapa entrada") { openURL(entrada) }
            }
            if let salida {
                textoBoton("Mapa salida") { openURL(salida) }
            }
            if let onJustificar {
                textoBoton("Justificar falta", color: AttendanceEstado.justificada.color, weight: .semibold, action: onJustificar)
            }
            NavigationLink {
                TeamMemberDetailView(userId: row.member.userId, nombre: row.member.displayName)
                    .nxBrandNavBar()
            } label: {
                etiquetaBoton("Ver qué está haciendo", color: NxColors.brand, weight: .regular)
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// `TextButton` de Material: letra 12,5 y 40 de alto.
    private func textoBoton(
        _ titulo: String,
        color: Color = NxColors.brand,
        weight: Font.Weight = .regular,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            etiquetaBoton(titulo, color: color, weight: weight)
        }
        .buttonStyle(.plain)
    }

    private func etiquetaBoton(_ titulo: String, color: Color, weight: Font.Weight) -> some View {
        Text(titulo)
            .font(.system(size: 12.5, weight: weight))
            .foregroundStyle(color)
            .padding(.horizontal, 12)
            .frame(minHeight: 40)
            .contentShape(Rectangle())
    }
}

// MARK: - Justificar falta

/// «Justificar falta» (solo Christian): motivo de al menos 10 caracteres; el día
/// queda como «Falta justificada» y no se crea ninguna checada (Android
/// `JustificarFaltaDialog`).
private struct JustificarFaltaSheet: View {
    let nombre: String
    let dia: String
    /// Devuelve el error legible, o `nil` si quedó justificada.
    let onConfirm: (String) async -> String?

    @Environment(\.dismiss) private var dismiss
    @State private var motivo = ""
    @State private var saving = false
    @State private var error: String?

    private var ok: Bool { FaltasJustificadas.motivoOk(motivo) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Justificar falta")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(NxColors.fg)
            Text("\(nombre) · \(AsistenciasEquipoTab.minuscula(dia)). El día quedará como «Falta justificada» con tu motivo; no se crea ninguna checada.")
                .font(.system(size: 13))
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 4) {
                Text("Motivo")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(error != nil ? NxColors.danger : NxColors.fg2)
                TextField("Ej. Incapacidad del IMSS por tres días.", text: $motivo, axis: .vertical)
                    .font(.system(size: 15))
                    .lineLimit(3...6)
                    .disabled(saving)
                    .padding(12)
                    .background(NxColors.card, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .strokeBorder(error != nil ? NxColors.danger : NxColors.borderStrong, lineWidth: 1)
                    )
                // La ayuda vive bajo el campo y el error la reemplaza mientras dure.
                Text(error ?? "Mínimo \(FaltasJustificadas.motivoMinimo) caracteres: queda en el expediente del día.")
                    .font(.system(size: 11.5))
                    .foregroundStyle(error != nil ? NxColors.danger : NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 8) {
                Spacer()
                Button("Cancelar") { dismiss() }
                    .buttonStyle(NxPillButtonStyle(fill: .clear, foreground: NxColors.fg2))
                    .disabled(saving)
                Button(saving ? "Guardando…" : "Justificar falta") {
                    Task { await save() }
                }
                .buttonStyle(NxPillButtonStyle(fill: AttendanceEstado.justificada.color, foreground: .white))
                .disabled(!ok || saving)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.card)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
        .onChange(of: motivo) { _, value in
            if value.count > FaltasJustificadas.motivoMaximo {
                motivo = String(value.prefix(FaltasJustificadas.motivoMaximo))
            }
        }
    }

    @MainActor
    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        if let failure = await onConfirm(motivo) {
            error = failure
        } else {
            dismiss()
        }
    }
}
