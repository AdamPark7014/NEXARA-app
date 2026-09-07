import Foundation

/// Gobierno INTEGRA: bitácora, identidad ERP↔ACS, perfil — paridad con Android.
final class IntegraGovernanceRepository {
    static let shared = IntegraGovernanceRepository()
    private init() {}

    struct ConsultaBitacora {
        var limit: Int = 25
        var skip: Int = 0
        var fromIso: String? = nil
        var toIso: String? = nil
        var action: String? = nil
        var userId: Int64? = nil
        /// Filters action **code** (`action contains`), not `changes`.
        var q: String? = nil
        var order: String = "desc"
    }

    struct AuditPage {
        let total: Int
        let limit: Int
        let skip: Int
        let items: [[String: Any]]
    }

    func audit(_ consulta: ConsultaBitacora) async throws -> AuditPage {
        var q: [String: String] = [
            "limit": String(consulta.limit),
            "skip": String(consulta.skip),
            "order": consulta.order == "asc" ? "asc" : "desc",
        ]
        if let from = consulta.fromIso { q["from"] = from }
        if let to = consulta.toIso { q["to"] = to }
        if let action = consulta.action?.trimmingCharacters(in: .whitespacesAndNewlines), !action.isEmpty {
            q["action"] = action
        }
        if let userId = consulta.userId { q["userId"] = String(userId) }
        if let search = consulta.q?.trimmingCharacters(in: .whitespacesAndNewlines), !search.isEmpty {
            q["q"] = search
        }
        let root = IntegraJSON.decodeMap(try await IntegraHTTP.get("integra/audit", query: q))
        let items = IntegraJSON.itemsOf(root)
        return AuditPage(
            total: root.integraInt("total") ?? items.count,
            limit: root.integraInt("limit") ?? consulta.limit,
            skip: root.integraInt("skip") ?? consulta.skip,
            items: items
        )
    }

    func identityMe() async throws -> [String: Any] {
        IntegraJSON.decodeMap(try await IntegraHTTP.get("integra/identity/me"))
    }

    /// ACS person card. Prefer nested `person` when present (ISAPI mirror).
    func personDetail(personId: String, siteId: Int? = nil) async throws -> [String: Any] {
        var q = IntegraQuery.site(siteId ?? IntegraSiteScope.current)
        let root = IntegraJSON.decodeMap(
            try await IntegraHTTP.get("integra/people/\(personId)", query: q)
        )
        if let person = IntegraJSON.asMap(root["person"]) {
            return person
        }
        return root
    }

    func myProfile() async throws -> [String: Any] {
        IntegraJSON.decodeMap(try await IntegraHTTP.get("users/profile/me"))
    }

    func updateMyProfile(_ campos: [String: String?]) async throws {
        // Encode optional fields; omit keys with nil by building a string dict of non-nil.
        var body: [String: String] = [:]
        for (k, v) in campos {
            if let v { body[k] = v }
        }
        _ = try await IntegraHTTP.patchJSON("users/profile/me", body: body)
    }

    /// Allow clearing fields by sending empty string (Android sends Map with nulls;
    /// Nest treats empty as clear for some profile fields). Prefer `updateMyProfile`
    /// for partial updates.
    func updateMyProfileMap(_ campos: [String: Any]) async throws {
        _ = try await IntegraHTTP.patchMap("users/profile/me", body: campos)
    }

    func pushEventStats(siteId: Int? = nil) async throws -> [String: Any] {
        IntegraJSON.decodeMap(
            try await IntegraHTTP.get(
                "integra/push/events/stats",
                query: IntegraQuery.site(siteId ?? IntegraSiteScope.current)
            )
        )
    }

    /// INTEGRA has no dedicated inbox API — reuse shared ERP `NotificationsRepository`.
}
