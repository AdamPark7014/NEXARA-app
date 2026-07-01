import Foundation

/// Repositorio STUDIO — paridad con Android `StudioRepository`.
final class StudioRepository {
    static let shared = StudioRepository()
    private let api = ApiClient.shared

    private init() {}

    // MARK: Dashboard

    func dashboardStats() async throws -> StudioDashboardStats {
        async let contactsData   = api.get("contact-messages", query: ["limit": "1"])
        async let casesData      = api.get("case-studies", query: ["limit": "100"])
        async let socialData     = api.get("social-posts", query: ["limit": "6"])
        async let newsData       = api.get("news", query: ["limit": "200"])
        async let newsletterData = api.get("newsletter", query: ["limit": "1"])

        let cRaw        = try await contactsData
        let cases       = try decodeList(CaseStudy.self, from: try await casesData)
        let social      = try decodeList(SocialPost.self, from: try await socialData)
                            .filter { $0.estado == "Programado" || $0.estado == "Borrador" }
        let newsItems   = try decodeList(NewsPost.self, from: try await newsData)
        let nlRaw       = try await newsletterData

        let contacts         = parseTotal(cRaw) ?? ApiClient.decodeMapList(cRaw).count
        let published        = cases.filter { $0.publicado == true }.count
        let newsPublished    = newsItems.filter { ($0.status ?? "").lowercased() == "published" }.count
        let newsletterActive = parseTotal(nlRaw) ?? ApiClient.decodeMapList(nlRaw).count

        return StudioDashboardStats(
            contacts: contacts,
            casesTotal: cases.count,
            casesPublished: published,
            socialDrafts: Array(social.prefix(4)),
            newsTotal: newsItems.count,
            newsPublished: newsPublished,
            newsletterActive: newsletterActive
        )
    }

    // MARK: Hero

    func heroSlides() async throws -> [HeroSlide] {
        try decodeList(HeroSlide.self, from: try await api.get("hero-slides"))
            .sorted { ($0.position ?? 0) < ($1.position ?? 0) }
    }

    func createHeroSlide(
        altText: String?, caption: String?, href: String?,
        position: Int?, isActive: Bool, imageData: Data?, fileName: String?
    ) async throws -> HeroSlide {
        var fields: [String: String] = ["isActive": isActive ? "true" : "false"]
        if let v = altText, !v.isEmpty { fields["altText"] = v }
        if let v = caption, !v.isEmpty { fields["caption"] = v }
        if let v = href, !v.isEmpty { fields["href"] = v }
        if let v = position { fields["position"] = String(v) }

        let data = try await api.uploadMultipart(
            "hero-slides", method: "POST",
            fields: fields,
            fileField: imageData != nil ? "image" : nil,
            fileData: imageData,
            fileName: fileName
        )
        return try ApiClient.decodeOne(data)
    }

    func updateHeroSlide(
        id: Int64, altText: String?, caption: String?, href: String?,
        position: Int?, isActive: Bool?, imageData: Data?, fileName: String?
    ) async throws -> HeroSlide {
        var fields: [String: String] = [:]
        if let v = altText { fields["altText"] = v }
        if let v = caption { fields["caption"] = v }
        if let v = href { fields["href"] = v }
        if let v = position { fields["position"] = String(v) }
        if let v = isActive { fields["isActive"] = v ? "true" : "false" }

        let data = try await api.uploadMultipart(
            "hero-slides/\(id)", method: "PUT",
            fields: fields,
            fileField: imageData != nil ? "image" : nil,
            fileData: imageData,
            fileName: fileName
        )
        return try ApiClient.decodeOne(data)
    }

    func reorderHeroSlides(ids: [Int64]) async throws {
        _ = try await api.patchJSON("hero-slides/reorder", body: ReorderHeroBody(ids: ids))
    }

    func deleteHeroSlide(id: Int64) async throws {
        try await api.delete("hero-slides/\(id)")
    }

    // MARK: Cases

    func caseStudies() async throws -> [CaseStudy] {
        try decodeList(CaseStudy.self, from: try await api.get("case-studies", query: ["limit": "100"]))
    }

    func createCaseStudy(_ body: CreateCaseStudyBody) async throws -> CaseStudy {
        try ApiClient.decodeOne(try await api.postJSON("case-studies", body: body))
    }

    func updateCaseStudy(id: Int64, _ body: UpdateCaseStudyBody) async throws -> CaseStudy {
        try ApiClient.decodeOne(try await api.patchJSON("case-studies/\(id)", body: body))
    }

    func toggleCasePublicado(id: Int64) async throws -> CaseStudy {
        try ApiClient.decodeOne(try await api.patchJSON("case-studies/\(id)/toggle-publicado", body: EmptyBody()))
    }

    func deleteCaseStudy(id: Int64) async throws {
        try await api.delete("case-studies/\(id)")
    }

    // MARK: Social

    func socialPosts(estado: String? = nil) async throws -> [SocialPost] {
        var q = ["limit": "50"]
        if let e = estado { q["estado"] = e }
        return try decodeList(SocialPost.self, from: try await api.get("social-posts", query: q))
    }

    func createSocialPost(_ body: CreateSocialPostBody) async throws -> SocialPost {
        try ApiClient.decodeOne(try await api.postJSON("social-posts", body: body))
    }

    func updateSocialPost(id: Int64, _ body: UpdateSocialPostBody) async throws -> SocialPost {
        try ApiClient.decodeOne(try await api.patchJSON("social-posts/\(id)", body: body))
    }

    func setSocialEstado(id: Int64, estado: String) async throws -> SocialPost {
        try ApiClient.decodeOne(try await api.patchJSON("social-posts/\(id)/estado", body: SocialEstadoBody(estado: estado)))
    }

    func deleteSocialPost(id: Int64) async throws {
        try await api.delete("social-posts/\(id)")
    }

    // MARK: News

    func news(search: String? = nil, status: String? = nil) async throws -> [NewsPost] {
        var q: [String: String] = [:]
        if let s = search, !s.isEmpty { q["search"] = s }
        if let s = status { q["status"] = s }
        return try decodeList(NewsPost.self, from: try await api.get("news", query: q))
    }

    func createNews(_ body: CreateNewsBody) async throws -> NewsPost {
        try ApiClient.decodeOne(try await api.postJSON("news", body: body))
    }

    func updateNews(id: Int64, _ body: UpdateNewsBody) async throws -> NewsPost {
        try ApiClient.decodeOne(try await api.putJSON("news/\(id)", body: body))
    }

    func deleteNews(id: Int64) async throws {
        try await api.delete("news/\(id)")
    }

    // MARK: Contacts

    func contactMessages(limit: Int = 100) async throws -> [ContactMessage] {
        try decodeList(ContactMessage.self, from: try await api.get("contact-messages", query: ["limit": String(limit)]))
    }

    func updateContactMessage(id: Int64, _ body: UpdateContactMessageBody) async throws -> ContactMessage {
        try ApiClient.decodeOne(try await api.putJSON("contact-messages/\(id)", body: body))
    }

    func deleteContactMessage(id: Int64) async throws {
        try await api.delete("contact-messages/\(id)")
    }

    // MARK: Newsletter

    func newsletter(search: String? = nil) async throws -> [NewsletterSubscriber] {
        var q: [String: String] = [:]
        if let s = search, !s.isEmpty { q["search"] = s }
        return try decodeList(NewsletterSubscriber.self, from: try await api.get("newsletter", query: q))
    }

    // MARK: Pages

    func pageSections() async throws -> [String] {
        let data = try await api.get("studio/page-content/sections")
        if let resp = try? JSONDecoder().decode(PageSectionsResponse.self, from: data) {
            return resp.sections ?? []
        }
        return []
    }

    func getPageContent(section: String) async throws -> PageContent {
        try ApiClient.decodeOne(try await api.get("studio/page-content/\(section)"))
    }

    func upsertPageContent(section: String, content: Any) async throws -> PageContent {
        try ApiClient.decodeOne(try await api.putJSON(
            "studio/page-content/\(section)",
            body: UpsertPageContentBody(content: AnyCodable(content))
        ))
    }

    // MARK: Private

    private struct EmptyBody: Encodable {}

    private func decodeList<T: Decodable>(_ type: T.Type, from data: Data) throws -> [T] {
        try ApiClient.decodeList(data)
    }

    private func parseTotal(_ data: Data) -> Int? {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return obj["total"] as? Int
    }
}
