import SwiftUI

/// Inicio (rediseño v2, `.ai/ui-maquetas/movil-inicio-ios.png`): la primera pestaña.
///
/// De arriba abajo: saludo con la fecha y la campana; la tarjeta de jornada con
/// el botón grande de checar; el único aviso que importa hoy; la actividad de
/// «ahora» con su acción principal; y las siguientes del día. Todo sale de lo
/// que la app ya consulta: `me/activities`, `attendance/current` y las checadas
/// de hoy. Colores con variante oscura (`NxSurface`, `NxBrand`).
struct InicioView: View {
    @ObservedObject var store: InicioStore
    let tieneActividades: Bool
    let tieneAsistencia: Bool
    let onOpenNotifications: () -> Void
    let onOpenActivity: (Int, String?) -> Void
    let onOpenActividades: () -> Void
    let onOpenAsistencia: () -> Void
    let onOpenComidas: () -> Void

    @ObservedObject private var session = SessionStore.shared
    @ObservedObject private var badge = NotificationsBadgeStore.shared
    @StateObject private var attendance = AttendanceVM()
    @Environment(\.scenePhase) private var scenePhase
    @State private var photoType: String?
    @State private var pausando: MyActivityItem?
    @State private var motivoPausa = ""
    @State private var pausaError: String?

    private var myId: Int? { session.currentUser.flatMap { Int($0.id) } }
    private var muestraJornada: Bool { tieneAsistencia && attendance.canRegisterSelf }
    /// Dirección general (Christian y su equivalente): el API no le da «Mis actividades»
    /// (403 «no aplica a dirección general»), así que Inicio le lleva a la pizarra del equipo.
    /// En modo demo `CoreOrg.isCeo` es verdadero para la persona ficticia: ahí sí hay cola propia.
    private var esDireccion: Bool { !DemoMode.isActive && CoreOrg.isCeo(session.currentUser?.email) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                InicioHeader(
                    user: session.currentUser,
                    unread: badge.unreadCount,
                    onOpenNotifications: onOpenNotifications
                )
                if muestraJornada {
                    InicioJornadaCard(
                        vm: attendance,
                        onMark: { photoType = $0 },
                        onComida: onOpenComidas,
                        onVerJornada: onOpenAsistencia
                    )
                }
                if let aviso = InicioRules.aviso(store.open, miId: myId) {
                    InicioAvisoCard(aviso: aviso) {
                        if let id = aviso.activityId { onOpenActivity(id, nil) }
                    }
                }
                if let pausaError {
                    NxIconText(systemName: "exclamationmark.triangle.fill", text: pausaError, tint: CorePalette.red)
                        .font(.footnote)
                }
                actividades
            }
            .padding(.horizontal, NxSpacing.l)
            .padding(.bottom, NxSpacing.xl)
        }
        .background(NxSurface.screen.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await reload() }
        .task { await reload() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await reload() } }
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
                    let failure = await attendance.checkIn(type, photo: captured)
                    if failure == nil { photoType = nil }
                    return failure
                },
                onCancel: { photoType = nil }
            )
        }
        .alert(
            "No se pudo checar",
            isPresented: Binding(
                get: { attendance.checkInBloqueo != nil },
                set: { if !$0 { attendance.clearBloqueo() } }
            ),
            presenting: attendance.checkInBloqueo
        ) { _ in
            Button("Entendido", role: .cancel) { attendance.clearBloqueo() }
        } message: { mensaje in
            Text(mensaje + "\n\n" + ChecadaRechazo.ayuda(mensaje))
        }
        .alert(
            SesionActividad.tituloPausaPropia,
            isPresented: Binding(
                get: { pausando != nil },
                set: { if !$0 { pausando = nil } }
            ),
            presenting: pausando
        ) { item in
            TextField("Motivo (opcional)", text: $motivoPausa)
            Button("Cancelar", role: .cancel) { pausando = nil }
            Button("Pausar") { Task { await pausar(item) } }
        } message: { _ in
            Text(SesionActividad.textoPausaPropia)
        }
    }

    // MARK: Actividades

    @ViewBuilder
    private var actividades: some View {
        if esDireccion {
            InicioSectionTitle(title: "Tu equipo hoy")
            InicioEquipoCard(onVerEquipo: tieneActividades ? Optional(onOpenActividades) : nil)
        } else if tieneActividades {
            if store.loading && store.data == nil {
                InicioSectionTitle(title: "Ahora")
                NxSkeletonRows(count: 2)
            } else if let error = store.error, store.data == nil {
                NxStaleBanner(message: error) { Task { await store.load(enabled: true) } }
            } else if let actual = store.actual {
                InicioSectionTitle(title: "Ahora")
                InicioActualCard(
                    item: actual,
                    enCurso: store.accionEnCurso == actual.id,
                    error: store.accionError,
                    onPrimary: { accion in Task { await primaria(accion, actual) } },
                    onPausar: {
                        motivoPausa = ""
                        pausaError = nil
                        pausando = actual
                    },
                    onDetalle: { onOpenActivity(actual.id, nil) }
                )
                if let error = store.error {
                    NxStaleBanner(message: error) { Task { await store.load(enabled: true) } }
                }
                let siguientes = store.siguientes
                if !siguientes.isEmpty {
                    InicioSectionTitle(title: "Después, hoy", action: "Ver todas", onAction: onOpenActividades)
                    InicioSiguientesCard(items: siguientes) { onOpenActivity($0.id, nil) }
                } else {
                    Button("Ver todas mis actividades", action: onOpenActividades)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NxBrand.text)
                        .nxTapTarget()
                }
            } else {
                InicioSectionTitle(title: "Ahora")
                InicioTodoAlDiaCard(hechasHoy: store.hechasHoy, onVerTodas: onOpenActividades)
            }
        } else if !muestraJornada {
            InicioTodoAlDiaCard(hechasHoy: 0, onVerTodas: nil)
        }
    }

    // MARK: Acciones

    @MainActor
    private func reload() async {
        await store.load(enabled: tieneActividades && !esDireccion)
        if muestraJornada || tieneAsistencia {
            await attendance.loadMine()
            await ShiftGpsTracker.shared.resumeIfNeeded()
        }
    }

    @MainActor
    private func primaria(_ accion: InicioRules.Accion, _ item: MyActivityItem) async {
        switch accion.kind {
        case .reanudar:
            _ = await store.reanudar(item.id)
        case .iniciar where accion.marcaInicio:
            if await store.iniciar(item.id) { onOpenActivity(item.id, accion.tab) }
        default:
            onOpenActivity(item.id, accion.tab)
        }
    }

    @MainActor
    private func pausar(_ item: MyActivityItem) async {
        if let invalido = SesionActividad.errorMotivoPropio(motivoPausa) {
            pausaError = invalido
            return
        }
        do {
            try await CoreRepository.shared.pausarActividad(activityId: item.id, motivo: motivoPausa)
            pausaError = nil
            pausando = nil
            await store.load(enabled: true)
        } catch {
            pausaError = error.toUserMessage(fallback: "No se pudo pausar la actividad")
        }
    }
}

// MARK: - Piezas

private extension InicioRules.Tono {
    var nxTone: NxTone {
        switch self {
        case .info: return .info
        case .warning: return .warning
        case .danger: return .danger
        case .success: return .success
        case .neutral: return .neutral
        }
    }
}

/// Saludo con la fecha, foto y la campana (Inicio no tiene barra de navegación).
private struct InicioHeader: View {
    let user: SessionUser?
    let unread: Int
    let onOpenNotifications: () -> Void

    private var initials: String {
        let letters = (user?.nombre ?? "").split(separator: " ").prefix(2).compactMap { $0.first }
        return letters.isEmpty ? "?" : String(letters).uppercased()
    }

    var body: some View {
        HStack(spacing: NxSpacing.m) {
            ZStack {
                if let url = user?.avatarUrl, !url.isEmpty {
                    AuthenticatedImage(url: url, contentMode: .fill)
                } else {
                    Circle().fill(NxBrand.softFill)
                    Text(initials)
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(NxBrand.text)
                }
            }
            .frame(width: 48, height: 48)
            .clipShape(Circle())
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 1) {
                Text(InicioRules.fechaLarga(Date()))
                    .font(.subheadline)
                    .foregroundStyle(NxSurface.muted)
                Text(InicioRules.saludo(user?.nombre))
                    .font(.title.weight(.bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .accessibilityAddTraits(.isHeader)
            }
            Spacer(minLength: 0)
            Button(action: onOpenNotifications) {
                Image(systemName: "bell")
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(Color.primary)
                    .frame(width: 44, height: 44)
                    .background(NxSurface.card, in: Circle())
                    .overlay(Circle().strokeBorder(NxSurface.border, lineWidth: 1))
                    .overlay(alignment: .topTrailing) {
                        if unread > 0 {
                            Text(unread > 99 ? "99+" : "\(unread)")
                                .font(.caption2.bold())
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(CorePalette.red, in: Capsule())
                                .offset(x: 4, y: -4)
                        }
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(unread > 0 ? "Notificaciones, \(unread) sin leer" : "Notificaciones")
            .accessibilityIdentifier("bell-button")
        }
        .padding(.top, NxSpacing.s)
    }
}

private struct InicioSectionTitle: View {
    let title: String
    var action: String? = nil
    var onAction: (() -> Void)? = nil

    var body: some View {
        HStack {
            Text(title)
                .font(.title3.weight(.bold))
                .accessibilityAddTraits(.isHeader)
            Spacer()
            if let action, let onAction {
                Button(action, action: onAction)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NxBrand.text)
                    .nxTapTarget()
            }
        }
        .padding(.top, NxSpacing.xs)
    }
}

/// Tarjeta teal de la jornada: la misma checada que Asistencias (foto + GPS +
/// aviso de rechazo) a través de `AttendanceVM`; aquí solo cambia la presentación.
private struct InicioJornadaCard: View {
    @ObservedObject var vm: AttendanceVM
    @ObservedObject private var tracker = ShiftGpsTracker.shared
    let onMark: (String) -> Void
    let onComida: () -> Void
    let onVerJornada: () -> Void

    private var jornada: InicioRules.Jornada {
        InicioRules.jornada(abierta: vm.isOpen, hayEntrada: vm.hasEntryToday, haySalida: vm.hasExitToday)
    }

    private var estadoTexto: String {
        switch jornada {
        case .enJornada:
            return "En jornada · entrada \(CoreFormat.time(vm.lastEntryAt) ?? "—")"
        case .completada:
            let entrada = vm.myPunches.first(where: { $0.isEntry })?.timestamp
            let salida = vm.myPunches.last(where: { !$0.isEntry })?.timestamp
            return "Jornada completada · \(CoreFormat.time(entrada) ?? "—") – \(CoreFormat.time(salida) ?? "—")"
        case .sinEntrada:
            return vm.statusLabel == AttendanceEstado.justificada.label ? vm.statusLabel : "Sin entrada registrada"
        }
    }

    private var subTexto: String {
        switch jornada {
        case .enJornada:
            if vm.openedOnAnotherDay { return "Jornada abierta desde otro día: marca tu salida." }
            return tracker.isTracking ? "Compartiendo tu ubicación de jornada" : "Tu ubicación de jornada está apagada"
        case .completada:
            return "Entrada y salida registradas hoy"
        case .sinEntrada:
            return "Se toma una foto y tu ubicación al checar"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: NxSpacing.s) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: NxSpacing.s) {
                    Circle()
                        .fill(vm.isOpen ? Color(red: 0.49, green: 1.0, blue: 0.85) : Color.white.opacity(0.55))
                        .frame(width: 8, height: 8)
                    Text(estadoTexto)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Color.white.opacity(0.92))
                        .lineLimit(1)
                }
                TimelineView(.periodic(from: .now, by: 30)) { context in
                    let live = AttendanceClock.elapsed(from: vm.lastEntryAt, to: nil, now: context.date)
                    let total = vm.totalSecondsToday + (vm.isOpen ? live : 0)
                    HStack(alignment: .lastTextBaseline, spacing: NxSpacing.s) {
                        Text(InicioRules.horasMinutos(total))
                            .font(.system(size: 44, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                        Text("h trabajadas")
                            .font(.headline.weight(.regular))
                            .foregroundStyle(Color.white.opacity(0.8))
                    }
                }
                Label(subTexto, systemImage: "location")
                    .font(.footnote)
                    .foregroundStyle(Color.white.opacity(0.85))
                    .lineLimit(2)
                botones.padding(.top, 6)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(NxBrand.heroGradient, in: RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous))
            .overlay(alignment: .bottomTrailing) {
                Circle()
                    .strokeBorder(Color.white.opacity(0.06), lineWidth: 26)
                    .frame(width: 220, height: 220)
                    .offset(x: 70, y: 90)
                    .allowsHitTesting(false)
            }
            .clipShape(RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous))
            .shadow(color: NxBrand.deep.opacity(0.25), radius: 14, y: 8)

            if let notice = vm.checkInNotice {
                NxIconText(systemName: "checkmark.circle.fill", text: notice, tint: CorePalette.green)
                    .font(.footnote)
            }
            if let error = vm.mineError {
                NxIconText(systemName: "exclamationmark.triangle.fill", text: error, tint: CorePalette.red)
                    .font(.footnote)
            }
        }
    }

    @ViewBuilder
    private var botones: some View {
        HStack(spacing: 10) {
            switch jornada {
            case .enJornada:
                InicioHeroButton(title: "Comida", systemImage: "fork.knife", light: true, action: onComida)
                InicioHeroButton(
                    title: vm.checkInLoading ? "Registrando…" : "Checar salida",
                    systemImage: "rectangle.portrait.and.arrow.right",
                    light: false,
                    loading: vm.checkInLoading
                ) { onMark("salida") }
                .disabled(vm.checkInLoading || !vm.canMarkExit)
            case .sinEntrada:
                InicioHeroButton(
                    title: vm.checkInLoading ? "Registrando…" : "Checar entrada",
                    systemImage: "arrow.right.to.line",
                    light: false,
                    loading: vm.checkInLoading
                ) { onMark("entrada") }
                .disabled(vm.checkInLoading || !vm.canMarkEntry)
            case .completada:
                InicioHeroButton(title: "Ver mi jornada", systemImage: "clock", light: true, action: onVerJornada)
            }
        }
    }
}

private struct InicioHeroButton: View {
    let title: String
    let systemImage: String
    let light: Bool
    var loading: Bool = false
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        Button(action: action) {
            HStack(spacing: NxSpacing.s) {
                if loading {
                    ProgressView().tint(light ? .white : NxBrand.deep)
                } else {
                    Image(systemName: systemImage)
                }
                Text(title).lineLimit(1).minimumScaleFactor(0.8)
            }
            .font(.headline)
            .foregroundStyle(light ? Color.white : NxBrand.deep)
            .frame(maxWidth: .infinity, minHeight: NxMetrics.primaryButtonHeight)
            .background(
                light ? Color.white.opacity(0.16) : Color.white,
                in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                    .strokeBorder(Color.white.opacity(light ? 0.22 : 0), lineWidth: 1)
            )
            .opacity(isEnabled ? 1 : 0.6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// El único aviso de hoy: color con significado y toque para abrir la actividad.
private struct InicioAvisoCard: View {
    let aviso: InicioRules.Aviso
    let onTap: () -> Void

    var body: some View {
        let tone = aviso.tono.nxTone
        Button(action: onTap) {
            HStack(spacing: NxSpacing.m) {
                Image(systemName: aviso.systemImage)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(tone.fg)
                    .frame(width: 38, height: 38)
                    .background(NxSurface.card.opacity(0.7), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(aviso.titulo)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(tone.fg)
                        .lineLimit(2)
                    Text(aviso.detalle)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
                if aviso.activityId != nil {
                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tone.fg.opacity(0.10), in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
            .multilineTextAlignment(.leading)
        }
        .buttonStyle(.plain)
        .disabled(aviso.activityId == nil)
        .accessibilityElement(children: .combine)
    }
}

/// La actividad de ahora: tipo, folio, estado, avance y la acción principal grande.
private struct InicioActualCard: View {
    let item: MyActivityItem
    let enCurso: Bool
    let error: String?
    let onPrimary: (InicioRules.Accion) -> Void
    let onPausar: () -> Void
    let onDetalle: () -> Void

    var body: some View {
        let accion = InicioRules.accion(item)
        let estado = InicioRules.estado(item)
        let kindColor = NxBrand.category(item.coreKind)
        let pausable = item.despachador != true && item.sesion.puedePausar(estatus: item.estatus)
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: NxSpacing.s) {
                Image(systemName: CoreStatusUI.kindSymbol(item.coreKind))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(kindColor)
                    .frame(width: 28, height: 28)
                    .background(kindColor.opacity(0.14), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                Text("\(CoreStatusUI.kind(item.coreKind, ticketTypeCustom: item.ticketTypeCustom))  \(item.anNumber ?? "")")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NxSurface.muted)
                    .lineLimit(1)
                Spacer(minLength: 4)
                InicioEstadoChip(estado: estado)
            }
            Text(item.displayTitle)
                .font(.title3.weight(.bold))
                .lineLimit(3)
            if let lugar = InicioRules.lugar(item) {
                Label(lugar, systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundStyle(NxSurface.muted)
                    .lineLimit(1)
            }
            if let periodo = item.periodo?.texto {
                Text(periodo).font(.footnote).foregroundStyle(NxSurface.muted)
            }
            if let avance = InicioRules.avance(item) {
                HStack(spacing: 10) {
                    ProgressView(value: Double(avance.hechos), total: Double(max(avance.total, 1)))
                        .tint(NxBrand.primary)
                    Text("\(avance.hechos)/\(avance.total)")
                        .font(.subheadline.weight(.bold))
                        .monospacedDigit()
                }
                .padding(.top, 2)
            }
            if let error {
                Text(error).font(.footnote).foregroundStyle(CorePalette.red)
            }
            HStack(spacing: NxSpacing.s) {
                Button {
                    onPrimary(accion)
                } label: {
                    HStack(spacing: NxSpacing.s) {
                        if enCurso {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: accion.systemImage)
                        }
                        Text(accion.label).lineLimit(1).minimumScaleFactor(0.8)
                    }
                }
                .buttonStyle(NxPrimaryButtonStyle())
                .disabled(enCurso)
                if pausable {
                    InicioSquareButton(systemImage: "pause", label: "Pausar actividad", action: onPausar)
                }
                InicioSquareButton(systemImage: "info.circle", label: "Ver detalle", action: onDetalle)
            }
            .padding(.top, 2)
        }
        .padding(NxSpacing.l)
        .background(NxSurface.card, in: RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous)
                .strokeBorder(NxSurface.border, lineWidth: 1)
        )
    }
}

private struct InicioEstadoChip: View {
    let estado: InicioRules.Estado

    var body: some View {
        let color = estado.tono.nxTone.fg
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(estado.label).lineLimit(1)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(color)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(color.opacity(0.12), in: Capsule())
    }
}

private struct InicioSquareButton: View {
    let systemImage: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(Color.primary)
                .frame(width: NxMetrics.primaryButtonHeight, height: NxMetrics.primaryButtonHeight)
                .background(NxSurface.card, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                        .strokeBorder(NxSurface.borderStrong, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// «Después, hoy»: las siguientes de la cola, una por renglón.
private struct InicioSiguientesCard: View {
    let items: [MyActivityItem]
    let onOpen: (MyActivityItem) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 { Divider().padding(.leading, 14) }
                fila(item)
            }
        }
        .background(NxSurface.card, in: RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous)
                .strokeBorder(NxSurface.border, lineWidth: 1)
        )
    }

    private func fila(_ item: MyActivityItem) -> some View {
        let kindColor = NxBrand.category(item.coreKind)
        // Bajo la hora solo cabe algo corto («Día 2»). La prioridad («Esta semana», «Puede
        // esperar») va en la línea de detalle: en la columna de 56 pt salía cortada («Esta se…»).
        let dia = item.periodo?.dia.map { "Día \($0)" }
        let detalle = [dia == nil ? CoreStatusUI.priority(item.prioridad).label : nil, InicioRules.detalleSiguiente(item)]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
        return Button {
            onOpen(item)
        } label: {
            HStack(spacing: NxSpacing.m) {
                VStack(spacing: 1) {
                    Text(CoreFormat.time(item.fechaInicio) ?? "—")
                        .font(.subheadline.weight(.bold))
                        .monospacedDigit()
                    if let dia {
                        Text(dia)
                            .font(.caption2)
                            .foregroundStyle(NxSurface.muted)
                            .lineLimit(1)
                    }
                }
                .frame(width: 56)
                Image(systemName: CoreStatusUI.kindSymbol(item.coreKind))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(kindColor)
                    .frame(width: 36, height: 36)
                    .background(kindColor.opacity(0.14), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.displayTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.primary)
                        .lineLimit(2)
                    Text(detalle)
                        .font(.footnote)
                        .foregroundStyle(NxSurface.muted)
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
            .multilineTextAlignment(.leading)
        }
        .buttonStyle(.plain)
    }
}

/// Inicio de dirección general: no tiene cola propia; su día es el del equipo.
private struct InicioEquipoCard: View {
    let onVerEquipo: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: NxSpacing.s) {
            HStack(spacing: NxSpacing.m) {
                NxIconBadge(systemName: "person.3.fill", tint: NxBrand.primary, size: 44, circle: true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Pizarra del equipo").font(.headline)
                    Text("Quién está en campo, qué lleva cada persona y qué va atrasado.")
                        .font(.footnote)
                        .foregroundStyle(NxSurface.muted)
                }
            }
            if let onVerEquipo {
                Button(action: onVerEquipo) {
                    Label("Ver la pizarra del equipo", systemImage: "arrow.right")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: NxMetrics.primaryButtonHeight)
                        .foregroundStyle(.white)
                        .background(NxBrand.primary, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxSurface.card, in: RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous)
                .strokeBorder(NxSurface.border, lineWidth: 1)
        )
    }
}

private struct InicioTodoAlDiaCard: View {
    let hechasHoy: Int
    let onVerTodas: (() -> Void)?

    private var texto: String {
        switch hechasHoy {
        case 0: return "Cuando te asignen algo aparecerá aquí."
        case 1: return "Terminaste 1 actividad hoy. Cuando te asignen algo aparecerá aquí."
        default: return "Terminaste \(hechasHoy) actividades hoy. Cuando te asignen algo aparecerá aquí."
        }
    }

    var body: some View {
        VStack(spacing: NxSpacing.s) {
            NxIconBadge(systemName: "checkmark.circle", tint: CorePalette.green, size: 52, circle: true)
            Text("Todo al día").font(.headline)
            Text(texto)
                .font(.footnote)
                .foregroundStyle(NxSurface.muted)
                .multilineTextAlignment(.center)
            if let onVerTodas {
                Button("Ver todas mis actividades", action: onVerTodas)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NxBrand.text)
                    .nxTapTarget()
            }
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(NxSurface.card, in: RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous)
                .strokeBorder(NxSurface.border, lineWidth: 1)
        )
    }
}

#Preview("Inicio") {
    NavigationStack {
        InicioView(
            store: InicioStore(),
            tieneActividades: true,
            tieneAsistencia: true,
            onOpenNotifications: {},
            onOpenActivity: { _, _ in },
            onOpenActividades: {},
            onOpenAsistencia: {},
            onOpenComidas: {}
        )
    }
}
