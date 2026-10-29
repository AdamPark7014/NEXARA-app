import Foundation

/// Material del almacén que consumió una actividad (`GET activities/:id/materiales`).
/// El API responde un objeto `{ movimientos, costoTotal }`, no un arreglo.
struct ActivityMateriales: Hashable {
    var movimientos: Int = 0
    var costoTotal: Double = 0

    /// Lee la respuesta tal como llega. `costoTotal` puede venir como número o como texto.
    init(map: [String: Any]) {
        movimientos = (map["movimientos"] as? [Any])?.count ?? 0
        costoTotal = ActivityParse.double(map["costoTotal"]) ?? 0
    }

    init(movimientos: Int, costoTotal: Double) {
        self.movimientos = movimientos
        self.costoTotal = costoTotal
    }
}

/// Lo que suma la tarjeta «Costo directo» del detalle: el material de la actividad. Los
/// viáticos salen de `ViaticosRepository.lista()` (ya filtrados por persona y jefe).
final class ActivityCostoRepository {
    static let shared = ActivityCostoRepository()
    private let api = ApiClient.shared
    private init() {}

    func materiales(activityId: Int) async throws -> ActivityMateriales {
        let data = try await api.get("activities/\(activityId)/materiales")
        return ActivityMateriales(map: ConsoleHelpers.decodeMap(data))
    }
}
