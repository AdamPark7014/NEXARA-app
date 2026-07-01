import Foundation

/// API LAB — paridad `LabController` del backend.
final class LabRepository {
    static let shared = LabRepository()
    private let api = ApiClient.shared
    private init() {}

    func healthSummary() async throws -> [String: Any] {
        ConsoleHelpers.decodeMap(try await api.get("lab/health-summary"))
    }

    func basicHealth() async throws -> String {
        String(data: try await api.get("health"), encoding: .utf8) ?? "OK"
    }

    func flags(scope: String? = nil) async throws -> [[String: Any]] {
        var q: [String: String] = [:]
        if let scope, !scope.isEmpty { q["scope"] = scope }
        return ApiClient.decodeMapList(try await api.get("lab/flags", query: q))
    }

    func setFlag(key: String, enabled: Bool) async throws -> [String: Any] {
        struct Body: Encodable { let enabled: Bool }
        return ConsoleHelpers.decodeMap(try await api.patchJSON("lab/flags/\(key)", body: Body(enabled: enabled)))
    }

    func runAi(model: String, prompt: String, systemPrompt: String?) async throws -> [String: Any] {
        struct Body: Encodable {
            let model: String
            let prompt: String
            let systemPrompt: String?
        }
        return ConsoleHelpers.decodeMap(try await api.postJSON("lab/ai", body: Body(
            model: model, prompt: prompt, systemPrompt: systemPrompt?.nilIfEmpty
        )))
    }
}
