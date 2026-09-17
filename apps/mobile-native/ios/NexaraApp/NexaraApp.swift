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
            }
            .task {
                // Jornada abierta con consentimiento: vuelve a armar el rastreo al abrir la app
                // (si no, tras un relanzamiento por ubicación el GPS de la jornada no se re-arma).
                guard session.currentUser != nil else { return }
                await ShiftGpsTracker.shared.resumeIfNeeded()
            }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active, session.currentUser != nil else { return }
                Task { await AuthRepository.shared.maybeExtendSession() }
                Task { await ShiftGpsTracker.shared.resumeIfNeeded() }
            }
        }
    }
}

/// Ruta raíz. Solo existe ERP (Core): el personal entra directo a Actividades y
/// las cuentas de cliente o sucursal, directo al portal externo. No hay menú de paneles.
final class AppState: ObservableObject {
    enum Route: Equatable { case login, core, portal }
    @Published var route: Route

    init() {
        // «Recordarme» apagado: la sesión no sobrevive a cerrar la app.
        RememberMe.endSessionOnLaunchIfNeeded()
        self.route = AppState.landing(for: SessionStore.shared.currentUser)
    }

    static func landing(for user: SessionUser?) -> Route {
        guard let user else { return .login }
        return CoreNavigation.isExternal(user) ? .portal : .core
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
                        app.route = AppState.landing(for: session.currentUser)
                    })
                case .core:
                    CoreShellView()
                case .portal:
                    PortalNavView(onExit: { AuthRepository.shared.logout() })
                }
            }
        }
        // Sesión cerrada (botón, 401 o token vencido): de vuelta al login.
        .onChange(of: session.currentUser?.id) { _, newId in
            if newId == nil {
                app.route = .login
            } else if app.route != .login {
                app.route = AppState.landing(for: session.currentUser)
            }
        }
        // Sesión leída del llavero tarde (arranque con el teléfono bloqueado):
        // la persona nunca cerró sesión, así que sale del login sola.
        .onReceive(NotificationCenter.default.publisher(for: SessionStore.didRestoreNotification)) { _ in
            app.route = AppState.landing(for: session.currentUser)
        }
    }
}
