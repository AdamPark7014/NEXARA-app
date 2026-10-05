import SwiftUI

// Burbuja de mensaje y piezas de la conversación — paridad Android
// `ChatMessageCard`, `ReactionChips`, `QuickReactionPicker`,
// `PinnedMessagesSection`, `ChatDateDivider`, `ChatUnreadDivider` y
// `ReactionsBottomSheetContent` (`ui/chat/ChatScreen.kt`).

/// Lo que se puede hacer con un mensaje. Lo arma la pantalla que lo aloja
/// (conversación o hilo).
struct ChatMessageActions {
    var onOpenThread: (ChatMessageRow) -> Void
    var onReply: (ChatMessageRow) -> Void
    var onReact: (ChatMessageRow, String) -> Void
    var onEdit: (ChatMessageRow) -> Void
    var onPin: (ChatMessageRow) -> Void
    var onOpenAttachment: (_ url: String, _ name: String) -> Void
    var onShowReactors: (ChatMessageRow, String?) -> Void
}

/// Reacciones rápidas (Android `QUICK_REACTIONS`).
enum ChatQuickReactions {
    static let emojis = ["👍", "❤️", "😂", "🎉"]
}

/// Hoja «Reacciones» de un mensaje.
struct ChatReactorsItem: Identifiable {
    let id = UUID()
    let reactions: [ChatReactionRow]
    let initialEmoji: String?
}

struct ChatMessageCard: View {
    let msg: ChatMessageRow
    let currentUserId: Int64
    var pinned = false
    var compact = false
    var showThreadHint = true
    let actions: ChatMessageActions

    @State private var showReactionPicker = false

    private var isOwn: Bool { msg.authorId == currentUserId }
    private var canThread: Bool { msg.isRoot }
    /// Propias en marca con letra blanca; ajenas en #E2E8F0.
    private var bubbleColor: Color { isOwn ? NxColors.brand : NxColors.border }
    private var primaryText: Color { isOwn ? .white : NxColors.fg }
    private var metaText: Color { isOwn ? Color.white.opacity(0.78) : NxColors.muted }
    private var accent: Color { isOwn ? .white : NxColors.brand }

    private var bubbleShape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            topLeadingRadius: 16,
            bottomLeadingRadius: isOwn ? 16 : 4,
            bottomTrailingRadius: isOwn ? 4 : 16,
            topTrailingRadius: 16,
            style: .continuous
        )
    }

    var body: some View {
        bubble
            .frame(maxWidth: .infinity, alignment: isOwn ? .trailing : .leading)
    }

    private var bubble: some View {
        VStack(alignment: .leading, spacing: 4) {
            header
            if !msg.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(ChatMarkup.attributed(msg.body, primary: primaryText, mention: accent))
                    .font(NxType.bodyMedium)
                    .tint(accent)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            attachment
            if !msg.reactions.isEmpty {
                reactionChips
            }
            if showReactionPicker {
                quickPicker
            }
            meta
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: compact ? 240 : 300, alignment: .leading)
        .background(bubbleColor, in: bubbleShape)
        .contentShape(.contextMenuPreview, bubbleShape)
        .contextMenu { actionItems }
    }

    // MARK: Cabecera

    private var header: some View {
        HStack(alignment: .center, spacing: 2) {
            if !isOwn {
                Text(msg.authorName.nilIfEmpty ?? "Usuario")
                    .font(NxType.labelMedium.weight(.semibold))
                    .foregroundStyle(NxColors.brand)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            Spacer(minLength: 0)
            if pinned || msg.isPinned {
                Image(systemName: "pin")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(NxColors.muted)
                    .accessibilityLabel("Fijado")
            }
            if !isOwn {
                Menu {
                    actionItems
                } label: {
                    Image(systemName: "ellipsis")
                        .rotationEffect(.degrees(90))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(metaText)
                        .frame(width: 28, height: 24)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Opciones")
            }
        }
    }

    /// Android `messageActionItems` (+ «Ver reacciones», que allá es mantener
    /// presionado un chip).
    @ViewBuilder
    private var actionItems: some View {
        Button {
            showReactionPicker = true
        } label: {
            Label("Reaccionar", systemImage: "face.smiling")
        }
        Button {
            actions.onReply(msg)
        } label: {
            Label("Responder", systemImage: "arrowshape.turn.up.left")
        }
        if isOwn {
            Button {
                actions.onEdit(msg)
            } label: {
                Label("Editar", systemImage: "pencil")
            }
        }
        if canThread {
            Button {
                actions.onPin(msg)
            } label: {
                Label(msg.isPinned ? "Desfijar" : "Fijar", systemImage: "pin")
            }
        }
        if canThread && msg.replyCount > 0 {
            Button {
                actions.onOpenThread(msg)
            } label: {
                Label("Ver hilo (\(msg.replyCount))", systemImage: "bubble.left.and.bubble.right")
            }
        }
        if !msg.reactions.isEmpty {
            Button {
                actions.onShowReactors(msg, nil)
            } label: {
                Label("Ver reacciones", systemImage: "person.2")
            }
        }
    }

    // MARK: Adjunto

    @ViewBuilder
    private var attachment: some View {
        let url = msg.attachmentUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        let name = msg.attachmentName.nilIfEmpty ?? "Adjunto"
        if !url.isEmpty {
            if ChatMarkup.isImage(name: msg.attachmentName, url: url) {
                Button {
                    actions.onOpenAttachment(url, msg.attachmentName)
                } label: {
                    AuthenticatedImage(url: url, contentMode: .fit, background: Color.clear)
                        .frame(maxWidth: .infinity)
                        .frame(height: 200)
                        .clipShape(RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(name)
            } else {
                Button {
                    actions.onOpenAttachment(url, msg.attachmentName)
                } label: {
                    attachmentLabel(name)
                }
                .buttonStyle(.plain)
            }
        } else if !msg.attachmentName.isEmpty {
            attachmentLabel(msg.attachmentName)
        }
    }

    private func attachmentLabel(_ name: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Image(systemName: "paperclip")
                .accessibilityHidden(true)
            Text(name)
                .lineLimit(2)
        }
        .font(NxType.bodySmall)
        .foregroundStyle(accent)
    }

    // MARK: Reacciones

    private var reactionChips: some View {
        HStack(spacing: 6) {
            ForEach(msg.reactions) { reaction in
                reactionChip(reaction)
            }
        }
        .padding(.top, 2)
    }

    private func reactionChip(_ reaction: ChatReactionRow) -> some View {
        let mine = reaction.userIds.contains(currentUserId)
        let fill: Color = mine
            ? NxColors.brand.opacity(isOwn ? 0.28 : 0.15)
            : (isOwn ? Color.white.opacity(0.16) : NxColors.sunken)
        let edge: Color = mine
            ? NxColors.brand.opacity(isOwn ? 0.65 : 0.5)
            : (isOwn ? Color.white.opacity(0.25) : NxColors.borderStrong.opacity(0.6))
        let countColor: Color = (isOwn && !mine) ? Color.white.opacity(0.9) : (isOwn ? .white : NxColors.fg)
        return Button {
            actions.onReact(msg, reaction.emoji)
        } label: {
            HStack(spacing: 4) {
                Text(reaction.emoji)
                    .font(NxType.labelMedium)
                Text("\(reaction.count)")
                    .font(.system(size: 11, weight: mine ? .bold : .regular))
                    .foregroundStyle(countColor)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(fill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(edge, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(reaction.emoji) \(reaction.count)")
    }

    private var quickPicker: some View {
        HStack(spacing: 4) {
            ForEach(ChatQuickReactions.emojis, id: \.self) { emoji in
                Button {
                    actions.onReact(msg, emoji)
                    showReactionPicker = false
                } label: {
                    Text(emoji)
                        .font(.system(size: 18))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
            Button {
                showReactionPicker = false
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(NxColors.fg2)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cerrar")
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(NxColors.sunken, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    // MARK: Pie

    private var meta: some View {
        HStack(spacing: 8) {
            Text(ChatTime.messageTime(msg.createdAt))
                .font(NxType.labelSmall)
                .foregroundStyle(metaText)
            if msg.isEdited {
                Text("(editado)")
                    .font(NxType.labelSmall)
                    .italic()
                    .foregroundStyle(metaText)
            }
            if showThreadHint && canThread && msg.replyCount > 0 {
                Button {
                    actions.onOpenThread(msg)
                } label: {
                    Text("\(msg.replyCount) \(msg.replyCount == 1 ? "respuesta" : "respuestas") · Ver hilo")
                        .font(NxType.labelSmall)
                        .foregroundStyle(accent)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Divisores

/// Android `ChatDateDivider`.
struct ChatDateDivider: View {
    let label: String

    var body: some View {
        HStack(spacing: 12) {
            line
            Text(label)
                .font(NxType.labelSmall.weight(.bold))
                .foregroundStyle(NxColors.muted)
                .lineLimit(1)
            line
        }
        .padding(.vertical, 8)
    }

    private var line: some View {
        Rectangle()
            .fill(NxColors.borderStrong.opacity(0.6))
            .frame(height: 1)
    }
}

/// Android `ChatUnreadDivider`.
struct ChatUnreadDivider: View {
    var body: some View {
        HStack(spacing: 12) {
            line
            Text("Mensajes nuevos")
                .font(NxType.labelSmall.weight(.bold))
                .foregroundStyle(NxColors.danger)
                .lineLimit(1)
            line
        }
        .padding(.vertical, 6)
    }

    private var line: some View {
        Rectangle()
            .fill(NxColors.danger.opacity(0.35))
            .frame(height: 1)
    }
}

// MARK: - Fijados

/// Android `PinnedMessagesSection`: tarjeta de marca al 8 % con sus mensajes compactos.
struct ChatPinnedSection: View {
    let messages: [ChatMessageRow]
    let currentUserId: Int64
    let actions: ChatMessageActions

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "pin.fill")
                    .foregroundStyle(NxColors.brand)
                    .accessibilityHidden(true)
                Text("Mensajes fijados")
                    .font(NxType.titleSmall.weight(.bold))
                    .foregroundStyle(NxColors.brand)
                Text("\(messages.count)")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 5)
                    .frame(minWidth: 16, minHeight: 16)
                    .background(NxColors.brand, in: Capsule())
            }
            ForEach(messages) { msg in
                ChatMessageCard(
                    msg: msg,
                    currentUserId: currentUserId,
                    pinned: true,
                    compact: true,
                    actions: actions
                )
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.brand.opacity(0.08), in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
    }
}

// MARK: - Quién reaccionó

/// Android `ReactionsBottomSheetContent`: pestañas por emoji («Todas» primero)
/// y la lista de quienes reaccionaron, del más antiguo al más reciente.
struct ChatReactorsSheet: View {
    let reactions: [ChatReactionRow]
    @State private var active: String

    private static let all = "__all__"

    init(reactions: [ChatReactionRow], initialEmoji: String?) {
        self.reactions = reactions
        _active = State(initialValue: initialEmoji ?? Self.all)
    }

    private var total: Int { reactions.reduce(0) { $0 + $1.count } }

    private var reactors: [(user: ChatReactionUserRow, emoji: String)] {
        if active == Self.all {
            return reactions
                .flatMap { reaction in reaction.users.map { (user: $0, emoji: reaction.emoji) } }
                .sorted {
                    (ChatTime.parse($0.user.reactedAt) ?? .distantPast) < (ChatTime.parse($1.user.reactedAt) ?? .distantPast)
                }
        }
        let match = reactions.first { $0.emoji == active }
        return (match?.users ?? []).map { (user: $0, emoji: active) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Reacciones")
                .font(NxType.titleMedium.weight(.bold))
                .foregroundStyle(NxColors.fg)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    tab("Todas · \(total)", key: Self.all)
                    ForEach(reactions) { reaction in
                        tab("\(reaction.emoji) \(reaction.count)", key: reaction.emoji)
                    }
                }
            }
            if reactors.isEmpty {
                Text("Sin reacciones")
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                    .padding(.vertical, 16)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(reactors.enumerated()), id: \.offset) { _, item in
                            reactorRow(item.user, emoji: item.emoji)
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.top, 20)
        .padding(.bottom, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.card)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func tab(_ label: String, key: String) -> some View {
        let selected = active == key
        return Button {
            active = key
        } label: {
            Text(label)
                .font(NxType.labelMedium.weight(selected ? .bold : .regular))
                .foregroundStyle(selected ? NxColors.brand : NxColors.muted)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(selected ? NxColors.brandSoft : NxColors.sunken, in: Capsule())
                .overlay(Capsule().strokeBorder(selected ? NxColors.brand.opacity(0.5) : Color.clear, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? AccessibilityTraits.isSelected : [])
    }

    private func reactorRow(_ user: ChatReactionUserRow, emoji: String) -> some View {
        HStack(spacing: 10) {
            NxAvatar(nombre: user.nombre, url: user.avatarUrl.nilIfEmpty, size: 32)
            VStack(alignment: .leading, spacing: 1) {
                Text(user.nombre)
                    .font(NxType.bodyMedium.weight(.semibold))
                    .foregroundStyle(NxColors.fg)
                Text(ChatTime.relativeReaction(user.reactedAt).nilIfEmpty ?? "—")
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
            }
            Spacer(minLength: 0)
            if active == Self.all {
                Text(emoji)
                    .font(.system(size: 18))
            }
        }
        .padding(.vertical, 6)
    }
}
