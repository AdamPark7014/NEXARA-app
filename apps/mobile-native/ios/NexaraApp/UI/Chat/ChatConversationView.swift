import SwiftUI
import UIKit
import PhotosUI
import QuickLook
import UniformTypeIdentifiers

// Conversación abierta — paridad Android `ChatScreen` con `selectedChannel`
// (barra con fijados, búsqueda, recargar y menú del canal; lista con fijados,
// divisores y burbujas; barra para escribir; hoja del hilo).

// MARK: - Adjuntos

/// PDF descargado que se ve dentro de la app.
struct ChatPdfItem: Identifiable {
    let id = UUID()
    let title: String
    let data: Data
}

/// Abre un adjunto dentro de la app (Android `openChatAttachment`): el PDF en el
/// visor propio y lo demás con Vista Rápida. Nunca manda al navegador.
@MainActor
final class ChatAttachmentViewer: ObservableObject {
    @Published var pdf: ChatPdfItem?
    @Published var previewURL: URL?
    @Published private(set) var opening = false
    @Published var error: String?

    func open(url: String, name: String) {
        guard !opening else { return }
        opening = true
        error = nil
        Task {
            do {
                let data = try await AuthenticatedAssetLoader.shared.data(for: url)
                let title = name.nilIfEmpty ?? Self.fileName(from: url)
                if ChatMarkup.isPdf(name: name, url: url) {
                    pdf = ChatPdfItem(title: title, data: data)
                } else {
                    let file = FileManager.default.temporaryDirectory
                        .appendingPathComponent(UUID().uuidString, isDirectory: true)
                    try FileManager.default.createDirectory(at: file, withIntermediateDirectories: true)
                    let target = file.appendingPathComponent(Self.safeName(title, url: url))
                    try data.write(to: target, options: .atomic)
                    previewURL = target
                }
            } catch {
                self.error = error.toUserMessage(fallback: "No se pudo abrir el archivo")
            }
            opening = false
        }
    }

    private static func fileName(from url: String) -> String {
        let last = URL(string: url)?.lastPathComponent ?? ""
        return last.isEmpty ? "Adjunto" : last
    }

    /// Vista Rápida necesita la extensión para saber qué es.
    private static func safeName(_ title: String, url: String) -> String {
        var name = title.replacingOccurrences(of: "/", with: "-")
        if (name as NSString).pathExtension.isEmpty {
            let ext = (URL(string: url)?.pathExtension ?? "")
            if !ext.isEmpty { name += "." + ext }
        }
        return name.isEmpty ? "adjunto" : name
    }
}

/// Visor de PDF, Vista Rápida, aviso de error y el velo «Subiendo adjunto…» /
/// «Abriendo archivo…».
struct ChatAttachmentPresenter: ViewModifier {
    @ObservedObject var viewer: ChatAttachmentViewer
    let uploading: Bool

    private var errorShown: Binding<Bool> {
        Binding(
            get: { viewer.error != nil },
            set: { if !$0 { viewer.error = nil } }
        )
    }

    func body(content: Content) -> some View {
        content
            .overlay {
                if viewer.opening || uploading {
                    ZStack {
                        Color.black.opacity(0.25).ignoresSafeArea()
                        VStack(spacing: 12) {
                            ProgressView()
                                .controlSize(.large)
                                .tint(NxColors.brand)
                            Text(uploading ? "Subiendo adjunto…" : "Abriendo archivo…")
                                .font(NxType.bodySmall)
                                .foregroundStyle(NxColors.fg)
                        }
                        .padding(24)
                        .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
                    }
                }
            }
            .sheet(item: $viewer.pdf) { item in
                NavigationStack {
                    PDFViewerScreen(title: item.title, data: item.data)
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) {
                                Button("Cerrar") { viewer.pdf = nil }
                            }
                        }
                }
            }
            .quickLookPreview($viewer.previewURL)
            .alert("No se pudo abrir", isPresented: errorShown) {
                Button("Aceptar", role: .cancel) {}
            } message: {
                Text(viewer.error ?? "")
            }
    }
}

/// «Imagen» (fotos) y «PDF» (archivos) para adjuntar.
struct ChatAttachmentPickers: ViewModifier {
    @Binding var showPhotos: Bool
    @Binding var showPdf: Bool
    let onPicked: (_ data: Data, _ fileName: String, _ mimeType: String) -> Void
    let onError: (String) -> Void

    @State private var photoItem: PhotosPickerItem?

    func body(content: Content) -> some View {
        content
            .photosPicker(isPresented: $showPhotos, selection: $photoItem, matching: .images)
            .onChange(of: photoItem) { _, item in
                guard let item else { return }
                photoItem = nil
                Task {
                    do {
                        guard let raw = try await item.loadTransferable(type: Data.self) else {
                            onError("No se pudo leer la imagen")
                            return
                        }
                        let jpeg = UIImage(data: raw)?.jpegData(compressionQuality: 0.85) ?? raw
                        onPicked(jpeg, "imagen-\(Int(Date().timeIntervalSince1970)).jpg", "image/jpeg")
                    } catch {
                        onError("No se pudo leer la imagen")
                    }
                }
            }
            .fileImporter(isPresented: $showPdf, allowedContentTypes: [.pdf]) { result in
                guard case .success(let url) = result else { return }
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                if let data = try? Data(contentsOf: url) {
                    onPicked(data, url.lastPathComponent, "application/pdf")
                } else {
                    onError("No se pudo leer el PDF")
                }
            }
    }
}

// MARK: - Barra para escribir

/// Android `ChatComposeBar`: pastilla de radio 28 con clip (Imagen / PDF),
/// mencionar actividad y evidencia, el texto y el botón redondo de enviar.
struct ChatComposeBar: View {
    @Binding var draft: String
    let placeholder: String
    let sending: Bool
    let uploading: Bool
    let onSend: () -> Void
    let onPickImage: () -> Void
    let onPickPdf: () -> Void
    let onPickActivity: () -> Void
    let onPickEvidence: () -> Void

    private var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !sending && !uploading
    }

    private var canAttach: Bool { !sending && !uploading }

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            Menu {
                Button("Imagen", action: onPickImage)
                Button("PDF", action: onPickPdf)
            } label: {
                icon("paperclip")
            }
            .disabled(!canAttach)
            .accessibilityLabel("Adjuntar")
            Button(action: onPickActivity) { icon("doc.text") }
                .buttonStyle(.plain)
                .disabled(!canAttach)
                .accessibilityLabel("Mencionar actividad")
            Button(action: onPickEvidence) { icon("photo") }
                .buttonStyle(.plain)
                .disabled(!canAttach)
                .accessibilityLabel("Mencionar evidencia")
            TextField("", text: $draft, prompt: Text(placeholder).foregroundColor(NxColors.muted), axis: .vertical)
                .lineLimit(1...4)
                .font(NxType.bodyMedium)
                .foregroundStyle(NxColors.fg)
                .tint(NxColors.brand)
                .padding(.vertical, 8)
                .frame(minHeight: 40)
                .accessibilityLabel(placeholder)
            Button(action: onSend) {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(canSend ? Color.white : NxColors.muted)
                    .frame(width: 40, height: 40)
                    .background(canSend ? NxColors.brand : NxColors.sunken, in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
            .accessibilityLabel("Enviar")
        }
        .padding(.leading, 4)
        .padding(.trailing, 6)
        .padding(.vertical, 4)
        .background {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(NxColors.card)
                .nxElevation(2)
        }
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(NxColors.borderStrong.opacity(0.5), lineWidth: 1)
        )
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private func icon(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 18))
            .foregroundStyle(NxColors.muted)
            .frame(width: 40, height: 40)
            .contentShape(Rectangle())
    }
}

/// Android `ReplyPreviewBar`.
struct ChatReplyPreviewBar: View {
    let author: String
    let text: String
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "arrowshape.turn.up.left.fill")
                .foregroundStyle(NxColors.brand)
                .accessibilityLabel("Respondiendo")
            VStack(alignment: .leading, spacing: 1) {
                Text("Respondiendo a \(author)")
                    .font(NxType.labelMedium.weight(.semibold))
                    .foregroundStyle(NxColors.fg)
                Text(ChatMarkup.readable(text))
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(NxColors.fg2)
                    .frame(width: 40, height: 40)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cancelar respuesta")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(NxColors.sunken)
    }
}

// MARK: - Conversación

struct ChatConversationView: View {
    @ObservedObject var store: ChatStore

    @StateObject private var viewer = ChatAttachmentViewer()
    @State private var draft = ""
    @State private var showPhotos = false
    @State private var showPdf = false
    @State private var confirmLeave = false
    @State private var reactors: ChatReactorsItem?
    @State private var scrollToTop = 0

    private var channel: ChatChannelRow? { store.selectedChannel }
    private var title: String { channel.map(ChatChannelKind.title) ?? "" }
    private var isDirect: Bool { channel?.isDirect == true }

    private var subtitle: String {
        guard let channel else { return "" }
        var parts = [ChatChannelKind.label(channel.kind)]
        if !channel.topic.isEmpty { parts.append(channel.topic) }
        if channel.memberCount > 0 { parts.append("\(channel.memberCount) miembros") }
        if store.isMuted { parts.append("silenciado") }
        if store.channelDetail?.readOnly == true { parts.append("solo lectura") }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        withSheets(screen)
            .onChange(of: draft) { _, value in
                if !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { store.notifyDraftChanged() }
            }
    }

    private var screen: some View {
        VStack(spacing: 0) {
            if store.showSearch {
                ChatSearchPanel(store: store)
            }
            ChatMessageList(
                store: store,
                scrollToTop: scrollToTop,
                actions: actions
            )
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { bottomBar }
        .background(NxColors.surface.ignoresSafeArea())
        .navigationTitle(title)
        .nxBrandNavBar(showsBell: false)
        .toolbar {
            ToolbarItem(placement: .principal) { header }
            ToolbarItemGroup(placement: .topBarTrailing) { trailingButtons }
        }
        .modifier(ChatAttachmentPresenter(viewer: viewer, uploading: store.uploading))
        .modifier(ChatAttachmentPickers(
            showPhotos: $showPhotos,
            showPdf: $showPdf,
            onPicked: { data, name, mime in upload(data: data, fileName: name, mimeType: mime) },
            onError: { store.messagesError = $0 }
        ))
    }

    private func withSheets<Content: View>(_ content: Content) -> some View {
        content
            .sheet(item: threadBinding) { _ in
                ChatThreadSheet(store: store)
            }
            .sheet(item: $reactors) { item in
                ChatReactorsSheet(reactions: item.reactions, initialEmoji: item.initialEmoji)
            }
            .sheet(isPresented: inviteBinding) {
                ChatColleaguesSheet(
                    title: "Invitar miembro",
                    colleagues: store.colleagues,
                    loading: store.colleaguesLoading || store.channelActionLoading,
                    error: store.channelActionError,
                    onSearch: { query in Task { await store.loadColleagues(query: query) } },
                    onPick: { userId in Task { await store.inviteMember(userId: userId) } },
                    onDismiss: { store.setShowInviteMember(false) }
                )
            }
            .sheet(isPresented: editTopicBinding) {
                ChatEditTopicSheet(
                    currentTopic: channel?.topic ?? "",
                    loading: store.channelActionLoading,
                    error: store.channelActionError,
                    onSave: { topic in Task { await store.updateTopic(topic) } },
                    onDismiss: { store.setShowEditTopic(false) }
                )
            }
            .sheet(item: editingBinding) { msg in
                ChatEditMessageSheet(
                    currentBody: msg.body,
                    loading: store.channelActionLoading,
                    error: store.channelActionError,
                    onSave: { body in Task { await store.editMessage(msg.id, body: body) } },
                    onDismiss: { store.setEditingMessage(nil) }
                )
            }
            .sheet(isPresented: entityBinding) {
                ChatEntityPickerSheet(
                    kind: store.entityKind,
                    mentions: store.entityMentions,
                    loading: store.entityMentionsLoading,
                    onKindChange: { store.setEntityKind($0) },
                    onSearch: { query in Task { await store.loadEntityMentions(query: query) } },
                    onPick: { entity in
                        draft = ChatMarkup.append(token: ChatMarkup.entityToken(entity), to: draft)
                        store.showEntityPicker = false
                    },
                    onDismiss: { store.showEntityPicker = false }
                )
            }
            .alert("Salir de \(channel?.name ?? "")", isPresented: $confirmLeave) {
                Button("Salir", role: .destructive) {
                    Task { await store.leaveChannel() }
                }
                Button("Cancelar", role: .cancel) {}
            } message: {
                Text("Dejarás de recibir sus mensajes y el canal desaparecerá de tu lista. Si es público podrás volver a entrar; si es privado, tendrán que invitarte.")
            }
    }

    // MARK: Barra superior

    private var header: some View {
        VStack(spacing: 1) {
            HStack(spacing: 4) {
                if let icon = channel.flatMap({ ChatChannelKind.systemImage($0.kind) }) {
                    Image(systemName: icon)
                        .font(.system(size: 13, weight: .semibold))
                        .accessibilityHidden(true)
                }
                Text(title)
                    .font(.system(size: 16, weight: .bold))
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            if !subtitle.isEmpty {
                Text(subtitle)
                    .font(.system(size: 11, weight: .medium))
                    .opacity(0.85)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
        }
        .foregroundStyle(Color.white)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder
    private var trailingButtons: some View {
        if !store.pinnedMessages.isEmpty {
            Button {
                scrollToTop += 1
            } label: {
                Image(systemName: "pin.fill")
                    .foregroundStyle(Color.white)
                    .overlay(alignment: .topTrailing) {
                        NxCountBadge(count: store.pinnedMessages.count)
                            .fixedSize()
                            .offset(x: 10, y: -8)
                    }
            }
            .accessibilityLabel("Fijados, \(store.pinnedMessages.count)")
        }
        Button {
            store.toggleSearch()
        } label: {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(Color.white)
        }
        .accessibilityLabel("Buscar mensajes")
        Button {
            Task { await store.refreshMessages() }
        } label: {
            Image(systemName: "arrow.clockwise")
                .foregroundStyle(Color.white)
        }
        .accessibilityLabel("Actualizar")
        Menu {
            channelMenu
        } label: {
            Image(systemName: "ellipsis")
                .rotationEffect(.degrees(90))
                .foregroundStyle(Color.white)
        }
        .accessibilityLabel("Opciones del canal")
    }

    @ViewBuilder
    private var channelMenu: some View {
        if !isDirect {
            Button {
                store.setShowInviteMember(true)
            } label: {
                Label("Invitar miembro", systemImage: "person.badge.plus")
            }
            Button {
                store.setShowEditTopic(true)
            } label: {
                Label("Editar tema", systemImage: "pencil")
            }
        }
        if store.canMuteChannel {
            Button {
                Task { await store.toggleMuted() }
            } label: {
                Label(
                    store.isMuted ? "Reactivar avisos" : "Silenciar canal",
                    systemImage: store.isMuted ? "bell" : "bell.slash"
                )
            }
            .disabled(store.channelActionLoading)
        }
        if store.canLeaveChannel {
            Button(role: .destructive) {
                confirmLeave = true
            } label: {
                Label("Salir del canal", systemImage: "rectangle.portrait.and.arrow.right")
            }
            .disabled(store.channelActionLoading)
        }
    }

    // MARK: Abajo

    private var bottomBar: some View {
        VStack(spacing: 0) {
            let typing = store.typingLabel
            if !typing.isEmpty {
                Text(typing)
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 4)
            }
            if let reply = store.replyTo {
                ChatReplyPreviewBar(
                    author: reply.authorName.nilIfEmpty ?? "Usuario",
                    text: reply.body,
                    onDismiss: { store.replyTo = nil }
                )
            }
            ChatComposeBar(
                draft: $draft,
                placeholder: store.replyTo != nil ? "Responder en el hilo…" : "Escribe un mensaje…",
                sending: store.sending,
                uploading: store.uploading,
                onSend: send,
                onPickImage: { showPhotos = true },
                onPickPdf: { showPdf = true },
                onPickActivity: { store.openEntityPicker(kind: "ACTIVITY") },
                onPickEvidence: { store.openEntityPicker(kind: "EVIDENCE") }
            )
        }
        .background(NxColors.surface.ignoresSafeArea(edges: .bottom))
    }

    // MARK: Acciones

    private var actions: ChatMessageActions {
        ChatMessageActions(
            onOpenThread: { store.openThread($0) },
            onReply: { store.replyToMessage($0) },
            onReact: { msg, emoji in Task { await store.react(msg.id, emoji: emoji) } },
            onEdit: { store.setEditingMessage($0) },
            onPin: { msg in Task { await store.pinMessage(msg.id) } },
            onOpenAttachment: { url, name in viewer.open(url: url, name: name) },
            onShowReactors: { msg, emoji in reactors = ChatReactorsItem(reactions: msg.reactions, initialEmoji: emoji) }
        )
    }

    private func send() {
        let text = draft
        draft = ""
        Task {
            let sent = await store.send(text)
            if !sent && draft.isEmpty { draft = text }
        }
    }

    private func upload(data: Data, fileName: String, mimeType: String) {
        let text = draft
        draft = ""
        Task {
            let sent = await store.uploadAndSend(data: data, fileName: fileName, mimeType: mimeType, text: text)
            if !sent && draft.isEmpty { draft = text }
        }
    }

    // MARK: Hojas

    private var threadBinding: Binding<ChatMessageRow?> {
        Binding(
            get: { store.threadRoot },
            set: { if $0 == nil { store.closeThread() } }
        )
    }

    private var inviteBinding: Binding<Bool> {
        Binding(get: { store.showInviteMember }, set: { store.setShowInviteMember($0) })
    }

    private var editTopicBinding: Binding<Bool> {
        Binding(get: { store.showEditTopic }, set: { store.setShowEditTopic($0) })
    }

    /// Con el hilo abierto, la edición y el selector los presenta la hoja del hilo.
    private var editingBinding: Binding<ChatMessageRow?> {
        Binding(
            get: { store.threadRoot == nil ? store.editingMessage : nil },
            set: { if $0 == nil { store.setEditingMessage(nil) } }
        )
    }

    private var entityBinding: Binding<Bool> {
        Binding(
            get: { store.showEntityPicker && store.threadRoot == nil },
            set: { if !$0 { store.showEntityPicker = false } }
        )
    }
}

// MARK: - Lista de mensajes

/// Errores, fijados, divisores y burbujas, con «tira para actualizar», el salto
/// a un mensaje (`jumpTargetId`) y el desplazamiento al final cuando llega uno nuevo.
private struct ChatMessageList: View {
    @ObservedObject var store: ChatStore
    let scrollToTop: Int
    let actions: ChatMessageActions

    private static let topId = "chat-top"

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    Color.clear.frame(height: 0).id(Self.topId)
                    if store.hasMore {
                        Button {
                            Task { await store.loadOlder() }
                        } label: {
                            HStack(spacing: 6) {
                                if store.loadingOlder {
                                    ProgressView().controlSize(.small).tint(NxColors.brand)
                                }
                                Text("Cargar anteriores")
                                    .font(NxType.labelLarge)
                                    .foregroundStyle(NxColors.brand)
                            }
                            .frame(maxWidth: .infinity, minHeight: 40)
                        }
                        .buttonStyle(.plain)
                        .disabled(store.loadingOlder)
                    }
                    if let error = store.channelActionError {
                        NxErrorBlock(message: error)
                    }
                    if let error = store.messagesError {
                        NxErrorBlock(message: error) {
                            Task { await store.refreshMessages() }
                        }
                    }
                    if !store.pinnedMessages.isEmpty {
                        ChatPinnedSection(
                            messages: store.pinnedMessages,
                            currentUserId: store.currentUserId,
                            actions: actions
                        )
                    }
                    ForEach(store.conversationItems) { item in
                        row(item)
                            .id(item.id)
                    }
                }
                .padding(12)
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await store.refreshMessages() }
            .onChange(of: store.messages.last?.id) { _, lastId in
                guard store.jumpTargetId == nil, let lastId else { return }
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo("m-\(lastId)", anchor: .bottom)
                }
            }
            .onChange(of: store.jumpTargetId) { _, target in
                guard let target else { return }
                Task {
                    try? await Task.sleep(for: .milliseconds(150))
                    withAnimation { proxy.scrollTo("m-\(target)", anchor: .center) }
                    store.jumpTargetId = nil
                }
            }
            .onChange(of: scrollToTop) { _, _ in
                withAnimation { proxy.scrollTo(Self.topId, anchor: .top) }
            }
        }
    }

    @ViewBuilder
    private func row(_ item: ChatConversationItem) -> some View {
        switch item {
        case .day(_, let label):
            ChatDateDivider(label: label)
        case .unread:
            ChatUnreadDivider()
        case .message(let msg):
            ChatMessageCard(msg: msg, currentUserId: store.currentUserId, actions: actions)
        }
    }
}

// MARK: - Hilo

/// Android `ThreadSheetContent`: raíz, respuestas y el campo para responder.
struct ChatThreadSheet: View {
    @ObservedObject var store: ChatStore

    @StateObject private var viewer = ChatAttachmentViewer()
    @State private var draft = ""
    @State private var showPhotos = false
    @State private var showPdf = false
    @State private var reactors: ChatReactorsItem?

    private var busy: Bool { store.sending || store.uploading }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text("Hilo de conversación")
                    .font(NxType.titleMedium.weight(.bold))
                    .foregroundStyle(NxColors.fg)
                if let root = store.threadRoot {
                    ChatMessageCard(msg: root, currentUserId: store.currentUserId, showThreadHint: false, actions: actions)
                }
                replies
                replyField
                replyActions
            }
            .padding(.horizontal, 12)
            .padding(.top, 24)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(NxColors.card)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .environment(\.openURL, OpenURLAction { ChatLinks.handle($0) })
        .modifier(ChatAttachmentPresenter(viewer: viewer, uploading: store.uploading))
        .modifier(ChatAttachmentPickers(
            showPhotos: $showPhotos,
            showPdf: $showPdf,
            onPicked: { data, name, mime in upload(data: data, fileName: name, mimeType: mime) },
            onError: { viewer.error = $0 }
        ))
        .sheet(item: $reactors) { item in
            ChatReactorsSheet(reactions: item.reactions, initialEmoji: item.initialEmoji)
        }
        .sheet(item: editingBinding) { msg in
            ChatEditMessageSheet(
                currentBody: msg.body,
                loading: store.channelActionLoading,
                error: store.channelActionError,
                onSave: { body in Task { await store.editMessage(msg.id, body: body) } },
                onDismiss: { store.setEditingMessage(nil) }
            )
        }
        .sheet(isPresented: entityBinding) {
            ChatEntityPickerSheet(
                kind: store.entityKind,
                mentions: store.entityMentions,
                loading: store.entityMentionsLoading,
                onKindChange: { store.setEntityKind($0) },
                onSearch: { query in Task { await store.loadEntityMentions(query: query) } },
                onPick: { entity in
                    draft = ChatMarkup.append(token: ChatMarkup.entityToken(entity), to: draft)
                    store.showEntityPicker = false
                },
                onDismiss: { store.showEntityPicker = false }
            )
        }
    }

    @ViewBuilder
    private var replies: some View {
        if store.threadLoading {
            HStack(spacing: 8) {
                ProgressView().tint(NxColors.brand)
                Text("Cargando respuestas…")
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        } else if let error = store.threadError {
            NxErrorBlock(message: error) { retry() }
        } else if !store.threadReplies.isEmpty {
            let count = store.threadReplies.count
            Text("\(count) \(count == 1 ? "respuesta" : "respuestas")")
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
            ForEach(store.threadReplies) { reply in
                ChatMessageCard(msg: reply, currentUserId: store.currentUserId, showThreadHint: false, actions: actions)
            }
        }
    }

    private var replyField: some View {
        TextField("", text: $draft, prompt: Text("Responder en el hilo…").foregroundColor(NxColors.muted), axis: .vertical)
            .lineLimit(1...3)
            .font(NxType.bodyLarge)
            .foregroundStyle(NxColors.fg)
            .tint(NxColors.brand)
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
            .overlay(
                RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                    .strokeBorder(NxColors.borderStrong, lineWidth: 1)
            )
            .accessibilityLabel("Responder en el hilo…")
    }

    private var replyActions: some View {
        HStack(spacing: 0) {
            Button {
                showPhotos = true
            } label: {
                toolIcon("paperclip")
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Adjuntar imagen")
            Button("PDF") { showPdf = true }
                .buttonStyle(ChatTextButtonStyle())
            Button {
                store.openEntityPicker(kind: "ACTIVITY")
            } label: {
                toolIcon("doc.text")
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Mencionar actividad")
            Button {
                store.openEntityPicker(kind: "EVIDENCE")
            } label: {
                toolIcon("photo")
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Mencionar evidencia")
            Spacer(minLength: 0)
            Button(action: send) {
                HStack(spacing: 4) {
                    Image(systemName: "paperplane.fill")
                    Text("Responder")
                }
            }
            .buttonStyle(ChatTextButtonStyle())
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
            .opacity(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy ? 0.4 : 1)
            .accessibilityLabel("Enviar respuesta")
        }
        .disabled(busy)
    }

    private func toolIcon(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 18))
            .foregroundStyle(NxColors.fg2)
            .frame(width: 40, height: 40)
            .contentShape(Rectangle())
    }

    private var actions: ChatMessageActions {
        ChatMessageActions(
            onOpenThread: { _ in },
            onReply: { store.replyToMessage($0) },
            onReact: { msg, emoji in Task { await store.react(msg.id, emoji: emoji) } },
            onEdit: { store.setEditingMessage($0) },
            onPin: { msg in Task { await store.pinMessage(msg.id) } },
            onOpenAttachment: { url, name in viewer.open(url: url, name: name) },
            onShowReactors: { msg, emoji in reactors = ChatReactorsItem(reactions: msg.reactions, initialEmoji: emoji) }
        )
    }

    private func retry() {
        guard let channelId = store.selectedChannel?.id, let rootId = store.threadRoot?.id else { return }
        Task { await store.loadThreadReplies(channelId: channelId, parentId: rootId) }
    }

    private func send() {
        guard let rootId = store.threadRoot?.id else { return }
        let text = draft
        draft = ""
        Task {
            let sent = await store.send(text, parentId: rootId)
            if !sent && draft.isEmpty { draft = text }
        }
    }

    private func upload(data: Data, fileName: String, mimeType: String) {
        let rootId = store.threadRoot?.id
        let text = draft
        draft = ""
        Task {
            let sent = await store.uploadAndSend(data: data, fileName: fileName, mimeType: mimeType, text: text, parentId: rootId)
            if !sent && draft.isEmpty { draft = text }
        }
    }

    private var editingBinding: Binding<ChatMessageRow?> {
        Binding(
            get: { store.threadRoot != nil ? store.editingMessage : nil },
            set: { if $0 == nil { store.setEditingMessage(nil) } }
        )
    }

    private var entityBinding: Binding<Bool> {
        Binding(
            get: { store.showEntityPicker && store.threadRoot != nil },
            set: { if !$0 { store.showEntityPicker = false } }
        )
    }
}

// MARK: - Enlaces del texto

/// Enlaces a actividades y evidencias dentro de los mensajes (Android
/// `openChatEntityLink`): se abren en la app; las menciones de persona y las
/// URL web no hacen nada.
enum ChatLinks {
    static func handle(_ url: URL) -> OpenURLAction.Result {
        guard let href = ChatMarkup.href(from: url) else { return .discarded }
        open(href)
        return .handled
    }

    static func open(_ href: String) {
        let clean = href.trimmingCharacters(in: .whitespacesAndNewlines)
        let lower = clean.lowercased()
        if clean.isEmpty || lower.hasPrefix("user:") { return }
        if lower.hasPrefix("http://") || lower.hasPrefix("https://") { return }
        let destination: DeepLinkDestination?
        if lower.hasPrefix("nexara://") {
            destination = URL(string: clean).flatMap { DeepLinkParser.parse($0) }
        } else {
            destination = DeepLinkParser.parseWebPath(clean)
        }
        guard let destination else { return }
        Task { @MainActor in
            DeepLinkCoordinator.shared.ingest(destination: destination)
        }
    }
}
