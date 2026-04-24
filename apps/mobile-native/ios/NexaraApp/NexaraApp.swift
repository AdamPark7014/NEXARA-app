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
    enum Route: Equatable { case login, panels, portal(PortalKind) }
    @Published var route: Route

    init() {
        self.route = SessionStore.shared.currentUser != nil ? .panels : .login
    }
}

enum PortalKind: String, CaseIterable, Identifiable {
    case console, tickets, ventas, contabilidad, web
    var id: String { rawValue }
    var title: String {
        switch self {
        case .console: return "Consola"
        case .tickets: return "Tickets"
        case .ventas: return "Ventas"
        case .contabilidad: return "Contabilidad"
        case .web: return "Web"
        }
    }
    var icon: String {
        switch self {
        case .console: return "square.grid.2x2"
        case .tickets: return "ticket"
        case .ventas: return "cart"
        case .contabilidad: return "dollarsign.circle"
        case .web: return "globe"
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
                LoginView(onLoggedIn: { app.route = .panels })
            case .panels:
                PanelHubView(onOpen: { portal in app.route = .portal(portal) },
                             onLogout: {
                                 session.clear()
                                 app.route = .login
                             })
            case .portal(let portal):
                PortalNavView(portal: portal, onExit: { app.route = .panels })
            }
        }
    }
}
