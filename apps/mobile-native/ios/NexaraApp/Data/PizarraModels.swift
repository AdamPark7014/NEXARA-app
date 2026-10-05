import Foundation

// Pizarra del equipo, contrato C (rango, KPI y «Asignadas por mí»). Espejo de
// `TeamBoardKpisDto` y `BoardAsignadaPorMiDto` de Android y de `team-board.service.ts`
// del API. Todo es opcional: con una API vieja la pizarra se ve como antes.

/// Cómo le fue a una persona en el rango consultado (`kpis` de `me/board`).
struct TeamBoardKpis: Decodable, Hashable {
    let asignadas: Int?
    let cerradas: Int?
    let aTiempo: Int?
    let aTiempoPct: FlexDouble?
    let minutosPlan: FlexDouble?
    let minutosReales: FlexDouble?
    let eficienciaPct: FlexDouble?
    let minutosAsistidos: FlexDouble?
    let minutosEnActividad: FlexDouble?
    let productividadPct: FlexDouble?
    let rechazadas: Int?
}

/// `GET me/board/asignadas-por-mi`: lo que asignó quien consulta, con persona y semáforo.
struct BoardAsignadaPorMi: Decodable, Identifiable, Hashable {
    let id: Int
    let anNumber: String?
    let titulo: String?
    let estatus: String?
    let prioridad: String?
    /// rojo | amarillo | verde
    let semaforo: String?
    /// PENDIENTE | ACEPTADA | RECHAZADA
    let aceptacion: String?
    /// Solo histórico: rechazos de antes del 18-09 (ya no se puede rechazar).
    let motivoRechazo: String?
    /// Hora real en que la inició; nil = sin iniciar.
    let inicioRealAt: String?
    let fechaMaxima: String?
    let minutosPlan: FlexDouble?
    let minutosReales: FlexDouble?
    let excedida: Bool?
    /// A quién se la asignó.
    let persona: MyActivityAssigner?
    let usuario: MyActivityAssigner?

    /// El contrato dice «persona»; se acepta `usuario` por si el API lo nombra así.
    var quien: MyActivityAssigner? { persona ?? usuario }
}

/// `{ desde, hasta, items }` (la forma de hoy del API).
private struct BoardAsignadasPorMiSobre: Decodable {
    let items: [BoardAsignadaPorMi]?
}

extension CoreRepository {
    /// `desde`/`hasta` como parámetros de consulta; vacío = el API usa hoy.
    static func rangoQuery(_ desde: String?, _ hasta: String?) -> [String: String] {
        var query: [String: String] = [:]
        if let desde, !desde.isEmpty { query["desde"] = desde }
        if let hasta, !hasta.isEmpty { query["hasta"] = hasta }
        return query
    }

    /// «Asignadas por mí» en el rango. Se aceptan las dos formas que puede tomar la
    /// respuesta: un arreglo suelto o `{ items: [...] }` (igual que Android). Si el
    /// endpoint no existe todavía, quien llama lo trata como lista vacía.
    func boardAsignadasPorMi(desde: String?, hasta: String?) async throws -> [BoardAsignadaPorMi] {
        let data = try await ApiClient.shared.get(
            "me/board/asignadas-por-mi",
            query: CoreRepository.rangoQuery(desde, hasta)
        )
        let decoder = JSONDecoder()
        if let lista = try? decoder.decode([BoardAsignadaPorMi].self, from: data) {
            return lista
        }
        if let sobre = try? decoder.decode(BoardAsignadasPorMiSobre.self, from: data) {
            return sobre.items ?? []
        }
        return []
    }
}
