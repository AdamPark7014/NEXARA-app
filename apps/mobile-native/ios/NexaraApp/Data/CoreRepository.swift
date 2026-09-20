import Foundation

/// Errores propios de Core que no son HTTP.
enum CoreError: LocalizedError {
    /// `ApiClient` guardó la mutación en la cola sin conexión.
    case queuedOffline
    case message(String)

    var errorDescription: String? {
        switch self {
        case .queuedOffline:
            return "Sin conexión: quedó en cola y se enviará cuando regrese la señal."
        case .message(let text):
            return text
        }
    }
}

// Cuerpos de las rutas de evidencia (mismos nombres que la web).

/// Foto de entrada o de salida de una actividad.
///
/// `mockLocation` viaja porque de estas dos fotos sale el tiempo productivo: si la
/// ubicación la produjo software hay que poder saberlo después. No bloquea la foto —eso
/// dejaría a alguien sin poder entregar su trabajo— pero el servidor la guarda marcada.
struct GeoPhotoPayload: Encodable {
    let photoUrl: String
    let latitude: Double
    let longitude: Double
    let mockLocation: Bool?

    init(photoUrl: String, latitude: Double, longitude: Double, mockLocation: Bool? = nil) {
        self.photoUrl = photoUrl
        self.latitude = latitude
        self.longitude = longitude
        self.mockLocation = mockLocation
    }
}

struct PhotoGeoPayload: Encodable {
    let latitude: Double
    let longitude: Double
    let capturedAt: String
}

struct EvidencePhotosPayload: Encodable {
    let photoUrls: [String]
    let photoGeo: [PhotoGeoPayload?]
}

struct ServiceSheetPdfPayload: Encodable {
    let pdfUrl: String
}

/// `POST activity-evidence/:id/campos/:fieldId/foto` (evidencia por campos). Mismo
/// cuerpo que la foto de entrada: la imagen va como data URL en `photoUrl` y el
/// API la guarda en disco.
struct CampoPhotoPayload: Encodable {
    /// ANTES | EN_PROGRESO | DESPUES
    let momento: String
    /// `data:image/jpeg;base64,…`
    let photoUrl: String
    let latitude: Double?
    let longitude: Double?
    /// ISO-8601 de cuando se tomó.
    let capturedAt: String?
}

struct ServiceSheetFormPayload: Encodable {
    let formData: [String: String]
}

/// Corrección de un paso devuelto: `POST activity-evidence/:id/resubmit`.
struct ResubmitPayload<StepData: Encodable>: Encodable {
    let step: String
    let data: StepData
}

/// Capa de datos de NEXARA Core: Mis actividades, pizarra, despacho, evidencias
/// del equipo y el flujo de captura del ejecutor.
final class CoreRepository {
    static let shared = CoreRepository()
    private let api = ApiClient.shared
    private init() {}

    // MARK: Helpers

    /// `ApiClient` responde `{"queued":true,"offline":true}` cuando no hay red.
    static func isQueuedOffline(_ data: Data) -> Bool {
        guard data.count <= 64,
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return (object["queued"] as? Bool) == true
    }

    /// Acciones con permiso de superior (cancelar, pasar, justificar, desactivar…) no van a
    /// la cola sin conexión: si el API las rechaza al reenviarlas, nadie se entera.
    static func requireOnline() async throws {
        guard await NetworkMonitor.shared.isOnline else {
            throw CoreError.message("Sin conexión: esta acción necesita señal. Intenta de nuevo cuando regrese.")
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    // MARK: Mis actividades

    func myActivities() async throws -> MyActivitiesResponse {
        let data = try await api.get("me/activities")
        return try decode(MyActivitiesResponse.self, from: data)
    }

    /// Solo encargados de área (`canReorder`). La justificación es obligatoria (≥ 10).
    func reorderMyActivities(activityIds: [Int], movedActivityId: Int, justificacion: String) async throws -> MyActivitiesResponse {
        struct Body: Encodable {
            let activityIds: [Int]
            let movedActivityId: Int
            let justificacion: String
        }
        let data = try await api.patchJSON(
            "me/activities/order",
            body: Body(activityIds: activityIds, movedActivityId: movedActivityId, justificacion: justificacion)
        )
        return try decode(MyActivitiesResponse.self, from: data)
    }

    /// «Iniciar actividad»: guarda la hora real de inicio (`POST me/activities/:id/iniciar`).
    /// No hay aceptar ni rechazar (regla del 18-09). Solo en línea: encolada, la hora
    /// sería la de cuando regrese la señal; sin red, la foto de entrada marca el inicio.
    func iniciarActividad(activityId: Int) async throws {
        struct Empty: Encodable {}
        try await CoreRepository.requireOnline()
        let data = try await api.postJSON("me/activities/\(activityId)/iniciar", body: Empty())
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    // MARK: Checklist de herramientas

    /// `GET me/activities/:id/herramientas`: qué hay que llevar y qué ya se palomeó.
    /// Solo de quien la tiene asignada (a los demás el API contesta 403).
    func herramientasChecklist(activityId: Int) async throws -> HerramientasChecklist {
        let data = try await api.get("me/activities/\(activityId)/herramientas")
        return try decode(HerramientasChecklist.self, from: data)
    }

    /// `POST me/activities/:id/herramientas/:requirementId/check`: «lo traigo y sirve»
    /// (`ok: true`) o «falta o está dañado» (`ok: false`). Devuelve el checklist completo.
    func palomearHerramienta(
        activityId: Int,
        requirementId: Int,
        ok: Bool,
        nota: String? = nil,
        fotoUrl: String? = nil
    ) async throws -> HerramientasChecklist {
        struct Body: Encodable {
            let ok: Bool
            let nota: String?
            let fotoUrl: String?
        }
        let data = try await api.postJSON(
            "me/activities/\(activityId)/herramientas/\(requirementId)/check",
            body: Body(ok: ok, nota: nota, fotoUrl: fotoUrl)
        )
        return try decode(HerramientasChecklist.self, from: data)
    }

    /// Quien reparte un despacho lo pasa a su equipo. Devuelve cuántos quedaron asignados.
    func dispatchActivity(activityId: Int, userIds: [Int], indicaciones: String?) async throws -> Int {
        struct Body: Encodable {
            let userIds: [Int]
            let indicaciones: String?
        }
        let data = try await api.postJSON(
            "me/activities/\(activityId)/despacho",
            body: Body(userIds: userIds, indicaciones: indicaciones)
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
        return ConsoleHelpers.mapInt(ConsoleHelpers.decodeMap(data), "asignados")
    }

    /// Quien reparte un despacho cambia su día y hora (queda como «Reprogramada por …»).
    func reprogramar(activityId: Int, fecha: Date, motivo: String?) async throws {
        struct Body: Encodable {
            let fecha: String
            let motivo: String?
        }
        let data = try await api.patchJSON(
            "me/activities/\(activityId)/reprogramar",
            body: Body(fecha: CoreFormat.isoString(fecha), motivo: motivo)
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    // MARK: Pizarra

    /// Safety net: Christian/Adam/Claudia/cuenta demo no deben verse como equipo/empleados.
    func teamBoard() async throws -> TeamBoardResponse {
        let data = try await api.get("me/board")
        let decoded = try decode(TeamBoardResponse.self, from: data)
        return TeamBoardResponse(
            scope: decoded.scope,
            users: decoded.users.filter { !CoreOrg.isNonEmployee($0.email) }
        )
    }

    func teamBoardUser(userId: Int) async throws -> TeamBoardUser {
        let data = try await api.get("me/board/\(userId)")
        return try decode(TeamBoardUser.self, from: data)
    }

    func teamBoardHistory(userId: Int) async throws -> [TeamBoardHistoryItem] {
        let data = try await api.get("me/board/\(userId)/history")
        return try decode([TeamBoardHistoryItem].self, from: data)
    }

    // MARK: Detalle e historial

    func activityDetail(activityId: Int) async throws -> [String: Any] {
        let data = try await api.get("activities/\(activityId)")
        return ConsoleHelpers.decodeMap(data)
    }

    /// `GET activities/:id/timeline` (ActivityTeamController). No existe
    /// `activities/:id/team/timeline`: pedirla primero solo gastaba un 404.
    func timeline(activityId: Int) async throws -> [ActivityTimelineEvent] {
        let data = try await api.get("activities/\(activityId)/timeline")
        if let wrapped = try? JSONDecoder().decode(ActivityTimelineResponse.self, from: data), let events = wrapped.events {
            return events
        }
        return try decode([ActivityTimelineEvent].self, from: data)
    }

    // MARK: Acciones de superior

    /// `GET activities/:id/acciones`: si quien consulta puede cancelarla o pasarla y de quién.
    func superiorActions(activityId: Int) async throws -> ActivitySuperiorActions {
        let data = try await api.get("activities/\(activityId)/acciones")
        return try decode(ActivitySuperiorActions.self, from: data)
    }

    /// `POST activities/:id/cancelar { motivo }` (mínimo 10 caracteres).
    func cancelActivity(activityId: Int, motivo: String) async throws {
        struct Body: Encodable { let motivo: String }
        try await CoreRepository.requireOnline()
        let data = try await api.postJSON("activities/\(activityId)/cancelar", body: Body(motivo: motivo))
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    /// `POST activities/:id/reasignar { aUsuarioId, deUsuarioId, motivo }`: quien la tenía deja
    /// su lugar y quien entra continúa con su propia evidencia.
    func reassignActivity(activityId: Int, aUsuarioId: Int, deUsuarioId: Int, motivo: String) async throws {
        struct Body: Encodable {
            let aUsuarioId: Int
            let deUsuarioId: Int
            let motivo: String
        }
        try await CoreRepository.requireOnline()
        let data = try await api.postJSON(
            "activities/\(activityId)/reasignar",
            body: Body(aUsuarioId: aUsuarioId, deUsuarioId: deUsuarioId, motivo: motivo)
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    // MARK: Evidencias del equipo

    func teamEvidence(activityId: Int) async throws -> TeamEvidenceResponse {
        let data = try await api.get("me/activities/\(activityId)/evidencias")
        return try decode(TeamEvidenceResponse.self, from: data)
    }

    func reviewTeamEvidence(activityId: Int, userId: Int, input: ReviewEvidenceInput) async throws -> TeamEvidenceResponse {
        let data = try await api.postJSON("me/activities/\(activityId)/evidencias/\(userId)/revision", body: input)
        return try decode(TeamEvidenceResponse.self, from: data)
    }

    // MARK: Captura del ejecutor

    /// `nil` cuando todavía no hay flujo: el API responde 404 hasta el primer envío.
    func evidenceFlow(activityId: Int) async throws -> EvidenceFlowState? {
        do {
            let data = try await api.get("activity-evidence/\(activityId)")
            return try decode(EvidenceFlowState.self, from: data)
        } catch let ApiError.http(code, _) where code == 404 {
            return nil
        }
    }

    /// Devuelve la fila guardada o `nil` si quedó en la cola sin conexión.
    private func postEvidence<Body: Encodable>(_ path: String, body: Body) async throws -> EvidenceFlowState? {
        let data = try await api.postJSON(path, body: body)
        if CoreRepository.isQueuedOffline(data) { return nil }
        return try decode(EvidenceFlowState.self, from: data)
    }

    func submitEntryPhoto(activityId: Int, photo: GeoPhotoPayload, correction: Bool) async throws -> EvidenceFlowState? {
        if correction {
            return try await postEvidence(
                "activity-evidence/\(activityId)/resubmit",
                body: ResubmitPayload(step: CoreEvidence.entryPhoto, data: photo)
            )
        }
        return try await postEvidence("activity-evidence/\(activityId)/entry-photo", body: photo)
    }

    func submitEvidencePhotos(activityId: Int, photos: EvidencePhotosPayload, correction: Bool) async throws -> EvidenceFlowState? {
        if correction {
            return try await postEvidence(
                "activity-evidence/\(activityId)/resubmit",
                body: ResubmitPayload(step: CoreEvidence.evidencePhotos, data: photos)
            )
        }
        return try await postEvidence("activity-evidence/\(activityId)/evidence-photos", body: photos)
    }

    /// Evidencia por campos: una foto de un campo en un momento. El API responde
    /// con la lista COMPLETA de campos de la actividad (`CampoDto[]`, no el
    /// flujo); `nil` si quedó en la cola sin conexión.
    func submitCampoPhoto(
        activityId: Int,
        campoId: Int,
        momento: String,
        photoUrl: String,
        latitude: Double?,
        longitude: Double?,
        capturedAt: String?
    ) async throws -> [EvidenceCampo]? {
        let data = try await api.postJSON(
            "activity-evidence/\(activityId)/campos/\(campoId)/foto",
            body: CampoPhotoPayload(
                momento: momento,
                photoUrl: photoUrl,
                latitude: latitude,
                longitude: longitude,
                capturedAt: capturedAt
            )
        )
        if CoreRepository.isQueuedOffline(data) { return nil }
        return try decode([EvidenceCampo].self, from: data)
    }

    func submitServiceSheetPdf(activityId: Int, pdfDataUrl: String, correction: Bool) async throws -> EvidenceFlowState? {
        let payload = ServiceSheetPdfPayload(pdfUrl: pdfDataUrl)
        if correction {
            return try await postEvidence(
                "activity-evidence/\(activityId)/resubmit",
                body: ResubmitPayload(step: CoreEvidence.serviceSheetPdf, data: payload)
            )
        }
        return try await postEvidence("activity-evidence/\(activityId)/service-sheet-pdf", body: payload)
    }

    /// El formulario viaja plano en el paso normal y como `{formData}` en la corrección.
    func submitServiceSheetData(activityId: Int, fields: [String: String], correction: Bool) async throws -> EvidenceFlowState? {
        if correction {
            return try await postEvidence(
                "activity-evidence/\(activityId)/resubmit",
                body: ResubmitPayload(step: CoreEvidence.serviceSheetData, data: ServiceSheetFormPayload(formData: fields))
            )
        }
        return try await postEvidence("activity-evidence/\(activityId)/service-sheet-data", body: fields)
    }

    func submitExitPhoto(activityId: Int, photo: GeoPhotoPayload, correction: Bool) async throws -> EvidenceFlowState? {
        if correction {
            return try await postEvidence(
                "activity-evidence/\(activityId)/resubmit",
                body: ResubmitPayload(step: CoreEvidence.exitPhoto, data: photo)
            )
        }
        return try await postEvidence("activity-evidence/\(activityId)/exit-photo", body: photo)
    }

    /// Reemplaza una foto de evidencia ya guardada.
    func replaceEvidencePhoto(activityId: Int, index: Int, photoUrl: String) async throws -> EvidenceFlowState? {
        struct Body: Encodable { let photoUrl: String }
        return try await postEvidence(
            "activity-evidence/\(activityId)/evidence-photo/\(index)",
            body: Body(photoUrl: photoUrl)
        )
    }

    /// Quita una foto de evidencia ya guardada.
    func removeEvidencePhoto(activityId: Int, index: Int) async throws -> EvidenceFlowState? {
        struct Body: Encodable {}
        return try await postEvidence(
            "activity-evidence/\(activityId)/evidence-photo/\(index)/remove",
            body: Body()
        )
    }
}
