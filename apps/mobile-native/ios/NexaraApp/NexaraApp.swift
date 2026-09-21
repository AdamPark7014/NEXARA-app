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
    enum Route: Equatable { case login, onboarding, core, portal }
    @Published var route: Route

    init() {
        // «Recordarme» apagado: la sesión no sobrevive a cerrar la app.
        RememberMe.endSessionOnLaunchIfNeeded()
        self.route = AppState.landing(for: SessionStore.shared.currentUser)
    }

    static func landing(for user: SessionUser?) -> Route {
        guard let user else { return .login }
        // La bienvenida va entre el acceso y la casa, como en Android: con sesión ya
        // iniciada, porque habla de «tus actividades» y «tu jornada». Se ve una sola
        // vez por teléfono (ver `OnboardingStore`).
        //
        // A las cuentas de portal NO se les enseña, aunque Android sí lo haga: sus
        // tres láminas hablan de checar jornada, subir evidencias y del chat del
        // equipo, y un cliente o una sucursal no hacen nada de eso. Es la única
        // diferencia deliberada con Android en este flujo.
        if !CoreNavigation.isExternal(user), !OnboardingStore.isCompleted { return .onboarding }
        return home(for: user)
    }

    /// Dónde vive esta cuenta una vez pasada la bienvenida.
    static func home(for user: SessionUser) -> Route {
        CoreNavigation.isExternal(user) ? .portal : .core
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
                case .onboarding:
                    OnboardingView(onFinish: {
                        OnboardingStore.markCompleted()
                        guard let user = session.currentUser else {
                            app.route = .login
                            return
                        }
                        app.route = AppState.home(for: user)
                    })
                case .core:
                    CoreShellView()
                case .portal:
                    PortalNavView(onExit: { AuthRepository.shared.logout() })
                }
            }
        }
        // El aviso de sesión expirada envuelve la app entera, como el
        // `SessionExpiredHost` de Android: la expiración se confirma en cualquier
        // petición y hay que explicarla esté donde esté la persona.
        .sessionExpiredAlert()
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
