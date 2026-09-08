import Foundation

/// Capa de datos de RR. HH. — permisos, evaluaciones, panel de personas y CVs.
///
/// Por qué existe habiendo `ExtraRepository`: allí RR. HH. era una sola línea
/// (`load("hr/leaves")`) que devolvía la lista y se comía cualquier error. Con
/// eso la pantalla no podía aprobar, rechazar, cancelar ni dar de alta nada, y
/// tampoco podía distinguir «no hay permisos» de «el servidor respondió 403».
/// Aquí los métodos que escriben **propagan** el error para que la vista pueda
/// decir qué pasó, igual que hace `ExtraRepository.kt` en Android.
final class HrRepository {
    static let shared = HrRepository()
    private let api = ApiClient.shared
    private init() {}

    // MARK: Permisos (leaves)

    /// `GET hr/leaves`. Los filtros son los del controlador Nest; se mandan
    /// sólo cuando valen algo para no forzar un `WHERE` vacío.
    func leaves(status: String? = nil, type: String? = nil, userId: Int64? = nil) async throws -> [HrLeave] {
        var query: [String: String] = [:]
        if let status, !status.isEmpty { query["status"] = status }
        if let type, !type.isEmpty { query["type"] = type }
        if let userId, userId > 0 { query["userId"] = String(userId) }
        let data = try await api.get("hr/leaves", query: query)
        return ApiClient.decodeMapList(data).map { HrLeave(raw: $0) }
    }

    /// Alta de solicitud propia. Las fechas van en AAAA-MM-DD; validar antes
    /// con `HrLeaveDraft.validate` evita gastar el viaje de red.
    func createLeave(type: String, startDate: String, endDate: String, reason: String?) async throws {
        struct Body: Encodable {
            let type: String
            let startDate: String
            let endDate: String
            let reason: String?
        }
        _ = try await api.postJSON("hr/leaves", body: Body(
            type: type, startDate: startDate, endDate: endDate, reason: reason
        ))
    }

    /// `PATCH hr/leaves/:id/approve` — exige el permiso `hr.approve_leave`.
    /// El API no espera cuerpo, pero `patchJSON` siempre manda uno: va vacío.
    func approveLeave(id: Int64) async throws {
        _ = try await api.patchJSON("hr/leaves/\(id)/approve", body: EmptyBody())
    }

    /// `PATCH hr/leaves/:id/reject`. El motivo es obligatorio en la práctica:
    /// una solicitud rechazada sin explicación acaba en una llamada al de RR. HH.
    func rejectLeave(id: Int64, reason: String) async throws {
        struct Body: Encodable { let rejectionReason: String }
        _ = try await api.patchJSON("hr/leaves/\(id)/reject", body: Body(rejectionReason: reason))
    }

    /// `PATCH hr/leaves/:id/cancel`. El servidor sólo deja cancelar la propia
    /// y sólo mientras siga pendiente; la vista esconde el botón en el resto.
    func cancelLeave(id: Int64) async throws {
        _ = try await api.patchJSON("hr/leaves/\(id)/cancel", body: EmptyBody())
    }

    /// `GET hr/leaves/balance/:userId`. Sólo suma lo aprobado del año.
    func leaveBalance(userId: Int64, year: Int? = nil) async throws -> HrLeaveBalance {
        var query: [String: String] = [:]
        if let year { query["year"] = String(year) }
        let data = try await api.get("hr/leaves/balance/\(userId)", query: query)
        return HrLeaveBalance(raw: ConsoleHelpers.decodeMap(data))
    }

    // MARK: Evaluaciones de desempeño

    /// `GET hr/reviews`.
    func reviews(status: String? = nil, period: String? = nil, userId: Int64? = nil) async throws -> [HrReviewItem] {
        var query: [String: String] = [:]
        if let status, !status.isEmpty { query["status"] = status }
        if let period, !period.isEmpty { query["period"] = period }
        if let userId, userId > 0 { query["userId"] = String(userId) }
        let data = try await api.get("hr/reviews", query: query)
        return ApiClient.decodeMapList(data).map { HrReviewItem(raw: $0) }
    }

    /// `PATCH hr/reviews/:id/submit` — el evaluador cierra el borrador.
    func submitReview(id: Int64) async throws -> HrReviewItem {
        let data = try await api.patchJSON("hr/reviews/\(id)/submit", body: EmptyBody())
        return HrReviewItem(raw: ConsoleHelpers.decodeMap(data))
    }

    /// `PATCH hr/reviews/:id/acknowledge` — el evaluado confirma que la recibió.
    func acknowledgeReview(id: Int64) async throws -> HrReviewItem {
        let data = try await api.patchJSON("hr/reviews/\(id)/acknowledge", body: EmptyBody())
        return HrReviewItem(raw: ConsoleHelpers.decodeMap(data))
    }

    // MARK: Panel de personas

    /// `GET hr/dashboard` — el API lo resuelve con el mismo cálculo que
    /// alimenta `/erp/hr/kpis` en la web.
    func dashboard() async throws -> HrPeopleDashboard {
        let data = try await api.get("hr/dashboard")
        return HrPeopleDashboard(raw: ConsoleHelpers.decodeMap(data))
    }

    // MARK: CVs

    /// `GET cvs`. Duplica a `ExtraRepository.candidateItems()` a propósito:
    /// aquélla se traga el error y devuelve lista vacía, y en la pantalla de
    /// reclutamiento eso se lee igual que «no hay candidatos».
    func candidates(stage: String? = nil) async throws -> [CandidateItem] {
        var query: [String: String] = [:]
        if let stage, !stage.isEmpty { query["stage"] = stage }
        let data = try await api.get("cvs", query: query)
        return ApiClient.decodeMapList(data).map { CandidateItem(raw: $0) }
    }
}

/// Cuerpo vacío para los PATCH que el API no necesita leer.
/// Privado a propósito: cada repositorio declara el suyo y así no colisionan.
private struct EmptyBody: Encodable {}
