import SwiftUI

@main
struct NexaraApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var session = SessionStore.shared
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(appState)
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
        if case .module(let panel, _) = dl.pending {
            appState.route = .portal(panel)
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

    var body: some View {
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
                    ConsoleTabView(panel: panel, onExit: { app.route = .panels })
                case .crm:
                    CrmTabView(onExit: { app.route = .panels })
                case .portal:
                    PortalNavView(panel: .portal, onExit: { app.route = .panels })
                case .studio:
                    PortalNavView(panel: panel, onExit: { app.route = .panels })
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
    if case .module(let panel, _) = dl.pending {
        app.route = .portal(panel)
    }
}
