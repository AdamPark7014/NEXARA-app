import Foundation

/// `GET/POST/DELETE /guardias`. A quién se programa lo dice el API.
struct PersonaGuardia: Decodable, Identifiable, Hashable {
    let id: Int
    let nombre: String
    let puesto: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = Self.entero(c, .id)
        nombre = (try c.decodeIfPresent(String.self, forKey: .nombre)) ?? ""
        puesto = try c.decodeIfPresent(String.self, forKey: .puesto)
    }

    private enum CodingKeys: String, CodingKey { case id, nombre, puesto }

    private static func entero(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> Int {
        if let n = try? c.decode(Int.self, forKey: key) { return n }
        if let n = try? c.decode(Double.self, forKey: key) { return Int(n) }
        if let s = try? c.decode(String.self, forKey: key), let n = Int(s) { return n }
        return 0
    }
}

struct GuardiaItem: Decodable, Identifiable, Hashable {
    let id: Int
    let userId: Int
    let fecha: String
    let nota: String?
    let persona: PersonaGuardia?
    let puedeQuitar: Bool

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = Self.entero(c, .id)
        userId = Self.entero(c, .userId)
        fecha = (try c.decodeIfPresent(String.self, forKey: .fecha)) ?? ""
        nota = try c.decodeIfPresent(String.self, forKey: .nota)
        persona = try c.decodeIfPresent(PersonaGuardia.self, forKey: .persona)
        puedeQuitar = (try c.decodeIfPresent(Bool.self, forKey: .puedeQuitar)) ?? false
    }

    private enum CodingKeys: String, CodingKey { case id, userId, fecha, nota, persona, puedeQuitar }

    private static func entero(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> Int {
        if let n = try? c.decode(Int.self, forKey: key) { return n }
        if let n = try? c.decode(Double.self, forKey: key) { return Int(n) }
        if let s = try? c.decode(String.self, forKey: key), let n = Int(s) { return n }
        return 0
    }
}

struct GuardiasRango: Decodable {
    let desde: String
    let hasta: String
    let hoy: String
    let puedeProgramar: Bool
    let personas: [PersonaGuardia]
    let items: [GuardiaItem]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        desde = (try c.decodeIfPresent(String.self, forKey: .desde)) ?? ""
        hasta = (try c.decodeIfPresent(String.self, forKey: .hasta)) ?? ""
        hoy = (try c.decodeIfPresent(String.self, forKey: .hoy)) ?? ""
        puedeProgramar = (try c.decodeIfPresent(Bool.self, forKey: .puedeProgramar)) ?? false
        personas = (try c.decodeIfPresent([PersonaGuardia].self, forKey: .personas)) ?? []
        items = (try c.decodeIfPresent([GuardiaItem].self, forKey: .items)) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case desde, hasta, hoy, puedeProgramar, personas, items
    }
}

private struct ProgramarGuardiaBody: Encodable {
    let userId: Int
    let fecha: String
    let nota: String?

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(userId, forKey: .userId)
        try c.encode(fecha, forKey: .fecha)
        if let nota, !nota.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            try c.encode(nota, forKey: .nota)
        }
    }

    private enum CodingKeys: String, CodingKey { case userId, fecha, nota }
}

enum GuardiasRepository {
    static func listar() async throws -> GuardiasRango {
        let data = try await ApiClient.shared.get("guardias")
        return try JSONDecoder().decode(GuardiasRango.self, from: data)
    }

    static func programar(userId: Int, fecha: String, nota: String?) async throws {
        let body = ProgramarGuardiaBody(userId: userId, fecha: fecha, nota: nota)
        _ = try await ApiClient.shared.postJSON("guardias", body: body)
    }

    static func quitar(id: Int) async throws {
        try await ApiClient.shared.delete("guardias/\(id)")
    }
}
