import Foundation

// Días festivos de quien pregunta (`GET festivos/mio`, 29-10). Espejo de `FestivosMioDto`,
// `FestivoDto`, `FestivoComoDto` y `FestivoHorarioDto` de Android (`CoreActivitiesApi.kt`).
// La regla de si a alguien le toca o no vive en el servidor; el teléfono solo la nombra
// (`FestivoRules`). Todo es opcional: con una API que aún no lo tiene no se pinta nada.

/// El festivo de hoy y los próximos 90 días, ya resueltos para quien pregunta.
struct FestivosMio: Decodable, Equatable {
    /// AAAA-MM-DD en México.
    var hoy: String? = nil
    var festivoHoy: Festivo? = nil
    /// Hasta 5, en orden.
    var proximos: [Festivo]? = nil
}

struct Festivo: Decodable, Equatable {
    var fecha: String? = nil
    var nombre: String? = nil
    /// LEY | EMPRESA
    var origen: String? = nil
    var finDeSemana: Bool? = nil
    var nota: String? = nil
    var como: FestivoComo? = nil
}

/// Cómo le toca a quien pregunta: si trabaja, con qué horario y si se paga doble.
struct FestivoComo: Decodable, Equatable {
    var trabaja: Bool? = nil
    /// nil = jornada completa.
    var horario: FestivoHorario? = nil
    var pagoDoble: Bool? = nil
}

/// «HH:MM» de México.
struct FestivoHorario: Decodable, Equatable {
    var entrada: String? = nil
    var salida: String? = nil
}

extension CoreRepository {
    /// Mi festivo de hoy y los próximos; la API resuelve si me toca y con qué horario.
    /// Una respuesta `null` (o vacía) es nil: no hay nada que pintar.
    func festivosMio() async throws -> FestivosMio? {
        let data = try await ApiClient.shared.get("festivos/mio")
        if CoreRepository.isQueuedOffline(data) { return nil }
        let texto = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if texto.isEmpty || texto == "null" { return nil }
        return try JSONDecoder().decode(FestivosMio.self, from: data)
    }
}
