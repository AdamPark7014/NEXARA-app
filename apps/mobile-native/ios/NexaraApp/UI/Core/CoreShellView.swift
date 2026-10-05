import SwiftUI

/// Lo que se abre encima del shell desde un enlace, un push o la campana.
private enum CoreShellOverlay: Identifiable {
    case notifications
    case activity(id: Int, tab: String?)
    case person(userId: Int)
    case comidas
    /// Un módulo del hub directo (deep link o push).
    case extra(CoreExtraModule)
    /// Un viático concreto: el aviso trae su id y hay que abrir ÉSE, no la lista.
    case viatico(id: Int)
    /// Clientes dejó de ser pestaña (v2): `/erp/clientes/:id` y `?sector=` se abren encima.
    case clientes(id: Int?, sector: String?)
    /// Mi perfil dejó de ser pestaña (v2): su enlace se abre encima.
    case perfil

    var id: String {
        switch self {
        case .notifications: return "notifications"
        case .activity(let id, let tab): return "activity-\(id)-\(tab ?? "")"
        case .person(let userId): return "person-\(userId)"
        case .comidas: return "comidas"
        case .extra(let module): return "extra-\(module.rawValue)"
        case .viatico(let id): return "viatico-\(id)"
        case .clientes(let id, let sector): return "clientes-\(id ?? 0)-\(sector ?? "")"
        case .perfil: return "perfil"
        }
    }
}

/// Las 5 pestañas del rediseño v2, en este orden: Inicio · Actividades · Chat ·
/// Asistencia · Más. Inicio y Más las tiene todo el personal; las otras tres
/// solo si el rol abre ese módulo (`CoreNavigation`). Clientes y Mi perfil
/// viven en «Más» (sus enlaces no cambian).
private enum CoreShellTab: String, Hashable, CaseIterable {
    case inicio, actividades, chat, asistencias, mas

    var title: String {
        switch self {
        case .inicio: return "Inicio"
        case .actividades: return "Actividades"
        case .chat: return "Chat"
        case .asistencias: return "Asistencia"
        case .mas: return "Más"
        }
    }

    var systemImage: String {
        switch self {
        case .inicio: return "house"
        case .actividades: return "checklist"
        case .chat: return "bubble.left.and.bubble.right"
        case .asistencias: return "clock"
        case .mas: return "square.grid.2x2"
        }
    }

    /// Módulo de Core que la pestaña necesita; `nil` = la tiene todo el personal.
    var module: CoreModule? {
        switch self {
        case .actividades: return .actividades
        case .chat: return .chat
        case .asistencias: return .asistencias
        case .inicio, .mas: return nil
        }
    }
}

/// Shell de NEXARA Core (rediseño v2). Después del login el personal cae en
/// Inicio (jornada, aviso, actividad de ahora y siguientes). Menú = módulos de
/// Core de `GET me/navigation` filtrados por rol (ver `CoreNavigation`), en una
/// tab bar nativa de 5 destinos con insignias; la campana va en cada pestaña.
struct CoreShellView: View {
    @EnvironmentObject var session: SessionStore
    @ObservedObject private var deepLink = DeepLinkCoordinator.shared
    @ObservedObject private var badge = NotificationsBadgeStore.shared
    @StateObject private var inicio = InicioStore()
    @State private var selected: CoreShellTab = .inicio
    @State private var overlay: CoreShellOverlay?
    @State private var chatChannelId: Int64?
    @State private var chatMessageId: Int64?
    @State private var chatNonce = 0
    /// Mensajes de chat sin leer (suma de `unreadCount` de los canales), para la insignia.
    @State private var chatUnread = 0

    private var modules: [CoreModule] { CoreNavigation.modules(for: session.currentUser) }
    /// Módulos del hub «Más» (ver `CoreNavigation.extraModules`).
    private var extraModules: [CoreExtraModule] { CoreNavigation.extraModules(for: session.currentUser) }
    private var myId: Int? { session.currentUser.flatMap { Int($0.id) } }

    private var tabs: [CoreShellTab] {
        CoreShellTab.allCases.filter { tab in tab.module.map { modules.contains($0) } ?? true }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Modo demostración: aviso discreto arriba, con salida a un toque.
            if DemoMode.isActive {
                DemoBanner()
            }
            shell
        }
    }

    private var shell: some View {
        TabView(selection: $selected) {
            ForEach(tabs, id: \.self) { tab in
                tabRoot(tab)
                    .tabItem {
                        Label(tab.title, systemImage: tab.systemImage)
                            .accessibilityIdentifier("tab-\(tab.rawValue)")
                    }
                    .badge(badgeCount(tab))
                    .accessibilityIdentifier("tab-\(tab.rawValue)")
                    .tag(tab)
            }
        }
        .tint(NxBrand.adaptive)
        .fullScreenCover(item: $overlay) { item in
            overlayScreen(item)
        }
        .task { await refreshNavigationIfNeeded() }
        .task { await pollUnread() }
        .onAppear {
            syncSelection()
            applyDeepLink()
        }
        .onChange(of: modules) { _, _ in syncSelection() }
        .onChange(of: deepLink.pending) { _, _ in applyDeepLink() }
    }

    private func badgeCount(_ tab: CoreShellTab) -> Int {
        switch tab {
        case .actividades: return inicio.pendientes
        case .chat: return chatUnread
        default: return 0
        }
    }

    // MARK: Pestañas

    @ViewBuilder
    private func tabRoot(_ tab: CoreShellTab) -> some View {
        switch tab {
        case .inicio:
            NavigationStack {
                InicioView(
                    store: inicio,
                    tieneActividades: modules.contains(.actividades),
                    tieneAsistencia: modules.contains(.asistencias),
                    onOpenNotifications: { present(.notifications) },
                    onOpenActivity: { id, detailTab in present(.activity(id: id, tab: detailTab)) },
                    onOpenActividades: { if modules.contains(.actividades) { selected = .actividades } },
                    onOpenAsistencia: { if modules.contains(.asistencias) { selected = .asistencias } },
                    onOpenComidas: { present(.comidas) }
                )
            }
        case .chat:
            // `ChatView` trae su propio NavigationStack.
            ChatView(initialChannelId: chatChannelId, initialMessageId: chatMessageId)
                .id(chatNonce)
        case .actividades:
            NavigationStack {
                ActividadesHomeView().toolbar { bellItem }
            }
        case .asistencias:
            NavigationStack {
                AttendanceView().toolbar { bellItem }
            }
        case .mas:
            NavigationStack {
                CoreMoreHubView(
                    modules: extraModules,
                    showClientes: modules.contains(.clientes)
                )
                .toolbar { bellItem }
            }
        }
    }

    private var bellItem: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button { present(.notifications) } label: {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: "bell")
                    if badge.unreadCount > 0 {
                        Text(badge.unreadCount > 99 ? "99+" : "\(badge.unreadCount)")
                            .font(.caption2.bold())
                            .foregroundColor(.white)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Color.red, in: Capsule())
                            .offset(x: 10, y: -8)
                    }
                }
            }
            .accessibilityLabel(badge.unreadCount > 0 ? "Notificaciones, \(badge.unreadCount) sin leer" : "Notificaciones")
            .accessibilityIdentifier("bell-button")
        }
    }

    @ViewBuilder
    private func overlayScreen(_ item: CoreShellOverlay) -> some View {
        switch item {
        case .notifications:
            NavigationStack {
                NotificationsCenterView(onBack: { overlay = nil })
            }
        case .activity(let id, let tab):
            NavigationStack {
                ActivityCoreDetailView(activityId: id, initialTab: tab)
                    .toolbar { closeItem }
            }
        case .person(let userId):
            NavigationStack {
                TeamMemberDetailView(userId: userId, nombre: "", isSelf: userId == myId)
                    .toolbar { closeItem }
            }
        case .comidas:
            NavigationStack {
                ComidasView().toolbar { closeItem }
            }
        case .extra(let module):
            NavigationStack {
                // Mismo destino que en el hub: un enlace o un push a Vehículos,
                // Almacén o Proyectos abre su pantalla, no la ficha de la web.
                CoreExtraDestination(module: module).toolbar { closeItem }
            }
        case .viatico(let id):
            NavigationStack {
                ViaticosView(abrirId: id).toolbar { closeItem }
            }
        case .clientes(let id, let sector):
            NavigationStack {
                ClientesHomeView(initialClientId: id, initialSectorSlug: sector)
                    .toolbar { closeItem }
            }
            .environmentObject(session)
        case .perfil:
            NavigationStack {
                MyProfileView().toolbar { closeItem }
            }
            .environmentObject(session)
        }
    }

    private var closeItem: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button("Cerrar") { overlay = nil }
        }
    }

    // MARK: Navegación

    private func syncSelection() {
        if !tabs.contains(selected) {
            selected = .inicio
        }
    }

    /// Cambiar de cubierta en el mismo instante no la presenta: se cierra la
    /// actual y la nueva entra un momento después.
    private func present(_ next: CoreShellOverlay) {
        guard overlay != nil else {
            overlay = next
            return
        }
        overlay = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
            overlay = next
        }
    }

    @MainActor
    private func applyDeepLink() {
        guard let destination = deepLink.consumeCore() else { return }
        switch destination {
        case .notifications:
            present(.notifications)
        case .portal:
            selected = .inicio
        case .core(let link):
            open(link)
        }
    }

    private func open(_ link: CoreLink) {
        // Módulo del hub «Más»: se abre encima de la pestaña actual; si su rol
        // no lo ve, a casa (misma regla que abajo).
        if let extra = link.extra {
            guard extraModules.contains(extra) else {
                selected = .inicio
                return
            }
            // El aviso de un viático trae su id: abre ESE viático, no la lista.
            // Es la diferencia entre «te autorizaron algo» y saber qué.
            if extra == .viaticos, let id = link.entityId, id > 0 {
                present(.viatico(id: Int(id)))
            } else {
                present(.extra(extra))
            }
            return
        }
        // Módulo que su rol no ve: a casa, como `coreSurfaceRedirect`.
        guard modules.contains(link.module) else {
            selected = .inicio
            return
        }
        switch link.module {
        case .actividades:
            selected = .actividades
            if let vista = link.vista, vista == "mias" || vista == "equipo" {
                UserDefaults.standard.set(vista, forKey: coreActividadesVistaKey)
            }
            if let activityId = link.activityId {
                present(.activity(id: activityId, tab: link.tab))
            } else if let userId = link.boardUserId {
                present(.person(userId: userId))
            }
        case .asistencias:
            selected = .asistencias
            if link.tab == "comidas" {
                present(.comidas)
            }
        case .chat:
            selected = .chat
            chatChannelId = link.chatChannelId
            chatMessageId = link.chatMessageId
            chatNonce += 1
        case .clientes:
            // `/erp/clientes/:id` y `?sector=` abren la ficha o la pestaña.
            present(.clientes(id: link.entityId.map { Int($0) }, sector: link.vista))
        case .perfil:
            present(.perfil)
        }
    }

    // MARK: Datos

    /// `GET me/navigation` define el menú; se pide si la sesión aún no lo trae. También si le
    /// faltan las rutas (`navPaths`): las sesiones abiertas antes de guardarlas solo tenían claves
    /// y, sin rutas, dirección se quedaba sin Chat ni Asistencia hasta volver a entrar.
    @MainActor
    private func refreshNavigationIfNeeded() async {
        guard let user = session.currentUser,
              user.navModules == nil || (user.navPaths == nil && !DemoMode.isActive)
        else { return }
        var enriched = await AuthRepository.shared.enrichSession(user)
        if enriched != user, let now = SessionStore.shared.currentUser, now.id == user.id {
            // El token pudo renovarse mientras tanto: se guarda el vigente.
            enriched.token = now.token
            enriched.expiresAt = now.expiresAt
            SessionStore.shared.save(enriched)
        }
    }

    /// Como la web: el contador de no leídas se refresca cada 45 s. Con él se
    /// releen las insignias de Actividades (lo pendiente) y de Chat (sin leer).
    @MainActor
    private func pollUnread() async {
        while !Task.isCancelled {
            await badge.refresh()
            if modules.contains(.actividades) {
                await inicio.load(enabled: true)
            }
            if modules.contains(.chat), let canales = try? await ChatRepository.shared.listChannels() {
                chatUnread = canales.reduce(0) { $0 + max(0, ConsoleHelpers.mapInt($1, "unreadCount")) }
            }
            try? await Task.sleep(nanoseconds: 45_000_000_000)
        }
    }
}
