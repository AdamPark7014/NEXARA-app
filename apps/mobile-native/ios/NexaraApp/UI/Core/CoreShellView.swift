import SwiftUI

/// Lo que se abre encima del shell desde un enlace, un push o la campana.
private enum CoreShellOverlay: Identifiable {
    case notifications
    case activity(id: Int, tab: String?)
    case person(userId: Int)
    case comidas
    /// Hub «Más»: los módulos de Core que no son pestaña.
    case more
    /// Un módulo del hub directo (deep link o push).
    case extra(CoreExtraModule)

    var id: String {
        switch self {
        case .notifications: return "notifications"
        case .activity(let id, let tab): return "activity-\(id)-\(tab ?? "")"
        case .person(let userId): return "person-\(userId)"
        case .comidas: return "comidas"
        case .more: return "more"
        case .extra(let module): return "extra-\(module.rawValue)"
        }
    }
}

/// Shell de NEXARA Core. Después del login el personal cae directo en
/// Actividades (`/erp/pizarra`). Menú = módulos de Core de `GET me/navigation`
/// filtrados por rol (ver `CoreNavigation`), más la campana de notificaciones.
struct CoreShellView: View {
    @EnvironmentObject var session: SessionStore
    @ObservedObject private var deepLink = DeepLinkCoordinator.shared
    @ObservedObject private var badge = NotificationsBadgeStore.shared
    @State private var selected: CoreModule = .actividades
    @State private var overlay: CoreShellOverlay?
    @State private var chatChannelId: Int64?
    @State private var chatMessageId: Int64?
    @State private var chatNonce = 0
    @State private var clientesLinkId: Int?
    @State private var clientesSectorSlug: String?
    @State private var clientesNonce = 0

    private var modules: [CoreModule] { CoreNavigation.modules(for: session.currentUser) }
    /// Módulos del hub «Más» (ver `CoreNavigation.extraModules`).
    private var extraModules: [CoreExtraModule] { CoreNavigation.extraModules(for: session.currentUser) }
    private var myId: Int? { session.currentUser.flatMap { Int($0.id) } }

    var body: some View {
        TabView(selection: $selected) {
            ForEach(modules) { module in
                tabRoot(module)
                    .tabItem { Label(module.title, systemImage: module.systemImage) }
                    .tag(module)
            }
        }
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

    // MARK: Pestañas

    @ViewBuilder
    private func tabRoot(_ module: CoreModule) -> some View {
        switch module {
        case .chat:
            // `ChatView` trae su propio NavigationStack.
            ChatView(initialChannelId: chatChannelId, initialMessageId: chatMessageId)
                .id(chatNonce)
        case .actividades:
            NavigationStack {
                ActividadesHomeView().toolbar {
                    bellItem
                    moreItem
                }
            }
        case .asistencias:
            NavigationStack {
                AttendanceView().toolbar {
                    bellItem
                    moreItem
                }
            }
        case .clientes:
            NavigationStack {
                ClientesHomeView(
                    initialClientId: clientesLinkId,
                    initialSectorSlug: clientesSectorSlug
                )
                .toolbar {
                    bellItem
                    moreItem
                }
                .id(clientesNonce)
            }
        case .perfil:
            NavigationStack {
                MyProfileView().toolbar {
                    bellItem
                    moreItem
                }
            }
        }
    }

    /// «Más»: Cotizaciones, Almacén, Vehículos… Solo si el rol ve alguno.
    private var moreItem: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            if !extraModules.isEmpty {
                Button { present(.more) } label: {
                    Label("Más", systemImage: "square.grid.2x2")
                }
                .accessibilityLabel("Más módulos")
            }
        }
    }

    private var bellItem: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
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
        case .more:
            NavigationStack {
                CoreMoreHubView(modules: extraModules).toolbar { closeItem }
            }
        case .extra(let module):
            NavigationStack {
                CoreModulePlaceholderView(module: module).toolbar { closeItem }
            }
        }
    }

    private var closeItem: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button("Cerrar") { overlay = nil }
        }
    }

    // MARK: Navegación

    private func syncSelection() {
        if !modules.contains(selected) {
            selected = modules.first ?? .actividades
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
            selected = .actividades
        case .core(let link):
            open(link)
        }
    }

    private func open(_ link: CoreLink) {
        // Módulo del hub «Más»: se abre encima de la pestaña actual; si su rol
        // no lo ve, a casa (misma regla que abajo).
        if let extra = link.extra {
            if extraModules.contains(extra) {
                present(.extra(extra))
            } else {
                selected = .actividades
            }
            return
        }
        // Módulo que su rol no ve: a casa, como `coreSurfaceRedirect`.
        guard modules.contains(link.module) else {
            selected = .actividades
            return
        }
        selected = link.module
        switch link.module {
        case .actividades:
            if let vista = link.vista, vista == "mias" || vista == "equipo" {
                UserDefaults.standard.set(vista, forKey: coreActividadesVistaKey)
            }
            if let activityId = link.activityId {
                present(.activity(id: activityId, tab: link.tab))
            } else if let userId = link.boardUserId {
                present(.person(userId: userId))
            }
        case .asistencias:
            if link.tab == "comidas" {
                present(.comidas)
            }
        case .chat:
            chatChannelId = link.chatChannelId
            chatMessageId = link.chatMessageId
            chatNonce += 1
        case .clientes:
            // `/erp/clientes/:id` y `?sector=` abren la ficha o la pestaña.
            clientesLinkId = link.entityId.map { Int($0) }
            clientesSectorSlug = link.vista
            clientesNonce += 1
        case .perfil:
            break
        }
    }

    // MARK: Datos

    /// `GET me/navigation` define el menú; se pide si la sesión aún no lo trae.
    @MainActor
    private func refreshNavigationIfNeeded() async {
        guard let user = session.currentUser, user.navModules == nil else { return }
        var enriched = await AuthRepository.shared.enrichSession(user)
        if enriched != user, let now = SessionStore.shared.currentUser, now.id == user.id {
            // El token pudo renovarse mientras tanto: se guarda el vigente.
            enriched.token = now.token
            enriched.expiresAt = now.expiresAt
            SessionStore.shared.save(enriched)
        }
    }

    /// Como la web: el contador de no leídas se refresca cada 45 s.
    private func pollUnread() async {
        while !Task.isCancelled {
            await badge.refresh()
            try? await Task.sleep(nanoseconds: 45_000_000_000)
        }
    }
}
