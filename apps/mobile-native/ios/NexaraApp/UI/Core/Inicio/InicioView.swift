import SwiftUI

/// Inicio (rediseño v2, `.ai/ui-maquetas/movil-inicio.html`): la primera pestaña.
/// Espejo de `InicioScreen.kt` de Android.
///
/// De arriba abajo: saludo con la fecha y la campana; la tarjeta de jornada con
/// el botón grande de checar; el único aviso que importa hoy; la actividad de
/// «ahora» con su acción principal; y las siguientes del día. Todo sale de lo
/// que la app ya consulta: `me/activities`, `attendance/current` y las checadas
/// de hoy. Inicio no tiene barra superior: trae su propia cabecera.
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

    private var myId: Int? { session.currentUser.flatMap { Int($0.id) } }
    private var muestraJornada: Bool { tieneAsistencia && attendance.canRegisterSelf }
    /// Dirección general (Christian y su equivalente): el API no le da «Mis actividades»
    /// (403 «no aplica a dirección general»), así que Inicio le lleva a la pizarra del equipo.
    /// En modo demo `CoreOrg.isCeo` es verdadero para la persona ficticia: ahí sí hay cola propia.
    private var esDireccion: Bool { !DemoMode.isActive && CoreOrg.isCeo(session.currentUser?.email) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                InicioHeader(
                    user: session.currentUser,
                    unread: badge.unreadCount,
                    onOpenNotifications: onOpenNotifications
                )
                if muestraJornada {
                    InicioJornadaHero(
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
                actividades
            }
            .padding(.horizontal, NxSpacing.l)
            .padding(.bottom, NxSpacing.xl)
        }
        .background(NxColors.surface.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await reload() }
        .task { await reload() }
        .onChange(of: scenePhase) { _, phase in
            // Al volver a la app se relee todo, sin esperar al siguiente tic.
            if phase == .active { Task { await reload() } }
        }
        .refreshOnModels(["Activity", "ActivityEvidence", "ServiceSheet"]) {
            await store.load(enabled: tieneActividades && !esDireccion)
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
        // Android `PausarPropiaDialog`: motivo opcional y «Pausar».
        .sheet(item: $pausando) { item in
            PausarPropiaSheet(activityId: item.id) { _ in
                pausando = nil
                Task { await store.load(enabled: true) }
            }
        }
    }

    // MARK: Actividades

    @ViewBuilder
    private var actividades: some View {
        if esDireccion {
            VStack(alignment: .leading, spacing: NxSpacing.s) {
                InicioSectionTitle(title: "Tu equipo hoy")
                InicioEquipoCard(onVerEquipo: tieneActividades ? Optional(onOpenActividades) : nil)
            }
        } else if tieneActividades {
            if store.loading && store.data == nil {
                NxSkeletonList(itemCount: 2, itemHeight: 132)
            } else if let error = store.error, store.open.isEmpty {
                NxRefreshErrorBanner(message: error, onRetry: { Task { await store.load(enabled: true) } })
            } else if let actual = store.actual {
                InicioSectionTitle(title: "Ahora")
                InicioActualCard(
                    item: actual,
                    enCurso: store.accionEnCurso == actual.id,
                    error: store.accionError,
                    onPrimary: { accion in Task { await primaria(accion, actual) } },
                    onPausar: {
                        store.accionError = nil
                        pausando = actual
                    },
                    onDetalle: { onOpenActivity(actual.id, nil) }
                )
                if let error = store.error {
                    NxRefreshErrorBanner(message: error, onRetry: { Task { await store.load(enabled: true) } })
                }
                let siguientes = store.siguientes
                if !siguientes.isEmpty {
                    InicioSectionTitle(title: "Después, hoy", action: "Ver todas", onAction: onOpenActividades)
                    InicioSiguientesCard(items: siguientes) { onOpenActivity($0.id, nil) }
                } else if store.open.count <= 1 {
                    InicioVerTodasRow(onClick: onOpenActividades)
                }
            } else {
                VStack(alignment: .leading, spacing: NxSpacing.s) {
                    InicioSectionTitle(title: "Ahora")
                    InicioTodoAlDiaCard(hechasHoy: store.hechasHoy, onVerTodas: onOpenActividades)
                }
            }
        } else if !tieneAsistencia {
            // Sin Actividades ni Asistencia: Inicio no se queda en blanco.
            InicioTodoAlDiaCard(hechasHoy: 0, onVerTodas: nil)
        }
    }

    // MARK: Acciones

    @MainActor
    private func reload() async {
        await store.load(enabled: tieneActividades && !esDireccion)
        if tieneAsistencia {
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
}

// MARK: - Piezas

private extension InicioRules.Tono {
    /// Color del texto/icono del tono (Android `NxTheme.colors`).
    var tinta: Color {
        switch self {
        case .danger: return NxColors.danger
        case .warning: return NxColors.warning
        case .success: return NxColors.success
        case .info: return NxColors.info
        case .neutral: return NxColors.fg2
        }
    }

    var fondo: Color {
        switch self {
        case .danger: return NxColors.dangerSoft
        case .warning: return NxColors.warningSoft
        case .success: return NxColors.successSoft
        case .info: return NxColors.infoSoft
        case .neutral: return NxColors.sunken
        }
    }

    var texto: Color {
        switch self {
        case .danger: return NxColors.dangerText
        case .warning: return NxColors.warningText
        default: return NxColors.fg
        }
    }
}

/// Cabecera de Inicio (Android `InicioHeader`): foto 48, fecha 13 gris, «Hola, …»
/// 22 Bold y la campana en un círculo blanco de 44 con su insignia.
private struct InicioHeader: View {
    let user: SessionUser?
    let unread: Int
    let onOpenNotifications: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            InicioAvatar(nombre: user?.nombre, url: user?.avatarUrl, size: 48)
            VStack(alignment: .leading, spacing: 1) {
                Text(InicioRules.fechaLarga(Date()))
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(1)
                Text(InicioRules.saludo(user?.nombre))
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(1)
                    .accessibilityAddTraits(.isHeader)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: onOpenNotifications) {
                Image(systemName: "bell")
                    .font(.system(size: 19, weight: .regular))
                    .foregroundStyle(NxColors.fg2)
                    .frame(width: 22, height: 22)
                    .overlay(alignment: .topTrailing) {
                        if unread > 0 {
                            NxCountBadge(count: unread)
                                .fixedSize()
                                .offset(x: 9, y: -7)
                        }
                    }
                    .frame(width: 44, height: 44)
                    .background(NxColors.card, in: Circle())
                    .overlay(Circle().strokeBorder(NxColors.border, lineWidth: 1))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(unread > 0 ? "Notificaciones, \(unread) sin leer" : "Notificaciones")
            .accessibilityIdentifier("bell-button")
        }
        .padding(.top, 12)
        .padding(.bottom, 2)
    }
}

/// Foto con aro de 2 en `brandSoft2` o iniciales de marca en ExtraBold (36 % del lado).
private struct InicioAvatar: View {
    let nombre: String?
    let url: String?
    let size: CGFloat

    var body: some View {
        Group {
            if let url, !url.isEmpty {
                AuthenticatedImage(url: url, contentMode: .fill, background: NxColors.brandSoft)
                    .frame(width: size, height: size)
                    .clipShape(Circle())
                    .overlay(Circle().strokeBorder(NxColors.brandSoft2, lineWidth: 2))
            } else {
                ZStack {
                    Circle().fill(NxColors.brandSoft)
                    Text(ActividadesTexto.iniciales(nombre))
                        .font(.system(size: size * 0.36, weight: .heavy))
                        .foregroundStyle(NxColors.brandText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
                .frame(width: size, height: size)
            }
        }
        .accessibilityHidden(true)
    }
}

/// Título de sección (Android `SectionTitle`): 17 Bold y una acción 13,5 SemiBold de marca.
private struct InicioSectionTitle: View {
    let title: String
    var action: String? = nil
    var onAction: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            Text(title)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(NxColors.fg)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            if let action, let onAction {
                Button(action: onAction) {
                    Text(action)
                        .font(.system(size: 13.5, weight: .semibold))
                        .foregroundStyle(NxColors.brandText)
                        .padding(6)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 6)
        .padding(.horizontal, 2)
    }
}

/// Tarjeta teal de la jornada (Android `JornadaHero`): la misma checada que
/// Asistencias (foto + GPS + aviso de rechazo) a través de `AttendanceVM`; aquí
/// solo cambia la presentación.
private struct InicioJornadaHero: View {
    @ObservedObject var vm: AttendanceVM
    @ObservedObject private var tracker = ShiftGpsTracker.shared
    let onMark: (String) -> Void
    let onComida: () -> Void
    let onVerJornada: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: NxSpacing.s) {
            // La cifra se refresca cada 30 s mientras la jornada está abierta.
            TimelineView(.periodic(from: .now, by: 30)) { context in
                tarjeta(now: context.date)
            }
            if let notice = vm.checkInNotice, !notice.isEmpty {
                let esError = vm.checkInNoticeIsError
                HStack(alignment: .center, spacing: 6) {
                    Image(systemName: esError ? "exclamationmark.circle" : "checkmark.circle")
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(esError ? NxColors.danger : NxColors.success)
                        .frame(width: 16, height: 16)
                        .accessibilityHidden(true)
                    Text(notice)
                        .font(.system(size: 12.5))
                        .foregroundStyle(esError ? NxColors.danger : NxColors.fg2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 4)
            }
        }
    }

    /// Última checada de ese tipo (la más reciente).
    private func ultima(_ punches: [AttendancePunch]) -> String? {
        punches.max { (CoreFormat.date($0.timestamp) ?? .distantPast) < (CoreFormat.date($1.timestamp) ?? .distantPast) }?.timestamp
    }

    private func tarjeta(now: Date) -> some View {
        let abierta = vm.isOpen
        let entradas = vm.myPunches.filter { $0.isEntry }
        let salidas = vm.myPunches.filter { !$0.isEntry }
        let hayEntrada = !entradas.isEmpty
        let jornada = InicioRules.jornada(abierta: abierta, hayEntrada: hayEntrada, haySalida: !salidas.isEmpty)
        let inicioIso = vm.lastEntryAt ?? ultima(entradas)
        let salidaIso = ultima(salidas)
        let trabajado: TimeInterval
        let estadoTexto: String
        let subTexto: String
        switch jornada {
        case .enJornada:
            trabajado = AttendanceClock.elapsed(from: inicioIso, to: nil, now: now)
            estadoTexto = "En jornada · entrada \(ActividadesTexto.hora(inicioIso))"
            subTexto = tracker.isTracking ? "Compartiendo tu ubicación de jornada" : "Tu ubicación de jornada está apagada"
        case .completada:
            trabajado = AttendanceClock.elapsed(from: inicioIso, to: salidaIso, now: now)
            estadoTexto = "Jornada completada · \(ActividadesTexto.hora(inicioIso)) – \(ActividadesTexto.hora(salidaIso))"
            subTexto = "Entrada y salida registradas hoy"
        case .sinEntrada:
            trabajado = 0
            estadoTexto = "Sin entrada registrada"
            subTexto = "Se toma una foto y tu ubicación al checar"
        }
        // El API contesta 400 a la segunda entrada del día: aquí se apaga antes.
        let puedeEntrar = !hayEntrada && !abierta

        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 8) {
                Circle()
                    .fill(abierta ? NxColors.rgb(0x7DFFD8) : Color.white.opacity(0.55))
                    .frame(width: 8, height: 8)
                Text(estadoTexto)
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.92))
                    .lineLimit(1)
            }
            HStack(alignment: .lastTextBaseline, spacing: 8) {
                Text(InicioRules.horasMinutos(trabajado))
                    .font(.system(size: 40, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(Color.white)
                    .lineLimit(1)
                Text("h trabajadas")
                    .font(.system(size: 16))
                    .foregroundStyle(Color.white.opacity(0.78))
                    .lineLimit(1)
            }
            .padding(.top, 6)
            HStack(alignment: .center, spacing: 6) {
                Image(systemName: "mappin")
                    .font(.system(size: 13, weight: .regular))
                    .frame(width: 15, height: 15)
                    .accessibilityHidden(true)
                Text(subTexto)
                    .font(.system(size: 13))
                    .lineLimit(1)
            }
            .foregroundStyle(Color.white.opacity(0.85))
            HStack(spacing: 10) {
                switch jornada {
                case .enJornada:
                    InicioHeroButton(title: "Comida", systemImage: "fork.knife", light: true, action: onComida)
                    InicioHeroButton(
                        title: "Checar salida",
                        systemImage: "rectangle.portrait.and.arrow.right",
                        light: false,
                        loading: vm.checkInLoading
                    ) { onMark("salida") }
                case .sinEntrada:
                    InicioHeroButton(
                        title: "Checar entrada",
                        systemImage: "rectangle.portrait.and.arrow.forward",
                        light: false,
                        loading: vm.checkInLoading,
                        enabled: puedeEntrar
                    ) { onMark("entrada") }
                case .completada:
                    InicioHeroButton(title: "Ver mi jornada", systemImage: "clock", light: true, action: onVerJornada)
                }
            }
            .padding(.top, 12)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Aro decorativo detrás del contenido (Android `drawBehind`: radio 110, trazo 28).
        .background(alignment: .bottomTrailing) {
            Circle()
                .stroke(Color.white.opacity(0.06), lineWidth: 28)
                .frame(width: 220, height: 220)
                .offset(x: 90, y: 140)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
        .background(NxBrand.heroGradient)
        .clipShape(RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous))
    }
}

/// Botón de la tarjeta de jornada (Android `HeroButton`): 52 de alto, radio 16,
/// blanco lleno (letra teal profundo) o blanco translúcido con filo.
private struct InicioHeroButton: View {
    let title: String
    let systemImage: String
    let light: Bool
    var loading: Bool = false
    var enabled: Bool = true
    let action: () -> Void

    private var activo: Bool { enabled && !loading }

    private var tinta: Color {
        if light { return activo ? Color.white : Color.white.opacity(0.6) }
        return activo ? NxColors.brandDeep : NxColors.brandDeep.opacity(0.6)
    }

    private var fondo: Color {
        if light { return activo ? Color.white.opacity(0.16) : Color.white.opacity(0.10) }
        return activo ? Color.white : Color.white.opacity(0.6)
    }

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 8) {
                if loading {
                    ProgressView()
                        .controlSize(.small)
                        .tint(NxColors.brandDeep)
                        .frame(width: 18, height: 18)
                } else {
                    Image(systemName: systemImage)
                        .font(.system(size: 17, weight: .medium))
                        .frame(width: 20, height: 20)
                        .accessibilityHidden(true)
                }
                Text(loading ? "Registrando…" : title)
                    .font(.system(size: 15, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .foregroundStyle(tinta)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: NxMetrics.primaryButtonHeight)
            .background(fondo, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
            .overlay {
                if light {
                    RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.22), lineWidth: 1)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
        }
        .buttonStyle(NxPressableStyle())
        .disabled(!activo)
    }
}

/// El único aviso de hoy (Android `AvisoCard`): fondo suave del tono, icono en una
/// baldosa de 36 y flecha si abre la actividad.
private struct InicioAvisoCard: View {
    let aviso: InicioRules.Aviso
    let onTap: () -> Void

    var body: some View {
        let tono = aviso.tono
        Button(action: onTap) {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: tono == .warning ? "pause" : "exclamationmark.triangle")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(tono.tinta)
                    .frame(width: 36, height: 36)
                    .background(NxColors.card.opacity(0.7), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    Text(aviso.titulo)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(tono.texto)
                        .lineLimit(2)
                    Text(aviso.detalle)
                        .font(.system(size: 12.5))
                        .foregroundStyle(tono.texto.opacity(0.85))
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .multilineTextAlignment(.leading)
                if aviso.activityId != nil {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(tono.texto.opacity(0.7))
                        .accessibilityHidden(true)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tono.fondo, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
        }
        .buttonStyle(NxPressableStyle())
        .disabled(aviso.activityId == nil)
        .accessibilityElement(children: .combine)
    }
}

/// La actividad de ahora (Android `ActualCard`): tipo, folio, estado, avance, la
/// acción principal grande y los botones cuadrados Pausar / Ver detalle.
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
        let encabezado = [
            CoreStatusUI.kind(item.coreKind, ticketTypeCustom: item.ticketTypeCustom),
            ActividadesTexto.limpio(item.anNumber),
        ].compactMap { $0 }.joined(separator: "  ")

        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 8) {
                Image(systemName: CoreStatusUI.kindSymbol(item.coreKind))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(kindColor)
                    .frame(width: 28, height: 28)
                    .background(kindColor.opacity(0.14), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .accessibilityHidden(true)
                Text(encabezado)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                NxChip(text: estado.label, color: estado.tono.tinta, dot: true)
            }
            Text(InicioRules.titulo(item))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(NxColors.fg)
                .lineSpacing(1.4)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
            if let lugar = InicioRules.lugar(item) {
                HStack(alignment: .center, spacing: 6) {
                    Image(systemName: "mappin")
                        .font(.system(size: 13))
                        .frame(width: 15, height: 15)
                        .accessibilityHidden(true)
                    Text(lugar)
                        .font(.system(size: 13.5))
                        .lineLimit(1)
                }
                .foregroundStyle(NxColors.muted)
            }
            if let periodo = item.periodo?.texto {
                Text(periodo)
                    .font(.system(size: 12.5))
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(1)
            }
            if let avance = InicioRules.avance(item) {
                HStack(alignment: .center, spacing: 10) {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(NxColors.sunken)
                            Capsule()
                                .fill(NxColors.brand)
                                .frame(width: geo.size.width * CGFloat(avance.total == 0 ? 0 : Double(avance.hechos) / Double(avance.total)))
                        }
                    }
                    .frame(height: 8)
                    .accessibilityHidden(true)
                    Text("\(avance.hechos)/\(avance.total)")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(NxColors.fg2)
                        .monospacedDigit()
                }
                .padding(.top, 2)
            }
            if let error {
                Text(error)
                    .font(.system(size: 12.5))
                    .foregroundStyle(NxColors.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(alignment: .center, spacing: 8) {
                Button {
                    onPrimary(accion)
                } label: {
                    HStack(alignment: .center, spacing: 8) {
                        if enCurso {
                            ProgressView()
                                .controlSize(.small)
                                .tint(Color.white)
                                .frame(width: 18, height: 18)
                        } else {
                            Image(systemName: accion.systemImage)
                                .font(.system(size: 17, weight: .medium))
                                .frame(width: 20, height: 20)
                                .accessibilityHidden(true)
                        }
                        Text(accion.label)
                            .font(.system(size: 15, weight: .bold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                    }
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 12)
                    .frame(maxWidth: .infinity, minHeight: NxMetrics.primaryButtonHeight)
                    .background(
                        enCurso ? NxColors.fg.opacity(0.12) : NxColors.brand,
                        in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                    )
                    .contentShape(RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
                }
                .buttonStyle(NxPressableStyle())
                .disabled(enCurso)
                if pausable {
                    InicioSquareButton(systemImage: "pause", label: "Pausar actividad", action: onPausar)
                }
                InicioSquareButton(systemImage: "info.circle", label: "Ver detalle", action: onDetalle)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous)
                .strokeBorder(NxColors.border, lineWidth: 1)
        )
    }
}

/// Botón cuadrado de 52, radio 16, filo #CBD5E1 e icono de 22.
private struct InicioSquareButton: View {
    let systemImage: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 19, weight: .regular))
                .foregroundStyle(NxColors.fg)
                .frame(width: NxMetrics.primaryButtonHeight, height: NxMetrics.primaryButtonHeight)
                .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                        .strokeBorder(NxColors.borderStrong, lineWidth: 1)
                )
                .contentShape(RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
        }
        .buttonStyle(NxPressableStyle())
        .accessibilityLabel(label)
    }
}

/// «Después, hoy» (Android `SiguientesCard`): las siguientes de la cola, una por renglón.
private struct InicioSiguientesCard: View {
    let items: [MyActivityItem]
    let onOpen: (MyActivityItem) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 { NxRowDivider() }
                fila(item)
            }
        }
        .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous)
                .strokeBorder(NxColors.border, lineWidth: 1)
        )
    }

    private func fila(_ item: MyActivityItem) -> some View {
        let kindColor = NxBrand.category(item.coreKind)
        return Button {
            onOpen(item)
        } label: {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .center, spacing: 0) {
                    Text(InicioRules.horaDe(item.fechaInicio) ?? "—")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                        .monospacedDigit()
                        .lineLimit(1)
                    Text(InicioRules.subHora(item))
                        .font(.system(size: 11))
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                // 58 como Android: con 48 «Esta semana» salía «Esta sem…».
                .frame(width: 58)
                Image(systemName: CoreStatusUI.kindSymbol(item.coreKind))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(kindColor)
                    .frame(width: 36, height: 36)
                    .background(kindColor.opacity(0.14), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    Text(InicioRules.titulo(item))
                        .font(.system(size: 14.5, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(2)
                    Text(InicioRules.detalleSiguiente(item))
                        .font(.system(size: 12.5))
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .multilineTextAlignment(.leading)
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.fg4)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(NxPressableStyle())
    }
}

/// «Ver todas mis actividades» (Android `VerTodasRow`).
private struct InicioVerTodasRow: View {
    let onClick: () -> Void

    var body: some View {
        Button(action: onClick) {
            Text("Ver todas mis actividades")
                .font(.system(size: 13.5, weight: .semibold))
                .foregroundStyle(NxColors.brandText)
                .padding(.horizontal, 6)
                .padding(.vertical, 8)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Inicio de dirección general (Android `EquipoCard`): no tiene cola propia; su día es el del equipo.
private struct InicioEquipoCard: View {
    let onVerEquipo: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: "person.3")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(NxColors.brandText)
                    .frame(width: 44, height: 44)
                    .background(NxColors.brandSoft, in: Circle())
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Pizarra del equipo")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                    Text("Quién está en campo, qué lleva cada persona y qué va atrasado.")
                        .font(.system(size: 13))
                        .foregroundStyle(NxColors.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if let onVerEquipo {
                NxPrimaryButton("Ver la pizarra del equipo", action: onVerEquipo)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous)
                .strokeBorder(NxColors.border, lineWidth: 1)
        )
    }
}

/// «Todo al día» (Android `TodoAlDiaCard`).
private struct InicioTodoAlDiaCard: View {
    let hechasHoy: Int
    let onVerTodas: (() -> Void)?

    private var texto: String {
        switch hechasHoy {
        case 1: return "Terminaste 1 actividad hoy. Cuando te asignen algo aparecerá aquí."
        case let n where n > 1: return "Terminaste \(n) actividades hoy. Cuando te asignen algo aparecerá aquí."
        default: return "Cuando te asignen algo aparecerá aquí."
        }
    }

    var body: some View {
        VStack(alignment: .center, spacing: 6) {
            Image(systemName: "checkmark.circle")
                .font(.system(size: 23, weight: .regular))
                .foregroundStyle(NxColors.success)
                .frame(width: 52, height: 52)
                .background(NxColors.successSoft, in: Circle())
                .accessibilityHidden(true)
            Text("Todo al día")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(NxColors.fg)
            Text(texto)
                .font(.system(size: 13))
                .foregroundStyle(NxColors.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            if let onVerTodas {
                InicioVerTodasRow(onClick: onVerTodas)
                    .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous)
                .strokeBorder(NxColors.border, lineWidth: 1)
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
