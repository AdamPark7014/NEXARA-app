import Foundation

/// Qué se le dice a la persona cuando el servidor no acepta su checada.
///
/// Espejo de `AttendanceCheckIn.kt` en Android, con los mismos textos: las dos apps
/// tienen que decir lo mismo ante el mismo 422, o el mismo problema se va a explicar de
/// dos maneras según el teléfono que traiga cada quien.
///
/// Son cuatro motivos y la salida es distinta en cada uno. Decirle siempre «desactiva el
/// GPS falso» a quien solo tenía el teléfono en un sótano no le ayuda a checar.
enum ChecadaRechazo {

    /// Lo que contesta el servidor con 422 cuando el teléfono traía GPS falso.
    static let mockMensaje =
        "Detectamos una ubicación simulada. Desactiva cualquier app de GPS falso para checar."

    /// Qué hacer después del 422 por GPS falso.
    static let mockAyuda =
        "Tu checada no se registró y tus jefes recibieron el aviso. Desactiva la app de "
        + "ubicación simulada en Ajustes, reinicia la app y vuelve a intentarlo."

    /// ¿El error es un rechazo del servidor y no un fallo de red o de datos?
    ///
    /// Todos se ven igual para quien está parado en la puerta —«no quedó registrada»— así
    /// que todos van al mismo aviso, con la ayuda que corresponda.
    static func esRechazo(_ mensaje: String?) -> Bool {
        let t = (mensaje ?? "").lowercased()
        guard !t.isEmpty else { return false }
        return t.contains("ubicación simulada") || t.contains("ubicacion simulada")
            || t.contains("ubicación vieja") || t.contains("ubicacion vieja")
            || t.contains("distancia imposible")
            || t.contains("app nexara")
    }

    /// Qué tiene que hacer para poder checar, según el motivo.
    static func ayuda(_ mensaje: String?) -> String {
        let t = (mensaje ?? "").lowercased()
        if t.contains("ubicación vieja") || t.contains("ubicacion vieja") {
            return "Tu teléfono mandó la última posición que tenía guardada. Sal al aire libre "
                + "o asómate a una ventana unos segundos para que el GPS mida de nuevo, y vuelve a intentarlo."
        }
        if t.contains("distancia imposible") {
            return "Tu ubicación no cuadra con tu checada anterior. Si de verdad te trasladaste, "
                + "avisa a tu jefe para que la registre él; tu checada no se guardó."
        }
        if t.contains("app nexara") {
            return "Las checadas solo se registran desde esta app. Si no puedes usar tu teléfono, "
                + "tu jefe puede registrarla por ti."
        }
        return mockAyuda
    }
}
