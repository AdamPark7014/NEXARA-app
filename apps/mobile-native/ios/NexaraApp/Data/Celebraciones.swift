import Foundation

// Cumpleaños y aniversarios de ingreso del equipo para el aviso de Actividades.
// Espejo de `GET me/celebraciones/hoy` (`celebrations.service.ts`) y de los textos de
// `apps/api/src/celebrations/celebraciones.ts`. La edad nunca se muestra: en
// cumpleaños el API ni siquiera la manda (`anios` es nulo).

enum CelebracionTipo {
    static let cumpleanos = "cumpleanos"
    static let aniversario = "aniversario"
}

struct CelebracionHoy: Decodable, Identifiable, Hashable {
    let userId: Int
    let nombre: String
    let avatarUrl: String?
    /// `cumpleanos` | `aniversario`.
    let tipo: String
    /// Solo en aniversarios: años en NEXARA.
    let anios: Int?
    let soyYo: Bool

    var id: String { "\(tipo)-\(userId)" }
    var esCumpleanos: Bool { tipo.lowercased() == CelebracionTipo.cumpleanos }

    private enum CodingKeys: String, CodingKey {
        case userId, nombre, avatarUrl, tipo, anios, soyYo
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        userId = try container.decode(Int.self, forKey: .userId)
        nombre = ((try? container.decode(String.self, forKey: .nombre)) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        avatarUrl = try? container.decode(String.self, forKey: .avatarUrl)
        tipo = (try? container.decode(String.self, forKey: .tipo)) ?? CelebracionTipo.cumpleanos
        anios = try? container.decode(Int.self, forKey: .anios)
        soyYo = (try? container.decode(Bool.self, forKey: .soyYo)) ?? false
    }

    /// «Carolina», no «Carolina Juárez Álvarez» (`primerNombre` del API).
    static func primerNombre(_ nombre: String) -> String {
        guard let primero = nombre.split(whereSeparator: { $0.isWhitespace }).first else { return "" }
        return String(primero.prefix(1)).uppercased() + String(primero.dropFirst())
    }

    /// Una frase, la misma que Android (`Celebraciones.linea`) y la web (`textoCelebracion`).
    /// El cumpleaños nunca lleva la edad; el aniversario, solo los años en NEXARA.
    var titulo: String {
        let tiempo: String? = anios.flatMap { $0 > 0 ? ($0 == 1 ? "1 año" : "\($0) años") : nil }
        if soyYo {
            let quien = Self.primerNombre(nombre)
            if esCumpleanos {
                let saludo = quien.isEmpty ? "¡Feliz cumpleaños" : "¡Feliz cumpleaños, \(quien)"
                return "\(saludo): todo el equipo te desea un gran día! 🎂"
            }
            let saludo = quien.isEmpty ? "¡Felicidades" : "¡Felicidades, \(quien)"
            let hecho = tiempo.map { "hoy cumples \($0) en NEXARA" } ?? "hoy es tu aniversario en NEXARA"
            return "\(saludo): \(hecho)! 🎉"
        }
        let quien = nombre.isEmpty ? "alguien del equipo" : nombre
        if esCumpleanos {
            return "Hoy es cumpleaños de \(quien) 🎂"
        }
        if let tiempo {
            let sujeto = nombre.isEmpty ? "Alguien del equipo" : nombre
            return "\(sujeto) cumple \(tiempo) en NEXARA 🎉"
        }
        return "Hoy es aniversario de \(quien) en NEXARA 🎉"
    }
}

struct CelebracionesHoy: Decodable {
    /// Día de la empresa, `AAAA-MM-DD`: con él se recuerda si ya se cerró el aviso.
    let fecha: String
    let celebraciones: [CelebracionHoy]

    private enum CodingKeys: String, CodingKey {
        case fecha, celebraciones
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        fecha = (try? container.decode(String.self, forKey: .fecha)) ?? ""
        celebraciones = (try? container.decode([CelebracionHoy].self, forKey: .celebraciones)) ?? []
    }
}

/// «Cerrar» vale solo por ese día: mañana, con otra fecha, el aviso vuelve a salir.
enum CelebracionesAviso {
    private static func key(userId: String?) -> String {
        "nx-celebraciones-cerrado-\(userId ?? "anon")"
    }

    static func cerrado(fecha: String, userId: String?) -> Bool {
        !fecha.isEmpty && UserDefaults.standard.string(forKey: key(userId: userId)) == fecha
    }

    static func cerrar(fecha: String, userId: String?) {
        guard !fecha.isEmpty else { return }
        UserDefaults.standard.set(fecha, forKey: key(userId: userId))
    }
}

final class CelebracionesRepository {
    static let shared = CelebracionesRepository()
    private let api = ApiClient.shared
    private init() {}

    /// `GET me/celebraciones/hoy`.
    func deHoy() async throws -> CelebracionesHoy {
        let data = try await api.get("me/celebraciones/hoy")
        return try JSONDecoder().decode(CelebracionesHoy.self, from: data)
    }
}
