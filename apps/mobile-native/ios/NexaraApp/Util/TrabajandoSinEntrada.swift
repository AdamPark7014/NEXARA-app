import Foundation

/// Sin checada pero con actividad en curso (espejo de `apps/web/lib/trabajando-sin-entrada.ts`).
enum TrabajandoSinEntrada {
    static let etiqueta = "Trabajando sin entrada"

    struct BoardHint {
        let id: Int
        var entradaHoyAt: String? = nil
        var currentActivity: Any? = nil
        var openActivities: [Any]? = nil
        var status: String? = nil
    }

    static func ids(_ boardUsers: [BoardHint]) -> Set<Int> {
        var out = Set<Int>()
        for u in boardUsers {
            let sinEntrada = (u.entradaHoyAt ?? "").isEmpty
            let conActividad =
                u.currentActivity != nil
                || !(u.openActivities ?? []).isEmpty
                || u.status == "activo"
                || u.status == "atrasado"
            if sinEntrada && conActividad { out.insert(u.id) }
        }
        return out
    }

    static func etiqueta(userId: Int, estadoAusente: Bool, ids: Set<Int>) -> String? {
        guard estadoAusente else { return nil }
        return ids.contains(userId) ? Self.etiqueta : nil
    }
}
