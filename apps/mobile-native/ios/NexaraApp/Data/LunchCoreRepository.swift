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
