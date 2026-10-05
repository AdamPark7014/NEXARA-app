import Foundation

// Estado y reglas del chat — paridad Android `ChatViewModel` (`ui/chat/ChatScreen.kt`)
// y `ChatListFilter.kt`. Las vistas (`ChatView`) solo pintan lo que hay aquí.

/// Filtros locales de la lista de conversaciones (Android `ChatListFilter`). No
/// piden nada al servidor: acotan los canales ya cargados.
enum ChatListFilter: String, CaseIterable, Identifiable {
    case todos, noLeidos, favoritos, directos

    var id: String { rawValue }

    var label: String {
        switch self {
        case .todos: return "Todos"
        case .noLeidos: return "No leídos"
        case .favoritos: return "Favoritos"
        case .directos: return "Directos"
        }
    }
}

/// Android `ChatListFiltering`.
enum ChatListFiltering {
    /// Nombre, tema o descripción; sin distinguir mayúsculas ni acentos.
    static func matchesQuery(_ channel: ChatChannelRow, _ query: String) -> Bool {
        let q = normalize(query)
        if q.isEmpty { return true }
        return [channel.name, channel.topic, channel.description]
            .contains { normalize($0).contains(q) }
    }

    static func matchesFilter(_ channel: ChatChannelRow, _ filter: ChatListFilter, _ favorites: Set<Int64>) -> Bool {
        switch filter {
        case .todos: return true
        case .noLeidos: return channel.unreadCount > 0 || channel.unread
        case .favoritos: return favorites.contains(channel.id)
        case .directos: return channel.isDirect
        }
    }

    static func apply(
        _ channels: [ChatChannelRow],
        query: String,
        filter: ChatListFilter,
        favorites: Set<Int64>
    ) -> [ChatChannelRow] {
        channels.filter { matchesFilter($0, filter, favorites) && matchesQuery($0, query) }
    }

    /// Cuántos entran en cada chip (sin la búsqueda de texto, para que el número
    /// no baile al escribir).
    static func count(_ channels: [ChatChannelRow], _ filter: ChatListFilter, _ favorites: Set<Int64>) -> Int {
        channels.filter { matchesFilter($0, filter, favorites) }.count
    }

    static func normalize(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_MX"))
            .lowercased()
    }
}

/// Elemento de la conversación: divisor de fecha, divisor «Mensajes nuevos» o mensaje.
enum ChatConversationItem: Identifiable {
    case day(key: String, label: String)
    case unread
    case message(ChatMessageRow)

    var id: String {
        switch self {
        case .day(let key, _): return "day-\(key)"
        case .unread: return "unread-divider"
        case .message(let msg): return "m-\(msg.id)"
        }
    }

    /// Android `buildChatListItems`: divisor por día y, una sola vez, «Mensajes
    /// nuevos» antes del primer mensaje ajeno posterior a la última lectura.
    static func build(_ messages: [ChatMessageRow], currentUserId: Int64, unreadBoundaryAt: String?) -> [ChatConversationItem] {
        var items: [ChatConversationItem] = []
        var lastDay: String?
        var dividerShown = false
        let boundary = unreadBoundaryAt.flatMap { ChatTime.parse($0) }
        let now = Date()
        for msg in messages {
            let day = ChatTime.dayKey(msg.createdAt)
            if day != lastDay {
                items.append(.day(key: day, label: ChatTime.dayLabel(msg.createdAt, now: now)))
                lastDay = day
            }
            if let boundary, !dividerShown, msg.authorId != currentUserId,
               let at = ChatTime.parse(msg.createdAt), at > boundary {
                items.append(.unread)
                dividerShown = true
            }
            items.append(.message(msg))
        }
        return items
    }
}

/// Favoritos del chat: solo en este teléfono (Android `ChatFavoritesStore`).
private enum ChatFavoritesStore {
    private static let key = "nexara.chat.favoriteChannelIds"

    static func load() -> Set<Int64> {
        let arr = UserDefaults.standard.array(forKey: key) as? [Int] ?? []
        return Set(arr.map { Int64($0) })
    }

    static func save(_ ids: Set<Int64>) {
        UserDefaults.standard.set(ids.map { Int($0) }, forKey: key)
    }
}

@MainActor
final class ChatStore: ObservableObject {
    // MARK: Lista
    @Published private(set) var loading = true
    @Published private(set) var refreshing = false
    @Published private(set) var channels: [ChatChannelRow] = []
    @Published var error: String?
    @Published private(set) var favoriteIds: Set<Int64> = ChatFavoritesStore.load()
    @Published private(set) var loadedOnce = false

    // MARK: Conversación
    @Published private(set) var selectedChannel: ChatChannelRow?
    @Published private(set) var messages: [ChatMessageRow] = []
    @Published private(set) var hasMore = false
    @Published private(set) var loadingOlder = false
    @Published private(set) var pinnedMessages: [ChatMessageRow] = []
    @Published private(set) var unreadBoundaryAt: String?
    @Published private(set) var refreshingMessages = false
    @Published var messagesError: String?
    @Published private(set) var channelDetail: ChatChannelDetail?
    /// Mensaje al que hay que desplazar la lista (`?channel&msg`, búsqueda).
    @Published var jumpTargetId: Int64?
    @Published private(set) var typingUsers: [Int64: ChatTypingUser] = [:]

    // MARK: Hilo y respuesta
    @Published private(set) var threadRoot: ChatMessageRow?
    @Published private(set) var threadReplies: [ChatMessageRow] = []
    @Published private(set) var threadLoading = false
    @Published private(set) var threadError: String?
    @Published var replyTo: ChatMessageRow?

    // MARK: Envío
    @Published private(set) var sending = false
    @Published private(set) var uploading = false

    // MARK: Panel «Menciones» de la lista
    @Published private(set) var showMentions = false
    @Published private(set) var mentions: [ChatMentionRow] = []
    @Published private(set) var mentionsLoading = false

    // MARK: Selector «Mencionar actividad / evidencia»
    @Published var showEntityPicker = false
    @Published private(set) var entityKind = "ACTIVITY"
    @Published private(set) var entityMentions: [ChatMentionRow] = []
    @Published private(set) var entityMentionsLoading = false

    // MARK: Búsqueda (`chat/search`)
    @Published var showSearch = false
    @Published var searchQuery = ""
    @Published private(set) var searchResults: [ChatSearchHit] = []
    @Published private(set) var searchLoading = false
    @Published var searchError: String?
    /// `true` = la búsqueda se limita al canal abierto.
    @Published private(set) var searchInChannel = false

    // MARK: Acciones de canal
    @Published var showCreateChannel = false
    @Published var showDmPicker = false
    @Published var showInviteMember = false
    @Published var showEditTopic = false
    @Published var editingMessage: ChatMessageRow?
    @Published private(set) var colleagues: [ChatColleagueRow] = []
    @Published private(set) var colleaguesLoading = false
    @Published private(set) var channelActionLoading = false
    @Published var channelActionError: String?

    let currentUserId: Int64
    private let currentUserName: String
    private var lastTypingEmitAt: Date?
    private var joinedChannelId: Int64?
    /// La pantalla está a la vista (pestaña Chat y app en primer plano).
    private(set) var screenActive = false
    /// El usuario pidió «Cargar anteriores»: al recargar se conservan.
    private var pagedOlder = false
    private var polling = false
    private var colleaguesRequest = 0
    private var entityRequest = 0
    private var mentionsRequest = 0

    init() {
        let user = SessionStore.shared.currentUser
        currentUserId = Int64(user?.id ?? "") ?? 0
        currentUserName = user?.nombre ?? ""
    }

    // MARK: Reglas de la ficha

    /// Silenciado según la ficha; si aún no llegó, se asume que no.
    var isMuted: Bool { channelDetail?.muted == true }

    /// Salir solo en canales de equipo: el servidor rechaza los DM y los canales
    /// `general` / `anuncios`, y una vista supervisada no es membresía.
    var canLeaveChannel: Bool {
        guard let channel = selectedChannel, !channel.isDirect else { return false }
        let slug = channelDetail?.slug.nilIfEmpty ?? channel.slug
        if slug == "general" || slug == "anuncios" { return false }
        return channelDetail?.supervised != true
    }

    /// Silenciar exige membresía real: ni supervisado ni solo lectura.
    var canMuteChannel: Bool {
        guard let detail = channelDetail else { return false }
        return !detail.supervised && !detail.readOnly
    }

    var conversationItems: [ChatConversationItem] {
        ChatConversationItem.build(messages, currentUserId: currentUserId, unreadBoundaryAt: unreadBoundaryAt)
    }

    // MARK: Lista de canales

    private func sorted(_ list: [ChatChannelRow]) -> [ChatChannelRow] {
        list.filter { favoriteIds.contains($0.id) } + list.filter { !favoriteIds.contains($0.id) }
    }

    func loadChannels() async {
        loading = true
        error = nil
        do {
            channels = sorted(try await ChatRepository.shared.channels())
            loadedOnce = true
        } catch {
            self.error = error.toUserMessage()
        }
        loading = false
    }

    func refreshChannels() async {
        refreshing = true
        error = nil
        do {
            let list = try await ChatRepository.shared.channels()
            if let current = selectedChannel, let fresh = list.first(where: { $0.id == current.id }) {
                var updated = fresh
                if let detail = channelDetail, detail.id == fresh.id { updated = fresh.merged(with: detail) }
                selectedChannel = updated
            }
            channels = sorted(list)
            loading = false
            loadedOnce = true
        } catch {
            self.error = error.toUserMessage()
        }
        refreshing = false
    }

    func toggleFavorite(_ channelId: Int64) {
        if favoriteIds.contains(channelId) {
            favoriteIds.remove(channelId)
        } else {
            favoriteIds.insert(channelId)
        }
        ChatFavoritesStore.save(favoriteIds)
        channels = sorted(channels)
    }

    // MARK: Pantalla visible, sala del socket y presencia

    /// La pestaña Chat se ve (o deja de verse). Android: `ON_RESUME` / `ON_PAUSE`.
    func setScreenActive(_ active: Bool) {
        guard active != screenActive else { return }
        screenActive = active
        RealtimeBus.shared.emitChat("chat:presence", ["status": active ? "online" : "away"])
        if active, let id = selectedChannel?.id {
            // Conversación visible: su push no se muestra.
            ActiveConversation.shared.set(id)
            joinRoom(id)
            Task { await pollNewMessages() }
        } else {
            ActiveConversation.shared.clear()
        }
    }

    private func joinRoom(_ channelId: Int64) {
        if let current = joinedChannelId, current != channelId {
            RealtimeBus.shared.emitChat("chat:leave", ["channelId": current])
        }
        RealtimeBus.shared.emitChat("chat:join", ["channelId": channelId])
        joinedChannelId = channelId
    }

    private func leaveRoom() {
        if let current = joinedChannelId {
            RealtimeBus.shared.emitChat("chat:leave", ["channelId": current])
        }
        joinedChannelId = nil
    }

    // MARK: Abrir y cerrar conversación

    func selectChannel(_ channel: ChatChannelRow) {
        openChannel(channel, aroundMessageId: nil, openThreadOf: nil)
    }

    /// Abre el canal. Con `aroundMessageId` trae la ventana centrada en ese
    /// mensaje (enlace o búsqueda); con `openThreadOf` abre además ese hilo.
    func openChannel(_ channel: ChatChannelRow, aroundMessageId: Int64?, openThreadOf: Int64?) {
        joinRoom(channel.id)
        selectedChannel = channel
        messages = []
        hasMore = false
        pagedOlder = false
        pinnedMessages = []
        unreadBoundaryAt = channel.lastReadAt.nilIfEmpty
        messagesError = nil
        threadRoot = nil
        threadReplies = []
        threadError = nil
        replyTo = nil
        typingUsers = [:]
        channelDetail = nil
        showSearch = false
        searchResults = []
        searchError = nil
        jumpTargetId = nil
        channelActionError = nil
        if screenActive { ActiveConversation.shared.set(channel.id) }
        Task {
            if let around = aroundMessageId, around > 0 {
                await jumpToMessage(channelId: channel.id, messageId: around, markRead: true)
            } else {
                await refreshMessages(channelId: channel.id, markRead: true)
            }
            if let rootId = openThreadOf, rootId > 0, selectedChannel?.id == channel.id,
               let root = messages.first(where: { $0.id == rootId }) {
                openThread(root)
            }
        }
        Task { await loadChannelDetail(channel.id) }
    }

    /// Enlace o push a un canal (`?channel&msg`). Android abre el hilo del mensaje
    /// enlazado; si el canal no está en la lista se intenta con su ficha.
    func openFromLink(channelId: Int64, messageId: Int64?) async {
        guard channelId > 0 else { return }
        let msg = (messageId ?? 0) > 0 ? messageId : nil
        if let channel = channels.first(where: { $0.id == channelId }) {
            openChannel(channel, aroundMessageId: msg, openThreadOf: msg)
            return
        }
        guard let detail = try? await ChatRepository.shared.channelDetail(channelId: channelId), detail.id > 0 else { return }
        let channel = ChatChannelRow(raw: detail.raw)
        openChannel(channel, aroundMessageId: msg, openThreadOf: msg)
    }

    func clearChannel() {
        guard selectedChannel != nil else { return }
        leaveRoom()
        ActiveConversation.shared.clear()
        selectedChannel = nil
        unreadBoundaryAt = nil
        messagesError = nil
        threadRoot = nil
        threadReplies = []
        threadError = nil
        replyTo = nil
        typingUsers = [:]
        channelDetail = nil
        // La búsqueda sobrevive al cierre solo si era global.
        let wasGlobal = showSearch && !searchInChannel
        if searchInChannel { searchResults = [] }
        showSearch = wasGlobal
        searchInChannel = false
        jumpTargetId = nil
        showEntityPicker = false
        editingMessage = nil
        showInviteMember = false
        showEditTopic = false
    }

    // MARK: Mensajes

    private func merge(_ existing: [ChatMessageRow], _ incoming: [ChatMessageRow]) -> [ChatMessageRow] {
        guard !incoming.isEmpty else { return existing }
        var byId: [Int64: ChatMessageRow] = [:]
        for msg in existing { byId[msg.id] = msg }
        for msg in incoming { byId[msg.id] = msg }
        return byId.values.sorted { $0.id < $1.id }
    }

    private func markChannelRead(_ channelId: Int64) {
        let now = NxFormat.isoString(Date())
        channels = channels.map { channel in
            guard channel.id == channelId else { return channel }
            var copy = channel
            copy.unreadCount = 0
            copy.unread = false
            copy.lastReadAt = now
            return copy
        }
        if selectedChannel?.id == channelId {
            selectedChannel?.unreadCount = 0
            selectedChannel?.unread = false
        }
    }

    /// Recarga la última página, los fijados y, si hay hilo abierto, sus respuestas.
    func refreshMessages(channelId: Int64? = nil, markRead: Bool = false) async {
        guard let id = channelId ?? selectedChannel?.id else { return }
        let threadParentId = threadRoot?.id
        refreshingMessages = true
        messagesError = nil
        do {
            let page = try await ChatRepository.shared.listMessages(channelId: id)
            let pins = try await ChatRepository.shared.listPins(channelId: id)
            var replies: [ChatMessageRow]?
            if let threadParentId {
                replies = try await ChatRepository.shared.listMessages(channelId: id, limit: 100, parentId: threadParentId).messages
            }
            if markRead { await ChatRepository.shared.markRead(channelId: id) }
            guard selectedChannel?.id == id else {
                refreshingMessages = false
                return
            }
            if pagedOlder, let newest = page.messages.first?.id {
                // Con páginas viejas ya cargadas se conservan las anteriores a esta.
                messages = merge(messages.filter { $0.id < newest }, page.messages)
            } else {
                messages = page.messages
                hasMore = page.hasMore
            }
            pinnedMessages = pins
            if let replies, threadRoot?.id == threadParentId { threadReplies = replies }
            if markRead { markChannelRead(id) }
        } catch {
            if selectedChannel?.id == id { messagesError = error.toUserMessage() }
        }
        refreshingMessages = false
    }

    /// Sondeo de 3 s (además del socket): solo agrega lo nuevo.
    func pollNewMessages() async {
        guard let id = selectedChannel?.id, !refreshingMessages, !polling else { return }
        polling = true
        defer { polling = false }
        do {
            let afterId = messages.map(\.id).max()
            let page = try await ChatRepository.shared.listMessages(channelId: id)
            let fresh = afterId.map { after in page.messages.filter { $0.id > after } } ?? page.messages
            var freshReplies: [ChatMessageRow] = []
            if let parentId = threadRoot?.id {
                let afterReply = threadReplies.map(\.id).max()
                let replies = try await ChatRepository.shared.listMessages(channelId: id, limit: 100, parentId: parentId).messages
                freshReplies = afterReply.map { after in replies.filter { $0.id > after } } ?? replies
            }
            guard selectedChannel?.id == id else { return }
            if !fresh.isEmpty {
                messages = merge(messages, fresh)
                // Lo que se ve en pantalla queda leído: sin esto, con el socket
                // caído, el canal volvía a la lista con su contador viejo.
                if screenActive, fresh.contains(where: { $0.authorId != currentUserId }) {
                    await ChatRepository.shared.markRead(channelId: id)
                    markChannelRead(id)
                }
            }
            if !freshReplies.isEmpty { threadReplies = merge(threadReplies, freshReplies) }
        } catch {
            // El sondeo falla en silencio; el error se ve al recargar a mano.
        }
    }

    /// «Cargar anteriores» (la web lo tiene): página previa con `beforeId`.
    func loadOlder() async {
        guard let id = selectedChannel?.id, hasMore, !loadingOlder,
              let oldest = messages.map(\.id).min() else { return }
        loadingOlder = true
        do {
            let page = try await ChatRepository.shared.listMessages(channelId: id, beforeId: oldest)
            guard selectedChannel?.id == id else {
                loadingOlder = false
                return
            }
            messages = merge(messages, page.messages)
            hasMore = page.hasMore
            pagedOlder = true
        } catch {
            messagesError = error.toUserMessage()
        }
        loadingOlder = false
    }

    /// Ventana centrada en un mensaje que puede no estar en la última página.
    func jumpToMessage(channelId: Int64, messageId: Int64, markRead: Bool = false) async {
        guard messageId > 0 else { return }
        refreshingMessages = true
        messagesError = nil
        do {
            let page = try await ChatRepository.shared.listMessages(channelId: channelId, aroundId: messageId)
            let pins = try await ChatRepository.shared.listPins(channelId: channelId)
            if markRead { await ChatRepository.shared.markRead(channelId: channelId) }
            guard selectedChannel?.id == channelId else {
                refreshingMessages = false
                return
            }
            messages = page.messages
            hasMore = page.hasMore
            pagedOlder = false
            pinnedMessages = pins
            jumpTargetId = messageId
            if markRead { markChannelRead(channelId) }
        } catch {
            messagesError = error.toUserMessage()
        }
        refreshingMessages = false
    }

    // MARK: Hilos

    func openThread(_ msg: ChatMessageRow) {
        guard let channelId = selectedChannel?.id else { return }
        threadRoot = msg
        threadReplies = []
        threadError = nil
        replyTo = nil
        Task { await loadThreadReplies(channelId: channelId, parentId: msg.id) }
    }

    func closeThread() {
        threadRoot = nil
        threadReplies = []
        threadError = nil
        replyTo = nil
    }

    func loadThreadReplies(channelId: Int64, parentId: Int64) async {
        threadLoading = true
        threadError = nil
        do {
            let page = try await ChatRepository.shared.listMessages(channelId: channelId, limit: 100, parentId: parentId)
            if threadRoot?.id == parentId { threadReplies = page.messages }
        } catch {
            threadError = error.toUserMessage()
        }
        threadLoading = false
    }

    /// «Responder»: abre el hilo del mensaje (o de su raíz) y deja la respuesta apuntada.
    func replyToMessage(_ msg: ChatMessageRow) {
        let root: ChatMessageRow?
        if let parentId = msg.parentId {
            root = messages.first(where: { $0.id == parentId }) ?? (threadRoot?.id == parentId ? threadRoot : nil)
        } else {
            root = msg
        }
        guard let root else { return }
        if threadRoot?.id != root.id { openThread(root) }
        replyTo = root
    }

    // MARK: Menciones

    func toggleShowMentions() {
        showMentions.toggle()
        if showMentions && mentions.isEmpty { Task { await loadMentions() } }
    }

    func loadMentions(query: String? = nil) async {
        mentionsRequest += 1
        let request = mentionsRequest
        mentionsLoading = true
        let list = try? await ChatRepository.shared.mentions(query: query)
        guard request == mentionsRequest else { return }
        if let list { mentions = list }
        mentionsLoading = false
    }

    func openEntityPicker(kind: String) {
        entityKind = kind
        entityMentions = []
        showEntityPicker = true
        Task { await loadEntityMentions(query: nil) }
    }

    func setEntityKind(_ kind: String) {
        entityKind = kind
        entityMentions = []
        Task { await loadEntityMentions(query: nil) }
    }

    func loadEntityMentions(query: String?) async {
        entityRequest += 1
        let request = entityRequest
        let kind = entityKind
        entityMentionsLoading = true
        let list = try? await ChatRepository.shared.mentions(query: query, kind: kind)
        guard request == entityRequest else { return }
        if let list { entityMentions = list }
        entityMentionsLoading = false
    }

    /// `@…` mientras se escribe (la web): personas que se pueden mencionar.
    func userMentions(query: String) async -> [ChatMentionRow] {
        (try? await ChatRepository.shared.mentions(query: query, kind: "USER")) ?? []
    }

    // MARK: Enviar

    /// Envía el texto. Sin `parentId` explícito va al hilo abierto o a la
    /// respuesta apuntada. Devuelve `false` si no salió (el borrador se repone).
    @discardableResult
    func send(_ text: String, parentId: Int64? = nil) async -> Bool {
        guard let channel = selectedChannel else { return false }
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return false }
        let effectiveParent = parentId ?? threadRoot?.id ?? replyTo?.id
        sending = true
        do {
            let msg = try await ChatRepository.shared.postMessage(channelId: channel.id, body: clean, parentId: effectiveParent)
            applySent(msg, parentId: effectiveParent)
            sending = false
            await refreshMessages(channelId: channel.id)
            return true
        } catch {
            sending = false
            messagesError = error.toUserMessage()
            return false
        }
    }

    /// Sube el adjunto (`chat/upload`) y lo manda con el texto que hubiera.
    @discardableResult
    func uploadAndSend(data: Data, fileName: String, mimeType: String, text: String, parentId: Int64? = nil) async -> Bool {
        guard let channel = selectedChannel else { return false }
        let effectiveParent = parentId ?? threadRoot?.id ?? replyTo?.id
        uploading = true
        messagesError = nil
        do {
            let upload = try await ChatRepository.shared.uploadAttachment(data: data, fileName: fileName, mimeType: mimeType)
            let msg = try await ChatRepository.shared.postMessage(
                channelId: channel.id,
                body: text,
                parentId: effectiveParent,
                attachmentUrl: upload.url,
                attachmentName: upload.name
            )
            applySent(msg, parentId: effectiveParent)
            uploading = false
            await refreshMessages(channelId: channel.id)
            return true
        } catch {
            uploading = false
            messagesError = error.toUserMessage(fallback: "No se pudo enviar el adjunto")
            return false
        }
    }

    private func applySent(_ msg: ChatMessageRow, parentId: Int64?) {
        if let parentId {
            messages = messages.map { item in
                guard item.id == parentId else { return item }
                var copy = item
                copy.replyCount += 1
                return copy
            }
            if threadRoot?.id == parentId {
                if msg.id > 0 { threadReplies = merge(threadReplies, [msg]) }
                threadRoot?.replyCount += 1
            }
        } else if msg.id > 0 {
            messages = merge(messages, [msg])
        }
        replyTo = nil
    }

    // MARK: Reacciones, edición y fijados

    func react(_ messageId: Int64, emoji: String) async {
        do {
            let msg = try await ChatRepository.shared.toggleReaction(messageId: messageId, emoji: emoji)
            if msg.id > 0 {
                handleMessageUpdated(msg)
            } else {
                await refreshMessages()
            }
        } catch {
            // Igual que Android: una reacción fallida no interrumpe la conversación.
        }
    }

    func editMessage(_ messageId: Int64, body: String) async {
        guard !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            channelActionError = "El mensaje no puede estar vacío"
            return
        }
        channelActionLoading = true
        channelActionError = nil
        do {
            let msg = try await ChatRepository.shared.editMessage(messageId: messageId, body: body)
            if msg.id > 0 { handleMessageUpdated(msg) } else { await refreshMessages() }
            editingMessage = nil
        } catch {
            channelActionError = error.toUserMessage(fallback: "No se pudo editar el mensaje")
        }
        channelActionLoading = false
    }

    func pinMessage(_ messageId: Int64) async {
        do {
            let msg = try await ChatRepository.shared.pinMessage(messageId: messageId)
            if msg.id > 0 { handleMessageUpdated(msg) } else { await refreshMessages() }
        } catch {
            messagesError = error.toUserMessage()
        }
    }

    // MARK: Ficha, silencio y salida

    /// Falla en silencio a propósito: la ficha solo alimenta el menú y el subtítulo.
    func loadChannelDetail(_ channelId: Int64) async {
        guard let detail = try? await ChatRepository.shared.channelDetail(channelId: channelId),
              selectedChannel?.id == channelId else { return }
        channelDetail = detail
        // El conteo de miembros de la ficha es el bueno.
        selectedChannel = selectedChannel?.merged(with: detail)
    }

    func toggleMuted() async {
        guard let channelId = selectedChannel?.id, canMuteChannel else { return }
        let target = !isMuted
        channelActionLoading = true
        channelActionError = nil
        do {
            let detail = try await ChatRepository.shared.setChannelMuted(channelId: channelId, muted: target)
            if selectedChannel?.id == channelId { channelDetail = detail }
            channels = channels.map { channel in
                guard channel.id == channelId else { return channel }
                var copy = channel
                copy.muted = target
                return copy
            }
        } catch {
            channelActionError = error.toUserMessage(
                fallback: target ? "No se pudo silenciar el canal" : "No se pudo reactivar el canal"
            )
        }
        channelActionLoading = false
    }

    /// Sale del canal; al lograrlo vuelve a la lista y la recarga. `true` si salió.
    @discardableResult
    func leaveChannel() async -> Bool {
        guard let channelId = selectedChannel?.id else { return false }
        channelActionLoading = true
        channelActionError = nil
        do {
            try await ChatRepository.shared.leaveChannel(channelId: channelId)
            channelActionLoading = false
            clearChannel()
            await refreshChannels()
            return true
        } catch {
            channelActionLoading = false
            channelActionError = error.toUserMessage(fallback: "No se pudo salir del canal")
            return false
        }
    }

    // MARK: Búsqueda de mensajes

    /// Con un canal abierto arranca acotada a ese canal.
    func toggleSearch() {
        let opening = !showSearch
        showSearch = opening
        searchInChannel = opening && selectedChannel != nil
        searchError = nil
        if !opening { searchResults = [] }
    }

    func setSearchInChannel(_ value: Bool) {
        searchInChannel = value
        if searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 {
            Task { await runSearch() }
        }
    }

    func runSearch() async {
        let q = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= 2 else {
            searchResults = []
            searchError = "Escribe al menos dos letras"
            return
        }
        let channelId = searchInChannel ? selectedChannel?.id : nil
        searchLoading = true
        searchError = nil
        do {
            searchResults = try await ChatRepository.shared.searchMessages(query: q, channelId: channelId)
        } catch {
            searchResults = []
            searchError = error.toUserMessage(fallback: "No se pudo buscar")
        }
        searchLoading = false
    }

    /// Salta de un resultado a su canal y a su mensaje (o al hilo, si es respuesta).
    /// Si el canal no está en la lista se refresca primero.
    func openSearchHit(_ hit: ChatSearchHit) async {
        var channel = channels.first(where: { $0.id == hit.channelId })
        if channel == nil {
            do {
                channels = sorted(try await ChatRepository.shared.channels())
                channel = channels.first(where: { $0.id == hit.channelId })
            } catch {
                searchError = error.toUserMessage(fallback: "No se pudo abrir el canal")
                return
            }
        }
        guard let channel else {
            searchError = "El canal de ese mensaje ya no está a tu alcance"
            return
        }
        showSearch = false
        let target = hit.parentId ?? hit.id
        openChannel(channel, aroundMessageId: target, openThreadOf: hit.parentId)
    }

    // MARK: Nueva conversación, invitar y tema

    func setShowDmPicker(_ show: Bool) {
        channelActionError = nil
        showDmPicker = show
        if show { Task { await loadColleagues(query: nil) } }
    }

    func setShowInviteMember(_ show: Bool) {
        channelActionError = nil
        showInviteMember = show
        if show { Task { await loadColleagues(query: nil) } }
    }

    func setShowCreateChannel(_ show: Bool) {
        channelActionError = nil
        showCreateChannel = show
    }

    func setShowEditTopic(_ show: Bool) {
        channelActionError = nil
        showEditTopic = show
    }

    func setEditingMessage(_ msg: ChatMessageRow?) {
        channelActionError = nil
        editingMessage = msg
    }

    func loadColleagues(query: String?) async {
        colleaguesRequest += 1
        let request = colleaguesRequest
        colleaguesLoading = true
        let list = try? await ChatRepository.shared.colleagues(query: query)
        guard request == colleaguesRequest else { return }
        colleagues = list ?? []
        colleaguesLoading = false
    }

    /// `true` si se creó (y ya quedó abierto).
    @discardableResult
    func createChannel(name: String, topic: String, isPrivate: Bool) async -> Bool {
        guard name.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 else {
            channelActionError = "El nombre debe tener al menos 2 caracteres"
            return false
        }
        channelActionLoading = true
        channelActionError = nil
        do {
            let channel = try await ChatRepository.shared.createChannel(
                name: name,
                kind: isPrivate ? "PRIVATE" : "PUBLIC",
                topic: topic
            )
            channelActionLoading = false
            showCreateChannel = false
            if channel.id > 0 {
                channels = sorted(channels.filter { $0.id != channel.id } + [channel])
                selectChannel(channel)
            }
            return true
        } catch {
            channelActionLoading = false
            channelActionError = error.toUserMessage(fallback: "No se pudo crear el canal")
            return false
        }
    }

    func openDm(userId: Int64) async {
        guard userId > 0 else { return }
        channelActionLoading = true
        channelActionError = nil
        do {
            let channel = try await ChatRepository.shared.openDm(userId: userId)
            channelActionLoading = false
            showDmPicker = false
            guard channel.id > 0 else { return }
            if let existing = channels.first(where: { $0.id == channel.id }) {
                selectChannel(existing)
            } else {
                channels = sorted(channels + [channel])
                selectChannel(channel)
            }
        } catch {
            channelActionLoading = false
            channelActionError = error.toUserMessage(fallback: "No se pudo abrir el mensaje directo")
        }
    }

    func inviteMember(userId: Int64) async {
        guard let channelId = selectedChannel?.id, userId > 0 else { return }
        channelActionLoading = true
        channelActionError = nil
        do {
            let detail = try await ChatRepository.shared.addMember(channelId: channelId, userId: userId)
            applyDetail(detail, channelId: channelId)
            showInviteMember = false
        } catch {
            channelActionError = error.toUserMessage(fallback: "No se pudo invitar al miembro")
        }
        channelActionLoading = false
    }

    func updateTopic(_ topic: String) async {
        guard let channelId = selectedChannel?.id else { return }
        channelActionLoading = true
        channelActionError = nil
        do {
            let detail = try await ChatRepository.shared.updateTopic(channelId: channelId, topic: topic)
            applyDetail(detail, channelId: channelId)
            showEditTopic = false
        } catch {
            channelActionError = error.toUserMessage(fallback: "No se pudo actualizar el tema")
        }
        channelActionLoading = false
    }

    private func applyDetail(_ detail: ChatChannelDetail, channelId: Int64) {
        guard detail.id == channelId else { return }
        channels = channels.map { $0.id == channelId ? $0.merged(with: detail) : $0 }
        if selectedChannel?.id == channelId {
            selectedChannel = selectedChannel?.merged(with: detail)
            channelDetail = detail
        }
    }

    // MARK: Escribiendo…

    /// `chat:typing` como mucho cada 1.2 s (Android `notifyDraftChanged`).
    func notifyDraftChanged() {
        guard let channelId = selectedChannel?.id, !currentUserName.isEmpty else { return }
        let now = Date()
        if let last = lastTypingEmitAt, now.timeIntervalSince(last) < 1.2 { return }
        lastTypingEmitAt = now
        RealtimeBus.shared.emitChat("chat:typing", [
            "channelId": channelId,
            "nombre": String(currentUserName.prefix(100)),
        ])
    }

    /// Quita a quien dejó de escribir hace más de 2.8 s.
    func sweepTyping() {
        guard !typingUsers.isEmpty else { return }
        let now = Date()
        let fresh = typingUsers.filter { now.timeIntervalSince($0.value.at) < 2.8 }
        if fresh.count != typingUsers.count { typingUsers = fresh }
    }

    var typingLabel: String {
        ChatChannelKind.typingLabel(typingUsers.values.map(\.nombre).sorted())
    }

    // MARK: Tiempo real (mismos eventos que la web)

    func handle(_ event: ChatSocketEvent) {
        let payload = event.payload
        switch event.name {
        case "connect":
            // Reconexión: volver a la sala y rellenar el hueco.
            joinedChannelId = nil
            if let id = selectedChannel?.id {
                joinRoom(id)
                Task { await pollNewMessages() }
            }
        case "chat:message":
            handleIncoming(ChatMessageRow(raw: payload))
        case "chat:message-updated":
            let msg = ChatMessageRow(raw: payload)
            if msg.id > 0 { handleMessageUpdated(msg) }
        case "chat:message-deleted":
            handleDeleted(id: StockParse.int64(payload["id"]) ?? 0, parentId: StockParse.int64(payload["parentId"]))
        case "chat:channel-activity":
            let channelId = StockParse.int64(payload["channelId"]) ?? 0
            let authorId = StockParse.int64(payload["authorId"]) ?? 0
            // El servidor la manda también a quien escribió: lo propio no es «no leído».
            guard channelId > 0, channelId != selectedChannel?.id, authorId != currentUserId else { return }
            bumpChannel(
                channelId,
                preview: StockParse.str(payload["preview"]),
                at: StockParse.str(payload["at"]),
                increment: true
            )
        case "chat:typing":
            let channelId = StockParse.int64(payload["channelId"]) ?? 0
            let userId = StockParse.int64(payload["userId"]) ?? 0
            guard channelId == selectedChannel?.id, userId > 0, userId != currentUserId else { return }
            typingUsers[userId] = ChatTypingUser(nombre: StockParse.str(payload["nombre"]), at: Date())
        case "chat:channel-updated":
            let id = StockParse.int64(payload["id"]) ?? 0
            let topic = StockParse.str(payload["topic"])
            channels = channels.map { channel in
                guard channel.id == id else { return channel }
                var copy = channel
                copy.topic = topic
                return copy
            }
            if selectedChannel?.id == id { selectedChannel?.topic = topic }
        case "chat:members-changed":
            let channelId = StockParse.int64(payload["channelId"]) ?? 0
            Task { await refreshChannels() }
            if channelId > 0, channelId == selectedChannel?.id {
                Task {
                    await refreshMessages(channelId: channelId)
                    await loadChannelDetail(channelId)
                }
            }
        default:
            break
        }
    }

    private func handleIncoming(_ msg: ChatMessageRow) {
        guard msg.id > 0, msg.channelId > 0 else { return }
        let selectedId = selectedChannel?.id
        if msg.channelId == selectedId {
            typingUsers[msg.authorId] = nil
            if msg.isRoot {
                messages = merge(messages, [msg])
                bumpChannel(msg.channelId, preview: msg.body, at: msg.createdAt, increment: false)
                Task { await ChatRepository.shared.markRead(channelId: msg.channelId) }
                markChannelRead(msg.channelId)
            } else if threadRoot?.id == msg.parentId {
                threadReplies = merge(threadReplies, [msg])
            }
        } else if msg.authorId != currentUserId, msg.isRoot {
            // Las respuestas de hilo no cuentan como no leídas ni cambian la
            // vista previa (el servidor tampoco las cuenta).
            bumpChannel(msg.channelId, preview: msg.body, at: msg.createdAt, increment: true)
        }
    }

    func handleMessageUpdated(_ msg: ChatMessageRow) {
        messages = messages.map { $0.id == msg.id ? msg : $0 }
        threadReplies = threadReplies.map { $0.id == msg.id ? msg : $0 }
        if threadRoot?.id == msg.id { threadRoot = msg }
        var pins = pinnedMessages.map { $0.id == msg.id ? msg : $0 }
        if msg.isPinned && !pins.contains(where: { $0.id == msg.id }) {
            pins.insert(msg, at: 0)
        } else if !msg.isPinned {
            pins.removeAll { $0.id == msg.id }
        }
        pinnedMessages = pins
    }

    private func handleDeleted(id: Int64, parentId: Int64?) {
        guard id > 0 else { return }
        if (parentId ?? 0) > 0 {
            threadReplies.removeAll { $0.id == id }
        } else {
            messages.removeAll { $0.id == id }
        }
        if threadRoot?.id == id {
            threadRoot = nil
            threadReplies = []
        }
        pinnedMessages.removeAll { $0.id == id }
    }

    /// Lista en vivo: no leídos, último mensaje y hora.
    private func bumpChannel(_ channelId: Int64, preview: String, at: String, increment: Bool) {
        channels = channels.map { channel in
            guard channel.id == channelId else { return channel }
            var copy = channel
            if increment {
                copy.unreadCount += 1
                copy.unread = true
            }
            if !preview.isEmpty { copy.lastMessagePreview = preview }
            if !at.isEmpty { copy.lastMessageAt = at }
            return copy
        }
    }
}
