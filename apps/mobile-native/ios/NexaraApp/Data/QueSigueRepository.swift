import Foundation

/// «¿Qué sigue?» y Mis pendientes (Velocidad Core, Ola 6). Espejo de `QueSigueApi.kt`: las sugerencias las
/// arma la API, y «Empezar» manda solo la clave.
struct SugerenciaQueSigue: Decodable, Identifiable, Hashable {
    let clave: String
    let tipo: String?
    let titulo: String
    let detalle: String?
    let accion: String?
    let href: String?

    var id: String { clave }
}

struct QueSigueRespuesta: Decodable {
    let aplica: Bool
    let area: String?
    let sugerencias: [SugerenciaQueSigue]
    let resumen: String?
}

struct ActividadArrancada: Decodable {
    let activityId: Int
    let iniciada: Bool
}

struct PendientePersonal: Decodable, Identifiable, Hashable {
    let id: Int
    let texto: String
}

private struct PendientesRespuesta: Decodable {
    let pendientes: [PendientePersonal]
}

private struct SinCuerpo: Encodable {}

final class QueSigueRepository {
    static let shared = QueSigueRepository()

    private let api = ApiClient.shared

    private func arrancada(_ data: Data) throws -> ActividadArrancada {
        // Sin red no se finge: una actividad con el reloj corriendo no puede quedar en la cola.
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
        return try JSONDecoder().decode(ActividadArrancada.self, from: data)
    }

    func queSigue() async throws -> QueSigueRespuesta {
        let data = try await api.get("me/que-sigue")
        return try JSONDecoder().decode(QueSigueRespuesta.self, from: data)
    }

    func empezar(clave: String) async throws -> ActividadArrancada {
        struct Body: Encodable { let clave: String }
        return try arrancada(try await api.postJSON("me/que-sigue/empezar", body: Body(clave: clave)))
    }

    func pendientes() async throws -> [PendientePersonal] {
        let data = try await api.get("me/pendientes")
        return try JSONDecoder().decode(PendientesRespuesta.self, from: data).pendientes
    }

    func agregar(texto: String) async throws {
        struct Body: Encodable { let texto: String }
        _ = try await api.postJSON("me/pendientes", body: Body(texto: texto))
    }

    func palomear(id: Int) async throws {
        _ = try await api.postJSON("me/pendientes/\(id)/hecho", body: SinCuerpo())
    }

    func empezarPendiente(id: Int) async throws -> ActividadArrancada {
        try arrancada(try await api.postJSON("me/pendientes/\(id)/empezar", body: SinCuerpo()))
    }

    func borrar(id: Int) async throws {
        try await api.delete("me/pendientes/\(id)")
    }
}
