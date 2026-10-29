import SwiftUI

/// Inicio, «Mi día» (canvas «App · Mi día», 28-10): la primera pestaña.
/// Espejo de `InicioScreen.kt` de Android (commit ace68045).
///
/// De arriba abajo: la fecha, «Mi día» y la campana; la tarjeta blanca de la jornada con su
/// único botón; el único aviso que importa hoy; la actividad de ahora en la banda oscura con
/// el reloj, el plan y la hora compromiso; y «Lo que sigue hoy». Todo sale de lo que la app ya
/// consulta: `me/activities`, `attendance/current` y las checadas de hoy. Inicio no tiene
/// barra superior: trae su propia cabecera.
struct InicioView: View {
    @ObservedObject var store: InicioStore
    let tieneActividades: Bool
    let tieneAsistencia: Bool
    let onOpenNotifications: () -> Void
    let onOpenActivity: (Int, String?) -> Void
    let onOpenActividades: () -> Void
    let onOpenAsistencia: () -> Void
    let onOpenComidas: () -> Void
    /// Dirección general: a dónde lleva cada renglón de su tablero. nil = el rol no abre ese
    /// módulo y el renglón cae a la pizarra (`onOpenActividades`).
    var onOpenAprobaciones: (() -> Void)? = nil
    var onOpenPagos: (() -> Void)? = nil
    var onOpenDesempeno: (() -> Void)? = nil
    var onOpenPersona: (Int) -> Void = { _ in }

    @ObservedObject private var session = SessionStore.shared
    @ObservedObject private var badge = NotificationsBadgeStore.shared
    @StateObject private var attendance = AttendanceVM()
    @Environment(\.scenePhase) private var scenePhase
    @State private var photoType: String?
    /// Checada que espera a que se resuelva el aviso de ubicación (permiso o ubicación apagada).
    @State private var tipoPendiente: String?
    @State private var avisoUbicacion: AvisoUbicacionChecada?
    @State private var pausando: MyActivityItem?

    private var myId: Int? { session.currentUser.flatMap { Int($0.id) } }
    private var muestraJornada: Bool { tieneAsistencia && attendance.canRegisterSelf }
    /// Dirección general (Christian y su equivalente): el API no le da «Mis actividades»
    /// (403 «no aplica a dirección general»), así que Inicio le enseña el tablero del equipo
    /// (`InicioCeoContenido`, canvas «App · Inicio CEO»).
    /// En modo demo `CoreOrg.isCeo` es verdadero para la persona ficticia: ahí sí hay cola propia.
    /// En demo, solo con `NEXARA_DEMO_CEO=1` (captura de paridad del tablero de dirección).
    private var esDireccion: Bool {
        DemoMode.isActive ? DemoMode.inicioDireccion : CoreOrg.isCeo(session.currentUser?.email)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                InicioHeader(
                    titulo: esDireccion ? "Tu equipo hoy" : "Mi día",
                    unread: badge.unreadCount,
                    onOpenNotifications: onOpenNotifications
                )
                // Festivo (mockup aprobado el 29-10): si descansa, la banda sustituye a la jornada (ese
                // día no se checa); si le toca, la tarjeta del horario lleva el botón de entrada.
                let festivo = FestivoRules.estado(store.festivos, hoyMexico: AttendanceClock.today())
                if festivo == .descansa, let festivos = store.festivos {
                    FestivoDescansaContenido(festivos: festivos)
                } else if muestraJornada {
                    InicioJornadaCard(
                        vm: attendance,
                        festivo: festivo == .labora ? store.festivos?.festivoHoy : nil,
                        onMark: { marcar($0) },
                        onComida: onOpenComidas,
                        onVerJornada: onOpenAsistencia
                    )
                } else if festivo == .labora, let hoy = store.festivos?.festivoHoy {
                    FestivoLaboraTarjeta(festivo: hoy, onEntrada: nil)
                }
                if let aviso = InicioRules.aviso(store.open, miId: myId) {
                    InicioAvisoCard(aviso: aviso) {
                        if let id = aviso.activityId { onOpenActivity(id, nil) }
                    }
                }
                actividades
            }
            .padding(.horizontal, NxSpacing.screenH)
            .padding(.bottom, NxSpacing.xl)
        }
        .background(NxColors.surface.ignoresSafeArea())
        // Franja del color del fondo detrás de la barra de estado: al desplazar, la banda oscura
        // pasaba por debajo de la hora (en negro) y no se leía.
        .overlay(alignment: .top) {
            NxColors.surface
                .ignoresSafeArea(edges: .top)
                .frame(height: 0)
        }
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await reload() }
        .task { await reload() }
        .onChange(of: scenePhase) { _, phase in
            // Al volver a la app se relee todo, sin esperar al siguiente tic.
            if phase == .active { Task { await reload() } }
        }
        .refreshOnModels(["Activity", "ActivityEvidence", "ServiceSheet"]) {
            // Los festivos cambian poco: un aviso en vivo los vuelve a pedir a lo más cada 10 min.
            await store.cargarFestivos(enVivo: true)
            if esDireccion {
                // El tablero de dirección son cinco consultas: los avisos en vivo lo espacian 30 s.
                await store.cargarCeo(enVivo: true)
            } else {
                await store.load(enabled: tieneActividades)
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
                    let failure = await attendance.checkIn(type, photo: captured)
                    if failure == nil { photoType = nil }
                    return failure
                },
                onCancel: { photoType = nil }
            )
        }
        .avisoUbicacionChecada($avisoUbicacion) {
            let tipo = tipoPendiente
            tipoPendiente = nil
            photoType = tipo
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

    /// Antes de la foto de la checada: permiso y ubicación encendida (ver `AvisoUbicacionChecada`).
    private func marcar(_ tipo: String) {
        Task { @MainActor in
            if let aviso = await AvisoUbicacionChecada.revisar() {
                tipoPendiente = tipo
                avisoUbicacion = aviso
            } else {
                photoType = tipo
            }
        }
    }

    // MARK: Actividades

    @ViewBuilder
    private var actividades: some View {
        if esDireccion {
            // Canvas «App · Inicio CEO» (29-10): lo que ve en la web, con los mismos endpoints.
            if let ceo = store.ceo, store.ceoError == nil, InicioCeoRules.hayAlgo(ceo) {
                InicioCeoContenido(
                    ceo: ceo,
                    onPizarra: onOpenActividades,
                    onPendiente: { abrirPendiente($0) },
                    onDesempeno: onOpenDesempeno ?? onOpenActividades,
                    onPersona: onOpenPersona
                )
            } else if store.ceo == nil && store.ceoCargando {
                NxSkeletonList(itemCount: 3, itemHeight: 120)
            } else {
                // Todo falló (o no hay nada que contar): el aviso y la tarjeta de la pizarra.
                if let error = store.ceoError {
                    NxRefreshErrorBanner(message: error, onRetry: { Task { await store.cargarCeo() } })
                }
                InicioEquipoCard(onVerEquipo: tieneActividades ? Optional(onOpenActividades) : nil)
            }
        } else if tieneActividades {
            if store.loading && store.data == nil {
                NxSkeletonList(itemCount: 2, itemHeight: 132)
            } else if let error = store.error, store.open.isEmpty {
                NxRefreshErrorBanner(message: error, onRetry: { Task { await store.load(enabled: true) } })
            } else if let actual = store.actual {
                // Sin rótulo «Ahora»: la banda oscura ya dice qué es.
                InicioActualCard(
                    item: actual,
                    cargado: store.cargadoEn,
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
                    InicioSectionTitle(title: "Lo que sigue hoy", action: "Ver todas", onAction: onOpenActividades)
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
        // Los festivos van aparte, a la par de lo demás: si la API aún no los tiene, no retrasan nada.
        let tienda = store
        let festivos = Task { await tienda.cargarFestivos() }
        await store.load(enabled: tieneActividades && !esDireccion)
        if esDireccion {
            await store.cargarCeo()
        }
        if tieneAsistencia {
            await attendance.loadMine()
            await ShiftGpsTracker.shared.resumeIfNeeded()
        }
        await festivos.value
    }

    /// Un renglón de «Requiere tu atención» de dirección: aprobaciones y pagos abren su pantalla
    /// si el rol la tiene; lo demás (y lo que el rol no abre), la pizarra.
    private func abrirPendiente(_ clave: String) {
        switch clave {
        case InicioCeoRules.claveAprobaciones: (onOpenAprobaciones ?? onOpenActividades)()
        case InicioCeoRules.clavePagos: (onOpenPagos ?? onOpenActividades)()
        default: onOpenActividades()
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

/// Cabecera de «Mi día» (Android `InicioHeader`): fecha 13 gris, «Mi día» en Inter Tight 28
/// negrita y la campana blanca de 44 que flota, con un punto de marca si hay avisos sin leer.
/// Dirección general lee «Tu equipo hoy».
private struct InicioHeader: View {
    var titulo: String = "Mi día"
    let unread: Int
    let onOpenNotifications: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(InicioRules.fechaLarga(Date()))
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(1)
                Text(titulo)
                    .font(NxFont.display(size: 28))
                    .tracking(-0.5)
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(1)
                    .accessibilityAddTraits(.isHeader)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: onOpenNotifications) {
                Image(systemName: "bell")
                    .font(.system(size: 19, weight: .regular))
                    .foregroundStyle(NxColors.fg)
                    .frame(width: 44, height: 44)
                    .background {
                        Circle()
                            .fill(NxColors.card)
                            .nxFlotante()
                    }
                    .overlay(alignment: .topTrailing) {
                        if unread > 0 {
                            Circle()
                                .fill(NxColors.brand)
                                .frame(width: 8, height: 8)
                                .padding(.top, 9)
                                .padding(.trailing, 10)
                        }
                    }
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(unread > 0 ? "Notificaciones, \(unread) sin leer" : "Notificaciones")
            .accessibilityIdentifier("bell-button")
        }
        .padding(.top, 16)
        .padding(.bottom, 4)
        .padding(.leading, 4)
    }
}

/// Título de sección (Android `SectionTitle`): 15 SemiBold y una acción 13,5 SemiBold de marca.
private struct InicioSectionTitle: View {
    let title: String
    var action: String? = nil
    var onAction: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            Text(title)
                .font(.system(size: 15, weight: .semibold))
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

/// Tarjeta blanca compacta de la jornada (Android `JornadaHero` + `JornadaTarjeta`): el estado
/// y su único botón, y la fila de comida mientras la jornada está abierta. La checada es la
/// misma de Asistencias (foto + GPS + aviso de rechazo) a través de `AttendanceVM`.
private struct InicioJornadaCard: View {
    @ObservedObject var vm: AttendanceVM
    @ObservedObject private var tracker = ShiftGpsTracker.shared
    /// Festivo que le toca laborar (Android `JornadaHero(festivo=…)`): su horario arriba y, sin
    /// entrada, su botón «Checar entrada» sustituye a esta tarjeta hasta que la hay.
    var festivo: Festivo? = nil
    let onMark: (String) -> Void
    let onComida: () -> Void
    let onVerJornada: () -> Void

    /// El API contesta 400 a la segunda entrada del día: aquí se apaga antes.
    private var puedeEntrar: Bool { !vm.hasEntryToday && !vm.isOpen }
    private var jornada: InicioRules.Jornada {
        InicioRules.jornada(abierta: vm.isOpen, hayEntrada: vm.hasEntryToday, haySalida: vm.hasExitToday)
    }

    /// «Checar entrada» del festivo: la misma checada que el botón «Entrada» de abajo (aviso de
    /// ubicación, foto y GPS). nil = ya hay entrada o jornada abierta: sin botón.
    private var entradaFestivo: (() -> Void)? {
        guard puedeEntrar else { return nil }
        return { onMark("entrada") }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let festivo {
                FestivoLaboraTarjeta(
                    festivo: festivo,
                    onEntrada: entradaFestivo,
                    loading: vm.checkInLoading
                )
            }
            if festivo == nil || jornada != .sinEntrada {
                // La cifra se refresca cada 30 s mientras la jornada está abierta.
                TimelineView(.periodic(from: .now, by: 30)) { context in
                    tarjeta(now: context.date)
                }
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
        let titulo: String
        let detalle: String
        switch jornada {
        case .enJornada:
            let trabajado = AttendanceClock.elapsed(from: inicioIso, to: nil, now: now)
            titulo = "Entraste a las \(ActividadesTexto.hora(inicioIso))"
            detalle = "\(InicioRules.horasMinutos(trabajado)) h trabajadas · " + (tracker.isTracking ? "GPS activo" : "GPS apagado")
        case .completada:
            let trabajado = AttendanceClock.elapsed(from: inicioIso, to: salidaIso, now: now)
            titulo = "Jornada completada · \(ActividadesTexto.hora(inicioIso)) – \(ActividadesTexto.hora(salidaIso))"
            detalle = "\(InicioRules.horasMinutos(trabajado)) h trabajadas · Entrada y salida registradas hoy"
        case .sinEntrada:
            titulo = "Sin entrada registrada"
            detalle = "Se toma una foto y tu ubicación al checar"
        }
        // El API contesta 400 a la segunda entrada del día: aquí se apaga antes.
        let puedeEntrar = !hayEntrada && !abierta
        let sinEntrada = jornada == .sinEntrada

        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: sinEntrada ? "clock" : "checkmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(sinEntrada ? NxColors.fg2 : NxColors.success)
                    .frame(width: 36, height: 36)
                    .background(sinEntrada ? NxColors.sunken : NxColors.successSoft, in: Circle())
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    Text(titulo)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(2)
                    Text(detalle)
                        .font(.system(size: 13))
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                switch jornada {
                case .sinEntrada:
                    InicioJornadaBoton(
                        title: "Entrada",
                        systemImage: "rectangle.portrait.and.arrow.forward",
                        primario: true,
                        loading: vm.checkInLoading,
                        enabled: puedeEntrar
                    ) { onMark("entrada") }
                case .enJornada:
                    InicioJornadaBoton(
                        title: "Salida",
                        systemImage: "rectangle.portrait.and.arrow.right",
                        primario: false,
                        loading: vm.checkInLoading
                    ) { onMark("salida") }
                case .completada:
                    InicioJornadaBoton(title: "Ver", systemImage: "clock", primario: false, action: onVerJornada)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            if jornada == .enJornada {
                NxRowDivider()
                Button(action: onComida) {
                    HStack(alignment: .center, spacing: 12) {
                        Image(systemName: "fork.knife")
                            .font(.system(size: 15, weight: .regular))
                            .foregroundStyle(NxColors.fg2)
                            .frame(width: 18, height: 18)
                            .accessibilityHidden(true)
                        Text("Comida")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(NxColors.fg)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(NxColors.fg4)
                            .accessibilityHidden(true)
                    }
                    .padding(.horizontal, 16)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .contentShape(Rectangle())
                }
                .buttonStyle(NxPressableStyle())
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        // Radio 20, sin borde, con la sombra flotante.
        .nxCardSurface(radius: NxRadius.l)
    }
}

/// Botón de la tarjeta de jornada (Android `JornadaBoton`): 44 de alto, radio 12; «Entrada»
/// verde lleno, «Salida» y «Ver» de contorno.
private struct InicioJornadaBoton: View {
    let title: String
    let systemImage: String
    let primario: Bool
    var loading: Bool = false
    var enabled: Bool = true
    let action: () -> Void

    private var activo: Bool { enabled && !loading }

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 6) {
                if loading {
                    ProgressView()
                        .controlSize(.small)
                        .tint(primario ? Color.white : NxColors.brand)
                        .frame(width: 16, height: 16)
                } else {
                    Image(systemName: systemImage)
                        .font(.system(size: 15, weight: .medium))
                        .frame(width: 18, height: 18)
                        .accessibilityHidden(true)
                }
                Text(loading ? "…" : title)
                    .font(.system(size: 14, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(primario ? Color.white : NxColors.fg)
            .padding(.horizontal, 14)
            .frame(minHeight: NxMetrics.minTap)
            .background {
                if primario {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(NxColors.brand)
                } else {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(NxColors.card)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .strokeBorder(NxColors.border, lineWidth: 1)
                        )
                }
            }
            .opacity(activo ? 1 : 0.6)
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(NxPressableStyle())
        .disabled(!activo)
        .fixedSize()
        .accessibilityLabel(loading ? "Registrando" : title)
    }
}

/// El único aviso de hoy (Android `AvisoCard`): fondo suave del tono, radio 16, icono en
/// una baldosa de 36 y flecha si abre la actividad.
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
            .background(tono.fondo, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(NxPressableStyle())
        .disabled(aviso.activityId == nil)
        .accessibilityElement(children: .combine)
    }
}

/// La actividad de ahora en la banda oscura con resplandor (Android `ActualCard`, canvas «App ·
/// Mi día»): estado y folio, el semáforo, título, lugar, el reloj grande, plan y hora
/// compromiso, el avance contra el plan, y dos botones: pausar (o ver el detalle) y la acción
/// principal.
private struct InicioActualCard: View {
    let item: MyActivityItem
    /// Cuándo llegó `item` (`InicioStore.cargadoEn`): base del reloj que corre en el teléfono.
    let cargado: Date
    let enCurso: Bool
    let error: String?
    let onPrimary: (InicioRules.Accion) -> Void
    let onPausar: () -> Void
    let onDetalle: () -> Void

    private static let radio: CGFloat = 26
    private static let fondo = NxColors.rgb(0x0D0F12)
    /// Texto secundario sobre la banda (#C9CED8).
    private static let tenue = NxColors.rgb(0xC9CED8)

    var body: some View {
        if item.enCurso == true {
            // El reloj corre cada segundo mientras la actividad está en curso.
            TimelineView(.periodic(from: .now, by: 1)) { context in
                banda(ahora: context.date)
            }
        } else {
            banda(ahora: cargado)
        }
    }

    private func banda(ahora: Date) -> some View {
        let accion = InicioRules.accion(item)
        let pausable = item.despachador != true && item.sesion.puedePausar(estatus: item.estatus)
        let segundos = InicioRules.segundosTrabajados(item, cargado: cargado, ahora: ahora)
        let avance = InicioRules.avancePlan(item, segundos: segundos)
        let pie = InicioRules.pieBanda(item) ?? (segundos == nil ? "Programada para hoy" : nil)
        let lugar = [InicioRules.lugar(item), item.periodo?.texto].compactMap { $0 }.joined(separator: " · ")
        let forma = RoundedRectangle(cornerRadius: Self.radio, style: .continuous)

        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 8) {
                Text(InicioRules.etiquetaBanda(item).uppercased())
                    .font(.system(size: 12, weight: .semibold))
                    .tracking(0.5)
                    .foregroundStyle(NxColors.rgb(0xB9BFCC))
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                // El estado ya va en la etiqueta: la pastilla dice cómo va contra el límite.
                if let pastilla = InicioRules.pastillaBanda(item) {
                    Text(pastilla)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .lineLimit(1)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 3)
                        .background(Color.white.opacity(0.12), in: Capsule())
                }
            }
            Button(action: onDetalle) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(InicioRules.titulo(item))
                        .font(NxFont.display(size: 21))
                        .foregroundStyle(Color.white)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                    if !lugar.isEmpty {
                        Text(lugar)
                            .font(.system(size: 14))
                            .foregroundStyle(Self.tenue)
                            .lineLimit(2)
                    }
                }
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(NxPressableStyle())
            VStack(alignment: .leading, spacing: 2) {
                Text(segundos.map { InicioRules.reloj($0) } ?? (InicioRules.horaDe(item.fechaInicio) ?? "—"))
                    .font(NxFont.display(size: 40))
                    .monospacedDigit()
                    .tracking(-0.8)
                    .foregroundStyle(Color.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .accessibilityLabel(segundos.map { "Tiempo trabajado \(InicioRules.reloj($0))" } ?? "Programada")
                if let pie {
                    Text(pie)
                        .font(.system(size: 13))
                        .foregroundStyle(Self.tenue)
                        .lineLimit(2)
                }
            }
            if let avance {
                InicioBandaAvance(avance: avance, excedida: item.excedida == true)
            }
            if let error {
                Text(error)
                    .font(.system(size: 12.5))
                    .foregroundStyle(NxColors.rgb(0xFFB4B4))
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(alignment: .center, spacing: 10) {
                InicioBandaBoton(
                    title: pausable ? "Pausar" : "Detalle",
                    systemImage: pausable ? "pause.fill" : "info.circle",
                    claro: false,
                    action: pausable ? onPausar : onDetalle
                )
                InicioBandaBoton(
                    title: InicioRules.etiquetaCorta(accion),
                    systemImage: accion.systemImage,
                    claro: true,
                    loading: enCurso
                ) { onPrimary(accion) }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background { InicioBandaResplandor(fondo: Self.fondo) }
        .clipShape(forma)
        // La sombra va fuera del recorte (si no, la corta la forma).
        .background {
            forma
                .fill(Self.fondo)
                .shadow(color: NxColors.rgb(0x0D0F12, alpha: 0.35), radius: 18, x: 0, y: 12)
        }
    }
}

/// Fondo casi negro de la banda con su aurora (Android `dibujarResplandor`): verde arriba a la
/// derecha, azul abajo a la izquierda y magenta abajo, al centro.
private struct InicioBandaResplandor: View {
    let fondo: Color

    var body: some View {
        GeometryReader { geo in
            let ancho = geo.size.width
            ZStack {
                fondo
                RadialGradient(
                    colors: [NxColors.rgb(0x10A183, alpha: 0.55), NxColors.rgb(0x10A183, alpha: 0)],
                    center: .topTrailing,
                    startRadius: 0,
                    endRadius: ancho * 0.85
                )
                RadialGradient(
                    colors: [NxColors.rgb(0x0060F0, alpha: 0.45), NxColors.rgb(0x0060F0, alpha: 0)],
                    center: UnitPoint(x: 0, y: 1.2),
                    startRadius: 0,
                    endRadius: ancho * 0.75
                )
                RadialGradient(
                    colors: [NxColors.rgb(0xA85299, alpha: 0.32), NxColors.rgb(0xA85299, alpha: 0)],
                    center: UnitPoint(x: 0.6, y: 1.3),
                    startRadius: 0,
                    endRadius: ancho * 0.55
                )
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Barra de 6 del reloj contra el plan: degradado #6EC5D8 → #10A183, o naranja si ya se pasó.
private struct InicioBandaAvance: View {
    let avance: Double
    let excedida: Bool

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.14))
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: excedida
                                ? [NxColors.rgb(0xF5B14C), NxColors.rgb(0xF08A1E)]
                                : [NxColors.rgb(0x6EC5D8), NxColors.rgb(0x10A183)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: geo.size.width * CGFloat(min(max(avance, 0), 1)))
            }
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }
}

/// Botón de 48 de la banda (Android `BandaBoton`): contorno blanco translúcido, o blanco lleno
/// con letra oscura para la acción principal.
private struct InicioBandaBoton: View {
    let title: String
    let systemImage: String
    let claro: Bool
    var loading: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 8) {
                if loading {
                    ProgressView()
                        .controlSize(.small)
                        .tint(NxColors.fg)
                        .frame(width: 18, height: 18)
                } else {
                    Image(systemName: systemImage)
                        .font(.system(size: 16, weight: .semibold))
                        .frame(width: 19, height: 19)
                        .accessibilityHidden(true)
                }
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .foregroundStyle(claro ? NxColors.fg : Color.white)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background {
                if claro {
                    RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                        .fill(Color.white.opacity(loading ? 0.7 : 1))
                } else {
                    RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.28), lineWidth: 1)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
        }
        .buttonStyle(NxPressableStyle())
        .disabled(loading)
    }
}

/// «Lo que sigue hoy» (Android `SiguientesCard`): tarjeta blanca de radio 22 con la sombra
/// flotante; cada fila con la hora (13 SemiBold gris, tabular), el título y el detalle en un
/// renglón («Biblioteca Central · 45 min»).
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
        .nxCardSurface(radius: 22)
    }

    private func fila(_ item: MyActivityItem) -> some View {
        Button {
            onOpen(item)
        } label: {
            HStack(alignment: .center, spacing: 12) {
                Text(InicioRules.horaFila(item))
                    .font(.system(size: 13, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .frame(width: 48, alignment: .leading)
                VStack(alignment: .leading, spacing: 2) {
                    Text(InicioRules.titulo(item))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(2)
                    Text(InicioRules.detalleSiguiente(item).replacingOccurrences(of: "\n", with: " · "))
                        .font(.system(size: 13))
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
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
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
        // Sin borde: la sombra flotante la separa del fondo.
        .nxCardSurface(radius: 22)
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
        // Sin borde: la sombra flotante la separa del fondo.
        .nxCardSurface(radius: 22)
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
