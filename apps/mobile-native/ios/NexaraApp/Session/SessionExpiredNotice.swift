import Foundation

/// Aviso global de sesión expirada. Espejo de `SessionEvents` + `SessionExpiredHost`
/// de Android.
///
/// Por qué existe: hasta ahora, cuando el servidor confirmaba que la sesión ya no
/// valía, `SessionRefresher` cerraba sesión y `RootView` devolvía a la pantalla de
/// acceso **sin decir una palabra**. Quien está en campo subiendo evidencias se
/// encontraba de golpe en el login sin saber si falló la red, si se equivocó de
/// contraseña o si la app se rompió. Android sí lo explica; iOS no. Esto lo cierra.
///
/// Solo se dispara con expiración **confirmada por el servidor**:
///   - `POST auth/session/refresh` contestó 401 (sesión revocada, usuario inactivo
///     o más de 30 días sin usarla), o
///   - la cuenta es de portal (cliente o sucursal), que no tiene renovación: ahí un
///     401 de cualquier endpoint es la palabra final.
///
/// Un 401 suelto del personal, un fallo de red o un 5xx **no** lo disparan: esos se
/// reintentan con el token renovado y la sesión sigue viva. Mismo criterio que
/// `SessionEvents` en Android.
final class SessionExpiredNotice: ObservableObject {
    static let shared = SessionExpiredNotice()

    /// `true` mientras el aviso está en pantalla. Varias peticiones pueden
    /// confirmar la expiración a la vez; con una sola bandera sale un único aviso
    /// (igual que el `if (showDialog) return` de Android).
    @Published var isPresented = false

    private init() {}

    /// Se llama desde donde sea: el cliente HTTP y el renovador de sesión no corren
    /// en el hilo principal, y `@Published` sí tiene que publicarse ahí.
    func notify() {
        DispatchQueue.main.async { [weak self] in
            guard let self, !self.isPresented else { return }
            self.isPresented = true
        }
    }

    /// Botón del aviso. Cierra lo que quede de sesión y devuelve al acceso.
    ///
    /// Normalmente la sesión ya está cerrada (la renovación revocada la cierra
    /// sola); el `logout` de aquí es para el caso del portal, donde nadie la cerró
    /// todavía porque esas cuentas no pasan por el renovador.
    func acknowledge() {
        isPresented = false
        if SessionStore.shared.currentUser != nil {
            AuthRepository.shared.logout()
        }
    }
}
