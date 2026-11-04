import Foundation

/// La bandeja de Aprobaciones junta lo que espera tu firma, venga de donde venga.
///
/// Adam (04-11-2026): «en aprobaciones no le aparece nada sin embargo si hay por revisar cosas». Solo
/// leía `workflow/my-pending`, que nunca ha tenido filas; las evidencias viven en `me/revisiones`.
/// Espejo de `BandejaRules.kt`.
enum BandejaRules {
    /// Lo que acepta la API de una sola vez.
    static let topeLote = 50
    static let notaLote = "Revisado en lote: todo correcto."
    static let minNota = 5
    static let filasALaVista = 5

    struct Evidencias: Equatable {
        var teTocan: [RevisionPendiente] = []
        var deOtros: [RevisionPendiente] = []
        var total: Int { teTocan.count + deOtros.count }
    }

    static func separar(_ revisiones: [RevisionPendiente]) -> Evidencias {
        Evidencias(
            teTocan: revisiones.filter { $0.paraTi != false },
            deOtros: revisiones.filter { $0.paraTi == false }
        )
    }

    /// «28 te tocan · 27 con sus jefes». Solo dice lo que no es cero.
    static func resumen(_ e: Evidencias) -> String {
        var partes: [String] = []
        if e.teTocan.count == 1 { partes.append("1 te toca") }
        if e.teTocan.count > 1 { partes.append("\(e.teTocan.count) te tocan") }
        if !e.deOtros.isEmpty { partes.append("\(e.deOtros.count) con sus jefes") }
        return partes.joined(separator: " · ")
    }

    /// Sin persona no hay a quién aprobarle: esa fila se abre y se revisa una por una.
    static func loteDe(_ e: Evidencias) -> [LoteItem] {
        Array(e.teTocan.compactMap { r in r.persona?.id.map { LoteItem(activityId: r.activityId, userId: $0) } }.prefix(topeLote))
    }

    static func textoBotonLote(_ cuantas: Int) -> String {
        cuantas == 1 ? "Aprobar 1" : "Aprobar \(cuantas) en lote"
    }

    static func notaValida(_ nota: String) -> Bool {
        nota.trimmingCharacters(in: .whitespacesAndNewlines).count >= minNota
    }

    static func calificacionValida(_ estrellas: Int) -> Bool { (1...5).contains(estrellas) }

    static func mensajeLote(aprobadas: Int, fallidas: Int) -> String {
        switch (aprobadas, fallidas) {
        case (0, 0): return "No había nada que aprobar."
        case (1, 0): return "Se aprobó 1 evidencia."
        case (_, 0): return "Se aprobaron \(aprobadas) evidencias."
        case (0, 1): return "No se pudo aprobar 1 evidencia."
        case (0, _): return "No se pudieron aprobar \(fallidas) evidencias."
        default: return "Se aprobaron \(aprobadas); \(fallidas) no se pudieron, revísalas una por una."
        }
    }

    /// Con algo de esto ya no es «no hay nada esperándote».
    static func hayAlgo(filas: Int, evidencias: Evidencias, viaticos: Int, gastos: Int) -> Bool {
        filas > 0 || evidencias.total > 0 || viaticos > 0 || gastos > 0
    }

    static func titulo(_ r: RevisionPendiente) -> String {
        let t = (r.titulo ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? (r.anNumber ?? "Actividad \(r.activityId)") : t
    }

    static func detalle(_ r: RevisionPendiente, ahora: Date) -> String {
        var partes: [String] = []
        if let nombre = r.persona?.nombre, !nombre.isEmpty { partes.append(nombre) }
        if let minutos = EnEsperaRevision.minutosEsperando(r.enviadaAt, ahora: ahora) {
            partes.append(EnEsperaRevision.textoEspera(minutos))
        }
        return partes.joined(separator: " · ")
    }
}
