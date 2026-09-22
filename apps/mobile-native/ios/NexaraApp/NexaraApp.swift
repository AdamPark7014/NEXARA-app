import SwiftUI

@main
struct NexaraApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var session = SessionStore.shared
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            AppLockGate {
                RootView()
                    .environmentObject(session)
                    .environmentObject(appState)
            }
            .environmentObject(session)
            .tint(Color("AccentColor"))
            .onOpenURL { url in
                DeepLinkCoordinator.shared.ingest(url)
                applyPendingDeepLink()
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
            appState.route = .portal(panel)
        }
    }
}

/// Ruta de navegación a nivel raíz.
final class AppState: ObservableObject {
    enum Route: Equatable { case login, panels, portal(PanelId), notifications }
    @Published var route: Route

    init() {
        // Producto ERP-only: entrar directo a ERP si hay sesión
        self.route = SessionStore.shared.currentUser != nil ? .portal(.erp) : .login
    }
}

struct RootView: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var app: AppState

    var body: some View {
        VStack(spacing: 0) {
            OfflineBanner()
            Group {
                switch app.route {
            case .login:
                LoginView(onLoggedIn: {
                    // ERP-only como UX primaria
                    app.route = .portal(.erp)
                    applyDeepLinkAfterLogin(app: app)
                })
            case .panels:
                PanelHubView(
                    onOpen: { panel in app.route = .portal(panel) },
                    onOpenNotifications: { app.route = .notifications },
                    onLogout: {
                        session.clear()
                        app.route = .login
                    }
                )
            case .notifications:
                NavigationStack {
                    // Volver a ERP (no hub multipanel)
                    NotificationsCenterView(onBack: { app.route = .portal(.erp) })
                }
            case .portal(let panel):
                switch panel {
                case .erp, .ops:
                    // Sin opción de «Cambiar panel» — ERP como shell principal
                    ConsoleTabView(panel: panel, onExit: { })
                case .crm:
                    CrmTabView(onExit: { app.route = .panels })
                case .portal:
                    PortalNavView(onExit: { app.route = .panels })
                case .studio:
                    PanelModuleNavView(panel: panel, onExit: { app.route = .panels })
                case .lab:
                    LabTabView(onExit: { app.route = .panels })
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
        app.route = .portal(panel)
    }
}
