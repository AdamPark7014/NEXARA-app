import Foundation

/// Un push ACS reciente (`GET integra/acs-fanout/status`).
struct AcsFanoutEntry: Identifiable, Hashable {
    let id: String
    var at: String?
    var op: String
    var employeeNo: String
    var pendingRetry: Bool
    var okCount: Int
    var failCount: Int
    var note: String?

    static func parse(_ raw: [String: Any]) -> AcsFanoutEntry? {
        guard let id = raw.integraStr("id") else { return nil }
        let results = (raw["results"] as? [[String: Any]])
            ?? IntegraJSON.asMapList(raw["results"])
            ?? []
        let ok = results.filter { $0.integraBool("ok") == true }.count
        return AcsFanoutEntry(
            id: id,
            at: raw.integraStr("at"),
            op: raw.integraStr("op") ?? "—",
            employeeNo: raw.integraStr("employeeNo") ?? "—",
            pendingRetry: raw.integraBool("pendingRetry") ?? false,
            okCount: ok,
            failCount: max(0, results.count - ok),
            note: raw.integraStr("note")
        )
    }
}

/// Conteos globales del sitio (`GET integra/capabilities`).
/// El contrato del servidor no está cerrado: números = conteos, booleanos = módulos.
struct IntegraCapabilityCounts {
    var entries: [(key: String, value: Int)]
    var modules: [(key: String, on: Bool)]

    static func parse(_ raw: [String: Any]) -> IntegraCapabilityCounts {
        var counts: [(String, Int)] = []
        var modules: [(String, Bool)] = []
        func ingest(_ map: [String: Any]) {
            for (k, v) in map {
                switch v {
                case let b as Bool:
                    modules.append((k, b))
                case let n as NSNumber where CFGetTypeID(n) != CFBooleanGetTypeID():
                    counts.append((k, n.intValue))
                case let n as Int:
                    counts.append((k, n))
                case let nested as [String: Any]:
                    ingest(nested)
                default:
                    break
                }
            }
        }
        ingest(raw)
        return IntegraCapabilityCounts(entries: counts, modules: modules)
    }

    var isEmpty: Bool { entries.isEmpty && modules.isEmpty }
}
