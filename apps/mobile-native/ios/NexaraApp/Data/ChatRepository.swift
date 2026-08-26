import Foundation

/// Chat workspace — paridad Android `ChatRepository` / web `WorkspaceChat`.
final class ChatRepository {
    static let shared = ChatRepository()
    private let api = ApiClient.shared
    private init() {}

    func listChannels() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("chat/channels"))
    }

    func listMessages(channelId: Int64, limit: Int = 40, parentId: Int64? = nil) async throws -> [[String: Any]] {
        var q: [String: String] = ["limit": String(limit)]
        if let parentId, parentId > 0 { q["parentId"] = String(parentId) }
        let data = try await api.get("chat/channels/\(channelId)/messages", query: q)
        let map = ConsoleHelpers.decodeMap(data)
        if let messages = map["messages"] as? [[String: Any]] {
            return messages
        }
        return ApiClient.decodeMapList(data)
    }

    func listPins(channelId: Int64) async throws -> [[String: Any]] {
        let data = try await api.get("chat/channels/\(channelId)/pins")
        let map = ConsoleHelpers.decodeMap(data)
        if let messages = map["messages"] as? [[String: Any]] {
            return messages
        }
        return ApiClient.decodeMapList(data)
    }

    func postMessage(
        channelId: Int64,
        body: String,
        parentId: Int64? = nil,
        attachmentUrl: String? = nil,
        attachmentName: String? = nil
    ) async throws {
        struct Body: Encodable {
            let body: String
            let parentId: Int64?
            let attachmentUrl: String?
            let attachmentName: String?
        }
        _ = try await api.postJSON(
            "chat/channels/\(channelId)/messages",
            body: Body(body: body, parentId: parentId, attachmentUrl: attachmentUrl, attachmentName: attachmentName)
        )
    }

    func toggleReaction(messageId: Int64, emoji: String) async throws {
        struct Body: Encodable { let emoji: String }
        _ = try await api.postJSON("chat/messages/\(messageId)/reactions", body: Body(emoji: emoji))
    }

    func pinMessage(messageId: Int64) async throws {
        _ = try await api.postJSON("chat/messages/\(messageId)/pin", body: EmptyBody())
    }

    private struct EmptyBody: Encodable {}

    func uploadAttachment(data: Data, fileName: String, mimeType: String) async throws -> (url: String, name: String) {
        let response = try await api.uploadMultipart(
            "chat/upload",
            fields: [:],
            fileField: "file",
            fileData: data,
            fileName: fileName,
            mimeType: mimeType
        )
        let map = ConsoleHelpers.decodeMap(response)
        let url = ConsoleHelpers.mapStr(map, "url", "attachmentUrl")
        let name = ConsoleHelpers.mapStr(map, "name", "attachmentName", "fileName").isEmpty ? fileName : ConsoleHelpers.mapStr(map, "name", "attachmentName", "fileName")
        guard !url.isEmpty else { throw ApiError.http(-1, "Respuesta de upload inválida") }
        return (url, name)
    }
}
