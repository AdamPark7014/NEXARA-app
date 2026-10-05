import SwiftUI
import UIKit

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

    /// Texto de la barra inferior.
    var title: String {
        switch self {
        case .inicio: return "Inicio"
        case .actividades: return "Actividades"
        case .chat: return "Chat"
        case .asistencias: return "Asistencia"
        case .mas: return "Más"
        }
    }

    /// Título de la barra teal (Android `currentTitle` de `ConsoleNavHost`).
    var barTitle: String {
        switch self {
        case .inicio: return "Inicio"
        case .actividades: return "Actividades"
        case .chat: return "Chat"
        case .asistencias: return "Asistencias"
        case .mas: return "Más"
        }
    }

    /// Icono de contorno (inactiva): Android `Icons.Outlined.*`.
    var systemImage: String {
        switch self {
        case .inicio: return "house"
        case .actividades: return "checkmark.square"
        case .chat: return "text.bubble"
        case .asistencias: return "clock"
        case .mas: return "square.grid.2x2"
        }
    }

    /// Icono relleno (activa): Android `Icons.Filled.*`.
    var selectedSystemImage: String { systemImage + ".fill" }

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

/// Shell de NEXARA Core (rediseño v2), con el cromo de Android
/// (`ConsoleNavHost`): barra superior teal con la campana en todas las pestañas
/// menos Inicio (que pinta su cabecera) y barra inferior propia de 5 destinos con
/// insignias. Después del login el personal cae en Inicio. Menú = módulos de
/// Core de `GET me/navigation` filtrados por rol (ver `CoreNavigation`).
///
/// Por dentro sigue siendo un `TabView` (cada pestaña conserva su
/// `NavigationStack` y su ciclo `onAppear`/`onDisappear`), pero con su barra
/// nativa oculta: la que se ve es `NxBottomBar`.
struct CoreShellView: View {
    @EnvironmentObject var session: SessionStore
    @ObservedObject private var deepLink = DeepLinkCoordinator.shared
    @StateObject private var inicio = InicioStore()
    @StateObject private var chrome = NxShellChrome()
    @State private var selected: CoreShellTab = .inicio
    @State private var overlay: CoreShellOverlay?
    @State private var chatChannelId: Int64?
    @State private var chatMessageId: Int64?
    @State private var chatNonce = 0
    /// Mensajes de chat sin leer (suma de `unreadCount` de los canales), para la insignia.
    @State private var chatUnread = 0
    /// Con el teclado arriba la barra inferior se esconde (no sube pegada al teclado).
    @State private var tecladoVisible = false

    private var modules: [CoreModule] { CoreNavigation.modules(for: session.currentUser) }
    /// Módulos del hub «Más» (ver `CoreNavigation.extraModules`).
    private var extraModules: [CoreExtraModule] { CoreNavigation.extraModules(for: session.currentUser) }
    private var myId: Int? { session.currentUser.flatMap { Int($0.id) } }

    private var tabs: [CoreShellTab] {
        CoreShellTab.allCases.filter { tab in tab.module.map { modules.contains($0) } ?? true }
    }

    /// Android `conBarraInferior`: fuera en el detalle de actividad (y con teclado).
    private var muestraBarraInferior: Bool {
        !chrome.barraInferiorOculta && !tecladoVisible
    }

    /// La campana de la barra teal (en cualquier pantalla del shell) abre la bandeja.
    private var abrirNotificaciones: () -> Void {
        { present(.notifications) }
    }

    var body: some View {
        VStack(spacing: 0) {
            TabView(selection: $selected) {
                ForEach(tabs, id: \.self) { tab in
                    tabRoot(tab)
                        // La barra nativa no se ve: la de Android es `NxBottomBar`.
                        .toolbar(.hidden, for: .tabBar)
                        .tag(tab)
                }
            }
            if muestraBarraInferior {
                barraInferior
            }
        }
        .background(NxColors.surface.ignoresSafeArea())
        .environment(\.nxOpenNotifications, abrirNotificaciones)
        .environment(\.nxShellChrome, chrome)
        .fullScreenCover(item: $overlay) { item in
            overlayScreen(item)
                .environment(\.nxOpenNotifications, abrirNotificaciones)
                .environment(\.nxShellChrome, chrome)
        }
        .task { await refreshNavigationIfNeeded() }
        .task { await pollUnread() }
        .onAppear {
            syncSelection()
            applyDeepLink()
        }
        .onChange(of: modules) { _, _ in syncSelection() }
        .onChange(of: deepLink.pending) { _, _ in applyDeepLink() }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            tecladoVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            tecladoVisible = false
        }
    }

    /// Barra inferior y, en modo demostración, su aviso justo encima. El aviso ya
    /// no va arriba: ahí la barra teal tiene que llegar hasta la hora sin nada
    /// en medio (si no, la hora blanca queda sobre fondo claro).
    private var barraInferior: some View {
        VStack(spacing: 0) {
            if DemoMode.isActive {
                DemoBanner()
                    .padding(.bottom, NxSpacing.xs)
            }
            NxBottomBar(
                items: tabs.map { tab in
                    NxBottomBarItem(
                        id: tab.rawValue,
                        title: tab.title,
                        systemImage: tab.systemImage,
                        selectedSystemImage: tab.selectedSystemImage,
                        badge: badgeCount(tab),
                        badgeNoun: tab == .chat ? "sin leer" : "pendientes"
                    )
                },
                selectedId: selected.rawValue,
                onSelect: { id in
                    if let tab = CoreShellTab(rawValue: id) { selected = tab }
                }
            )
        }
        .background(NxColors.surface.ignoresSafeArea(edges: .bottom))
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
            // Inicio pinta su propia cabecera (saludo, fecha y campana): sin barra teal.
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
            // `ChatView` trae su propio NavigationStack y pone su barra teal dentro.
            ChatView(initialChannelId: chatChannelId, initialMessageId: chatMessageId)
                .id(chatNonce)
        case .actividades:
            NavigationStack {
                ActividadesHomeView()
                    .nxBrandNavBar(title: CoreShellTab.actividades.barTitle)
            }
        case .asistencias:
            NavigationStack {
                AttendanceView()
                    .nxBrandNavBar(title: CoreShellTab.asistencias.barTitle)
            }
        case .mas:
            NavigationStack {
                CoreMoreHubView(
                    modules: extraModules,
                    showClientes: modules.contains(.clientes)
                )
                .nxBrandNavBar(title: CoreShellTab.mas.barTitle)
            }
        }
    }

    @ViewBuilder
    private func overlayScreen(_ item: CoreShellOverlay) -> some View {
        switch item {
        case .notifications:
            NavigationStack {
                NotificationsCenterView(onBack: { overlay = nil })
                    // En la bandeja no hace falta la campana: abrirla ya da todo por visto.
                    .nxBrandNavBar(title: "Notificaciones", showsBell: false)
            }
        case .activity(let id, let tab):
            NavigationStack {
                ActivityCoreDetailView(activityId: id, initialTab: tab)
                    .nxBrandNavBar()
                    .toolbar { closeItem }
            }
        case .person(let userId):
            NavigationStack {
                TeamMemberDetailView(userId: userId, nombre: "", isSelf: userId == myId)
                    .nxBrandNavBar()
                    .toolbar { closeItem }
            }
        case .comidas:
            NavigationStack {
                ComidasView()
                    .nxBrandNavBar(title: "Comidas")
                    .toolbar { closeItem }
            }
        case .extra(let module):
            NavigationStack {
                // Mismo destino que en el hub: un enlace o un push a Vehículos,
                // Almacén o Proyectos abre su pantalla.
                CoreExtraDestination(module: module)
                    .nxBrandNavBar(title: module.title)
                    .toolbar { closeItem }
            }
        case .viatico(let id):
            NavigationStack {
                ViaticosView(abrirId: id)
                    .nxBrandNavBar(title: CoreExtraModule.viaticos.title)
                    .toolbar { closeItem }
            }
        case .clientes(let id, let sector):
            NavigationStack {
                ClientesHomeView(initialClientId: id, initialSectorSlug: sector)
                    .nxBrandNavBar(title: CoreModule.clientes.title)
                    .toolbar { closeItem }
            }
            .environmentObject(session)
        case .perfil:
            NavigationStack {
                MyProfileView()
                    .nxBrandNavBar(title: CoreModule.perfil.title)
                    .toolbar { closeItem }
            }
            .environmentObject(session)
        }
    }

    /// Cerrar una cubierta: flecha blanca de volver, como el `ArrowBack` de
    /// Android. Se llama «Cerrar» para VoiceOver y para las pruebas de UI.
    private var closeItem: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button { overlay = nil } label: {
                Image(systemName: "chevron.backward")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Color.white)
            }
            .tint(Color.white)
            .accessibilityLabel("Cerrar")
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
        // Módulo del hub «Más»: se abre encima de la pestaña actual. Si su rol no
        // lo ve, o si la app todavía no tiene su pantalla, a casa (misma regla
        // que abajo): nunca se abre una ficha a medias.
        if let extra = link.extra {
            guard extraModules.contains(extra), CoreExtraDestination.tienePantallaNativa(extra) else {
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
            await NotificationsBadgeStore.shared.refresh()
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
