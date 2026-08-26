import Foundation

struct KbPublicCategory: Hashable {
    let id: Int64
    let name: String
    let icon: String

    init(raw: [String: Any]) {
        id = Int64(StockParse.dbl(raw["id"]) ?? 0)
        name = StockParse.str(raw["name"])
        icon = StockParse.str(raw["icon"])
    }
}

struct KbPublicArticle: Hashable, Identifiable {
    let id: Int64
    let slug: String
    let title: String
    let excerpt: String
    let content: String
    let category: KbPublicCategory?
    let tags: String
    let viewCount: Int
    let helpfulCount: Int
    let publishedAt: String

    init(raw: [String: Any]) {
        id = Int64(StockParse.dbl(raw["id"]) ?? 0)
        slug = StockParse.str(raw["slug"])
        title = StockParse.str(raw["title"])
        excerpt = StockParse.str(raw["excerpt"])
        content = StockParse.str(raw["content"])
        if let cat = raw["category"] as? [String: Any] {
            category = KbPublicCategory(raw: cat)
        } else {
            category = nil
        }
        tags = StockParse.str(raw["tags"])
        viewCount = Int(StockParse.dbl(raw["viewCount"]) ?? 0)
        helpfulCount = Int(StockParse.dbl(raw["helpfulCount"]) ?? 0)
        publishedAt = StockParse.str(raw["publishedAt"])
    }
}

/// KB público — paridad Android `KbPublicApi`.
enum KbPublicRepository {
    static func listArticles(query: String? = nil) async throws -> [KbPublicArticle] {
        var q: [String: String] = [:]
        if let query, !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            q["q"] = query.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let data = try await ApiClient.shared.get("kb-public/articles", query: q)
        return ApiClient.decodeMapList(data).map { KbPublicArticle(raw: $0) }
    }

    static func markHelpful(id: Int64) async throws -> KbPublicArticle {
        struct Empty: Encodable {}
        let data = try await ApiClient.shared.postJSON("kb-public/articles/\(id)/helpful", body: Empty())
        return KbPublicArticle(raw: ConsoleHelpers.decodeMap(data))
    }
}
