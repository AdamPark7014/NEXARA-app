import Foundation

// Hora de comida de Core (espejo de `apps/web/components/asistencias/ComidasPanel.tsx`
// y de `lunch-breaks.controller.ts`): salida y regreso con foto; fuera de
// 3:00–4:00 p.m. (regreso después de 4:05) se escribe por qué y el jefe lo
// aprueba o rechaza. Dirección (gerencia@) no registra la suya.

/// Registro de comida de una persona en un día.
struct LunchRecord: Decodable, Identifiable, Hashable {
    let id: Int
    let userId: Int?
    let status: String?
    let checkinTime: String?
    let checkoutTime: String?
    let checkinPhotoUrl: String?
    let checkoutPhotoUrl: String?
    let isCheckinLate: Bool?
    let isCheckoutLate: Bool?
    let checkinJustificacion: String?
    let checkoutJustificacion: String?
    /// `nil` = a tiempo · PENDIENTE | APROBADA | RECHAZADA cuando fue a destiempo.
    let revisionEstado: String?
    let revisionNotas: String?
    let revisadoPor: String?
    let revisadoAt: String?
    let minutos: Int?

    var isOut: Bool { (checkoutTime ?? "").isEmpty }

    private enum CodingKeys: String, CodingKey {
        case id, userId, status, checkinTime, checkoutTime, checkinPhotoUrl, checkoutPhotoUrl
        case isCheckinLate, isCheckoutLate, checkinJustificacion, checkoutJustificacion
        case revisionEstado, revisionNotas, revisadoPor, revisadoAt, minutos
    }

    /// Tolerante como el Gson de Android: un campo con otro tipo (minutos con
    /// decimales, un id en texto) ya no tira el registro entero —antes la tarjeta de
    /// la comida desaparecía en silencio porque `registro` se leía con `try?`.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let n = try? c.decode(Int.self, forKey: .id) {
            id = n
        } else if let s = try? c.decode(String.self, forKey: .id), let n = Int(s) {
            id = n
        } else {
            id = 0
        }
        userId = try? c.decode(Int.self, forKey: .userId)
        status = try? c.decode(String.self, forKey: .status)
        checkinTime = try? c.decode(String.self, forKey: .checkinTime)
        checkoutTime = try? c.decode(String.self, forKey: .checkoutTime)
        checkinPhotoUrl = try? c.decode(String.self, forKey: .checkinPhotoUrl)
        checkoutPhotoUrl = try? c.decode(String.self, forKey: .checkoutPhotoUrl)
        isCheckinLate = try? c.decode(Bool.self, forKey: .isCheckinLate)
        isCheckoutLate = try? c.decode(Bool.self, forKey: .isCheckoutLate)
        checkinJustificacion = try? c.decode(String.self, forKey: .checkinJustificacion)
        checkoutJustificacion = try? c.decode(String.self, forKey: .checkoutJustificacion)
        revisionEstado = try? c.decode(String.self, forKey: .revisionEstado)
        revisionNotas = try? c.decode(String.self, forKey: .revisionNotas)
        revisadoPor = try? c.decode(String.self, forKey: .revisadoPor)
        revisadoAt = try? c.decode(String.self, forKey: .revisadoAt)
        if let n = try? c.decode(Int.self, forKey: .minutos) {
            minutos = n
        } else if let d = try? c.decode(Double.self, forKey: .minutos), d.isFinite {
            minutos = Int(d.rounded())
        } else {
            minutos = nil
        }
    }
}

struct LunchWindow: Decodable, Hashable {
    let inicio: String?
    let fin: String?
    let regresoLimite: String?
    let texto: String?
}

/// `GET lunch-breaks/mi-dia`.
struct LunchMyDay: Decodable {
    let debeRegistrar: Bool
    let ahora: String?
    let ventana: LunchWindow?
    let salidaADestiempo: Bool
    let regresoADestiempo: Bool
    /// salida · regreso · listo · no_aplica
    let siguiente: String
    let registro: LunchRecord?

    private enum CodingKeys: String, CodingKey {
        case debeRegistrar, ahora, ventana, salidaADestiempo, regresoADestiempo, siguiente, registro
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        debeRegistrar = (try? container.decode(Bool.self, forKey: .debeRegistrar)) ?? false
        ahora = try? container.decode(String.self, forKey: .ahora)
        ventana = try? container.decode(LunchWindow.self, forKey: .ventana)
        salidaADestiempo = (try? container.decode(Bool.self, forKey: .salidaADestiempo)) ?? false
        regresoADestiempo = (try? container.decode(Bool.self, forKey: .regresoADestiempo)) ?? false
        siguiente = (try? container.decode(String.self, forKey: .siguiente)) ?? "no_aplica"
        registro = try? container.decode(LunchRecord.self, forKey: .registro)
    }

    var windowText: String { ventana?.texto ?? "3:00 a 4:00 p.m." }
}

struct LunchTeamRow: Decodable, Identifiable, Hashable {
    let userId: Int
    let nombre: String
    let puesto: String?
    let avatarUrl: String?
    let registro: LunchRecord?
    let puedoRevisar: Bool?

    var id: Int { userId }
    var canReview: Bool { puedoRevisar == true }

    private enum CodingKeys: String, CodingKey {
        case userId, nombre, puesto, avatarUrl, registro, puedoRevisar
    }

    /// Un nombre en `null` o un registro con forma rara no tiran la lista entera.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userId = try c.decode(Int.self, forKey: .userId)
        nombre = (try? c.decode(String.self, forKey: .nombre)) ?? "—"
        puesto = try? c.decode(String.self, forKey: .puesto)
        avatarUrl = try? c.decode(String.self, forKey: .avatarUrl)
        registro = try? c.decode(LunchRecord.self, forKey: .registro)
        puedoRevisar = try? c.decode(Bool.self, forKey: .puedoRevisar)
    }
}

struct LunchTeamSummary: Decodable, Hashable {
    let total: Int
    let registraron: Int
    let enComida: Int
    let aDestiempo: Int
    let pendientes: Int
}

/// `GET lunch-breaks/equipo?fecha=`.
struct LunchTeamResponse: Decodable {
    let fecha: String?
    /// todo · equipo · propio
    let alcance: String?
    let filas: [LunchTeamRow]
    let resumen: LunchTeamSummary?

    var hasTeam: Bool { (alcance ?? "propio") != "propio" }
}

final class LunchCoreRepository {
    static let shared = LunchCoreRepository()
    private let api = ApiClient.shared
    private init() {}

    /// Justificación mínima (salida/regreso a destiempo y rechazo).
    static let minReason = 5

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    private static func cleanReason(_ text: String?) -> String? {
        let trimmed = (text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    func myDay() async throws -> LunchMyDay {
        let data = try await api.get("lunch-breaks/mi-dia")
        return try decode(LunchMyDay.self, from: data)
    }

    /// Salida a comer. Devuelve `false` si quedó en la cola sin conexión.
    ///
    /// `at` es la hora **del servidor** (`mi-dia.ahora` más lo que haya corrido
    /// el reloj desde entonces): un teléfono adelantado diez minutos marcaba la
    /// comida fuera de horario y pedía justificación por nada.
    func checkIn(photoDataUrl: String, justificacion: String?, at: Date = Date()) async throws -> Bool {
        struct Body: Encodable {
            let checkinTime: String
            let checkinPhotoUrl: String
            let justificacion: String?
        }
        let data = try await api.postJSON("lunch-breaks/checkin", body: Body(
            checkinTime: CoreFormat.isoString(at),
            checkinPhotoUrl: photoDataUrl,
            justificacion: LunchCoreRepository.cleanReason(justificacion)
        ))
        return !CoreRepository.isQueuedOffline(data)
    }

    /// Regreso de comer. Devuelve `false` si quedó en la cola sin conexión.
    func checkOut(photoDataUrl: String, justificacion: String?, at: Date = Date()) async throws -> Bool {
        struct Body: Encodable {
            let checkoutTime: String
            let checkoutPhotoUrl: String
            let justificacion: String?
        }
        let data = try await api.putJSON("lunch-breaks/checkout", body: Body(
            checkoutTime: CoreFormat.isoString(at),
            checkoutPhotoUrl: photoDataUrl,
            justificacion: LunchCoreRepository.cleanReason(justificacion)
        ))
        return !CoreRepository.isQueuedOffline(data)
    }

    /// Comidas de mi gente en un día (`yyyy-MM-dd`).
    func team(fecha: String) async throws -> LunchTeamResponse {
        let data = try await api.get("lunch-breaks/equipo", query: ["fecha": fecha])
        return try decode(LunchTeamResponse.self, from: data)
    }

    /// Aprobar o rechazar una comida a destiempo (las notas son obligatorias al rechazar).
    func review(id: Int, decision: String, notas: String?) async throws {
        struct Body: Encodable {
            let decision: String
            let notas: String?
        }
        let data = try await api.patchJSON(
            "lunch-breaks/\(id)/revision",
            body: Body(decision: decision, notas: LunchCoreRepository.cleanReason(notas))
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }
}
