import Foundation

// Modelos del chat con tipo. Mismos campos que los DTO de Android
// (`data/api/ChatApi.kt`): canal de la lista, mensaje, reacción, mención,
// compañero, ficha del canal y resultado de búsqueda.
//
// Antes el chat de iOS pintaba diccionarios crudos y cada vista volvía a leer
// `authorId`, `parentId` o `unreadCount` a su manera; dos de esas lecturas no
// coincidían y los conteos salían distintos de Android. Aquí se decodifica una
// sola vez.

/// Lectura tolerante de los JSON del chat (números como `Int`, `NSNumber` o texto).
enum ChatJSON {
    static func bool(_ value: Any?) -> Bool {
        if let b = value as? Bool { return b }
        if let n = value as? NSNumber { return n.boolValue }
        if let s = value as? String { return s == "true" || s == "1" }
        return false
    }

    static func int64List(_ value: Any?) -> [Int64] {
        guard let list = value as? [Any] else { return [] }
        return list.compactMap { StockParse.int64($0) }
    }
}

/// Canal de la lista — Android `ChatChannelDto` (más `muted`/`supervised`/`readOnly`,
/// que `GET chat/channels` también manda).
struct ChatChannelRow: Identifiable, Equatable {
    let id: Int64
    var name: String
    var kind: String
    var slug: String
    var topic: String
    var description: String
    var memberCount: Int
    var unreadCount: Int
    var unread: Bool
    var lastMessageAt: String
    var lastMessagePreview: String
    var lastReadAt: String
    var muted: Bool
    var supervised: Bool
    var readOnly: Bool

    var isDirect: Bool { kind.uppercased() == "DIRECT" }
    var isPrivate: Bool { kind.uppercased() == "PRIVATE" }

    init(raw: [String: Any]) {
        let peer = raw["peer"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        name = StockParse.str(raw["name"], raw["nombre"], peer?["nombre"], peer?["email"])
        kind = StockParse.str(raw["kind"])
        slug = StockParse.str(raw["slug"])
        topic = StockParse.str(raw["topic"])
        description = StockParse.str(raw["description"])
        memberCount = StockParse.int(raw["memberCount"]) ?? 0
        unreadCount = max(0, StockParse.int(raw["unreadCount"]) ?? 0)
        unread = ChatJSON.bool(raw["unread"])
        lastMessageAt = StockParse.str(raw["lastMessageAt"])
        lastMessagePreview = StockParse.str(raw["lastMessagePreview"])
        lastReadAt = StockParse.str(raw["lastReadAt"])
        muted = ChatJSON.bool(raw["muted"])
        supervised = ChatJSON.bool(raw["supervised"])
        readOnly = ChatJSON.bool(raw["readOnly"])
    }

    /// Lo que cambia con la ficha (`chat/channels/:id`) sin perder lo que solo
    /// trae la lista (no leídos, vista previa, última lectura).
    func merged(with detail: ChatChannelDetail) -> ChatChannelRow {
        var copy = self
        if !detail.name.isEmpty { copy.name = detail.name }
        copy.topic = detail.topic
        if detail.memberCount > 0 { copy.memberCount = detail.memberCount }
        copy.muted = detail.muted
        copy.supervised = detail.supervised
        copy.readOnly = detail.readOnly
        return copy
    }
}

/// Quién reaccionó — Android `ChatReactionUserDto`.
struct ChatReactionUserRow: Identifiable, Equatable, Hashable {
    let id: Int64
    let nombre: String
    let avatarUrl: String
    /// ISO-8601 tal cual lo manda el API.
    let reactedAt: String

    init(raw: [String: Any]) {
        id = StockParse.int64(raw["id"]) ?? 0
        nombre = StockParse.str(raw["nombre"], raw["name"])
        avatarUrl = StockParse.str(raw["avatarUrl"])
        reactedAt = StockParse.str(raw["reactedAt"])
    }
}

/// Reacción agrupada por emoji — Android `ChatReactionDto`.
struct ChatReactionRow: Identifiable, Equatable {
    var id: String { emoji }
    let emoji: String
    let count: Int
    let userIds: [Int64]
    /// En orden de reacción (más antigua primero).
    let users: [ChatReactionUserRow]

    init(raw: [String: Any]) {
        let ids = ChatJSON.int64List(raw["userIds"])
        emoji = StockParse.str(raw["emoji"])
        userIds = ids
        users = ((raw["users"] as? [[String: Any]]) ?? []).map(ChatReactionUserRow.init)
        count = max(StockParse.int(raw["count"]) ?? 0, ids.count)
    }
}

/// Mensaje — Android `ChatMessageDto`.
struct ChatMessageRow: Identifiable, Equatable {
    let id: Int64
    var channelId: Int64
    var authorId: Int64
    var parentId: Int64?
    var body: String
    var attachmentUrl: String
    var attachmentName: String
    var pinnedAt: String
    var editedAt: String
    var createdAt: String
    var authorName: String
    var replyCount: Int
    var reactions: [ChatReactionRow]

    var isPinned: Bool { !pinnedAt.isEmpty }
    var isEdited: Bool { !editedAt.isEmpty }
    /// Mensaje del canal (no respuesta de hilo): solo estos se fijan y abren hilo.
    var isRoot: Bool { (parentId ?? 0) <= 0 }

    init(raw: [String: Any]) {
        let author = raw["author"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        channelId = StockParse.int64(raw["channelId"]) ?? 0
        authorId = StockParse.int64(raw["authorId"], author?["id"]) ?? 0
        let parent = StockParse.int64(raw["parentId"]) ?? 0
        parentId = parent > 0 ? parent : nil
        body = StockParse.str(raw["body"], raw["message"])
        attachmentUrl = StockParse.str(raw["attachmentUrl"])
        attachmentName = StockParse.str(raw["attachmentName"])
        pinnedAt = StockParse.str(raw["pinnedAt"])
        editedAt = StockParse.str(raw["editedAt"])
        createdAt = StockParse.str(raw["createdAt"])
        authorName = StockParse.str(author?["nombre"], author?["name"], author?["email"], raw["authorName"])
        replyCount = max(0, StockParse.int(raw["replyCount"]) ?? 0)
        reactions = ((raw["reactions"] as? [[String: Any]]) ?? [])
            .map(ChatReactionRow.init)
            .filter { !$0.emoji.isEmpty }
    }
}

/// Persona o entidad mencionable — Android `ChatMentionDto` (`chat/mentions`).
struct ChatMentionRow: Identifiable, Equatable {
    /// `kind` + id: una actividad y una evidencia pueden compartir número.
    var id: String { "\(kind)-\(entityId)" }
    let kind: String
    let entityId: Int64
    let label: String
    let subtitle: String
    let href: String

    init(raw: [String: Any]) {
        kind = StockParse.str(raw["kind"]).uppercased()
        entityId = StockParse.int64(raw["id"]) ?? 0
        label = StockParse.str(raw["label"])
        subtitle = StockParse.str(raw["subtitle"])
        href = StockParse.str(raw["href"])
    }
}

/// Compañero para un mensaje directo o una invitación — Android `ChatColleagueDto`.
struct ChatColleagueRow: Identifiable, Equatable {
    let id: Int64
    let nombre: String
    let email: String

    init(raw: [String: Any]) {
        id = StockParse.int64(raw["id"]) ?? 0
        nombre = StockParse.str(raw["nombre"], raw["name"])
        email = StockParse.str(raw["email"])
    }
}

/// Miembro de un canal, tal y como lo devuelve `chat/channels/:id`.
struct ChatChannelMemberRow: Identifiable, Hashable {
    let id: Int64
    let name: String
    let email: String
    let avatarUrl: String

    var displayName: String {
        if !name.isEmpty { return name }
        if !email.isEmpty { return email }
        return "Usuario #\(id)"
    }

    init(raw: [String: Any]) {
        // El API manda el miembro plano (`id`, `nombre`, `email`, `role`); el
        // demo y versiones viejas lo anidan en `user`.
        let user = (raw["user"] as? [String: Any]) ?? raw
        id = StockParse.int64(user["id"], raw["userId"]) ?? 0
        name = StockParse.str(user["nombre"], user["name"])
        email = StockParse.str(user["email"])
        avatarUrl = StockParse.str(user["avatarUrl"])
    }
}

/// Ficha del canal — Android `ChatChannelDetailDto` (`GET chat/channels/:id`).
struct ChatChannelDetail {
    let id: Int64
    let kind: String
    let slug: String
    let name: String
    let topic: String
    let description: String
    let lastMessageAt: String
    let memberCount: Int
    /// `true` cuando el usuario ve el canal por jerarquía (jefe mirando el DM de
    /// un reporte). En ese caso el backend impide escribir, silenciar y salir.
    let supervised: Bool
    let readOnly: Bool
    let muted: Bool
    let members: [ChatChannelMemberRow]
    let peerName: String
    let raw: [String: Any]

    var isDirect: Bool { kind.uppercased() == "DIRECT" }
    var displayName: String {
        if !name.isEmpty { return name }
        if !peerName.isEmpty { return peerName }
        return "Canal #\(id)"
    }

    init(raw: [String: Any] = [:]) {
        self.raw = raw
        let peer = raw["peer"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        kind = StockParse.str(raw["kind"])
        slug = StockParse.str(raw["slug"])
        name = StockParse.str(raw["name"], raw["nombre"])
        topic = StockParse.str(raw["topic"])
        description = StockParse.str(raw["description"])
        lastMessageAt = StockParse.str(raw["lastMessageAt"])
        let membersRaw = (raw["members"] as? [[String: Any]]) ?? []
        members = membersRaw.map(ChatChannelMemberRow.init)
        memberCount = StockParse.int(raw["memberCount"]) ?? membersRaw.count
        supervised = ChatJSON.bool(raw["supervised"])
        readOnly = ChatJSON.bool(raw["readOnly"])
        muted = ChatJSON.bool(raw["muted"])
        peerName = StockParse.str(peer?["nombre"], peer?["name"], peer?["email"])
    }
}

/// Resultado de `chat/search` — Android `ChatSearchHitDto`: el mensaje más el
/// canal donde vive, para saltar a él desde la lista de resultados.
struct ChatSearchHit: Identifiable, Hashable {
    let id: Int64
    let body: String
    let attachmentName: String
    let createdAt: String
    let authorName: String
    let parentId: Int64?
    let channelId: Int64
    let channelName: String
    let channelKind: String

    var displayChannel: String {
        channelName.isEmpty ? "Canal #\(channelId)" : channelName
    }

    init(raw: [String: Any]) {
        let author = raw["author"] as? [String: Any]
        let channel = raw["channel"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        body = StockParse.str(raw["body"], raw["message"])
        attachmentName = StockParse.str(raw["attachmentName"])
        createdAt = StockParse.str(raw["createdAt"])
        authorName = StockParse.str(author?["nombre"], author?["name"], author?["email"])
        let parent = StockParse.int64(raw["parentId"]) ?? 0
        parentId = parent > 0 ? parent : nil
        channelId = StockParse.int64(channel?["id"], raw["channelId"]) ?? 0
        channelName = StockParse.str(channel?["name"])
        channelKind = StockParse.str(channel?["kind"])
    }
}
