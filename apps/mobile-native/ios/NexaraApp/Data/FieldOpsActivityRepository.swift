import Foundation

/// Operación de campo sobre una actividad: incidencias, recomendaciones,
/// reasignación, ejecución (iniciar/finalizar) y reportes.
///
/// Por qué un repositorio propio y no `ConsoleRepository`: ese fichero lo están
/// escribiendo otros agentes en paralelo sobre la misma rama y cada merge suyo
/// se llevaría estos métodos por delante. Aquí no colisiona con nadie.
///
/// Paridad: `ConsoleRepository.kt` de Android (activityIncidents,
/// addActivityIncident, resolveActivityIncident, reopenActivityIncident,
/// activityRecommendations, addActivityRecommendation,
/// updateActivityRecommendation, reassignActivity, activityReassignments,
/// executeActivity, activitiesDetailed, adminTicketReportPdf).
final class FieldOpsActivityRepository {
    static let shared = FieldOpsActivityRepository()
    private let api = ApiClient.shared
    private init() {}

    // MARK: Incidencias

    func incidents(activityId: Int64) async throws -> [ActivityIncident] {
        ApiClient.decodeMapList(try await api.get("activities/\(activityId)/incidencias"))
            .map { ActivityIncident(raw: $0) }
    }

    /// El backend valida `tipo` y `severidad` contra un catálogo cerrado, por eso
    /// la UI solo ofrece los códigos de `FieldOpsCatalog` y aquí no se normaliza
    /// nada: si llegara un código inventado, mejor un 400 visible que un registro
    /// silencioso con basura dentro.
    func addIncident(
        activityId: Int64,
        tipo: String,
        severidad: String,
        descripcion: String,
        accionTomada: String?,
        horasPerdidas: Double?
    ) async throws -> ActivityIncident {
        struct Body: Encodable {
            let tipo: String
            let severidad: String
            let descripcion: String
            let accionTomada: String?
            let horasPerdidas: Double?
        }
        let data = try await api.postJSON("activities/\(activityId)/incidencias", body: Body(
            tipo: tipo,
            severidad: severidad,
            descripcion: descripcion,
            accionTomada: accionTomada?.nilIfEmpty,
            horasPerdidas: horasPerdidas
        ))
        return ActivityIncident(raw: ConsoleHelpers.decodeMap(data))
    }

    func resolveIncident(activityId: Int64, incidentId: Int64, accionTomada: String?) async throws {
        struct Body: Encodable { let accionTomada: String? }
        _ = try await api.patchJSON(
            "activities/\(activityId)/incidencias/\(incidentId)/resolver",
            body: Body(accionTomada: accionTomada?.nilIfEmpty)
        )
    }

    /// Reabrir no lleva cuerpo en el API, pero `ApiClient` no expone un PATCH sin
    /// body: se manda un objeto vacío, que es lo mismo que hace Android.
    func reopenIncident(activityId: Int64, incidentId: Int64) async throws {
        struct Empty: Encodable {}
        _ = try await api.patchJSON(
            "activities/\(activityId)/incidencias/\(incidentId)/reabrir",
            body: Empty()
        )
    }

    // MARK: Recomendaciones

    func recommendations(activityId: Int64) async throws -> [ActivityRecommendation] {
        ApiClient.decodeMapList(try await api.get("activities/\(activityId)/recomendaciones"))
            .map { ActivityRecommendation(raw: $0) }
    }

    func addRecommendation(
        activityId: Int64,
        tipo: String,
        prioridad: String,
        descripcion: String,
        costoEstimado: Double?
    ) async throws -> ActivityRecommendation {
        struct Body: Encodable {
            let tipo: String
            let prioridad: String
            let descripcion: String
            let costoEstimado: Double?
        }
        let data = try await api.postJSON("activities/\(activityId)/recomendaciones", body: Body(
            tipo: tipo,
            prioridad: prioridad,
            descripcion: descripcion,
            costoEstimado: costoEstimado
        ))
        return ActivityRecommendation(raw: ConsoleHelpers.decodeMap(data))
    }

    func updateRecommendation(
        activityId: Int64,
        recommendationId: Int64,
        estado: String? = nil,
        prioridad: String? = nil,
        costoEstimado: Double? = nil
    ) async throws -> ActivityRecommendation {
        struct Body: Encodable {
            let estado: String?
            let prioridad: String?
            let costoEstimado: Double?
        }
        let data = try await api.patchJSON(
            "activities/\(activityId)/recomendaciones/\(recommendationId)",
            body: Body(estado: estado, prioridad: prioridad, costoEstimado: costoEstimado)
        )
        return ActivityRecommendation(raw: ConsoleHelpers.decodeMap(data))
    }

    // MARK: Reasignación

    func reassignments(activityId: Int64) async throws -> [ActivityReassignment] {
        ApiClient.decodeMapList(try await api.get("activities/\(activityId)/reasignaciones"))
            .map { ActivityReassignment(raw: $0) }
    }

    /// `retirarAnterior` decide si el técnico saliente se queda en el equipo o
    /// sale del todo. Se manda explícito porque el valor por defecto del backend
    /// no está garantizado y una reasignación silenciosa deja OTs con dos
    /// responsables.
    func reassign(
        activityId: Int64,
        toUserId: Int64,
        motivo: String?,
        retirarAnterior: Bool
    ) async throws {
        struct Body: Encodable {
            let aUsuarioId: Int64
            let motivo: String?
            let retirarAnterior: Bool
        }
        _ = try await api.postJSON("activities/\(activityId)/reasignar", body: Body(
            aUsuarioId: toUserId,
            motivo: motivo?.nilIfEmpty,
            retirarAnterior: retirarAnterior
        ))
    }

    // MARK: Ejecución (iniciar / finalizar en sitio)

    /// `PATCH activities/:id/execute` — lo que el técnico puede cambiar de **su**
    /// propia OT. El API lo rechaza si la actividad no está asignada a quien
    /// llama, así que el error de permiso se propaga tal cual: no se enmascara.
    func execute(
        activityId: Int64,
        estatus: String?,
        fechaInicio: String? = nil,
        fechaFinalizacion: String? = nil
    ) async throws -> ActivityItem {
        struct Body: Encodable {
            let estatus: String?
            let fechaInicio: String?
            let fechaFinalizacion: String?
        }
        let data = try await api.patchJSON("activities/\(activityId)/execute", body: Body(
            estatus: estatus?.nilIfEmpty,
            fechaInicio: fechaInicio?.nilIfEmpty,
            fechaFinalizacion: fechaFinalizacion?.nilIfEmpty
        ))
        return ActivityItem(raw: ConsoleHelpers.decodeMap(data))
    }

    // MARK: Vista detallada y reporte

    func detailedActivities() async throws -> [ActivityDetailedItem] {
        ApiClient.decodeMapList(try await api.get("activities/detailed"))
            .map { ActivityDetailedItem(raw: $0) }
    }

    /// Reporte PDF de un ticket. Se usa `get` y no `getBinary` porque el endpoint
    /// fija `Content-Type: application/pdf` en la respuesta e ignora el `Accept`
    /// que mandemos; ambos helpers adjuntan el mismo `Authorization` y
    /// `X-Company-Id`. Además `scripts/parity-report.py` solo reconoce una lista
    /// fija de helpers y `getBinary(` no está en ella, así que con `get` la ruta
    /// queda contada de verdad.
    /// Los bytes se devuelven tal cual para dárselos a `PDFViewerScreen`, que ya
    /// resuelve visor y botón de compartir. No se escribe a disco: un reporte de
    /// ticket puede llevar datos de cliente y no tiene por qué quedarse en el
    /// teléfono si el usuario solo quería mirarlo.
    func ticketReportPdf(activityId: Int64) async throws -> Data {
        try await api.get("activities/\(activityId)/report")
    }
}
