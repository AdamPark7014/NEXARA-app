import Foundation

// MARK: - Hero

struct HeroSlide: Codable, Identifiable, Hashable {
    let id: Int64
    var imageUrl: String?
    var altText: String?
    var caption: String?
    var href: String?
    var position: Int?
    var isActive: Bool?
}

struct ReorderHeroBody: Encodable {
    let ids: [Int64]
}

// MARK: - Case studies

struct CaseStudy: Codable, Identifiable, Hashable {
    let id: Int64
    var titulo: String?
    var slug: String?
    var cliente: String?
    var vertical: String?
    var impacto: String?
    var descripcion: String?
    var cover: String?
    var imageUrl: String?
    var publicado: Bool?
}

struct CreateCaseStudyBody: Encodable {
    let titulo: String
    var slug: String?
    let cliente: String
    let vertical: String
    let impacto: String
    var descripcion: String?
    var imageUrl: String?
    var publicado: Bool?
}

struct UpdateCaseStudyBody: Encodable {
    var titulo: String?
    var slug: String?
    var cliente: String?
    var vertical: String?
    var impacto: String?
    var descripcion: String?
    var imageUrl: String?
    var publicado: Bool?
}

// MARK: - Social

struct SocialPost: Codable, Identifiable, Hashable {
    let id: Int64
    var red: String?
    var titulo: String?
    var contenido: String?
    var mediaUrl: String?
    var cuando: String?
    var estado: String?
}

struct CreateSocialPostBody: Encodable {
    let red: String
    let titulo: String
    let contenido: String
    var mediaUrl: String?
    let cuando: String
    var estado: String?
}

struct UpdateSocialPostBody: Encodable {
    var red: String?
    var titulo: String?
    var contenido: String?
    var mediaUrl: String?
    var cuando: String?
    var estado: String?
}

struct SocialEstadoBody: Encodable {
    let estado: String
}

// MARK: - News

struct NewsPost: Codable, Identifiable, Hashable {
    let id: Int64
    var title: String?
    var slug: String?
    var excerpt: String?
    var summary: String?
    var content: String?
    var body: String?
    var status: String?
}

struct CreateNewsBody: Encodable {
    let title: String
    var slug: String?
    var summary: String?
    let content: String
    var status: String?
    var tags: [String]?
}

struct UpdateNewsBody: Encodable {
    var title: String?
    var slug: String?
    var summary: String?
    var content: String?
    var status: String?
    var tags: [String]?
}

// MARK: - Contacts

struct ContactMessage: Codable, Identifiable, Hashable {
    let id: Int64
    var name: String?
    var email: String?
    var phone: String?
    var subject: String?
    var message: String?
    var status: String?
    var category: String?
    var responseMessage: String?
}

struct UpdateContactMessageBody: Encodable {
    var status: String?
    var responseMessage: String?
    var category: String?
}

// MARK: - Newsletter

struct NewsletterSubscriber: Codable, Identifiable, Hashable {
    let id: Int64
    var email: String?
    var name: String?
    var status: String?
}

// MARK: - Page content

struct PageContent: Codable {
    var section: String?
    var content: AnyCodable?
    var updatedAt: String?
}

struct PageSectionsResponse: Codable {
    var sections: [String]?
}

struct UpsertPageContentBody: Encodable {
    let content: AnyCodable
    var updatedBy: String?
}

/// Wrapper para JSON arbitrario en page content.
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) { self.value = value }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let v = try? container.decode([String: AnyCodable].self) {
            value = v.mapValues { $0.value }
        } else if let v = try? container.decode([AnyCodable].self) {
            value = v.map { $0.value }
        } else if let v = try? container.decode(String.self) {
            value = v
        } else if let v = try? container.decode(Bool.self) {
            value = v
        } else if let v = try? container.decode(Double.self) {
            value = v
        } else if let v = try? container.decode(Int.self) {
            value = v
        } else {
            value = [:]
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let v as [String: Any]:
            try container.encode(v.mapValues { AnyCodable($0) })
        case let v as [Any]:
            try container.encode(v.map { AnyCodable($0) })
        case let v as String: try container.encode(v)
        case let v as Bool: try container.encode(v)
        case let v as Double: try container.encode(v)
        case let v as Int: try container.encode(v)
        default:
            try container.encode([String: String]())
        }
    }
}

// MARK: - Dashboard

struct StudioDashboardStats {
    let contacts: Int
    let casesTotal: Int
    let casesPublished: Int
    let socialDrafts: [SocialPost]
}
