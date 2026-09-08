import Foundation

/// Ajustes INTEGRA — sitios, sync y escrituras. Espejo de Android `IntegraSettingsRepository`.
enum IntegraSettingsRepository {
    static func sites() async throws -> [[String: Any]] {
        IntegraJSON.decodeList(try await IntegraHTTP.get("integra/sites"))
    }

    static func createSite(
        name: String,
        host: String,
        appKey: String,
        appSecret: String,
        label: String = "",
        provider: String = "ARTEMIS",
        isFirstSite: Bool
    ) async throws -> [String: Any] {
        var body: [String: Any] = [
            "name": name.trimmingCharacters(in: .whitespacesAndNewlines),
            "host": {
                var h = host.trimmingCharacters(in: .whitespacesAndNewlines)
                while h.hasSuffix("/") { h.removeLast() }
                return h
            }(),
            "appKey": appKey.trimmingCharacters(in: .whitespacesAndNewlines),
            "appSecret": appSecret.trimmingCharacters(in: .whitespacesAndNewlines),
            "provider": provider.uppercased(),
            "isDefault": isFirstSite,
        ]
        let lab = label.trimmingCharacters(in: .whitespacesAndNewlines)
        if !lab.isEmpty { body["label"] = lab }
        return IntegraJSON.decodeMap(try await IntegraHTTP.postMap("integra/sites", body: body))
    }

    static func updateSite(id: Int, body: [String: Any]) async throws -> [String: Any] {
        IntegraJSON.decodeMap(try await IntegraHTTP.patchMap("integra/sites/\(id)", body: body))
    }

    static func makeDefault(id: Int) async throws {
        _ = try await updateSite(id: id, body: ["isDefault": true])
        IntegraSiteScope.select(id)
    }

    static func setActive(id: Int, active: Bool) async throws {
        _ = try await updateSite(id: id, body: ["isActive": active])
    }

    static func rename(id: Int, label: String) async throws {
        _ = try await updateSite(id: id, body: ["label": label.trimmingCharacters(in: .whitespacesAndNewlines)])
    }

    /// Destructivo: arrastra el inventario espejo del sitio.
    static func deleteSite(id: Int) async throws {
        _ = try await IntegraHTTP.delete("integra/sites/\(id)")
        if IntegraSiteScope.current == id {
            IntegraSiteScope.select(nil)
        }
    }

    /// Reconstruye el espejo desde los equipos.
    static func runSync(siteId: Int) async throws -> [String: Any] {
        IntegraJSON.decodeMap(
            try await IntegraHTTP.postEmpty("integra/sync", query: ["siteId": "\(siteId)"])
        )
    }

    static func lastSync(siteId: Int) async throws -> [String: Any] {
        IntegraJSON.decodeMap(
            try await IntegraHTTP.get("integra/sync/last", query: ["siteId": "\(siteId)"])
        )
    }

    /// Salud del abanico ACS (`GET integra/acs-fanout/status`).
    static func acsFanout(siteId: Int? = nil) async throws -> [AcsFanoutEntry] {
        let root = IntegraJSON.decodeMap(
            try await IntegraHTTP.get("integra/acs-fanout/status", query: IntegraQuery.site(siteId))
        )
        return IntegraJSON.itemsOf(root).compactMap(AcsFanoutEntry.parse)
    }

    /// Conteos / módulos del espejo (`GET integra/capabilities`) — forma abierta.
    static func capabilities(siteId: Int? = nil) async throws -> IntegraCapabilityCounts {
        let root = IntegraJSON.decodeMap(
            try await IntegraHTTP.get("integra/capabilities", query: IntegraQuery.site(siteId))
        )
        return IntegraCapabilityCounts.parse(root)
    }

    /// Nombres de regiones del espejo (`GET integra/regions`).
    static func regions(siteId: Int? = nil) async throws -> [String] {
        let root = IntegraJSON.decodeMap(
            try await IntegraHTTP.get("integra/regions", query: IntegraQuery.site(siteId))
        )
        return IntegraJSON.itemsOf(root).compactMap { row in
            row.integraStr("name") ?? row.integraStr("id")
        }
    }

    static func siteDraftProblems(name: String, host: String, appKey: String, appSecret: String) -> [String] {
        var out: [String] = []
        if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            out.append("El sitio necesita un nombre.")
        }
        let h = host.trimmingCharacters(in: .whitespacesAndNewlines)
        if h.isEmpty {
            out.append("Falta la dirección del servidor.")
        } else if !(h.hasPrefix("http://") || h.hasPrefix("https://")) {
            out.append("La dirección del servidor debe empezar por http:// o https://.")
        }
        if appKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            out.append("Falta la clave de aplicación (appKey).")
        }
        if appSecret.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            out.append("Falta el secreto de aplicación (appSecret).")
        }
        return out
    }
}
