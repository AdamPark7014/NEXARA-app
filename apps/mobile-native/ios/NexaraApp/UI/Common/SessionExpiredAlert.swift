import SwiftUI

/// Aviso de «Sesión expirada» sobre toda la app. Espejo de `SessionExpiredHost` de
/// Android, que envuelve el `NavHost` entero.
///
/// Va en la raíz y no en cada pantalla a propósito: la expiración puede confirmarse
/// en cualquier petición —una foto que se sube, la lista de actividades, un
/// checador— y el aviso tiene que salir esté donde esté la persona.
///
/// Android acompaña el diálogo con un snackbar. Aquí no: en iOS un `alert` ya es
/// modal y bloquea, así que repetir el mismo texto abajo solo estorbaría.
struct SessionExpiredAlert: ViewModifier {
    @ObservedObject private var aviso = SessionExpiredNotice.shared

    func body(content: Content) -> some View {
        content.alert("Sesión expirada", isPresented: $aviso.isPresented) {
            Button("Iniciar sesión") { aviso.acknowledge() }
        } message: {
            Text("Tu sesión ya no es válida. Inicia sesión de nuevo para continuar.")
        }
    }
}

extension View {
    /// Mismas palabras que Android, para que el soporte no tenga que traducir entre
    /// dos apps cuando alguien llama.
    func sessionExpiredAlert() -> some View {
        modifier(SessionExpiredAlert())
    }
}
