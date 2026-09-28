import Foundation

// Chat de la demostración: canales, mensajes, reacciones, fijados y menciones.
// Las formas salen de `ChatView` (mapas crudos) y de las fixtures de capturas de tienda.

extension DemoStore {
    // MARK: Piezas

    func authorJSON(_ id: Int) -> DemoJSON {
        let p = DemoData.person(id)
        return dj([
            "id": p.id,
            "nombre": id == DemoMode.meId ? "Tú" : p.nombre,
            "email": p.email,
            "avatarUrl": NSNull(),
        ])
    }

    /// Mensaje del guion. Se llama desde `seed()`, con el candado ya tomado.
    func chatMessage(seed: DemoMessageSeed, channelId: Int) -> DemoJSON {
        messageDates[seed.id] = at(-seed.ago)
        return dj([
            "id": seed.id,
            "channelId": channelId,
            "authorId": seed.author,
            "parentId": NSNull(),
            "kind": "TEXT",
            "body": seed.body,
            "attachmentUrl": NSNull(),
            "attachmentName": NSNull(),
            "pinnedAt": NSNull(),
            "editedAt": NSNull(),
            "createdAt": iso(-seed.ago),
            "author": authorJSON(seed.author),
            "replyCount": 0,
            "reactions": [DemoJSON](),
        ])
    }

    /// Reacciones del guion (quién reaccionó y hace cuánto).
    func seedReactions() {
        applyReaction(messageId: 7001, emoji: "👍", userId: 101, minutesAgo: 184)
        applyReaction(messageId: 7001, emoji: "👍", userId: 102, minutesAgo: 183)
        applyReaction(messageId: 7001, emoji: "👍", userId: 104, minutesAgo: 180)
        applyReaction(messageId: 7004, emoji: "🙌", userId: 104, minutesAgo: 70)
        applyReaction(messageId: 7005, emoji: "👏", userId: 101, minutesAgo: 28)
        applyReaction(messageId: 7005, emoji: "👏", userId: 107, minutesAgo: 25)
        applyReaction(messageId: 7006, emoji: "🔥", userId: DemoMode.meId, minutesAgo: 5)
        applyReaction(messageId: 7006, emoji: "🔥", userId: 102, minutesAgo: 4)
        applyReaction(messageId: 7006, emoji: "🔥", userId: 105, minutesAgo: 3)
        applyReaction(messageId: 7006, emoji: "👍", userId: 108, minutesAgo: 2)
    }

    /// Pone o quita la reacción de una persona (como el botón de la app).
    func applyReaction(messageId: Int, emoji: String, userId: Int, minutesAgo: Int) {
        for (channelId, list) in messages {
            guard let index = list.firstIndex(where: { ($0["id"] as? Int) == messageId }) else { continue }
            var message = list[index]
            var groups = message["reactions"] as? [DemoJSON] ?? []
            if let position = groups.firstIndex(where: { ($0["emoji"] as? String) == emoji }) {
                var group = groups[position]
                var userIds = group["userIds"] as? [Int] ?? []
                var users = group["users"] as? [DemoJSON] ?? []
                if let existing = userIds.firstIndex(of: userId) {
                    userIds.remove(at: existing)
                    users.removeAll { ($0["id"] as? Int) == userId }
                } else {
                    userIds.append(userId)
                    users.append(reactionUser(userId, minutesAgo: minutesAgo))
                }
                if userIds.isEmpty {
                    groups.remove(at: position)
                } else {
                    group["userIds"] = userIds
                    group["users"] = users
                    group["count"] = userIds.count
                    groups[position] = group
                }
            } else {
                groups.append(dj([
                    "emoji": emoji,
                    "count": 1,
                    "userIds": [userId],
                    "users": [reactionUser(userId, minutesAgo: minutesAgo)],
                ]))
            }
            message["reactions"] = groups
            var updated = list
            updated[index] = message
            messages[channelId] = updated
            return
        }
    }

    func reactionUser(_ userId: Int, minutesAgo: Int) -> DemoJSON {
        dj([
            "id": userId,
            "nombre": DemoData.person(userId).nombre,
            "avatarUrl": NSNull(),
            "reactedAt": iso(-minutesAgo),
        ])
    }

    // MARK: Canales

    func allChannelSeeds() -> [DemoChannelSeed] {
        (DemoData.chatChannels + extraChannels).filter { !removedChannels.contains($0.id) }
    }

    func channelSeed(_ id: Int) -> DemoChannelSeed? {
        allChannelSeeds().first { $0.id == id }
    }

    func lastMessageDate(_ channelId: Int) -> Date {
        var latest = Date.distantPast
        for message in messages[channelId] ?? [] {
            if let id = message["id"] as? Int, let when = messageDates[id], when > latest { latest = when }
        }
        return latest
    }

    func channelJSON(_ c: DemoChannelSeed) -> DemoJSON {
        let list = messages[c.id] ?? []
        var json = dj([
            "id": c.id,
            "kind": c.kind,
            "name": c.name,
            "topic": channelTopic[c.id] ?? c.topic,
            "memberCount": c.members,
            "unread": (channelUnread[c.id] ?? 0) > 0,
            "unreadCount": channelUnread[c.id] ?? 0,
            "lastReadAt": iso(-300),
            "muted": channelMuted.contains(c.id),
            "supervised": false,
            "readOnly": false,
        ])
        if c.kind != "DIRECT" { json["slug"] = c.name }
        if let peer = c.peer { json["peer"] = authorJSON(peer) }
        if let last = list.last {
            let body = last["body"] as? String ?? ""
            if c.kind == "DIRECT" {
                json["lastMessagePreview"] = body
            } else {
                let authorId = last["authorId"] as? Int ?? DemoMode.meId
                let name = authorId == DemoMode.meId ? "Tú" : DemoData.person(authorId).corto
                json["lastMessagePreview"] = "\(name): \(body)"
            }
            json["lastMessageAt"] = last["createdAt"] as? String ?? iso(-60)
        }
        return json
    }

    func fxChatChannels() -> [DemoJSON] {
        allChannelSeeds()
            .sorted { lastMessageDate($0.id) > lastMessageDate($1.id) }
            .map { channelJSON($0) }
    }

    func fxChannelDetail(_ id: Int) -> DemoJSON {
        guard let seed = channelSeed(id) else { return [:] }
        var memberIds: [Int]
        switch seed.kind {
        case "DIRECT":
            memberIds = [DemoMode.meId, seed.peer ?? 101]
        case "PRIVATE":
            memberIds = [DemoMode.meId, 101, 107]
        default:
            memberIds = DemoData.people.map { $0.id }
        }
        var json = channelJSON(seed)
        var members: [DemoJSON] = []
        for memberId in memberIds {
            members.append(dj([
                "userId": memberId,
                "user": authorJSON(memberId),
                "role": memberId == DemoMode.meId ? "owner" : "member",
                "lastReadAt": iso(-5),
            ]))
        }
        json["members"] = members
        return json
    }

    // MARK: Mensajes

    func fxChatMessages(channelId: Int, parentId: Int?) -> DemoJSON {
        let all = messages[channelId] ?? []
        var page: [DemoJSON]
        if let parentId, parentId > 0 {
            page = all.filter { ($0["parentId"] as? Int) == parentId }
        } else {
            page = all
        }
        // El servidor manda los más recientes primero en cada página; la app los ordena.
        page.sort { lhs, rhs in
            (lhs["id"] as? Int ?? 0) < (rhs["id"] as? Int ?? 0)
        }
        return dj(["messages": page, "hasMore": false])
    }

    func fxChatPins(channelId: Int) -> DemoJSON {
        let pinned = (messages[channelId] ?? []).filter { !($0["pinnedAt"] is NSNull) && $0["pinnedAt"] != nil }
        return dj(["messages": pinned])
    }

    /// Mensaje nuevo de la persona en sesión.
    func addMessage(
        channelId: Int,
        body: String,
        parentId: Int?,
        attachmentUrl: String?,
        attachmentName: String?,
        now: Date
    ) -> DemoJSON {
        nextMessageId += 1
        let id = nextMessageId
        var message = dj([
            "id": id,
            "channelId": channelId,
            "authorId": DemoMode.meId,
            "kind": "TEXT",
            "body": body,
            "pinnedAt": NSNull(),
            "editedAt": NSNull(),
            "createdAt": DemoClock.iso(now),
            "author": authorJSON(DemoMode.meId),
            "replyCount": 0,
            "reactions": [DemoJSON](),
        ])
        if let parentId, parentId > 0 { message["parentId"] = parentId } else { message["parentId"] = NSNull() }
        if let attachmentUrl, !attachmentUrl.isEmpty { message["attachmentUrl"] = attachmentUrl } else { message["attachmentUrl"] = NSNull() }
        if let attachmentName, !attachmentName.isEmpty { message["attachmentName"] = attachmentName } else { message["attachmentName"] = NSNull() }
        messageDates[id] = now

        var list = messages[channelId] ?? []
        if let parentId, parentId > 0, let index = list.firstIndex(where: { ($0["id"] as? Int) == parentId }) {
            var parent = list[index]
            parent["replyCount"] = (parent["replyCount"] as? Int ?? 0) + 1
            list[index] = parent
        }
        list.append(message)
        messages[channelId] = list
        channelUnread[channelId] = 0
        return message
    }

    /// Fija o desfija un mensaje.
    func togglePin(messageId: Int, now: Date) -> DemoJSON {
        for (channelId, list) in messages {
            guard let index = list.firstIndex(where: { ($0["id"] as? Int) == messageId }) else { continue }
            var message = list[index]
            if message["pinnedAt"] is NSNull || message["pinnedAt"] == nil {
                message["pinnedAt"] = DemoClock.iso(now)
            } else {
                message["pinnedAt"] = NSNull()
            }
            var updated = list
            updated[index] = message
            messages[channelId] = updated
            return message
        }
        return [:]
    }

    func editMessage(messageId: Int, body: String, now: Date) -> DemoJSON {
        for (channelId, list) in messages {
            guard let index = list.firstIndex(where: { ($0["id"] as? Int) == messageId }) else { continue }
            var message = list[index]
            message["body"] = body
            message["editedAt"] = DemoClock.iso(now)
            var updated = list
            updated[index] = message
            messages[channelId] = updated
            return message
        }
        return [:]
    }

    // MARK: Colegas, menciones y búsqueda

    func fxColleagues(query: String) -> [DemoJSON] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return DemoData.team
            .filter { q.isEmpty || $0.nombre.lowercased().contains(q) || $0.puesto.lowercased().contains(q) }
            .map { dj(["id": $0.id, "nombre": $0.nombre, "email": $0.email, "puesto": $0.puesto, "avatarUrl": NSNull()]) }
    }

    func fxMentions(query: String) -> [DemoJSON] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return DemoData.team
            .filter { q.isEmpty || $0.nombre.lowercased().contains(q) }
            .map { dj(["id": $0.id, "label": $0.corto, "subtitle": $0.puesto, "kind": "USER"]) }
    }

    func fxChatSearch(query: String, channelId: Int?) -> DemoJSON {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard q.count >= 2 else { return dj(["messages": [DemoJSON]()]) }
        var hits: [DemoJSON] = []
        for seed in allChannelSeeds() {
            if let channelId, channelId != seed.id { continue }
            for message in messages[seed.id] ?? [] {
                let body = (message["body"] as? String ?? "").lowercased()
                guard body.contains(q) else { continue }
                var hit = message
                hit["channel"] = dj(["id": seed.id, "name": seed.name, "kind": seed.kind])
                hits.append(hit)
            }
        }
        return dj(["messages": hits])
    }

    // MARK: Altas

    func openDirectChannel(with userId: Int) -> DemoJSON {
        if let existing = allChannelSeeds().first(where: { $0.kind == "DIRECT" && $0.peer == userId }) {
            return channelJSON(existing)
        }
        nextChannelId += 1
        let person = DemoData.person(userId)
        let seed = DemoChannelSeed(
            id: nextChannelId, kind: "DIRECT", name: person.nombre, topic: "Mensaje directo",
            peer: userId, members: 2, unread: 0
        )
        extraChannels.append(seed)
        messages[seed.id] = []
        channelUnread[seed.id] = 0
        return channelJSON(seed)
    }

    func createChannel(name: String, kind: String, topic: String) -> DemoJSON {
        nextChannelId += 1
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let seed = DemoChannelSeed(
            id: nextChannelId, kind: kind.isEmpty ? "PUBLIC" : kind, name: clean.isEmpty ? "nuevo-canal" : clean,
            topic: topic, peer: nil, members: 1, unread: 0
        )
        extraChannels.append(seed)
        messages[seed.id] = []
        channelUnread[seed.id] = 0
        return channelJSON(seed)
    }
}
