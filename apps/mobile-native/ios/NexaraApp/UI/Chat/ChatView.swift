import SwiftUI

/// Chat nativo iOS — paridad Android `ChatScreen` (`ui/chat/ChatScreen.kt`).
/// Lista de conversaciones con búsqueda, filtros, menciones y «Nueva
/// conversación»; al tocar una, la conversación se apila con su barra teal.
/// El estado y las reglas viven en `ChatStore`.
struct ChatView: View {
    var initialChannelId: Int64? = nil
    var initialMessageId: Int64? = nil

    @StateObject private var store = ChatStore()
    @Environment(\.scenePhase) private var scenePhase

    @State private var visible = false
    @State private var listQuery = ""
    @State private var listFilter: ChatListFilter = .todos
    /// `true` tras «Buscar en los mensajes»: resultados de `chat/search` arriba de la lista.
    @State private var searchingMessages = false
    @State private var showNewConversation = false
    @State private var pendingNew: ChatViewPendingNew?
    @State private var didOpenInitial = false
    @State private var showConversation = false
    /// Hay una hoja de la lista a la vista: la conversación se apila al cerrarse.
    @State private var listSheetVisible = false
    @State private var pendingPush = false

    private var screenActive: Bool { visible && scenePhase == .active }

    private var visibleChannels: [ChatChannelRow] {
        ChatListFiltering.apply(store.channels, query: listQuery, filter: listFilter, favorites: store.favoriteIds)
    }

    private var trimmedQuery: String { listQuery.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            listScreen
                .nxBrandNavBar(title: "Chat")
                .navigationDestination(isPresented: $showConversation) {
                    ChatConversationView(store: store)
                }
        }
        .environment(\.openURL, OpenURLAction { ChatLinks.handle($0) })
        .onAppear {
            visible = true
            store.setScreenActive(scenePhase == .active)
        }
        .onDisappear {
            visible = false
            store.setScreenActive(false)
        }
        .onChange(of: scenePhase) { _, phase in
            store.setScreenActive(visible && phase == .active)
            if visible && phase == .active { Task { await store.refreshChannels() } }
        }
        .onReceive(RealtimeBus.shared.chatEvents.receive(on: DispatchQueue.main)) { event in
            store.handle(event)
        }
        .onChange(of: store.selectedChannel?.id) { _, id in
            if id == nil {
                showConversation = false
            } else if !showConversation {
                if listSheetVisible { pendingPush = true } else { showConversation = true }
            }
        }
        .onChange(of: showConversation) { _, shown in
            if !shown { store.clearChannel() }
        }
        .task { await initialLoad() }
        .task(id: "\(store.selectedChannel?.id ?? 0)-\(screenActive)") { await pollLoop() }
        .task { await typingSweepLoop() }
        .modifier(ChatListSheets(
            store: store,
            showNewConversation: $showNewConversation,
            pendingNew: $pendingNew,
            onSheetShown: { listSheetVisible = true },
            onSheetDismissed: sheetDismissed
        ))
    }

    // MARK: Lista

    private var listScreen: some View {
        VStack(spacing: 0) {
            NxSearchField(text: $listQuery, placeholder: "Buscar conversación o mensaje")
                .onSubmit { launchMessageSearch() }
                .padding(.horizontal, 12)
                .padding(.top, 8)
            filterRow
            if store.showMentions {
                ChatMentionsPanel(
                    loading: store.mentionsLoading,
                    mentions: store.mentions,
                    onRetry: { Task { await store.loadMentions() } }
                )
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
            }
            if store.loading {
                NxSkeletonList(itemCount: 7, itemHeight: 80)
                    .padding(12)
                Spacer(minLength: 0)
            } else {
                channelList
            }
        }
        .nxScreenBackground()
        .nxFab("Nueva conversación") { showNewConversation = true }
        .onChange(of: listQuery) { _, _ in searchingMessages = false }
    }

    /// Android `ChatFilterRow`: un filtro a la vez (tocar el activo vuelve a
    /// «Todos») y «Menciones» abre el directorio de personas y entidades.
    private var filterRow: some View {
        NxFilterBar(horizontalPadding: 12) {
            ForEach(ChatListFilter.allCases) { filter in
                let count = ChatListFiltering.count(store.channels, filter, store.favoriteIds)
                NxFilterPill(
                    label: filter.label,
                    count: (filter == .todos || count == 0) ? nil : count,
                    selected: listFilter == filter
                ) {
                    listFilter = (listFilter == filter && filter != .todos) ? .todos : filter
                }
            }
            ChatMentionsChip(selected: store.showMentions) { store.toggleShowMentions() }
        }
        .padding(.vertical, 4)
    }

    private var channelList: some View {
        List {
            if trimmedQuery.count >= 2 {
                Group {
                    if searchingMessages {
                        ChatSearchResultsCard(store: store) { searchingMessages = false }
                    } else {
                        Button(action: launchMessageSearch) {
                            HStack(spacing: 8) {
                                Image(systemName: "magnifyingglass")
                                    .font(.system(size: 15))
                                Text("Buscar «\(trimmedQuery)» en los mensajes")
                                    .font(NxType.labelLarge)
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                            }
                            .foregroundStyle(NxColors.brand)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .chatListRow()
            }
            if let error = store.error {
                NxErrorBlock(message: error) {
                    Task {
                        if store.channels.isEmpty { await store.loadChannels() } else { await store.refreshChannels() }
                    }
                }
                .chatListRow()
            }
            if store.channels.isEmpty && store.error == nil {
                NxEmptyState(
                    title: "Sin conversaciones",
                    subtitle: "Crea un canal o escríbele a un compañero.",
                    systemImage: "bubble.left.and.bubble.right",
                    actionLabel: "Nueva conversación",
                    onAction: { showNewConversation = true }
                )
                .chatListRow()
            } else if !store.channels.isEmpty && visibleChannels.isEmpty {
                NxEmptyState(
                    title: "Sin coincidencias",
                    subtitle: "Ninguna conversación coincide con la búsqueda o el filtro.",
                    systemImage: "magnifyingglass",
                    actionLabel: "Quitar filtros",
                    onAction: {
                        listQuery = ""
                        listFilter = .todos
                        searchingMessages = false
                    }
                )
                .chatListRow()
            }
            ForEach(visibleChannels) { channel in
                ChatChannelListRow(
                    channel: channel,
                    isFavorite: store.favoriteIds.contains(channel.id),
                    onToggleFavorite: { store.toggleFavorite(channel.id) },
                    onOpen: { store.selectChannel(channel) }
                )
                .chatListRow()
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        // Abajo deja libre el botón «Nueva conversación».
        .contentMargins(.bottom, 96, for: .scrollContent)
        .contentMargins(.top, 4, for: .scrollContent)
        .refreshable { await store.refreshChannels() }
    }

    // MARK: Acciones

    private func launchMessageSearch() {
        guard trimmedQuery.count >= 2 else { return }
        store.searchQuery = trimmedQuery
        searchingMessages = true
        Task { await store.runSearch() }
    }

    private func initialLoad() async {
        if !store.loadedOnce { await store.loadChannels() }
        guard !didOpenInitial, let channelId = initialChannelId, channelId > 0 else { return }
        didOpenInitial = true
        await store.openFromLink(channelId: channelId, messageId: initialMessageId)
    }

    /// Sondeo de 3 s con una conversación abierta; 15 s de lista sin ella
    /// (Android: los dos `LaunchedEffect` con `delay`). Solo con la pantalla a la vista.
    private func pollLoop() async {
        guard screenActive else { return }
        let conversationOpen = store.selectedChannel != nil
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(conversationOpen ? 3 : 15))
            if Task.isCancelled { break }
            if conversationOpen {
                await store.pollNewMessages()
            } else if !store.loading {
                await store.refreshChannels()
            }
        }
    }

    private func typingSweepLoop() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(1))
            if Task.isCancelled { break }
            store.sweepTyping()
        }
    }

    private func sheetDismissed() {
        listSheetVisible = false
        if pendingPush {
            pendingPush = false
            if store.selectedChannel != nil { showConversation = true }
        }
    }
}

// MARK: - Hojas de la lista

/// Lo que se eligió en «Nueva conversación»: se abre al cerrarse esa hoja.
private enum ChatViewPendingNew { case direct, channel }

/// «Nueva conversación», «Crear canal» y «Mensaje directo». Una hoja se abre
/// cuando la anterior terminó de cerrarse (dos a la vez no se pueden).
private struct ChatListSheets: ViewModifier {
    @ObservedObject var store: ChatStore
    @Binding var showNewConversation: Bool
    @Binding var pendingNew: ChatViewPendingNew?
    let onSheetShown: () -> Void
    let onSheetDismissed: () -> Void

    private var createBinding: Binding<Bool> {
        Binding(get: { store.showCreateChannel }, set: { store.setShowCreateChannel($0) })
    }

    private var dmBinding: Binding<Bool> {
        Binding(get: { store.showDmPicker }, set: { store.setShowDmPicker($0) })
    }

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: $showNewConversation, onDismiss: openPending) {
                ChatNewConversationSheet(
                    onDirect: {
                        pendingNew = .direct
                        showNewConversation = false
                    },
                    onChannel: {
                        pendingNew = .channel
                        showNewConversation = false
                    }
                )
            }
            .sheet(isPresented: createBinding, onDismiss: onSheetDismissed) {
                ChatCreateChannelSheet(
                    loading: store.channelActionLoading,
                    error: store.channelActionError,
                    onCreate: { name, topic, isPrivate in
                        Task { await store.createChannel(name: name, topic: topic, isPrivate: isPrivate) }
                    },
                    onDismiss: { store.setShowCreateChannel(false) }
                )
                .onAppear(perform: onSheetShown)
            }
            .sheet(isPresented: dmBinding, onDismiss: onSheetDismissed) {
                ChatColleaguesSheet(
                    title: "Mensaje directo",
                    colleagues: store.colleagues,
                    loading: store.colleaguesLoading || store.channelActionLoading,
                    error: store.channelActionError,
                    onSearch: { query in Task { await store.loadColleagues(query: query) } },
                    onPick: { userId in Task { await store.openDm(userId: userId) } },
                    onDismiss: { store.setShowDmPicker(false) }
                )
                .onAppear(perform: onSheetShown)
            }
    }

    private func openPending() {
        guard let next = pendingNew else { return }
        pendingNew = nil
        switch next {
        case .direct: store.setShowDmPicker(true)
        case .channel: store.setShowCreateChannel(true)
        }
    }
}

// MARK: - Piezas de la lista

/// Android `ChannelListItem`: tarjeta de radio 12 con nombre (en negritas si hay
/// no leídos), hora, tipo · tema, vista previa, estrella y contador.
struct ChatChannelListRow: View {
    let channel: ChatChannelRow
    let isFavorite: Bool
    let onToggleFavorite: () -> Void
    let onOpen: () -> Void

    private var hasUnread: Bool { channel.unreadCount > 0 }

    private var subtitle: String {
        var text = ChatChannelKind.label(channel.kind)
        if !channel.topic.isEmpty { text += " · \(channel.topic)" }
        return text
    }

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Button(action: onOpen) {
                info
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            VStack(alignment: .trailing, spacing: 4) {
                Button(action: onToggleFavorite) {
                    Image(systemName: "star.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(isFavorite ? NxColors.brand : NxColors.muted.opacity(0.45))
                        .frame(width: 40, height: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isFavorite ? "Quitar de favoritos" : "Añadir a favoritos")
                if hasUnread {
                    Text(channel.unreadCount > 99 ? "99+" : "\(channel.unreadCount)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(NxColors.brand, in: Capsule())
                        .accessibilityLabel("\(channel.unreadCount) sin leer")
                }
            }
        }
        .padding(14)
        .nxCardSurface(radius: NxRadius.m, elevation: 1)
    }

    private var info: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .center, spacing: 8) {
                HStack(spacing: 4) {
                    if let icon = ChatChannelKind.systemImage(channel.kind) {
                        Image(systemName: icon)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(NxColors.fg)
                            .accessibilityHidden(true)
                    }
                    Text(ChatChannelKind.title(channel))
                        .font(.system(size: 15, weight: hasUnread ? .bold : .semibold))
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                Spacer(minLength: 0)
                if !channel.lastMessageAt.isEmpty {
                    Text(ChatTime.channelTime(channel.lastMessageAt))
                        .font(NxType.labelSmall)
                        .foregroundStyle(hasUnread ? NxColors.brand : NxColors.muted)
                        .lineLimit(1)
                }
            }
            Text(subtitle)
                .font(NxType.bodySmall)
                .foregroundStyle(NxColors.muted)
                .lineLimit(1)
                .truncationMode(.tail)
            if let preview = ChatMarkup.preview(channel.lastMessagePreview) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    if preview.isAttachment {
                        Image(systemName: "paperclip")
                            .accessibilityHidden(true)
                    }
                    Text(preview.text)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                .font(.system(size: 12.5, weight: hasUnread ? .medium : .regular))
                .foregroundStyle(hasUnread ? NxColors.fg : NxColors.muted)
            }
        }
    }
}

/// Chip «Menciones» con la @ (mismo dibujo que `NxFilterPill`).
private struct ChatMentionsChip: View {
    let selected: Bool
    let onClick: () -> Void

    var body: some View {
        Button(action: onClick) {
            HStack(spacing: 6) {
                Image(systemName: "at")
                    .font(.system(size: 13, weight: .semibold))
                Text("Menciones")
                    .font(.system(size: 13, weight: selected ? .bold : .medium))
                    .lineLimit(1)
            }
            .foregroundStyle(selected ? NxColors.fg : NxColors.fg2)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .frame(minHeight: 40)
            .background(selected ? NxColors.brandSoft : NxColors.card, in: Capsule())
            .overlay(Capsule().strokeBorder(selected ? NxColors.brand : NxColors.border, lineWidth: selected ? 1.5 : 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? AccessibilityTraits.isSelected : [])
    }
}

private extension View {
    /// Fila de la lista sin separador ni fondo, con el margen de Android (12 / 4).
    func chatListRow() -> some View {
        listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }
}
