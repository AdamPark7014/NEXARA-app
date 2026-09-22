import SwiftUI

/// Chat nativo iOS — paridad Android `ChatScreen` (canales ricos, pins, reacciones,
/// upload, paginación `beforeId`, crear canal / DM / invitar / editar topic).
struct ChatView: View {
    var initialChannelId: Int64? = nil
    var initialMessageId: Int64? = nil

    @State private var channels: [[String: Any]] = []
    @State private var selectedChannelId: Int64?
    @State private var messages: [[String: Any]] = []
    @State private var hasMoreMessages = false
    @State private var loadingOlder = false
    @State private var draft = ""
    @State private var loading = true
    @State private var refreshingChannels = false
    @State private var error: String?
    @State private var sending = false
    @State private var uploading = false
    @State private var pdfItem: ChatPDFItem?
    @State private var pinned: [[String: Any]] = []
    @State private var showPins = true
    @State private var threadRoot: [String: Any]?
    @State private var threadReplies: [[String: Any]] = []
    @State private var threadDraft = ""
    @State private var threadLoading = false
    @State private var showDocPicker = false
    @State private var showThreadDocPicker = false
    @State private var replyTo: [String: Any]?
    @State private var editingMessage: [String: Any]?
    @State private var reactorsSheetItem: ChatReactorsSheetItem?
    @State private var editDraft = ""
    @State private var favoriteIds: Set<Int64> = ChatFavoritesStore.load()
    @State private var showCreateChannel = false
    @State private var showDmPicker = false
    @State private var showInviteMember = false
    @State private var showEditTopic = false
    @State private var channelActionError: String?
    @State private var channelActionLoading = false
    @State private var colleagues: [[String: Any]] = []
    @State private var colleaguesQuery = ""
    @State private var createName = ""
    @State private var createTopic = ""
    @State private var createPrivate = false
    @State private var topicDraft = ""
    // Tiempo real: el canal abierto vive de los eventos del socket
    // (`chat:message`, `chat:typing`, …), no de un sondeo cada 3 s.
    @State private var joinedChannelId: Int64?
    @State private var typingUsers: [Int64: ChatTypingUser] = [:]
    @State private var lastTypingSentAt: Date?
    @State private var scrollTarget: Int64?
    @State private var highlightedMessageId: Int64?
    @State private var jumpedToOlderWindow = false
    @State private var didJumpToInitialMessage = false
    @State private var mentionOpen = false
    @State private var mentionQuery = ""
    @State private var mentionResults: [[String: Any]] = []
    @State private var mentionLoading = false
    // Búsqueda y ficha de canal: `chat/search`, `chat/channels/:id` y sus
    // acciones de silenciar / salir vivían sólo en la web.
    @State private var showSearch = false
    /// La lupa de la barra busca en todo; la entrada del menú del canal arranca
    /// acotada al canal abierto.
    @State private var searchScopedToChannel = false
    @State private var showChannelInfo = false

    private var currentUserId: Int64 {
        Int64(SessionStore.shared.currentUser?.id ?? "") ?? 0
    }

    private var selectedChannel: [String: Any]? {
        channels.first { (ConsoleHelpers.mapInt64($0, "id") ?? 0) == selectedChannelId }
    }

    private var sortedChannels: [[String: Any]] {
        let fav = channels.filter { favoriteIds.contains(ConsoleHelpers.mapInt64($0, "id") ?? 0) }
        let rest = channels.filter { !favoriteIds.contains(ConsoleHelpers.mapInt64($0, "id") ?? 0) }
        return fav + rest
    }

    private var rootMessages: [[String: Any]] {
        messages.filter { (ConsoleHelpers.mapInt64($0, "parentId") ?? 0) <= 0 }
    }

    private var messageListItems: [ChatListItem] {
        ChatListBuilder.build(messages: rootMessages)
    }

    var body: some View {
        NavigationStack {
            HStack(spacing: 0) {
                channelList
                Divider()
                messagePane
            }
            .navigationTitle("Chat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    Button { searchScopedToChannel = false; showSearch = true } label: {
                        Image(systemName: "magnifyingglass")
                    }
                    Button { showDmPicker = true; Task { await loadColleagues() } } label: {
                        Image(systemName: "person.bubble")
                    }
                    Button { showCreateChannel = true } label: {
                        Image(systemName: "plus.bubble")
                    }
                }
            }
            .task { await loadChannels() }
            .onChange(of: messages.count) { _, _ in
                Task { await openInitialMessageIfNeeded() }
            }
            .onChange(of: selectedChannelId) { _, newId in
                joinChannel(newId)
            }
            .onReceive(RealtimeBus.shared.chatEvents.receive(on: DispatchQueue.main)) { event in
                handleChatEvent(event)
            }
            .task { await sweepTypingUsers() }
            .onAppear { ActiveConversation.shared.set(selectedChannelId) }
            .onDisappear { leaveChannel() }
            .sheet(item: $pdfItem) { item in
                NavigationStack { PDFViewerScreen(title: item.title, data: item.data) }
            }
            .sheet(item: Binding(
                get: {
                    guard let root = threadRoot else { return nil }
                    let id = ConsoleHelpers.mapInt64(root, "id") ?? 0
                    return id > 0 ? ChatThreadItem(id: id, message: root) : nil
                },
                set: { item in
                    if item == nil { threadRoot = nil; threadReplies = [] }
                }
            )) { item in
                threadSheet(root: item.message)
            }
            .sheet(item: $reactorsSheetItem) { item in
                ChatReactorsSheet(reactions: item.reactions, initialEmoji: item.initialEmoji)
            }
            .sheet(isPresented: $showCreateChannel) { createChannelSheet }
            .sheet(isPresented: $showDmPicker) { colleaguesSheet(mode: .dm) }
            .sheet(isPresented: $showInviteMember) { colleaguesSheet(mode: .invite) }
            .sheet(isPresented: $showEditTopic) { editTopicSheet }
            .sheet(isPresented: $showSearch) {
                ChatSearchSheet(
                    channelId: selectedChannelId,
                    channelName: ConsoleHelpers.mapStr(selectedChannel ?? [:], "name", "nombre"),
                    startScoped: searchScopedToChannel,
                    onOpen: { channel, message in
                        showSearch = false
                        Task { await openSearchHit(channelId: channel, messageId: message) }
                    },
                    onDismiss: { showSearch = false }
                )
            }
            .sheet(isPresented: $showChannelInfo) {
                if let id = selectedChannelId, id > 0 {
                    ChatChannelInfoSheet(
                        channelId: id,
                        onDismiss: { showChannelInfo = false },
                        onLeft: {
                            showChannelInfo = false
                            selectedChannelId = nil
                            messages = []
                            pinned = []
                            Task { await loadChannels(refresh: true) }
                        }
                    )
                }
            }
            .alert("Editar mensaje", isPresented: Binding(
                get: { editingMessage != nil },
                set: { if !$0 { editingMessage = nil } }
            )) {
                TextField("Mensaje", text: $editDraft)
                Button("Guardar") { Task { await saveEdit() } }
                Button("Cancelar", role: .cancel) { editingMessage = nil }
            }
        }
    }

    // MARK: – Channel list

    private var channelList: some View {
        VStack(spacing: 0) {
            if refreshingChannels {
                ProgressView().padding(4)
            }
            List {
                if loading && channels.isEmpty {
                    ProgressView()
                }
                ForEach(Array(sortedChannels.enumerated()), id: \.offset) { _, ch in
                    let id = ConsoleHelpers.mapInt64(ch, "id") ?? 0
                    channelRow(ch)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            selectedChannelId = id
                            replyTo = nil
                            threadRoot = nil
                            threadReplies = []
                            Task { await loadMessages(channelId: id, markRead: true) }
                        }
                        .listRowBackground(
                            id == selectedChannelId
                                ? NxBrand.primary.opacity(0.12)
                                : Color(.systemBackground)
                        )
                }
            }
            .listStyle(.sidebar)
            .refreshable { await loadChannels(refresh: true) }
        }
        .frame(minWidth: 220, maxWidth: 300)
    }

    private func channelRow(_ ch: [String: Any]) -> some View {
        let id = ConsoleHelpers.mapInt64(ch, "id") ?? 0
        let name = ConsoleHelpers.mapStr(ch, "name", "nombre")
        let kind = ConsoleHelpers.mapStr(ch, "kind")
        let topic = ConsoleHelpers.mapStr(ch, "topic")
        let unread = ConsoleHelpers.mapInt(ch, "unreadCount")
        let preview = ConsoleHelpers.mapStr(ch, "lastMessagePreview")
        let lastAt = ConsoleHelpers.mapStr(ch, "lastMessageAt")
        let isFav = favoriteIds.contains(id)

        return HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    ChatChannelFormat.title(kind, name.isEmpty ? "Canal" : name)
                        .font(.subheadline.weight(unread > 0 ? .bold : .semibold))
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    if !lastAt.isEmpty {
                        Text(ChatChannelFormat.channelTime(lastAt))
                            .font(.caption2)
                            .foregroundStyle(unread > 0 ? NxBrand.primary : Color.secondary)
                    }
                }
                let subtitle = ChatChannelFormat.kindLabel(kind)
                    + (topic.isEmpty ? "" : " · \(topic)")
                if !subtitle.isEmpty {
                    Text(subtitle).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
                if !preview.isEmpty {
                    Text(ChatChannelFormat.preview(preview))
                        .font(.caption)
                        .foregroundStyle(unread > 0 ? Color.primary : Color.secondary)
                        .lineLimit(1)
                }
            }
            VStack(spacing: 4) {
                Button {
                    toggleFavorite(id)
                } label: {
                    Image(systemName: isFav ? "star.fill" : "star")
                        .font(.caption)
                        .foregroundStyle(isFav ? NxBrand.primary : Color.secondary.opacity(0.5))
                }
                .buttonStyle(.plain)
                if unread > 0 {
                    Text(unread > 99 ? "99+" : "\(unread)")
                        .font(.caption2.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(NxBrand.primary)
                        .clipShape(Capsule())
                }
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: – Message pane

    private var messagePane: some View {
        VStack(spacing: 0) {
            if let ch = selectedChannel {
                channelHeader(ch)
            }
            if let error {
                Text(error).font(.caption).foregroundStyle(.red).padding(8)
            }
            if uploading {
                ProgressView("Subiendo adjunto…").padding(8)
            }
            if showPins && !pinned.isEmpty {
                pinnedSection
            }
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        if hasMoreMessages {
                            Button {
                                Task { await loadOlderMessages() }
                            } label: {
                                if loadingOlder {
                                    ProgressView()
                                } else {
                                    Text("Cargar mensajes anteriores")
                                        .font(.caption)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 4)
                        }
                        ForEach(Array(messageListItems.enumerated()), id: \.offset) { _, item in
                            switch item {
                            case .date(let label):
                                ChatDateDivider(label: label)
                            case .message(let msg):
                                let mid = ConsoleHelpers.mapInt64(msg, "id") ?? 0
                                messageRow(msg, showThreadHint: true)
                                    .id(mid)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 10)
                                            .stroke(NxBrand.primary, lineWidth: highlightedMessageId == mid ? 2 : 0)
                                    )
                            }
                        }
                    }
                    .padding()
                }
                .onChange(of: messages.count) { _, _ in
                    // Si se saltó a un mensaje viejo, no arrastrar la vista al final.
                    guard scrollTarget == nil else { return }
                    if let last = rootMessages.last,
                       let id = ConsoleHelpers.mapInt64(last, "id"), id > 0 {
                        withAnimation { proxy.scrollTo(id, anchor: .bottom) }
                    }
                }
                .onChange(of: scrollTarget) { _, target in
                    guard let target else { return }
                    withAnimation { proxy.scrollTo(target, anchor: .center) }
                    highlightedMessageId = target
                    Task {
                        try? await Task.sleep(nanoseconds: 2_500_000_000)
                        if highlightedMessageId == target { highlightedMessageId = nil }
                        if scrollTarget == target { scrollTarget = nil }
                    }
                }
            }
            if let replyTo {
                replyPreviewBar(replyTo)
            }
            composeBar
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .fileImporter(
            isPresented: $showDocPicker,
            allowedContentTypes: [.pdf, .image],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                guard let url = urls.first else { return }
                Task { await uploadAndSend(url: url, parentId: replyTo.flatMap { ConsoleHelpers.mapInt64($0, "id") }) }
            case .failure(let err):
                error = err.toUserMessage()
            }
        }
    }

    private func channelHeader(_ ch: [String: Any]) -> some View {
        let name = ConsoleHelpers.mapStr(ch, "name", "nombre")
        let kind = ConsoleHelpers.mapStr(ch, "kind")
        let topic = ConsoleHelpers.mapStr(ch, "topic")
        let isDirect = kind.uppercased() == "DIRECT"
        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                ChatChannelFormat.title(kind, name)
                    .font(.headline)
                if !topic.isEmpty {
                    Text(topic).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            Spacer()
            if !pinned.isEmpty {
                Button { showPins.toggle() } label: {
                    Image(systemName: showPins ? "pin.fill" : "pin")
                }
            }
            Menu {
                if !isDirect {
                    Button("Editar tema") {
                        topicDraft = topic
                        showEditTopic = true
                    }
                    Button("Invitar miembro") {
                        showInviteMember = true
                        Task { await loadColleagues() }
                    }
                }
                // Ficha del canal: miembros, silenciar y salir. Todo eso vive en
                // `chat/channels/:id`, que la lista de canales no devuelve.
                Button("Información del canal") { showChannelInfo = true }
                Button("Buscar en el canal") {
                    searchScopedToChannel = true
                    showSearch = true
                }
                Button("Actualizar") {
                    if let id = selectedChannelId {
                        Task { await loadMessages(channelId: id) }
                    }
                }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color(.secondarySystemBackground))
    }

    private var pinnedSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Fijados").font(.caption.bold()).padding(.horizontal, 8)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(pinned.indices, id: \.self) { idx in
                        let p = pinned[idx]
                        let body = ConsoleHelpers.mapStr(p, "body", "message")
                        Button {
                            // scroll target would need id; opening is enough UX for now
                        } label: {
                            NxIconText(systemName: "pin.fill", text: String(body.prefix(48)))
                                .font(.caption)
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .background(Color.yellow.opacity(0.2))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 8)
            }
        }
        .padding(.vertical, 4)
    }

    private func replyPreviewBar(_ msg: [String: Any]) -> some View {
        let author = ChatMessageFormat.author(msg)
        let body = ConsoleHelpers.mapStr(msg, "body", "message")
        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Respondiendo a \(author)").font(.caption.bold()).foregroundStyle(NxBrand.primary)
                Text(body).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            Button { replyTo = nil } label: {
                Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
            }
        }
        .padding(8)
        .background(NxBrand.primary.opacity(0.08))
    }

    private var composeBar: some View {
        VStack(alignment: .leading, spacing: 6) {
            if jumpedToOlderWindow {
                Button("Ir a lo más reciente") {
                    guard let id = selectedChannelId else { return }
                    Task { await loadMessages(channelId: id) }
                }
                .font(.caption)
            }
            if !typingLine.isEmpty {
                Text(typingLine).font(.caption2).foregroundStyle(.secondary)
            }
            if mentionOpen && (!mentionResults.isEmpty || mentionLoading) {
                mentionSuggestions
            }
            HStack(alignment: .bottom) {
                TextField("Mensaje…", text: $draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...4)
                    .onChange(of: draft) { _, value in onDraftChange(value) }
                Button { showDocPicker = true } label: {
                    Image(systemName: "paperclip")
                }
                .disabled(sending || uploading || selectedChannelId == nil)
                Button {
                    Task { await sendMessage() }
                } label: {
                    Image(systemName: "paperplane.fill")
                }
                .disabled(
                    sending || uploading ||
                    draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                    selectedChannelId == nil
                )
            }
        }
        .padding()
    }

    /// «Fulano está escribiendo…», con la misma caducidad que la web (2.8 s).
    private var typingLine: String {
        let names = typingUsers.values
            .map { $0.nombre.split(separator: " ").first.map(String.init) ?? $0.nombre }
            .filter { !$0.isEmpty }
            .sorted()
        switch names.count {
        case 0: return ""
        case 1: return "\(names[0]) está escribiendo…"
        case 2: return "\(names[0]) y \(names[1]) están escribiendo…"
        default: return "Varias personas están escribiendo…"
        }
    }

    private var mentionSuggestions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if mentionLoading { ProgressView().scaleEffect(0.7) }
                ForEach(Array(mentionResults.prefix(8).enumerated()), id: \.offset) { _, m in
                    Button { insertMention(m) } label: {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(ConsoleHelpers.mapStr(m, "label")).font(.caption.bold())
                            let sub = ConsoleHelpers.mapStr(m, "subtitle")
                            if !sub.isEmpty {
                                Text(sub).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                            }
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 2)
        }
        .frame(maxHeight: 58)
    }

    // MARK: – Thread

    private func threadSheet(root: [String: Any]) -> some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        messageRow(root, showThreadHint: false)
                        if threadLoading {
                            ProgressView("Cargando respuestas…").padding()
                        } else if !threadReplies.isEmpty {
                            Text("\(threadReplies.count) \(threadReplies.count == 1 ? "respuesta" : "respuestas")")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .padding(.horizontal)
                            ForEach(threadReplies.indices, id: \.self) { idx in
                                messageRow(threadReplies[idx], showThreadHint: false)
                            }
                        }
                    }
                    .padding()
                }
                HStack {
                    TextField("Responder en el hilo…", text: $threadDraft, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(1...4)
                    Button { showThreadDocPicker = true } label: {
                        Image(systemName: "paperclip")
                    }
                    .disabled(sending || uploading || selectedChannelId == nil)
                    Button("Enviar") { Task { await sendThreadMessage() } }
                    .disabled(
                        sending || uploading ||
                        threadDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                        selectedChannelId == nil
                    )
                }
                .padding()
            }
            .navigationTitle("Hilo de conversación")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { threadRoot = nil; threadReplies = [] }
                }
            }
            .fileImporter(
                isPresented: $showThreadDocPicker,
                allowedContentTypes: [.pdf, .image],
                allowsMultipleSelection: false
            ) { result in
                switch result {
                case .success(let urls):
                    guard let url = urls.first else { return }
                    Task { await uploadAndSend(url: url, parentId: ConsoleHelpers.mapInt64(root, "id")) }
                case .failure(let err):
                    error = err.toUserMessage()
                }
            }
            .task {
                await loadThreadReplies(parentId: ConsoleHelpers.mapInt64(root, "id") ?? 0)
            }
        }
    }

    // MARK: – Message row

    @ViewBuilder
    private func messageRow(_ m: [String: Any], showThreadHint: Bool) -> some View {
        let author = ChatMessageFormat.author(m)
        let body = ConsoleHelpers.mapStr(m, "body", "message")
        let attachmentUrl = ConsoleHelpers.mapStr(m, "attachmentUrl", "url")
        let attachmentName = ConsoleHelpers.mapStr(m, "attachmentName", "name", "fileName")
        let replyCount = ConsoleHelpers.mapInt(m, "replyCount")
        let messageId = ConsoleHelpers.mapInt64(m, "id") ?? 0
        let authorId = ConsoleHelpers.mapInt64(m, "authorId")
            ?? ConsoleHelpers.mapInt64(m["author"] as? [String: Any] ?? [:], "id")
            ?? 0
        let canThread = (ConsoleHelpers.mapInt64(m, "parentId") ?? 0) <= 0
        let isOwn = currentUserId > 0 && authorId == currentUserId
        let editedAt = ConsoleHelpers.mapStr(m, "editedAt")
        let pinnedAt = ConsoleHelpers.mapStr(m, "pinnedAt")
        let createdAt = ConsoleHelpers.mapStr(m, "createdAt")
        let reactions = ChatMessageFormat.reactions(m)

        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(author.isEmpty ? "Usuario" : author)
                    .font(.caption.bold())
                    .foregroundStyle(isOwn ? NxBrand.primary : Color.primary)
                Spacer()
                if !pinnedAt.isEmpty {
                    Image(systemName: "pin.fill").font(.caption2).foregroundStyle(.secondary)
                }
                Menu {
                    Button("Responder") { replyTo = m }
                    if canThread {
                        Button("Ver hilo") { threadRoot = m }
                    }
                    if isOwn {
                        Button("Editar") {
                            editingMessage = m
                            editDraft = body
                        }
                    }
                    Button("Fijar") { Task { await pin(messageId: messageId) } }
                    Menu("Reaccionar") {
                        ForEach(["👍", "✅", "🔥", "❤️", "👀"], id: \.self) { emoji in
                            Button(emoji) { Task { await react(messageId: messageId, emoji: emoji) } }
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis").font(.caption).foregroundStyle(.secondary)
                }
            }
            if !body.isEmpty {
                Text(ChatMentionFormat.display(body)).font(.body)
            }
            if !attachmentUrl.isEmpty {
                let label = attachmentName.isEmpty ? "Adjunto" : attachmentName
                let isPdf = label.lowercased().hasSuffix(".pdf") || attachmentUrl.lowercased().contains(".pdf")
                Button {
                    Task { await openAttachment(url: attachmentUrl, name: label) }
                } label: {
                    Label(label, systemImage: isPdf ? "doc.richtext" : "paperclip")
                        .font(.caption)
                }
                .buttonStyle(.bordered)
            }
            if !reactions.isEmpty {
                HStack(spacing: 6) {
                    ForEach(reactions, id: \.emoji) { r in
                        Button {
                            Task { await react(messageId: messageId, emoji: r.emoji) }
                        } label: {
                            Text("\(r.emoji) \(r.count)")
                                .font(.caption2)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(r.mine ? NxBrand.primary.opacity(0.25) : Color(.tertiarySystemFill))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        // Ver quién reaccionó (con quién y en qué orden): mantiene el
                        // tap normal para reaccionar/quitar tu reacción.
                        .simultaneousGesture(
                            LongPressGesture(minimumDuration: 0.35).onEnded { _ in
                                reactorsSheetItem = ChatReactorsSheetItem(
                                    id: messageId,
                                    reactions: reactions,
                                    initialEmoji: r.emoji
                                )
                            }
                        )
                    }
                }
            }
            HStack(spacing: 8) {
                if !createdAt.isEmpty {
                    Text(ChatChannelFormat.messageTime(createdAt))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                if !editedAt.isEmpty {
                    Text("(editado)").font(.caption2).italic().foregroundStyle(.secondary)
                }
                if showThreadHint && canThread && replyCount > 0 {
                    Button("\(replyCount) \(replyCount == 1 ? "respuesta" : "respuestas") · Ver hilo") {
                        threadRoot = m
                    }
                    .font(.caption)
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: isOwn ? .trailing : .leading)
        .background(isOwn ? NxBrand.primary.opacity(0.12) : Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: – Sheets

    private var createChannelSheet: some View {
        NavigationStack {
            Form {
                TextField("Nombre", text: $createName)
                TextField("Tema (opcional)", text: $createTopic)
                Toggle("Privado", isOn: $createPrivate)
                if let channelActionError {
                    Text(channelActionError).foregroundStyle(.red).font(.footnote)
                }
            }
            .navigationTitle("Nuevo canal")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { showCreateChannel = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Crear") { Task { await createChannel() } }
                        .disabled(createName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || channelActionLoading)
                }
            }
        }
    }

    private enum ColleagueMode { case dm, invite }

    private func colleaguesSheet(mode: ColleagueMode) -> some View {
        NavigationStack {
            List {
                Section {
                    TextField("Buscar colega…", text: $colleaguesQuery)
                        .onChange(of: colleaguesQuery) { _, q in
                            Task { await loadColleagues(query: q) }
                        }
                }
                if channelActionLoading {
                    ProgressView()
                }
                ForEach(colleagues.indices, id: \.self) { idx in
                    let c = colleagues[idx]
                    let uid = ConsoleHelpers.mapInt64(c, "id") ?? 0
                    let name = ConsoleHelpers.mapStr(c, "nombre", "name")
                    let email = ConsoleHelpers.mapStr(c, "email")
                    Button {
                        Task {
                            if mode == .dm { await openDm(userId: uid) }
                            else { await inviteMember(userId: uid) }
                        }
                    } label: {
                        VStack(alignment: .leading) {
                            Text(name.isEmpty ? "Usuario #\(uid)" : name)
                            if !email.isEmpty { Text(email).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    .disabled(uid <= 0 || channelActionLoading)
                }
                if let channelActionError {
                    Text(channelActionError).foregroundStyle(.red).font(.footnote)
                }
            }
            .navigationTitle(mode == .dm ? "Mensaje directo" : "Invitar miembro")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") {
                        showDmPicker = false
                        showInviteMember = false
                    }
                }
            }
        }
    }

    private var editTopicSheet: some View {
        NavigationStack {
            Form {
                TextField("Tema", text: $topicDraft)
                if let channelActionError {
                    Text(channelActionError).foregroundStyle(.red).font(.footnote)
                }
            }
            .navigationTitle("Editar tema")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { showEditTopic = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { Task { await saveTopic() } }
                        .disabled(channelActionLoading)
                }
            }
        }
    }

    // MARK: – Actions

    private func toggleFavorite(_ id: Int64) {
        if favoriteIds.contains(id) { favoriteIds.remove(id) }
        else { favoriteIds.insert(id) }
        ChatFavoritesStore.save(favoriteIds)
    }

    private func loadChannels(refresh: Bool = false) async {
        if refresh { refreshingChannels = true } else { loading = true }
        error = nil
        do {
            channels = try await ChatRepository.shared.listChannels()
            if let preset = initialChannelId, preset > 0 {
                selectedChannelId = preset
                await loadMessages(channelId: preset, markRead: true)
            } else if selectedChannelId == nil, let first = sortedChannels.first {
                let id = ConsoleHelpers.mapInt64(first, "id")
                if let id, id > 0 {
                    selectedChannelId = id
                    await loadMessages(channelId: id, markRead: true)
                }
            }
        } catch {
            self.error = error.toUserMessage()
        }
        loading = false
        refreshingChannels = false
        await openInitialMessageIfNeeded()
    }

    /// Salta al canal y al mensaje que devolvió la búsqueda.
    ///
    /// El resultado puede estar en un canal que no es el abierto y en un mensaje
    /// anterior a los 50 que carga la vista: `aroundId` trae la ventana centrada
    /// en él de una sola llamada, sin paginar hacia atrás.
    private func openSearchHit(channelId: Int64, messageId: Int64) async {
        guard channelId > 0 else { return }
        if selectedChannelId != channelId {
            selectedChannelId = channelId
            replyTo = nil
            threadRoot = nil
            threadReplies = []
            await loadMessages(channelId: channelId, markRead: true, aroundId: messageId > 0 ? messageId : nil)
        }
        guard messageId > 0 else { return }
        if messages.contains(where: { ConsoleHelpers.mapInt64($0, "id") == messageId }) {
            scrollTarget = messageId
        } else {
            await loadMessages(channelId: channelId, aroundId: messageId)
        }
        if let msg = messages.first(where: { ConsoleHelpers.mapInt64($0, "id") == messageId }) {
            // Si el mensaje es respuesta dentro de un hilo, se abre el hilo; si
            // no, basta con haberlo traído a la lista.
            let parentId = ConsoleHelpers.mapInt64(msg, "parentId") ?? 0
            if parentId > 0,
               let root = messages.first(where: { ConsoleHelpers.mapInt64($0, "id") == parentId }) {
                threadRoot = root
                await loadThreadReplies(parentId: parentId)
            }
        }
    }

    /// Enlace `?channel&msg`: salta al mensaje aunque sea anterior a los últimos 50.
    private func openInitialMessageIfNeeded() async {
        guard let msgId = initialMessageId, msgId > 0, !didJumpToInitialMessage else { return }
        guard let channelId = selectedChannelId else { return }
        didJumpToInitialMessage = true
        if messages.contains(where: { ConsoleHelpers.mapInt64($0, "id") == msgId }) {
            scrollTarget = msgId
        } else {
            await loadMessages(channelId: channelId, aroundId: msgId)
        }
    }

    /// `aroundId` centra la ventana en ese mensaje (enlaces `?channel&msg`).
    private func loadMessages(channelId: Int64, markRead: Bool = false, aroundId: Int64? = nil) async {
        do {
            let page = try await ChatRepository.shared.listMessages(channelId: channelId, aroundId: aroundId)
            messages = page.messages
            hasMoreMessages = page.hasMore
            jumpedToOlderWindow = aroundId != nil
            if let aroundId, aroundId > 0 { scrollTarget = aroundId }
            pinned = (try? await ChatRepository.shared.listPins(channelId: channelId)) ?? []
            if markRead {
                await ChatRepository.shared.markRead(channelId: channelId)
                if let idx = channels.firstIndex(where: { (ConsoleHelpers.mapInt64($0, "id") ?? 0) == channelId }) {
                    var ch = channels[idx]
                    ch["unreadCount"] = 0
                    channels[idx] = ch
                }
            }
        } catch {
            self.error = error.toUserMessage()
        }
    }

    private func loadOlderMessages() async {
        guard let channelId = selectedChannelId, hasMoreMessages, !loadingOlder else { return }
        let oldest = messages.compactMap { ConsoleHelpers.mapInt64($0, "id") }.min() ?? 0
        guard oldest > 0 else { return }
        loadingOlder = true
        do {
            let page = try await ChatRepository.shared.listMessages(channelId: channelId, beforeId: oldest)
            let existing = Set(messages.compactMap { ConsoleHelpers.mapInt64($0, "id") })
            let older = page.messages.filter { !(existing.contains(ConsoleHelpers.mapInt64($0, "id") ?? -1)) }
            messages = older + messages
            hasMoreMessages = page.hasMore
        } catch {
            self.error = error.toUserMessage()
        }
        loadingOlder = false
    }

    // MARK: – Tiempo real

    /// Sala del canal abierto: `chat:join` / `chat:leave`, como `WorkspaceChat.tsx`.
    private func joinChannel(_ channelId: Int64?) {
        if let current = joinedChannelId, current != channelId {
            RealtimeBus.shared.emitChat("chat:leave", ["channelId": current])
        }
        typingUsers = [:]
        // Push: los avisos de esta conversación no salen mientras está abierta.
        ActiveConversation.shared.set(channelId)
        guard let channelId, channelId > 0 else {
            joinedChannelId = nil
            return
        }
        RealtimeBus.shared.emitChat("chat:join", ["channelId": channelId])
        joinedChannelId = channelId
    }

    private func leaveChannel() {
        if let current = joinedChannelId {
            RealtimeBus.shared.emitChat("chat:leave", ["channelId": current])
        }
        joinedChannelId = nil
        ActiveConversation.shared.clear()
    }

    /// Mismos eventos y mismas reglas que la web.
    private func handleChatEvent(_ event: ChatSocketEvent) {
        let payload = event.payload
        switch event.name {
        case "connect":
            // Reconexión: volver a la sala y rellenar el hueco de mensajes.
            joinedChannelId = nil
            joinChannel(selectedChannelId)
            if let id = selectedChannelId { Task { await loadMessages(channelId: id) } }
        case "chat:message":
            handleIncomingMessage(payload)
        case "chat:message-updated":
            let id = ConsoleHelpers.mapInt64(payload, "id") ?? 0
            replaceMessage(id: id, with: payload)
        case "chat:message-deleted":
            let id = ConsoleHelpers.mapInt64(payload, "id") ?? 0
            messages.removeAll { ConsoleHelpers.mapInt64($0, "id") == id }
            threadReplies.removeAll { ConsoleHelpers.mapInt64($0, "id") == id }
            pinned.removeAll { ConsoleHelpers.mapInt64($0, "id") == id }
        case "chat:channel-activity":
            let channelId = ConsoleHelpers.mapInt64(payload, "channelId") ?? 0
            guard channelId > 0, channelId != selectedChannelId else { return }
            bumpChannel(
                channelId: channelId,
                preview: ConsoleHelpers.mapStr(payload, "preview"),
                at: ConsoleHelpers.mapStr(payload, "at"),
                increment: true
            )
        case "chat:typing":
            let channelId = ConsoleHelpers.mapInt64(payload, "channelId") ?? 0
            let userId = ConsoleHelpers.mapInt64(payload, "userId") ?? 0
            guard channelId == selectedChannelId, userId > 0, userId != currentUserId else { return }
            typingUsers[userId] = ChatTypingUser(
                nombre: ConsoleHelpers.mapStr(payload, "nombre"),
                at: Date()
            )
        case "chat:channel-updated":
            let id = ConsoleHelpers.mapInt64(payload, "id") ?? 0
            guard let idx = channels.firstIndex(where: { ConsoleHelpers.mapInt64($0, "id") == id }) else { return }
            var ch = channels[idx]
            ch["topic"] = ConsoleHelpers.mapStr(payload, "topic")
            channels[idx] = ch
        case "chat:members-changed":
            Task { await loadChannels(refresh: true) }
        default:
            break
        }
    }

    private func handleIncomingMessage(_ msg: [String: Any]) {
        let channelId = ConsoleHelpers.mapInt64(msg, "channelId") ?? 0
        let messageId = ConsoleHelpers.mapInt64(msg, "id") ?? 0
        let parentId = ConsoleHelpers.mapInt64(msg, "parentId") ?? 0
        guard messageId > 0, channelId > 0 else { return }
        let preview = ConsoleHelpers.mapStr(msg, "body", "message")
        let at = ConsoleHelpers.mapStr(msg, "createdAt")

        guard channelId == selectedChannelId else {
            bumpChannel(channelId: channelId, preview: preview, at: at, increment: true)
            return
        }

        if parentId <= 0,
           !messages.contains(where: { ConsoleHelpers.mapInt64($0, "id") == messageId }) {
            messages.append(msg)
        }
        if parentId > 0,
           let root = threadRoot,
           ConsoleHelpers.mapInt64(root, "id") == parentId,
           !threadReplies.contains(where: { ConsoleHelpers.mapInt64($0, "id") == messageId }) {
            threadReplies.append(msg)
        }
        if let authorId = ConsoleHelpers.mapInt64(msg, "authorId") {
            typingUsers[authorId] = nil
        }
        bumpChannel(channelId: channelId, preview: preview, at: at, increment: false)
        Task { await ChatRepository.shared.markRead(channelId: channelId) }
    }

    private func replaceMessage(id: Int64, with msg: [String: Any]) {
        guard id > 0 else { return }
        if let idx = messages.firstIndex(where: { ConsoleHelpers.mapInt64($0, "id") == id }) {
            messages[idx] = msg
        }
        if let idx = threadReplies.firstIndex(where: { ConsoleHelpers.mapInt64($0, "id") == id }) {
            threadReplies[idx] = msg
        }
        if let root = threadRoot, ConsoleHelpers.mapInt64(root, "id") == id {
            threadRoot = msg
        }
        let isPinned = !ConsoleHelpers.mapStr(msg, "pinnedAt").isEmpty
        if let idx = pinned.firstIndex(where: { ConsoleHelpers.mapInt64($0, "id") == id }) {
            if isPinned { pinned[idx] = msg } else { pinned.remove(at: idx) }
        } else if isPinned {
            pinned.insert(msg, at: 0)
        }
    }

    /// Lista de canales en vivo: no leídas, último mensaje y hora.
    private func bumpChannel(channelId: Int64, preview: String, at: String, increment: Bool) {
        guard let idx = channels.firstIndex(where: { ConsoleHelpers.mapInt64($0, "id") == channelId }) else { return }
        var ch = channels[idx]
        if increment {
            ch["unreadCount"] = ConsoleHelpers.mapInt(ch, "unreadCount") + 1
            ch["unread"] = true
        } else {
            ch["unreadCount"] = 0
            ch["unread"] = false
        }
        if !preview.isEmpty { ch["lastMessagePreview"] = preview }
        if !at.isEmpty { ch["lastMessageAt"] = at }
        channels[idx] = ch
    }

    private func sweepTypingUsers() async {
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 800_000_000)
            guard !typingUsers.isEmpty else { continue }
            let now = Date()
            typingUsers = typingUsers.filter { now.timeIntervalSince($0.value.at) < 2.8 }
        }
    }

    /// `emitTyping` de la web: como mucho un aviso cada 1.2 s.
    private func emitTyping() {
        guard let channelId = selectedChannelId else { return }
        if let last = lastTypingSentAt, Date().timeIntervalSince(last) < 1.2 { return }
        lastTypingSentAt = Date()
        RealtimeBus.shared.emitChat("chat:typing", [
            "channelId": channelId,
            "nombre": SessionStore.shared.currentUser?.nombre ?? "Alguien",
        ])
    }

    // MARK: – Menciones

    private func onDraftChange(_ value: String) {
        emitTyping()
        guard let partial = ChatMentionFormat.pendingMention(in: value) else {
            mentionOpen = false
            mentionQuery = ""
            mentionResults = []
            return
        }
        mentionOpen = true
        if partial != mentionQuery || mentionResults.isEmpty {
            mentionQuery = partial
            Task { await loadMentions(partial) }
        }
    }

    /// `chat/mentions?kind=USER` — las mismas personas que ofrece la web.
    private func loadMentions(_ query: String) async {
        mentionLoading = true
        let results = (try? await ChatRepository.shared.listMentions(query: query, kind: "USER")) ?? []
        guard mentionOpen, mentionQuery == query else {
            mentionLoading = false
            return
        }
        mentionResults = results
        mentionLoading = false
    }

    private func insertMention(_ mention: [String: Any]) {
        draft = ChatMentionFormat.replacePending(
            in: draft,
            label: ConsoleHelpers.mapStr(mention, "label"),
            userId: ConsoleHelpers.mapInt64(mention, "id") ?? 0
        )
        mentionOpen = false
        mentionQuery = ""
        mentionResults = []
    }

    private func loadThreadReplies(parentId: Int64) async {
        guard parentId > 0, let channelId = selectedChannelId else { return }
        threadLoading = true
        do {
            let page = try await ChatRepository.shared.listMessages(channelId: channelId, limit: 100, parentId: parentId)
            threadReplies = page.messages
        } catch {
            self.error = error.toUserMessage()
        }
        threadLoading = false
    }

    private func loadColleagues(query: String? = nil) async {
        channelActionLoading = true
        channelActionError = nil
        do {
            colleagues = try await ChatRepository.shared.listColleagues(query: query ?? colleaguesQuery)
        } catch {
            channelActionError = error.toUserMessage()
        }
        channelActionLoading = false
    }

    private func createChannel() async {
        channelActionLoading = true
        channelActionError = nil
        do {
            let ch = try await ChatRepository.shared.createChannel(
                name: createName,
                kind: createPrivate ? "PRIVATE" : "PUBLIC",
                topic: createTopic.isEmpty ? nil : createTopic
            )
            showCreateChannel = false
            createName = ""; createTopic = ""; createPrivate = false
            await loadChannels(refresh: true)
            if let id = ConsoleHelpers.mapInt64(ch, "id"), id > 0 {
                selectedChannelId = id
                await loadMessages(channelId: id, markRead: true)
            }
        } catch {
            channelActionError = error.toUserMessage()
        }
        channelActionLoading = false
    }

    private func openDm(userId: Int64) async {
        guard userId > 0 else { return }
        channelActionLoading = true
        channelActionError = nil
        do {
            let ch = try await ChatRepository.shared.openDm(userId: userId)
            showDmPicker = false
            await loadChannels(refresh: true)
            if let id = ConsoleHelpers.mapInt64(ch, "id"), id > 0 {
                selectedChannelId = id
                await loadMessages(channelId: id, markRead: true)
            }
        } catch {
            channelActionError = error.toUserMessage()
        }
        channelActionLoading = false
    }

    private func inviteMember(userId: Int64) async {
        guard userId > 0, let channelId = selectedChannelId else { return }
        channelActionLoading = true
        channelActionError = nil
        do {
            _ = try await ChatRepository.shared.addMember(channelId: channelId, userId: userId)
            showInviteMember = false
        } catch {
            channelActionError = error.toUserMessage()
        }
        channelActionLoading = false
    }

    private func saveTopic() async {
        guard let channelId = selectedChannelId else { return }
        channelActionLoading = true
        channelActionError = nil
        do {
            let ch = try await ChatRepository.shared.updateTopic(channelId: channelId, topic: topicDraft)
            if let idx = channels.firstIndex(where: { (ConsoleHelpers.mapInt64($0, "id") ?? 0) == channelId }) {
                if ConsoleHelpers.mapInt64(ch, "id") != nil {
                    channels[idx] = ch
                } else {
                    var c = channels[idx]
                    c["topic"] = topicDraft
                    channels[idx] = c
                }
            }
            showEditTopic = false
        } catch {
            channelActionError = error.toUserMessage()
        }
        channelActionLoading = false
    }

    private func react(messageId: Int64, emoji: String) async {
        guard messageId > 0, let channelId = selectedChannelId else { return }
        do {
            _ = try await ChatRepository.shared.toggleReaction(messageId: messageId, emoji: emoji)
            await loadMessages(channelId: channelId)
            if let root = threadRoot, (ConsoleHelpers.mapInt64(root, "id") ?? 0) > 0 {
                await loadThreadReplies(parentId: ConsoleHelpers.mapInt64(root, "id") ?? 0)
            }
        } catch {
            self.error = error.toUserMessage()
        }
    }

    private func pin(messageId: Int64) async {
        guard messageId > 0, let channelId = selectedChannelId else { return }
        do {
            _ = try await ChatRepository.shared.pinMessage(messageId: messageId)
            pinned = (try? await ChatRepository.shared.listPins(channelId: channelId)) ?? []
            await loadMessages(channelId: channelId)
        } catch {
            self.error = error.toUserMessage()
        }
    }

    private func saveEdit() async {
        guard let msg = editingMessage, let mid = ConsoleHelpers.mapInt64(msg, "id"), mid > 0 else { return }
        guard let channelId = selectedChannelId else { return }
        do {
            _ = try await ChatRepository.shared.editMessage(messageId: mid, body: editDraft)
            editingMessage = nil
            await loadMessages(channelId: channelId)
        } catch {
            self.error = error.toUserMessage()
        }
    }

    private func sendMessage() async {
        guard let channelId = selectedChannelId else { return }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        let parentId = replyTo.flatMap { ConsoleHelpers.mapInt64($0, "id") }
        sending = true
        do {
            _ = try await ChatRepository.shared.postMessage(channelId: channelId, body: text, parentId: parentId)
            draft = ""
            replyTo = nil
            await loadMessages(channelId: channelId)
            if let parentId, parentId > 0 {
                await loadThreadReplies(parentId: parentId)
            }
        } catch {
            self.error = error.toUserMessage()
        }
        sending = false
    }

    private func sendThreadMessage() async {
        guard let channelId = selectedChannelId else { return }
        guard let rootId = ConsoleHelpers.mapInt64(threadRoot ?? [:], "id"), rootId > 0 else { return }
        let text = threadDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        sending = true
        do {
            _ = try await ChatRepository.shared.postMessage(channelId: channelId, body: text, parentId: rootId)
            threadDraft = ""
            await loadMessages(channelId: channelId)
            await loadThreadReplies(parentId: rootId)
        } catch {
            self.error = error.toUserMessage()
        }
        sending = false
    }

    private func uploadAndSend(url: URL, parentId: Int64? = nil) async {
        guard let channelId = selectedChannelId else { return }
        guard url.startAccessingSecurityScopedResource() else { return }
        defer { url.stopAccessingSecurityScopedResource() }
        uploading = true
        do {
            let data = try Data(contentsOf: url)
            let name = url.lastPathComponent
            let ext = url.pathExtension.lowercased()
            let mime = ext == "pdf" ? "application/pdf" : (ext == "png" ? "image/png" : "image/jpeg")
            let upload = try await ChatRepository.shared.uploadAttachment(data: data, fileName: name, mimeType: mime)
            let text = parentId != nil
                ? threadDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                : draft.trimmingCharacters(in: .whitespacesAndNewlines)
            _ = try await ChatRepository.shared.postMessage(
                channelId: channelId,
                body: text,
                parentId: parentId,
                attachmentUrl: upload.url,
                attachmentName: upload.name
            )
            if parentId != nil {
                threadDraft = ""
                await loadThreadReplies(parentId: parentId!)
            } else {
                draft = ""
                replyTo = nil
            }
            await loadMessages(channelId: channelId)
        } catch {
            self.error = error.toUserMessage()
        }
        uploading = false
    }

    private func openAttachment(url: String, name: String) async {
        let path = url.hasPrefix("http") ? url : url.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        do {
            let data: Data
            if url.hasPrefix("http") {
                guard let u = URL(string: url) else { return }
                let (blob, _) = try await URLSession.shared.data(for: URLRequest(url: u))
                data = blob
            } else {
                data = try await ApiClient.shared.getBinary(path)
            }
            if name.lowercased().hasSuffix(".pdf") || path.lowercased().contains(".pdf") {
                pdfItem = ChatPDFItem(title: name, data: data)
            }
        } catch {
            self.error = error.toUserMessage()
        }
    }
}

// MARK: – Helpers

private enum ChatListItem {
    case date(String)
    case message([String: Any])
}

private enum ChatListBuilder {
    static func build(messages: [[String: Any]]) -> [ChatListItem] {
        var items: [ChatListItem] = []
        var lastDay: String?
        for msg in messages {
            let created = ConsoleHelpers.mapStr(msg, "createdAt")
            let day = ChatChannelFormat.dayKey(created)
            if day != lastDay {
                items.append(.date(ChatChannelFormat.dayLabel(created)))
                lastDay = day
            }
            items.append(.message(msg))
        }
        return items
    }
}

private enum ChatChannelFormat {
    static func prefix(_ kind: String) -> String {
        switch kind.uppercased() {
        case "DIRECT", "PRIVATE": return ""
        default: return "# "
        }
    }

    /// Nombre del canal con su marca: candado (SF Symbol) si es privado, «# » si es canal.
    static func title(_ kind: String, _ name: String) -> Text {
        if kind.uppercased() == "PRIVATE" {
            return Text(Image(systemName: "lock.fill")) + Text(" " + name)
        }
        return Text(Self.prefix(kind) + name)
    }

    static func kindLabel(_ kind: String) -> String {
        switch kind.uppercased() {
        case "DIRECT": return "Directo"
        case "PRIVATE": return "Privado"
        default: return "Canal"
        }
    }

    /// Preview legible: menciones y enlaces a su texto, sin emojis de mensajes viejos.
    static func preview(_ raw: String) -> String {
        let sinEmojis = String(String.UnicodeScalarView(
            ChatMentionFormat.display(raw).unicodeScalars.filter { !$0.properties.isEmojiPresentation }
        ))
        return sinEmojis
            .replacingOccurrences(of: "  ", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func channelTime(_ iso: String) -> String {
        guard let d = parse(iso) else { return "" }
        let cal = Calendar.current
        if cal.isDateInToday(d) {
            let f = DateFormatter(); f.dateFormat = "HH:mm"; return f.string(from: d)
        }
        let f = DateFormatter(); f.dateFormat = "dd/MM"; return f.string(from: d)
    }

    static func messageTime(_ iso: String) -> String {
        guard let d = parse(iso) else { return "" }
        let f = DateFormatter(); f.dateFormat = "HH:mm"; return f.string(from: d)
    }

    static func dayKey(_ iso: String) -> String {
        guard let d = parse(iso) else { return iso }
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f.string(from: d)
    }

    static func dayLabel(_ iso: String) -> String {
        guard let d = parse(iso) else { return "" }
        let cal = Calendar.current
        if cal.isDateInToday(d) { return "Hoy" }
        if cal.isDateInYesterday(d) { return "Ayer" }
        let f = DateFormatter(); f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "EEEE d MMM"; return f.string(from: d).capitalized
    }

    private static func parse(_ iso: String) -> Date? {
        guard !iso.isEmpty else { return nil }
        let isoF = ISO8601DateFormatter()
        isoF.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = isoF.date(from: iso) { return d }
        isoF.formatOptions = [.withInternetDateTime]
        return isoF.date(from: iso)
    }
}

private enum ChatMessageFormat {
    static func author(_ m: [String: Any]) -> String {
        let direct = ConsoleHelpers.mapStr(m, "author", "nombre")
        if !direct.isEmpty && m["author"] is String { return direct }
        if let nested = m["author"] as? [String: Any] {
            let n = ConsoleHelpers.mapStr(nested, "nombre", "name")
            if !n.isEmpty { return n }
        }
        return ConsoleHelpers.mapStr(m, "nombre", "authorName")
    }

    /// Tab especial "Todas" del sheet de reactores (no es un emoji real).
    static let allReactionsTab = "__all__"

    struct ReactionUser: Hashable, Identifiable {
        let id: Int64
        let nombre: String
        let avatarUrl: String?
        /// ISO 8601 crudo tal como lo manda el API; se formatea con `relativeReactionTime`.
        let reactedAt: String?
    }

    struct Reaction: Hashable {
        let emoji: String
        let count: Int
        let mine: Bool
        /// Reactores en orden de reacción (más antiguo primero), tal como lo entrega el API.
        let users: [ReactionUser]
    }

    static func reactions(_ m: [String: Any]) -> [Reaction] {
        let uid = Int64(SessionStore.shared.currentUser?.id ?? "") ?? 0
        guard let raw = m["reactions"] as? [[String: Any]] else { return [] }
        return raw.compactMap { r in
            let emoji = ConsoleHelpers.mapStr(r, "emoji")
            guard !emoji.isEmpty else { return nil }
            let count = ConsoleHelpers.mapInt(r, "count")
            let userIds = (r["userIds"] as? [Any])?.compactMap { v -> Int64? in
                if let n = v as? NSNumber { return n.int64Value }
                if let i = v as? Int64 { return i }
                if let i = v as? Int { return Int64(i) }
                if let s = v as? String { return Int64(s) }
                return nil
            } ?? []
            let users: [ReactionUser] = ((r["users"] as? [[String: Any]]) ?? []).map { u in
                ReactionUser(
                    id: ConsoleHelpers.mapInt64(u, "id") ?? 0,
                    nombre: ConsoleHelpers.mapStr(u, "nombre"),
                    avatarUrl: (u["avatarUrl"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
                        .nilIfEmpty,
                    reactedAt: (u["reactedAt"] as? String)?.nilIfEmpty
                )
            }
            return Reaction(emoji: emoji, count: max(count, 1), mine: userIds.contains(uid), users: users)
        }
    }

    static func initials(_ name: String) -> String {
        let parts = name.trimmingCharacters(in: .whitespacesAndNewlines)
            .split(separator: " ")
            .filter { !$0.isEmpty }
        if parts.isEmpty { return "?" }
        if parts.count == 1 { return String(parts[0].prefix(2)).uppercased() }
        return (parts[0].prefix(1) + parts[1].prefix(1)).uppercased()
    }

    /// Parsea el `reactedAt` ISO 8601 del API (con o sin fracción de segundos).
    static func parseReactedAt(_ iso: String?) -> Date? {
        guard let iso, !iso.isEmpty else { return nil }
        let isoF = ISO8601DateFormatter()
        isoF.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = isoF.date(from: iso) { return d }
        isoF.formatOptions = [.withInternetDateTime]
        return isoF.date(from: iso)
    }

    /// "hace 5 min" / "hace 2 h" / "hace 3 d" para el sheet de reactores.
    static func relativeReactionTime(_ iso: String?) -> String {
        guard let d = parseReactedAt(iso) else { return "" }
        let seconds = max(0, Date().timeIntervalSince(d))
        let minutes = Int(seconds / 60)
        if minutes < 1 { return "ahora" }
        if minutes < 60 { return "hace \(minutes) min" }
        let hours = minutes / 60
        if hours < 24 { return "hace \(hours) h" }
        let days = hours / 24
        if days < 7 { return "hace \(days) d" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "d MMM"
        return f.string(from: d)
    }
}

// String.nilIfEmpty is provided globally in Support/String+NilIfEmpty.swift

/// Ítem del sheet "quién reaccionó" (`.sheet(item:)` exige `Identifiable`).
private struct ChatReactorsSheetItem: Identifiable {
    let id: Int64
    let reactions: [ChatMessageFormat.Reaction]
    let initialEmoji: String?
}

/// Sheet "quién reaccionó": pestañas por emoji (Todas primero) y la lista de
/// reactores en el orden en que reaccionaron (más antiguo primero).
private struct ChatReactorsSheet: View {
    let reactions: [ChatMessageFormat.Reaction]
    let initialEmoji: String?

    @Environment(\.dismiss) private var dismiss
    @State private var activeEmoji: String = ChatMessageFormat.allReactionsTab

    private var totalCount: Int { reactions.reduce(0) { $0 + $1.count } }

    private var activeReactors: [(user: ChatMessageFormat.ReactionUser, emoji: String)] {
        if activeEmoji == ChatMessageFormat.allReactionsTab {
            return reactions
                .flatMap { r in r.users.map { (user: $0, emoji: r.emoji) } }
                .sorted {
                    (ChatMessageFormat.parseReactedAt($0.user.reactedAt) ?? .distantPast)
                        < (ChatMessageFormat.parseReactedAt($1.user.reactedAt) ?? .distantPast)
                }
        }
        let match = reactions.first { $0.emoji == activeEmoji }
        return (match?.users ?? []).map { (user: $0, emoji: activeEmoji) }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        tabChip(label: "Todas · \(totalCount)", selected: activeEmoji == ChatMessageFormat.allReactionsTab) {
                            activeEmoji = ChatMessageFormat.allReactionsTab
                        }
                        ForEach(reactions, id: \.emoji) { r in
                            tabChip(label: "\(r.emoji) \(r.count)", selected: activeEmoji == r.emoji) {
                                activeEmoji = r.emoji
                            }
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }
                Divider()
                if activeReactors.isEmpty {
                    Spacer()
                    Text("Sin reacciones").font(.footnote).foregroundStyle(.secondary)
                    Spacer()
                } else {
                    List(Array(activeReactors.enumerated()), id: \.offset) { _, entry in
                        HStack(spacing: 10) {
                            ChatReactorAvatar(user: entry.user)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(entry.user.nombre).font(.subheadline.weight(.semibold))
                                let time = ChatMessageFormat.relativeReactionTime(entry.user.reactedAt)
                                Text(time.isEmpty ? "—" : time)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if activeEmoji == ChatMessageFormat.allReactionsTab {
                                Text(entry.emoji)
                            }
                        }
                        .listRowSeparator(.hidden)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Reacciones")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                }
            }
            .onAppear {
                if let initialEmoji, reactions.contains(where: { $0.emoji == initialEmoji }) {
                    activeEmoji = initialEmoji
                }
            }
        }
    }

    private func tabChip(label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.caption.weight(selected ? .bold : .regular))
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(selected ? NxBrand.primary.opacity(0.15) : Color(.tertiarySystemFill))
                .foregroundStyle(selected ? NxBrand.primary : Color.primary)
                .clipShape(Capsule())
                .overlay(
                    Capsule().stroke(selected ? NxBrand.primary.opacity(0.5) : Color.clear, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }
}

/// Avatar de un reactor: foto protegida si hay `avatarUrl`, si no iniciales en azul.
private struct ChatReactorAvatar: View {
    let user: ChatMessageFormat.ReactionUser

    var body: some View {
        Group {
            if let avatarUrl = user.avatarUrl, !avatarUrl.isEmpty {
                AuthenticatedImage(url: avatarUrl, contentMode: .fill, background: NxBrand.primary.opacity(0.15))
            } else {
                ZStack {
                    NxBrand.primary.opacity(0.15)
                    Text(ChatMessageFormat.initials(user.nombre))
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(NxBrand.primary)
                }
            }
        }
        .frame(width: 32, height: 32)
        .clipShape(Circle())
    }
}

private struct ChatDateDivider: View {
    let label: String
    var body: some View {
        HStack {
            Rectangle().fill(Color.secondary.opacity(0.25)).frame(height: 1)
            Text(label).font(.caption2).foregroundStyle(.secondary)
            Rectangle().fill(Color.secondary.opacity(0.25)).frame(height: 1)
        }
        .padding(.vertical, 4)
    }
}

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

private struct ChatPDFItem: Identifiable {
    let id = UUID()
    let title: String
    let data: Data
}

private struct ChatThreadItem: Identifiable {
    let id: Int64
    let message: [String: Any]
}
