import Foundation

/// «Vas a empezar ésta, pero tienes otra de más prioridad sin terminar»
/// (contrato B). Espejo de `ActivityPriorityJump` de Android.
///
/// No bloquea nada, y el API tampoco: solo sirve para preguntar, antes de mandar
/// la foto de entrada, si quiere decir por qué la hace primero. Lo que conteste
/// viaja como `justificacionOrden`; el servidor marca `saltoPrioridad` y avisa a
/// los jefes, pero deja pasar la foto.
///
/// Por qué importa: es la única parte del flujo donde la app le da a quien está en
/// campo la oportunidad de explicarse **antes** de que le llegue la pregunta al
/// jefe. Sin esto (como estaba iOS hasta ahora) el salto se registra igual, pero
/// sin su versión de los hechos.
enum ActivityPriorityJump {

    /// Una actividad abierta del día, vista desde esta regla.
    struct Pendiente {
        let id: Int
        let prioridad: String?
        /// Ya tiene foto de entrada o inicio real.
        var iniciada: Bool = false
        var terminada: Bool = false
    }

    /// ALTA = 0 · MEDIA = 1 · BAJA = 2. Acepta los textos viejos («urgente», «Alta»).
    static func rango(_ prioridad: String?) -> Int {
        switch (prioridad ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "alta", "urgente": return 0
        case "baja": return 2
        default: return 1
        }
    }

    /// La de más prioridad que sigue pendiente, o `nil` si no hay ninguna por
    /// encima de la que se va a empezar. Entre iguales no hay salto: solo cuenta
    /// la que está **estrictamente** más arriba.
    static func mayorPendiente(
        actualId: Int,
        actualPrioridad: String?,
        otras: [Pendiente]
    ) -> Pendiente? {
        let actual = rango(actualPrioridad)
        return otras
            .filter { $0.id != actualId && !$0.iniciada && !$0.terminada && rango($0.prioridad) < actual }
            .min { rango($0.prioridad) < rango($1.prioridad) }
    }

    /// ¿Esa actividad es del día (o de antes)? Lo que está programado para mañana
    /// no cuenta como salto de prioridad: nadie se salta el orden por adelantarse a
    /// lo de mañana. Sin fecha, cuenta.
    static func esDelDiaOAntes(
        _ iso: String?,
        hoy: Date = Date(),
        calendario: Calendar = .current
    ) -> Bool {
        guard let fecha = CoreFormat.date(iso) else { return true }
        return calendario.startOfDay(for: fecha) <= calendario.startOfDay(for: hoy)
    }

    /// «“Cambio de disco” es de prioridad alta y sigue sin empezar.»
    static func aviso(titulo: String?, prioridad: String?) -> String {
        let limpio = (titulo ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let nombre = limpio.isEmpty ? "Otra actividad" : "«\(limpio)»"
        let etiqueta: String
        switch rango(prioridad) {
        case 0: etiqueta = "prioridad alta"
        case 2: etiqueta = "prioridad baja"
        default: etiqueta = "prioridad media"
        }
        return "\(nombre) es de \(etiqueta) y sigue sin empezar."
    }
}
