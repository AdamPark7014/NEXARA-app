import LocalAuthentication
import SwiftUI

/// Bloqueo biométrico / passcode al volver a primer plano.
enum AppLock {
    private static let defaultsKey = "nexara_app_lock_enabled"

    /// Preferencia de usuario (default: true).
    static var isEnabled: Bool {
        get {
            if UserDefaults.standard.object(forKey: defaultsKey) == nil { return true }
            return UserDefaults.standard.bool(forKey: defaultsKey)
        }
        set { UserDefaults.standard.set(newValue, forKey: defaultsKey) }
    }

    static var isAvailable: Bool {
        let ctx = LAContext()
        var err: NSError?
        return ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err)
    }

    static var shouldLock: Bool { isEnabled && isAvailable }

    @MainActor
    static func authenticate(
        reason: String = "Desbloquea NEXARA para continuar"
    ) async -> Bool {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else {
            return true // no lock hardware — allow
        }
        return await withCheckedContinuation { cont in
            ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { ok, _ in
                cont.resume(returning: ok)
            }
        }
    }
}

/// Overlay de bloqueo al pasar a background con sesión activa.
struct AppLockGate<Content: View>: View {
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject var session: SessionStore
    @State private var locked = false
    @State private var unlocking = false
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        ZStack {
            content
            if locked && session.currentUser != nil {
                Color(.systemBackground).ignoresSafeArea()
                VStack(spacing: 16) {
                    Image(systemName: "lock.fill").font(.largeTitle).foregroundColor(.teal)
                    Text("NEXARA bloqueado").font(.headline)
                    Text("Confirma tu identidad para continuar")
                        .font(.caption).foregroundColor(.secondary)
                    Button(unlocking ? "Verificando…" : "Desbloquear") {
                        Task { await unlock() }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.teal)
                    .disabled(unlocking)
                }
            }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .background, session.currentUser != nil, AppLock.shouldLock {
                locked = true
            }
            if phase == .active, locked {
                Task { await unlock() }
            }
        }
    }

    private func unlock() async {
        unlocking = true
        let ok = await AppLock.authenticate()
        unlocking = false
        if ok { locked = false }
    }
}
