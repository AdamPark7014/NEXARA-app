import Foundation

/// Página de mensajes — paridad Android `ChatMessagesResponse`.
struct ChatMessagesPage {
    let messages: [ChatMessageRow]
    let hasMore: Bool
}

/// Chat del equipo — paridad Android `ChatRepository` / `ChatApi`
/// (mismos endpoints, mismos parámetros, mismos recortes).
final class ChatRepository {
    static let shared = ChatRepository()
    private let api = ApiClient.shared
    private init() {}

    // MARK: Canales

    /// Lista cruda de `chat/channels`. La usa el shell para la insignia de Chat.
    func listChannels() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("chat/channels"))
    }

    /// Canales con tipo (lo que pinta la lista).
    func channels() async throws -> [ChatChannelRow] {
        try await listChannels().map(ChatChannelRow.init).filter { $0.id > 0 }
    }

    func createChannel(
        name: String,
        kind: String? = nil,
        topic: String? = nil,
        description: String? = nil
    ) async throws -> ChatChannelRow {
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
        return ChatChannelRow(raw: ConsoleHelpers.decodeMap(data))
    }

    /// Ficha del canal — GET `chat/channels/:id`: miembros, silencio y si la
    /// vista es supervisada (la lista no trae miembros).
    func channelDetail(channelId: Int64) async throws -> ChatChannelDetail {
        let data = try await api.get("chat/channels/\(channelId)")
        return ChatChannelDetail(raw: ConsoleHelpers.decodeMap(data))
    }

    /// Silencia o reactiva — PATCH `chat/channels/:id/mute`. El API devuelve la
    /// ficha ya actualizada, así que no hace falta releer.
    @discardableResult
    func setChannelMuted(channelId: Int64, muted: Bool) async throws -> ChatChannelDetail {
        struct Body: Encodable { let muted: Bool }
        let data = try await api.patchJSON("chat/channels/\(channelId)/mute", body: Body(muted: muted))
        return ChatChannelDetail(raw: ConsoleHelpers.decodeMap(data))
    }

    /// Sale del canal — DELETE `chat/channels/:id/leave`. El API rechaza los DM y
    /// los canales `general` / `anuncios`.
    func leaveChannel(channelId: Int64) async throws {
        try await api.delete("chat/channels/\(channelId)/leave")
    }

    /// PATCH `chat/channels/:id/topic`. Devuelve la ficha del canal.
    func updateTopic(channelId: Int64, topic: String) async throws -> ChatChannelDetail {
        struct Body: Encodable { let topic: String }
        let data = try await api.patchJSON(
            "chat/channels/\(channelId)/topic",
            body: Body(topic: topic.trimmingCharacters(in: .whitespacesAndNewlines))
        )
        return ChatChannelDetail(raw: ConsoleHelpers.decodeMap(data))
    }

    /// POST `chat/channels/:id/members`. Devuelve la ficha del canal.
    func addMember(channelId: Int64, userId: Int64) async throws -> ChatChannelDetail {
        struct Body: Encodable { let userId: Int64 }
        let data = try await api.postJSON(
            "chat/channels/\(channelId)/members",
            body: Body(userId: userId)
        )
        return ChatChannelDetail(raw: ConsoleHelpers.decodeMap(data))
    }

    func colleagues(query: String? = nil) async throws -> [ChatColleagueRow] {
        var q: [String: String] = [:]
        if let clean = query?.trimmingCharacters(in: .whitespacesAndNewlines), !clean.isEmpty {
            q["q"] = clean
        }
        return ApiClient.decodeMapList(try await api.get("chat/colleagues", query: q))
            .map(ChatColleagueRow.init)
            .filter { $0.id > 0 }
    }

    func openDm(userId: Int64) async throws -> ChatChannelRow {
        struct Body: Encodable { let userId: Int64 }
        let data = try await api.postJSON("chat/dm", body: Body(userId: userId))
        return ChatChannelRow(raw: ConsoleHelpers.decodeMap(data))
    }

    // MARK: Mensajes

    /// GET `chat/channels/:id/messages`. Sin `parentId` trae solo los mensajes
    /// del canal (no las respuestas de hilo). `aroundId` centra la ventana en
    /// ese mensaje: así un enlace `?channel&msg` abre uno anterior a los últimos 50.
    func listMessages(
        channelId: Int64,
        limit: Int = 50,
        parentId: Int64? = nil,
        beforeId: Int64? = nil,
        aroundId: Int64? = nil
    ) async throws -> ChatMessagesPage {
        var q: [String: String] = ["limit": String(limit)]
        if let parentId, parentId > 0 { q["parentId"] = String(parentId) }
        if let beforeId, beforeId > 0 { q["beforeId"] = String(beforeId) }
        if let aroundId, aroundId > 0, beforeId == nil { q["aroundId"] = String(aroundId) }
        let data = try await api.get("chat/channels/\(channelId)/messages", query: q)
        let map = ConsoleHelpers.decodeMap(data)
        let raw: [[String: Any]]
        if let list = map["messages"] as? [[String: Any]] {
            raw = list
        } else {
            raw = ApiClient.decodeMapList(data)
        }
        let messages = raw.map(ChatMessageRow.init).filter { $0.id > 0 }
        return ChatMessagesPage(messages: messages, hasMore: ChatJSON.bool(map["hasMore"]))
    }

    func listPins(channelId: Int64) async throws -> [ChatMessageRow] {
        let data = try await api.get("chat/channels/\(channelId)/pins")
        let map = ConsoleHelpers.decodeMap(data)
        let raw = (map["messages"] as? [[String: Any]]) ?? ApiClient.decodeMapList(data)
        return raw.map(ChatMessageRow.init).filter { $0.id > 0 }
    }

    /// GET `chat/mentions`. Sin `kind` devuelve personas, actividades y evidencias.
    func mentions(query: String? = nil, kind: String? = nil) async throws -> [ChatMentionRow] {
        var q: [String: String] = [:]
        if let clean = query?.trimmingCharacters(in: .whitespacesAndNewlines), !clean.isEmpty {
            q["q"] = clean
        }
        if let kind, !kind.isEmpty { q["kind"] = kind }
        return ApiClient.decodeMapList(try await api.get("chat/mentions", query: q)).map(ChatMentionRow.init)
    }

    /// PATCH `chat/channels/:id/read`. Falla en silencio, como Android.
    func markRead(channelId: Int64) async {
        _ = try? await api.patchJSON("chat/channels/\(channelId)/read", body: EmptyBody())
    }

    func postMessage(
        channelId: Int64,
        body: String,
        parentId: Int64? = nil,
        attachmentUrl: String? = nil,
        attachmentName: String? = nil
    ) async throws -> ChatMessageRow {
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
        return ChatMessageRow(raw: ConsoleHelpers.decodeMap(data))
    }

    /// POST `chat/messages/:id/reactions`: pone o quita la reacción y devuelve el
    /// mensaje ya actualizado (id 0 si la respuesta no lo trae).
    func toggleReaction(messageId: Int64, emoji: String) async throws -> ChatMessageRow {
        struct Body: Encodable { let emoji: String }
        let data = try await api.postJSON("chat/messages/\(messageId)/reactions", body: Body(emoji: emoji))
        return ChatMessageRow(raw: ConsoleHelpers.decodeMap(data))
    }

    func editMessage(messageId: Int64, body: String) async throws -> ChatMessageRow {
        struct Body: Encodable { let body: String }
        let data = try await api.patchJSON(
            "chat/messages/\(messageId)",
            body: Body(body: body.trimmingCharacters(in: .whitespacesAndNewlines))
        )
        return ChatMessageRow(raw: ConsoleHelpers.decodeMap(data))
    }

    /// POST `chat/messages/:id/pin`: fija o desfija.
    func pinMessage(messageId: Int64) async throws -> ChatMessageRow {
        let data = try await api.postJSON("chat/messages/\(messageId)/pin", body: EmptyBody())
        return ChatMessageRow(raw: ConsoleHelpers.decodeMap(data))
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
        let returned = ConsoleHelpers.mapStr(map, "name", "attachmentName", "fileName")
        guard !url.isEmpty else { throw ApiError.http(-1, "Respuesta de upload inválida") }
        return (url, returned.isEmpty ? fileName : returned)
    }

    // MARK: Búsqueda

    /// GET `chat/search`. El servidor exige dos caracteres y devuelve como mucho
    /// 30; con menos de dos se corta aquí para no gastar la petición.
    func searchMessages(query: String, channelId: Int64? = nil) async throws -> [ChatSearchHit] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= 2 else { return [] }
        var params: [String: String] = ["q": q]
        if let channelId, channelId > 0 { params["channelId"] = String(channelId) }
        let data = try await api.get("chat/search", query: params)
        let map = ConsoleHelpers.decodeMap(data)
        let raw = (map["messages"] as? [[String: Any]]) ?? ApiClient.decodeMapList(data)
        return raw.map(ChatSearchHit.init).filter { $0.id > 0 }
    }

    private struct EmptyBody: Encodable {}
}

// String.nilIfEmpty is provided globally in Support/String+NilIfEmpty.swift
