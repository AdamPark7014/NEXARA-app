import SwiftUI

@main
struct NexaraApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var session = SessionStore.shared
    @StateObject private var appState = AppState()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            AppLockGate {
                RootView()
                    .environmentObject(session)
                    .environmentObject(appState)
            }
            .environmentObject(session)
            .onOpenURL { url in
                DeepLinkCoordinator.shared.ingest(url)
                applyPendingDeepLink()
            }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active, session.currentUser != nil else { return }
                Task { await AuthRepository.shared.maybeExtendSession() }
            }
        }
    }

    private func applyPendingDeepLink() {
        guard session.currentUser != nil else { return }
        let dl = DeepLinkCoordinator.shared
        if dl.consumeNotifications() {
            appState.route = .notifications
            return
        }
        if case .module(let panel, _, _, _) = dl.pending {
            appState.route = .portal(panel == .ops ? .erp : panel)
        }
    }
}

/// Ruta de navegación a nivel raíz.
final class AppState: ObservableObject {
    enum Route: Equatable { case login, panels, portal(PanelId), notifications }
    @Published var route: Route

    init() {
        if let single = PanelAccessResolver.singlePanelRoute(user: SessionStore.shared.currentUser) {
            self.route = .portal(single)
        } else {
            self.route = SessionStore.shared.currentUser != nil ? .panels : .login
        }
    }
}

struct RootView: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var app: AppState
    @ObservedObject private var deepLink = DeepLinkCoordinator.shared

    var body: some View {
        rootContent
            .onAppear { routePendingDeepLink() }
            .onChange(of: deepLink.pending) { _, _ in routePendingDeepLink() }
    }

    /// Push o bandeja con destino pendiente: abre el panel y el panel abre la pantalla.
    @MainActor
    private func routePendingDeepLink() {
        guard session.currentUser != nil, app.route != .login else { return }
        let coordinator = DeepLinkCoordinator.shared
        if coordinator.consumeNotifications() {
            app.route = .notifications
            return
        }
        if case .module(let panel, _, _, _) = coordinator.pending {
            let target: PanelId = panel == .ops ? .erp : panel
            if app.route != .portal(target) {
                app.route = .portal(target)
            }
        }
    }

    private var rootContent: some View {
        VStack(spacing: 0) {
            OfflineBanner()
            Group {
                switch app.route {
            case .login:
                LoginView(onLoggedIn: {
                    if let single = PanelAccessResolver.singlePanelRoute(user: session.currentUser) {
                        app.route = .portal(single)
                    } else {
                        app.route = .panels
                    }
                    applyDeepLinkAfterLogin(app: app)
                })
            case .panels:
                PanelHubView(
                    onOpen: { panel in app.route = .portal(panel) },
                    onOpenNotifications: { app.route = .notifications },
                    onLogout: {
                        session.clear()
                        app.route = .login
                    },
                )
            case .notifications:
                NavigationStack {
                    NotificationsCenterView(onBack: { app.route = .panels })
                }
            case .portal(let panel):
                switch panel {
                case .erp, .ops:
                    // Core: OPS vive dentro de ERP; nunca se abre un hub OPS aparte.
                    ConsoleTabView(panel: .erp, onExit: { app.route = .panels })
                case .crm:
                    CrmTabView(onExit: { app.route = .panels })
                case .portal:
                    PortalNavView(onExit: { app.route = .panels })
                case .studio:
                    PanelModuleNavView(panel: panel, onExit: { app.route = .panels })
                case .lab:
                    LabTabView(onExit: { app.route = .panels })
                case .integra:
                    IntegraRootView(onExit: { app.route = .panels })
                }
            }
            }
        }
    }
}

@MainActor
private func applyDeepLinkAfterLogin(app: AppState) {
    let dl = DeepLinkCoordinator.shared
    if dl.consumeNotifications() {
        app.route = .notifications
        return
    }
    if case .module(let panel, _, _, _) = dl.pending {
        app.route = .portal(panel == .ops ? .erp : panel)
    }
}
