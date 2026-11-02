import Foundation

/// Permiso para leer las fotos con IA (Android `PermisoLecturaIa`). La foto del ticket o del
/// tablero va a un servicio de terceros (Anthropic), así que se pregunta antes de la primera y
/// sin permiso no se manda: la foto se queda de respaldo y los datos se escriben a mano. Apple lo
/// exige en su guía 5.1.2(i).
///
/// El «sí» se guarda por persona en el teléfono y se quita en Mi perfil. El «a mano» vale solo
/// para esa pantalla: como no hay ajuste que lo revierta, la siguiente vez se vuelve a preguntar.
enum PermisoLecturaIa {
    static let titulo = "¿Leemos la foto con IA?"
    static let mensaje = """
        Para llenar los datos por ti, NEXARA manda la foto a Anthropic, un servicio de inteligencia \
        artificial que lee los números. Tú los confirmas antes de guardar.

        Si prefieres, toma la foto y escribe los datos a mano.
        """
    static let permitir = "Permitir"
    static let aMano = "Escribir a mano"

    private static var clave: String {
        "lecturaFotosIA.\(SessionStore.shared.currentUser?.id ?? "sin-sesion")"
    }

    static var concedido: Bool { UserDefaults.standard.bool(forKey: clave) }

    static func conceder() { UserDefaults.standard.set(true, forKey: clave) }

    /// Desde Mi perfil.
    static func quitar() { UserDefaults.standard.removeObject(forKey: clave) }
}
