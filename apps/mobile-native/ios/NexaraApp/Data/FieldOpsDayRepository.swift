import Foundation

/// Cierre de la jornada de campo: el resumen de **un** día de asistencia y el
/// reporte PDF del historial propio de evidencias.
///
/// Los dos endpoints existían en Android y no en iOS. Son los que el técnico usa
/// para defender su día: "estas son mis horas" y "estas son mis evidencias".
final class FieldOpsDayRepository {
    static let shared = FieldOpsDayRepository()
    private let api = ApiClient.shared
    private init() {}

    /// `GET attendance/day?date=YYYY-MM-DD`.
    ///
    /// Devuelve `nil` cuando el servidor responde `null`: ese día no se marcó.
    /// No se sustituye por un resumen en cero — un día sin marcar y un día de
    /// cero minutos son cosas distintas y la nómina las trata distinto.
    func attendanceDay(date: String) async throws -> AttendanceDaySummary? {
        let data = try await api.get("attendance/day", query: ["date": date])
        let map = ConsoleHelpers.decodeMap(data)
        guard !map.isEmpty else { return nil }
        let summary = AttendanceDaySummary(raw: map)
        return summary.isMissing ? nil : summary
    }

    /// `GET activity-evidence/history/report?from&to` — PDF con el historial
    /// propio de evidencias en el rango. Se usa `get` (y no `getBinary`) por lo
    /// mismo que en `FieldOpsActivityRepository.ticketReportPdf`: el endpoint fija
    /// `Content-Type: application/pdf` e ignora el `Accept`, y así la ruta queda
    /// visible para `scripts/parity-report.py`.
    func evidenceHistoryReport(from: String?, to: String?) async throws -> Data {
        var query: [String: String] = [:]
        if let from, !from.isEmpty { query["from"] = from }
        if let to, !to.isEmpty { query["to"] = to }
        return try await api.get("activity-evidence/history/report", query: query)
    }

    /// `yyyy-MM-dd`, el formato que aceptan los dos endpoints.
    static func dayString(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}
