import Foundation

/// Sesión de trabajo de una actividad: «En pausa», «Reanudar» y «Pausar».
/// Espejo de `apps/web/lib/sesion-actividad.ts` y de `SesionActividadRules.kt` en Android.
///
/// El reloj ya no corre de corrido desde que se inicia: corre por sesiones. Se detiene con
/// una pausa (propia o del jefe), al checar salida, a las 12 horas o al terminar el día.
/// «En pausa» no es un estatus (la actividad sigue «En Proceso»): lo dicen estos campos,
/// que una API anterior no manda.
struct SesionActividad: Hashable {
    var enCurso: Bool = false
    var enPausa: Bool = false
    /// FIN | PAUSA | SALIDA | TOPE_12H | CORTE_DIA
    var pausaTipo: String?
    var pausadaAt: String?
    var pausadaPor: MyActivityAssigner?
    var motivoPausa: String?
    var sesionAbiertaDesde: String?

    /// Lee la fila de `assignees` del detalle (`GET activities/:id`), que llega como diccionario.
    init(fila: [String: Any]?) {
        let fila = fila ?? [:]
        enCurso = (fila["enCurso"] as? Bool) ?? false
        enPausa = (fila["enPausa"] as? Bool) ?? false
        pausaTipo = fila["pausaTipo"] as? String
        pausadaAt = fila["pausadaAt"] as? String
        if let por = fila["pausadaPor"] as? [String: Any] {
            let id = (por["id"] as? Int) ?? (por["id"] as? NSNumber)?.intValue
            pausadaPor = MyActivityAssigner(id: id, nombre: por["nombre"] as? String)
        } else {
            pausadaPor = nil
        }
        motivoPausa = fila["motivoPausa"] as? String
        sesionAbiertaDesde = fila["sesionAbiertaDesde"] as? String
    }

    init(
        enCurso: Bool, enPausa: Bool, pausaTipo: String?, pausadaAt: String?,
        pausadaPor: MyActivityAssigner?, motivoPausa: String?, sesionAbiertaDesde: String?
    ) {
        self.enCurso = enCurso
        self.enPausa = enPausa
        self.pausaTipo = pausaTipo
        self.pausadaAt = pausadaAt
        self.pausadaPor = pausadaPor
        self.motivoPausa = motivoPausa
        self.sesionAbiertaDesde = sesionAbiertaDesde
    }

    static let motivoMinimo = 10
    static let motivoMaximo = 500

    static let tituloPausaPropia = "Pausar actividad"
    static let textoPausaPropia =
        "Tu reloj se detiene en esta actividad; sigue «En Proceso» y la reanudas cuando vuelvas a ella."
    static let ayudaReanudar =
        "Tu reloj vuelve a correr. Se detiene al pausar, al checar salida, a las 12 h o al terminar el día."
    static let placeholderMotivoJefe = "Ej. Salió una falla urgente en el cliente; que la atienda primero."

    static func cerrada(_ estatus: String?) -> Bool {
        (estatus ?? "").range(
            of: "finalizada|completada|cancelada|aprobada",
            options: [.regularExpression, .caseInsensitive]
        ) != nil
    }

    /// Nombre y primer apellido (o segundo nombre): «La pausó Juan Pérez».
    static func primerNombre(_ nombre: String?) -> String {
        CoreFormat.shortName(nombre)
    }

    /// Una línea que explica la pausa: quién y por qué, o qué la detuvo. nil si no está en pausa.
    /// `propia` cambia la persona del verbo: «tu salida» para quien la ejecuta, «su salida» para su jefe.
    func textoPausa(miId: Int? = nil, propia: Bool = true) -> String? {
        guard enPausa else { return nil }
        let motivo = (motivoPausa ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        switch pausaTipo {
        case "SALIDA":
            return propia ? "Se detuvo al marcar tu salida." : "Se detuvo al marcar su salida."
        case "TOPE_12H":
            return "Se detuvo sola al cumplir 12 horas."
        case "CORTE_DIA":
            return "Se detuvo sola al terminar el día."
        default:
            let sujeto: String
            if let quien = pausadaPor, let id = quien.id, let miId, id == miId {
                sujeto = "La pausaste"
            } else if let quien = pausadaPor {
                let nombre = SesionActividad.primerNombre(quien.nombre)
                sujeto = nombre.isEmpty ? "La pausó" : "La pausó \(nombre)"
            } else {
                sujeto = "Está en pausa"
            }
            return motivo.isEmpty ? "\(sujeto)." : "\(sujeto): \(motivo)"
        }
    }

    /// ¿Se pinta «Reanudar»? Solo a quien la ejecuta, con el reloj detenido y la actividad abierta.
    func puedeReanudar(despachador: Bool, estatus: String?) -> Bool {
        guard enPausa, !despachador else { return false }
        return !SesionActividad.cerrada(estatus)
    }

    /// ¿Se pinta «Pausar»? Solo hay algo que pausar mientras el reloj corre.
    func puedePausar(estatus: String?) -> Bool {
        enCurso && !SesionActividad.cerrada(estatus)
    }

    /// Error del motivo que escribe el jefe, o nil si alcanza.
    static func errorMotivoPausa(_ texto: String) -> String? {
        let n = texto.trimmingCharacters(in: .whitespacesAndNewlines).count
        if n < motivoMinimo { return "Escribe por qué la pausas (mínimo \(motivoMinimo) caracteres)." }
        if n > motivoMaximo { return "El motivo no puede pasar de \(motivoMaximo) caracteres." }
        return nil
    }

    /// El motivo propio es opcional, pero tampoco pasa del tope.
    static func errorMotivoPropio(_ texto: String) -> String? {
        texto.trimmingCharacters(in: .whitespacesAndNewlines).count > motivoMaximo
            ? "El motivo no puede pasar de \(motivoMaximo) caracteres."
            : nil
    }

    /// «Reloj corriendo desde las 09:30.»; sin hora legible, solo «Reloj corriendo.».
    var textoCorriendo: String {
        if let hora = CoreFormat.time(sesionAbiertaDesde), !hora.isEmpty {
            return "Reloj corriendo desde las \(hora)."
        }
        return "Reloj corriendo."
    }

    /// Aviso tras pausar a alguien de su equipo.
    static func avisoPausaDeEquipo(_ nombre: String?) -> String {
        let quien = primerNombre(nombre)
        return quien.isEmpty ? "Pausada. Ya recibió el aviso." : "Pausada. \(quien) ya recibió el aviso."
    }
}
