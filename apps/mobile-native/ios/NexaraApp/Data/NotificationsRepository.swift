import Foundation

/// Bandeja de notificaciones — paridad web `/erp/notifications-center` y Android `NotificationsRepository`.
final class NotificationsRepository {
    static let shared = NotificationsRepository()
    private let api = ApiClient.shared
    private init() {}

    func list(limit: Int = 50, offset: Int = 0) async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("notifications", query: [
            "limit": String(limit),
            "offset": String(offset),
        ]))
    }

    func unreadCount() async throws -> Int {
        let map = ConsoleHelpers.decodeMap(try await api.get("notifications/count/unread"))
        if let n = map["unreadCount"] as? Int { return n }
        if let n = map["unreadCount"] as? NSNumber { return n.intValue }
        return 0
    }

    func markRead(id: Int64) async throws {
        struct Empty: Encodable {}
        _ = try await api.patchJSON("notifications/\(id)/read", body: Empty())
    }

    func markAllRead() async throws {
        struct Empty: Encodable {}
        _ = try await api.patchJSON("notifications/read/all", body: Empty())
    }

    func delete(id: Int64) async throws {
        try await api.delete("notifications/\(id)")
    }

    func activityFeed(limit: Int = 40) async throws -> [[String: Any]] {
        let data = try await api.get("activity-feed", query: ["limit": String(limit)])
        let map = ConsoleHelpers.decodeMap(data)
        if let items = map["items"] as? [[String: Any]] { return items }
        return ApiClient.decodeMapList(data)
    }
}
