import Foundation

/// Página de mensajes — paridad Android `ChatMessagesResponse`.
struct ChatMessagesPage {
    let messages: [[String: Any]]
    let hasMore: Bool
}

/// Chat workspace — paridad Android `ChatRepository` / `ChatApi` (endpoints verificados).
final class ChatRepository {
    static let shared = ChatRepository()
    private let api = ApiClient.shared
    private init() {}

    func listChannels() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("chat/channels"))
    }

    func createChannel(
        name: String,
        kind: String? = nil,
        topic: String? = nil,
        description: String? = nil
    ) async throws -> [String: Any] {
        struct Body: Encodable {
            let name: String
            let kind: String?
            let topic: String?
            let description: String?
        }
        let data = try await api.postJSON(
            "chat/channels",
            body: Body(
                name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                kind: kind,
                topic: topic?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                description: description?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            )
        )
        return ConsoleHelpers.decodeMap(data)
    }

    /// Detalle del canal — GET `chat/channels/:id`.
    ///
    /// La lista (`chat/channels`) no trae miembros ni el estado de silencio; sin
    /// esto la pantalla no puede saber si el botón «Silenciar» debe salir
    /// activado ni si el usuario está viendo el canal como supervisor.
    func channelDetail(channelId: Int64) async throws -> ChatChannelDetail {
        let data = try await api.get("chat/channels/\(channelId)")
        return ChatChannelDetail(raw: ConsoleHelpers.decodeMap(data))
    }

    /// Silencia o reactiva el canal — PATCH `chat/channels/:id/mute`.
    /// Devuelve el canal actualizado para no tener que recargar la lista entera.
    @discardableResult
    func setChannelMuted(channelId: Int64, muted: Bool) async throws -> ChatChannelDetail {
        struct Body: Encodable { let muted: Bool }
        let data = try await api.patchJSON("chat/channels/\(channelId)/mute", body: Body(muted: muted))
        return ChatChannelDetail(raw: ConsoleHelpers.decodeMap(data))
    }

    /// Abandona el canal — DELETE `chat/channels/:id/leave`.
    /// El backend rechaza salir de un DM y de un canal supervisado; la vista
    /// oculta la acción en esos casos (`ChatChannelDetail.canLeave`).
    func leaveChannel(channelId: Int64) async throws {
        try await api.delete("chat/channels/\(channelId)/leave")
    }

    /// Busca mensajes — GET `chat/search`.
    ///
    /// El backend exige `q` de al menos dos caracteres y devuelve `{messages}`
    /// vacío si no llega; se corta aquí para no gastar la llamada.
    func searchMessages(query: String, channelId: Int64? = nil) async throws -> [ChatSearchHit] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= 2 else { return [] }
        var params: [String: String] = ["q": q]
        if let channelId, channelId > 0 { params["channelId"] = String(channelId) }
        let data = try await api.get("chat/search", query: params)
        let map = ConsoleHelpers.decodeMap(data)
        if let list = map["messages"] as? [[String: Any]] {
            return list.map(ChatSearchHit.init)
        }
        return ApiClient.decodeMapList(data).map(ChatSearchHit.init)
    }

    func updateTopic(channelId: Int64, topic: String) async throws -> [String: Any] {
        struct Body: Encodable { let topic: String }
        let data = try await api.patchJSON(
            "chat/channels/\(channelId)/topic",
            body: Body(topic: topic.trimmingCharacters(in: .whitespacesAndNewlines))
        )
        return ConsoleHelpers.decodeMap(data)
    }

    func addMember(channelId: Int64, userId: Int64) async throws -> [String: Any] {
        struct Body: Encodable { let userId: Int64 }
        let data = try await api.postJSON(
            "chat/channels/\(channelId)/members",
            body: Body(userId: userId)
        )
        return ConsoleHelpers.decodeMap(data)
    }

    func listColleagues(query: String? = nil) async throws -> [[String: Any]] {
        var q: [String: String] = [:]
        if let query, !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            q["q"] = query.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return ApiClient.decodeMapList(try await api.get("chat/colleagues", query: q))
    }

    func openDm(userId: Int64) async throws -> [String: Any] {
        struct Body: Encodable { let userId: Int64 }
        let data = try await api.postJSON("chat/dm", body: Body(userId: userId))
        return ConsoleHelpers.decodeMap(data)
    }

    func listMessages(
        channelId: Int64,
        limit: Int = 50,
        parentId: Int64? = nil,
        beforeId: Int64? = nil
    ) async throws -> ChatMessagesPage {
        var q: [String: String] = ["limit": String(limit)]
        if let parentId, parentId > 0 { q["parentId"] = String(parentId) }
        if let beforeId, beforeId > 0 { q["beforeId"] = String(beforeId) }
        let data = try await api.get("chat/channels/\(channelId)/messages", query: q)
        let map = ConsoleHelpers.decodeMap(data)
        let messages: [[String: Any]]
        if let list = map["messages"] as? [[String: Any]] {
            messages = list
        } else {
            messages = ApiClient.decodeMapList(data)
        }
        let hasMore = (map["hasMore"] as? Bool)
            ?? ((map["hasMore"] as? NSNumber)?.boolValue)
            ?? false
        return ChatMessagesPage(messages: messages, hasMore: hasMore)
    }

    func listPins(channelId: Int64) async throws -> [[String: Any]] {
        let data = try await api.get("chat/channels/\(channelId)/pins")
        let map = ConsoleHelpers.decodeMap(data)
        if let messages = map["messages"] as? [[String: Any]] {
            return messages
        }
        return ApiClient.decodeMapList(data)
    }

    func listMentions(query: String? = nil, kind: String? = nil) async throws -> [[String: Any]] {
        var q: [String: String] = [:]
        if let query, !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            q["q"] = query.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let kind, !kind.isEmpty { q["kind"] = kind }
        return ApiClient.decodeMapList(try await api.get("chat/mentions", query: q))
    }

    func markRead(channelId: Int64) async {
        _ = try? await api.patchJSON("chat/channels/\(channelId)/read", body: EmptyBody())
    }

    func postMessage(
        channelId: Int64,
        body: String,
        parentId: Int64? = nil,
        attachmentUrl: String? = nil,
        attachmentName: String? = nil
    ) async throws -> [String: Any] {
        struct Body: Encodable {
            let body: String
            let parentId: Int64?
            let attachmentUrl: String?
            let attachmentName: String?
        }
        let data = try await api.postJSON(
            "chat/channels/\(channelId)/messages",
            body: Body(
                body: body.trimmingCharacters(in: .whitespacesAndNewlines),
                parentId: parentId,
                attachmentUrl: attachmentUrl,
                attachmentName: attachmentName
            )
        )
        return ConsoleHelpers.decodeMap(data)
    }

    func toggleReaction(messageId: Int64, emoji: String) async throws -> [String: Any] {
        struct Body: Encodable { let emoji: String }
        let data = try await api.postJSON("chat/messages/\(messageId)/reactions", body: Body(emoji: emoji))
        return ConsoleHelpers.decodeMap(data)
    }

    func editMessage(messageId: Int64, body: String) async throws -> [String: Any] {
        struct Body: Encodable { let body: String }
        let data = try await api.patchJSON(
            "chat/messages/\(messageId)",
            body: Body(body: body.trimmingCharacters(in: .whitespacesAndNewlines))
        )
        return ConsoleHelpers.decodeMap(data)
    }

    func pinMessage(messageId: Int64) async throws -> [String: Any] {
        let data = try await api.postJSON("chat/messages/\(messageId)/pin", body: EmptyBody())
        return ConsoleHelpers.decodeMap(data)
    }

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
        let name = ConsoleHelpers.mapStr(map, "name", "attachmentName", "fileName").isEmpty
            ? fileName
            : ConsoleHelpers.mapStr(map, "name", "attachmentName", "fileName")
        guard !url.isEmpty else { throw ApiError.http(-1, "Respuesta de upload inválida") }
        return (url, name)
    }

    private struct EmptyBody: Encodable {}
}

private extension String {
    var nilIfEmpty: String? {
        let t = trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}
