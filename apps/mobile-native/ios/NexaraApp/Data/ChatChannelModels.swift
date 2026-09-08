import Foundation

// Modelos del canal de chat que la web ya usaba y el móvil no: detalle del
// canal (con miembros y estado de silencio) y resultados de búsqueda.
//
// El resto de `ChatRepository` devuelve `[String: Any]` crudo porque las
// pantallas sólo pintan campos sueltos. Aquí sí hay tipo: la vista necesita
// decidir con `muted`, `readOnly` y `supervised`, y un diccionario suelto
// convierte esa lógica en cadenas mágicas repartidas por la vista.

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
        // El backend anida el usuario en `user` dentro de cada miembro.
        let user = (raw["user"] as? [String: Any]) ?? raw
        id = StockParse.int64(user["id"], raw["userId"]) ?? 0
        name = StockParse.str(user["nombre"], user["name"])
        email = StockParse.str(user["email"])
        avatarUrl = StockParse.str(user["avatarUrl"])
    }
}

/// Detalle de canal — GET `chat/channels/:id`.
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
    /// un reporte). En ese caso el backend impide escribir y salir.
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
    /// Sólo tiene sentido salir de un canal de grupo del que eres miembro real.
    var canLeave: Bool { !supervised && !isDirect && id > 0 }

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
        memberCount = StockParse.int(raw["memberCount"]) ?? 0
        supervised = (raw["supervised"] as? Bool)
            ?? ((raw["supervised"] as? NSNumber)?.boolValue ?? false)
        readOnly = (raw["readOnly"] as? Bool)
            ?? ((raw["readOnly"] as? NSNumber)?.boolValue ?? false)
        muted = (raw["muted"] as? Bool)
            ?? ((raw["muted"] as? NSNumber)?.boolValue ?? false)
        members = ((raw["members"] as? [[String: Any]]) ?? []).map(ChatChannelMemberRow.init)
        peerName = StockParse.str(peer?["nombre"], peer?["name"], peer?["email"])
    }
}

/// Resultado de `chat/search`: un mensaje más el canal donde vive, para poder
/// saltar a él desde la lista de resultados.
struct ChatSearchHit: Identifiable, Hashable {
    let id: Int64
    let body: String
    let createdAt: String
    let authorName: String
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
        createdAt = StockParse.str(raw["createdAt"])
        authorName = StockParse.str(author?["nombre"], author?["name"], author?["email"])
        channelId = StockParse.int64(channel?["id"], raw["channelId"]) ?? 0
        channelName = StockParse.str(channel?["name"])
        channelKind = StockParse.str(channel?["kind"])
    }
}
