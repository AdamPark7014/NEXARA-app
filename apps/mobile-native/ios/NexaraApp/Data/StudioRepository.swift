import Foundation

/// Repositorio STUDIO — paridad con Android `StudioRepository`.
final class StudioRepository {
    static let shared = StudioRepository()
    private let api = ApiClient.shared

    private init() {}

    func dashboardStats() async throws -> (contacts: Int, casesTotal: Int, casesPublished: Int, socialDrafts: Int) {
        async let contactsData = api.get("contact-messages", query: ["limit": "1"])
        async let casesData = api.get("case-studies", query: ["limit": "100"])
        async let socialData = api.get("social-posts", query: ["limit": "6"])

        let cRaw = try await contactsData
        let casesRaw = try await casesData
        let socialRaw = try await socialData

        let contacts = parseTotal(cRaw) ?? ApiClient.decodeMapList(cRaw).count
        let cases = ApiClient.decodeMapList(casesRaw)
        let published = cases.filter { ($0["publicado"] as? Bool) == true }.count
        let social = ApiClient.decodeMapList(socialRaw)
            .filter { let e = $0["estado"] as? String; return e == "Programado" || e == "Borrador" }

        return (contacts, cases.count, published, social.count)
    }

    func heroSlides() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("hero-slides"))
    }

    func caseStudies() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("case-studies", query: ["limit": "100"]))
    }

    func socialPosts() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("social-posts", query: ["limit": "50"]))
    }

    func pageSections() async throws -> [String] {
        let data = try await api.get("studio/page-content/sections")
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let sections = obj["sections"] as? [String] {
            return sections
        }
        return []
    }

    func contactMessages() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("contact-messages", query: ["limit": "50"]))
    }

    func newsletter(search: String? = nil) async throws -> [[String: Any]] {
        var q: [String: String] = [:]
        if let s = search, !s.isEmpty { q["search"] = s }
        return ApiClient.decodeMapList(try await api.get("newsletter", query: q))
    }

    private func parseTotal(_ data: Data) -> Int? {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return obj["total"] as? Int
    }
}
