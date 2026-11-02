import Foundation

// Formatos de actividad: un formato es una receta (qué actividades lleva, cuánto tarda cada una según
// la cantidad, qué se fotografía y qué herramienta se lleva). Lo que cambia —cliente, persona, día— se
// pide al aplicar. Espejo de los DTO de `CoreActivitiesApi.kt`, con sus mismos valores por omisión.

private extension KeyedDecodingContainer {
    /// Un campo raro no tumba la lista: se queda el valor por omisión.
    func tolerante<T: Decodable>(_ type: T.Type, _ key: Key) -> T? {
        try? decodeIfPresent(type, forKey: key)
    }
}

struct PuntoFormato: Codable, Hashable {
    let nombre: String
    let momentos: [String]

    private enum CodingKeys: String, CodingKey { case nombre, momentos }

    init(nombre: String, momentos: [String]) {
        self.nombre = nombre
        self.momentos = momentos
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        nombre = c.tolerante(String.self, .nombre) ?? ""
        momentos = c.tolerante([String].self, .momentos) ?? []
    }
}

struct HerramientaFormato: Codable, Hashable {
    let descripcion: String
    let cantidad: Int

    private enum CodingKeys: String, CodingKey { case descripcion, cantidad }

    init(descripcion: String, cantidad: Int) {
        self.descripcion = descripcion
        self.cantidad = cantidad
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        descripcion = c.tolerante(String.self, .descripcion) ?? ""
        cantidad = c.tolerante(Int.self, .cantidad) ?? 1
    }
}

struct RenglonFormato: Decodable, Hashable {
    let titulo: String
    let coreKind: String
    let tipo: String?
    let minutosBase: Int
    let minutosPorUnidad: Int
    let fotos: Int
    let indicaciones: String?
    let puntos: [PuntoFormato]
    let herramientas: [HerramientaFormato]

    private enum CodingKeys: String, CodingKey {
        case titulo, coreKind, tipo, minutosBase, minutosPorUnidad, fotos, indicaciones, puntos, herramientas
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        titulo = c.tolerante(String.self, .titulo) ?? ""
        coreKind = c.tolerante(String.self, .coreKind) ?? "tarea"
        tipo = c.tolerante(String.self, .tipo)
        minutosBase = c.tolerante(Int.self, .minutosBase) ?? 60
        minutosPorUnidad = c.tolerante(Int.self, .minutosPorUnidad) ?? 0
        fotos = c.tolerante(Int.self, .fotos) ?? 4
        indicaciones = c.tolerante(String.self, .indicaciones)
        puntos = c.tolerante([PuntoFormato].self, .puntos) ?? []
        herramientas = c.tolerante([HerramientaFormato].self, .herramientas) ?? []
    }
}

struct RecetaFormato: Decodable, Hashable {
    let unidad: String?
    let cantidadPorOmision: Int
    let renglones: [RenglonFormato]

    private enum CodingKeys: String, CodingKey { case unidad, cantidadPorOmision, renglones }

    init(unidad: String? = nil, cantidadPorOmision: Int = 1, renglones: [RenglonFormato] = []) {
        self.unidad = unidad
        self.cantidadPorOmision = cantidadPorOmision
        self.renglones = renglones
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        unidad = c.tolerante(String.self, .unidad)
        cantidadPorOmision = c.tolerante(Int.self, .cantidadPorOmision) ?? 1
        renglones = c.tolerante([RenglonFormato].self, .renglones) ?? []
    }
}

/// `GET formatos-actividad`: la receta.
struct FormatoActividad: Decodable, Identifiable, Hashable {
    let id: Int
    let nombre: String
    let descripcion: String?
    let usos: Int
    let receta: RecetaFormato

    private enum CodingKeys: String, CodingKey { case id, nombre, descripcion, usos, receta }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.tolerante(Int.self, .id) ?? 0
        nombre = c.tolerante(String.self, .nombre) ?? ""
        descripcion = c.tolerante(String.self, .descripcion)
        usos = c.tolerante(Int.self, .usos) ?? 0
        receta = c.tolerante(RecetaFormato.self, .receta) ?? RecetaFormato()
    }
}

/// Renglón tal como se manda al aplicar (lo que se editó en pantalla no cambia el formato).
struct RenglonAplicar: Encodable {
    let titulo: String
    let coreKind: String
    let tipo: String?
    let minutos: Int
    let minutosBase: Int
    let minutosPorUnidad: Int
    let fotos: Int
    let indicaciones: String?
    let puntos: [PuntoFormato]
    let herramientas: [HerramientaFormato]
}

/// `POST formatos-actividad/:id/aplicar`. La `clave` evita duplicar con dos toques.
struct AplicarFormatoBody: Encodable {
    let clave: String
    let responsableId: Int
    let equipoIds: [Int]
    let fecha: String
    let clientId: Int?
    let sucursal: String?
    let renglones: [RenglonAplicar]
}

struct ActividadAplicada: Decodable, Identifiable, Hashable {
    let id: Int
    let anNumber: String?
    let titulo: String

    private enum CodingKeys: String, CodingKey { case id, anNumber, titulo }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.tolerante(Int.self, .id) ?? 0
        anNumber = c.tolerante(String.self, .anNumber)
        titulo = c.tolerante(String.self, .titulo) ?? ""
    }
}

struct FallidaAplicar: Decodable, Hashable {
    let titulo: String
    let motivo: String

    private enum CodingKeys: String, CodingKey { case titulo, motivo }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        titulo = c.tolerante(String.self, .titulo) ?? ""
        motivo = c.tolerante(String.self, .motivo) ?? ""
    }
}

struct ResultadoAplicarFormato: Decodable, Hashable {
    let actividades: [ActividadAplicada]
    let fallidas: [FallidaAplicar]

    private enum CodingKeys: String, CodingKey { case actividades, fallidas }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        actividades = c.tolerante([ActividadAplicada].self, .actividades) ?? []
        fallidas = c.tolerante([FallidaAplicar].self, .fallidas) ?? []
    }
}

/// `POST proceso-tiempos`: cuánto tardó de verdad (Programa Velocidad Core).
struct ProcesoTiempoBody: Encodable {
    let proceso: String
    let duracionMs: Int
    let clics: Int?
    let entidadId: Int?
    let detalle: String?
}

/// Persona a la que se le puede asignar (`GET users/assignable`).
struct PersonaAsignable: Identifiable, Hashable {
    let id: Int
    let nombre: String
}

extension CoreRepository {
    func formatosActividad() async throws -> [FormatoActividad] {
        let data = try await ApiClient.shared.get("formatos-actividad")
        do {
            return try JSONDecoder().decode([FormatoActividad].self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    /// Solo en línea (`ApiClient.isOnlineOnly`): el paquete necesita la respuesta.
    func aplicarFormato(id: Int, datos: AplicarFormatoBody) async throws -> ResultadoAplicarFormato {
        try await CoreRepository.requireOnline()
        let data = try await ApiClient.shared.postJSON("formatos-actividad/\(id)/aplicar", body: datos)
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
        do {
            return try JSONDecoder().decode(ResultadoAplicarFormato.self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    /// Medir nunca estorba: si falla, no pasa nada.
    func registrarTiempo(_ datos: ProcesoTiempoBody) async {
        _ = try? await ApiClient.shared.postJSON("proceso-tiempos", body: datos)
    }

    /// Quien se puede asignar: `users/assignable` y, si falla, `users`. Sin las cuentas que no son
    /// de personal (Android `usersFetch`). Sin datos, la lista vacía.
    func personasAsignables() async -> [PersonaAsignable] {
        let data: Data?
        if let asignables = try? await ApiClient.shared.get("users/assignable") {
            data = asignables
        } else {
            data = try? await ApiClient.shared.get("users")
        }
        guard let data else { return [] }
        return ApiClient.decodeMapList(data).compactMap { fila -> PersonaAsignable? in
            guard let id = ActivityParse.int(fila["id"]),
                  !CoreOrg.isNonEmployee(ActivityParse.str(fila["email"])) else { return nil }
            return PersonaAsignable(id: id, nombre: ActivityParse.str(fila["nombre"]))
        }
    }
}
