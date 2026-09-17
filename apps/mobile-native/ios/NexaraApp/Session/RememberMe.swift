import Foundation

/// «Recordarme» del inicio de sesión (paridad Android `RememberMe`).
///
/// - Activo (por omisión): la sesión queda abierta en este teléfono y la app entra directo; la
///   renovación automática la mantiene viva.
/// - Apagado: la sesión dura mientras la app siga en memoria. Al abrirla desde cero se cierra.
enum RememberMe {
    private static let key = "nx_remember_me"
    private static let lastEmailKey = "nx_last_login_email"

    static var isEnabled: Bool {
        get { UserDefaults.standard.object(forKey: key) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }

    /// Correo que se deja escrito en el login solo si la persona pidió que la recordaran.
    static var lastEmail: String {
        get { UserDefaults.standard.string(forKey: lastEmailKey) ?? "" }
        set {
            if newValue.isEmpty {
                UserDefaults.standard.removeObject(forKey: lastEmailKey)
            } else {
                UserDefaults.standard.set(newValue, forKey: lastEmailKey)
            }
        }
    }

    /// Se llama una vez al arrancar el proceso, antes de decidir la primera pantalla.
    static func endSessionOnLaunchIfNeeded() {
        guard !isEnabled, SessionStore.shared.currentUser != nil else { return }
        AuthRepository.shared.logout()
    }
}
