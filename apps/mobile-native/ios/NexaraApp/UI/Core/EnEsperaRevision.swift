import Foundation

/// «En espera de revisión» (web `revisiones-api.ts`, Android `EnEsperaRevision`): la evidencia
/// enviada que quien mira puede aprobar o devolver. Lo enviado ya cuenta como cumplido y
/// revisarlo tarde no es un atraso (Adam, 29-10): la espera solo informa, sin semáforo.
enum EnEsperaRevision {
    /// En el teléfono se enseñan las que más llevan esperando; el resto, en la web.
    static let maximo = 30

    /// Cuánto lleva esperando, en minutos (nil sin fecha o con fecha inválida).
    static func minutosEsperando(_ iso: String?, ahora: Date = Date()) -> Int? {
        guard let fecha = NxFormat.parseISO(iso) else { return nil }
        return max(0, Int(ahora.timeIntervalSince(fecha) / 60))
    }

    /// «hace 25 min», «hace 3 h», «hace 2 días».
    static func textoEspera(_ minutos: Int?) -> String {
        guard let minutos else { return "Sin fecha de envío" }
        if minutos < 1 { return "hace un momento" }
        if minutos < 60 { return "hace \(minutos) min" }
        let horas = minutos / 60
        if horas < 24 { return "hace \(horas) h" }
        let dias = horas / 24
        return dias == 1 ? "hace 1 día" : "hace \(dias) días"
    }

    /// La que más lleva esperando va primero; las que no traen fecha, al final.
    static func ordenar(_ items: [RevisionPendiente]) -> [RevisionPendiente] {
        items.sorted { a, b in
            switch (NxFormat.parseISO(a.enviadaAt), NxFormat.parseISO(b.enviadaAt)) {
            case let (fa?, fb?): return fa < fb
            case (.some, .none): return true
            default: return false
            }
        }
    }

    /// «AN-0130 · Cableado de nodos».
    static func titulo(_ r: RevisionPendiente) -> String {
        let partes = [r.anNumber, r.titulo].compactMap { ActividadesTexto.limpio($0) }
        return partes.isEmpty ? "Actividad #\(r.activityId)" : partes.joined(separator: " · ")
    }

    /// «Iván Pérez · enviada hace 3 h» (o «corrección reenviada…»).
    static func detalle(_ r: RevisionPendiente, ahora: Date = Date()) -> String {
        let quien = ActividadesTexto.limpio(r.persona?.nombre).map { CoreFormat.shortName($0) }
        let cuando: String
        if let minutos = minutosEsperando(r.enviadaAt, ahora: ahora) {
            cuando = r.correccion == true
                ? "corrección reenviada \(textoEspera(minutos))"
                : "enviada \(textoEspera(minutos))"
        } else {
            cuando = "sin fecha de envío"
        }
        return [quien, cuando].compactMap { $0 }.joined(separator: " · ")
    }
}
