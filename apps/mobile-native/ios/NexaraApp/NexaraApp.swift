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
        }
    }
}

/// Ruta de navegación a nivel raíz.
final class AppState: ObservableObject {
    enum Route: Equatable { case login, panels, portal(PanelId) }
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
        Group {
            switch app.route {
            case .login:
                LoginView(onLoggedIn: {
                    if let single = PanelAccessResolver.singlePanelRoute(user: session.currentUser) {
                        app.route = .portal(single)
                    } else {
                        app.route = .panels
                    }
                })
            case .panels:
                PanelHubView(
                    onOpen: { panel in app.route = .portal(panel) },
                    onLogout: {
                        session.clear()
                        app.route = .login
                    },
                )
            case .portal(let panel):
                switch panel {
                case .erp, .ops:
                    ConsoleTabView(panel: panel, onExit: { app.route = .panels })
                case .portal:
                    NavigationStack {
                        TicketsDashboardView()
                            .toolbar {
                                ToolbarItem(placement: .navigationBarLeading) {
                                    Button("Paneles") { app.route = .panels }
                                }
                            }
                    }
                default:
                    PortalNavView(panel: panel, onExit: { app.route = .panels })
                }
            }
        }
    }
}
