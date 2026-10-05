import SwiftUI

// Diálogos, hojas y paneles del chat — paridad Android `CreateChannelDialog`,
// `EditTopicDialog`, `ColleaguesPickerDialog`, `EditMessageDialog`,
// `EntityMentionPickerDialog`, `NewConversationSheet`, `MentionsPanel`,
// `ChatSearchPanel`, `ChatSearchResults` y `SearchHitsBody`.

// MARK: - Piezas comunes

/// Diálogo de Android (`AlertDialog`) como hoja corta: título, contenido, error,
/// y los botones de texto abajo a la derecha.
struct ChatDialog<Content: View>: View {
    let title: String
    let confirmLabel: String?
    let confirmEnabled: Bool
    let loading: Bool
    let error: String?
    let dismissLabel: String
    let onConfirm: () -> Void
    let onDismiss: () -> Void
    let content: Content

    init(
        title: String,
        confirmLabel: String? = nil,
        confirmEnabled: Bool = true,
        loading: Bool = false,
        error: String? = nil,
        dismissLabel: String = "Cancelar",
        onConfirm: @escaping () -> Void = {},
        onDismiss: @escaping () -> Void,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.confirmLabel = confirmLabel
        self.confirmEnabled = confirmEnabled
        self.loading = loading
        self.error = error
        self.dismissLabel = dismissLabel
        self.onConfirm = onConfirm
        self.onDismiss = onDismiss
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title)
                .font(.system(size: 22, weight: .regular))
                .foregroundStyle(NxColors.fg)
            content
            if let error, !error.isEmpty {
                Text(error)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if loading {
                ProgressView()
                    .tint(NxColors.brand)
                    .frame(maxWidth: .infinity)
            }
            HStack(spacing: 8) {
                Spacer(minLength: 0)
                Button(dismissLabel, action: onDismiss)
                    .buttonStyle(ChatTextButtonStyle())
                    .disabled(loading && confirmLabel != nil)
                if let confirmLabel {
                    Button(confirmLabel, action: onConfirm)
                        .buttonStyle(NxPillButtonStyle(fill: NxColors.brand, foreground: .white))
                        .disabled(!confirmEnabled || loading)
                        .opacity(!confirmEnabled || loading ? 0.5 : 1)
                }
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(NxColors.card)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

/// `TextButton` de Material: letra de marca sin fondo.
struct ChatTextButtonStyle: ButtonStyle {
    var color: Color = NxColors.brand

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(NxType.labelLarge)
            .foregroundStyle(color)
            .padding(.horizontal, 12)
            .frame(minHeight: 40)
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

/// `OutlinedTextField` con etiqueta: contorno #CBD5E1 (marca con foco), radio 12.
struct ChatOutlinedField: View {
    let label: String
    @Binding var text: String
    var placeholder = ""
    var multiline = false
    var submitLabel: SubmitLabel = .done
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(NxType.labelMedium)
                .foregroundStyle(focused ? NxColors.brand : NxColors.muted)
            Group {
                if multiline {
                    TextField("", text: $text, prompt: Text(placeholder).foregroundColor(NxColors.muted), axis: .vertical)
                        .lineLimit(1...5)
                } else {
                    TextField("", text: $text, prompt: Text(placeholder).foregroundColor(NxColors.muted))
                }
            }
            .font(NxType.bodyLarge)
            .foregroundStyle(NxColors.fg)
            .tint(NxColors.brand)
            .focused($focused)
            .submitLabel(submitLabel)
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
            .overlay(
                RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                    .strokeBorder(focused ? NxColors.brand : NxColors.borderStrong, lineWidth: focused ? 2 : 1)
            )
            .accessibilityLabel(label)
        }
    }
}

// MARK: - Nueva conversación

/// Android `NewConversationSheet`: las dos formas de empezar a hablar.
struct ChatNewConversationSheet: View {
    let onDirect: () -> Void
    let onChannel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Nueva conversación")
                .font(NxType.titleMedium.weight(.bold))
                .foregroundStyle(NxColors.fg)
                .padding(.horizontal, 24)
                .padding(.vertical, 8)
            option(
                title: "Mensaje directo",
                subtitle: "Escríbele a una persona del equipo.",
                systemImage: "person.fill",
                action: onDirect
            )
            option(
                title: "Canal",
                subtitle: "Un espacio para un tema o un grupo.",
                systemImage: "number",
                action: onChannel
            )
            Spacer(minLength: 0)
        }
        .padding(.top, 24)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.card)
        .presentationDetents([.height(250)])
        .presentationDragIndicator(.visible)
    }

    private func option(title: String, subtitle: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Image(systemName: systemImage)
                    .font(.system(size: 20))
                    .foregroundStyle(NxColors.brand)
                    .frame(width: 24)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(NxType.bodyLarge.weight(.semibold))
                        .foregroundStyle(NxColors.fg)
                    Text(subtitle)
                        .font(NxType.bodyMedium)
                        .foregroundStyle(NxColors.muted)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(NxPressableStyle())
    }
}

// MARK: - Crear canal y editar tema

/// Android `CreateChannelDialog`.
struct ChatCreateChannelSheet: View {
    let loading: Bool
    let error: String?
    let onCreate: (_ name: String, _ topic: String, _ isPrivate: Bool) -> Void
    let onDismiss: () -> Void

    @State private var name = ""
    @State private var topic = ""
    @State private var isPrivate = false

    var body: some View {
        ChatDialog(
            title: "Crear canal",
            confirmLabel: "Crear",
            confirmEnabled: name.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2,
            loading: loading,
            error: error,
            onConfirm: { onCreate(name, topic, isPrivate) },
            onDismiss: onDismiss
        ) {
            ChatOutlinedField(label: "Nombre *", text: $name, placeholder: "nombre-del-canal")
            ChatOutlinedField(label: "Tema", text: $topic, placeholder: "De qué trata este canal")
            Button {
                isPrivate.toggle()
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: isPrivate ? "checkmark.square.fill" : "square")
                        .font(.system(size: 20))
                        .foregroundStyle(isPrivate ? NxColors.brand : NxColors.muted)
                    Text("Canal privado")
                        .font(NxType.bodyMedium)
                        .foregroundStyle(NxColors.fg)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(isPrivate ? AccessibilityTraits.isSelected : [])
        }
    }
}

/// Android `EditTopicDialog`.
struct ChatEditTopicSheet: View {
    let loading: Bool
    let error: String?
    let onSave: (String) -> Void
    let onDismiss: () -> Void

    @State private var topic: String

    init(currentTopic: String, loading: Bool, error: String?, onSave: @escaping (String) -> Void, onDismiss: @escaping () -> Void) {
        self.loading = loading
        self.error = error
        self.onSave = onSave
        self.onDismiss = onDismiss
        _topic = State(initialValue: currentTopic)
    }

    var body: some View {
        ChatDialog(
            title: "Editar tema del canal",
            confirmLabel: "Guardar",
            loading: loading,
            error: error,
            onConfirm: { onSave(topic) },
            onDismiss: onDismiss
        ) {
            ChatOutlinedField(label: "Tema", text: $topic, multiline: true)
        }
    }
}

/// Android `EditMessageDialog`.
struct ChatEditMessageSheet: View {
    let loading: Bool
    let error: String?
    let onSave: (String) -> Void
    let onDismiss: () -> Void

    @State private var draft: String

    init(currentBody: String, loading: Bool, error: String?, onSave: @escaping (String) -> Void, onDismiss: @escaping () -> Void) {
        self.loading = loading
        self.error = error
        self.onSave = onSave
        self.onDismiss = onDismiss
        _draft = State(initialValue: currentBody)
    }

    var body: some View {
        ChatDialog(
            title: "Editar mensaje",
            confirmLabel: "Guardar",
            confirmEnabled: !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            loading: loading,
            error: error,
            onConfirm: { onSave(draft) },
            onDismiss: onDismiss
        ) {
            ChatOutlinedField(label: "Mensaje", text: $draft, multiline: true)
        }
    }
}

// MARK: - Compañeros (mensaje directo e invitar)

/// Android `ColleaguesPickerDialog`: «Mensaje directo» o «Invitar miembro».
struct ChatColleaguesSheet: View {
    let title: String
    let colleagues: [ChatColleagueRow]
    let loading: Bool
    let error: String?
    let onSearch: (String) -> Void
    let onPick: (Int64) -> Void
    let onDismiss: () -> Void

    @State private var query = ""

    var body: some View {
        ChatDialog(title: title, error: error, dismissLabel: "Cerrar", onDismiss: onDismiss) {
            ChatOutlinedField(label: "Buscar compañero", text: $query, placeholder: "Nombre o email", submitLabel: .search)
                .onChange(of: query) { _, value in onSearch(value) }
            if loading && colleagues.isEmpty {
                ProgressView()
                    .tint(NxColors.brand)
                    .frame(maxWidth: .infinity)
            } else if colleagues.isEmpty {
                Text("Sin resultados")
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
            } else {
                ScrollView {
                    LazyVStack(spacing: 4) {
                        ForEach(colleagues) { colleague in
                            row(colleague)
                        }
                    }
                }
                .frame(maxHeight: 320)
            }
        }
    }

    private func row(_ colleague: ChatColleagueRow) -> some View {
        Button {
            onPick(colleague.id)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(colleague.nombre)
                    .font(NxType.bodyMedium.weight(.semibold))
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(1)
                if !colleague.email.isEmpty {
                    Text(colleague.email)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(1)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(NxColors.sunken, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(NxPressableStyle())
        .disabled(loading)
    }
}

// MARK: - Mencionar actividad o evidencia

/// Android `EntityMentionPickerDialog`.
struct ChatEntityPickerSheet: View {
    let kind: String
    let mentions: [ChatMentionRow]
    let loading: Bool
    let onKindChange: (String) -> Void
    let onSearch: (String) -> Void
    let onPick: (ChatMentionRow) -> Void
    let onDismiss: () -> Void

    @State private var query = ""

    private struct Kind {
        let value: String
        let label: String
        let icon: String
    }

    private static let kinds = [
        Kind(value: "ACTIVITY", label: "Actividades", icon: "doc.text"),
        Kind(value: "EVIDENCE", label: "Evidencias", icon: "photo"),
    ]

    var body: some View {
        ChatDialog(title: "Mencionar en el mensaje", dismissLabel: "Cerrar", onDismiss: onDismiss) {
            HStack(spacing: 8) {
                ForEach(Self.kinds, id: \.value) { item in
                    Button {
                        query = ""
                        onKindChange(item.value)
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: item.icon)
                                .font(.system(size: 15))
                            Text(item.label)
                                .font(NxType.labelLarge.weight(kind == item.value ? .bold : .regular))
                        }
                        .foregroundStyle(kind == item.value ? NxColors.fg2 : NxColors.brand)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 40)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(kind == item.value)
                    .accessibilityAddTraits(kind == item.value ? AccessibilityTraits.isSelected : [])
                }
            }
            ChatOutlinedField(
                label: "Buscar",
                text: $query,
                placeholder: kind == "ACTIVITY" ? "AN, título o estado…" : "Evidencia, actividad o comentario…",
                submitLabel: .search
            )
            .onChange(of: query) { _, value in onSearch(value) }
            if loading && mentions.isEmpty {
                ProgressView()
                    .tint(NxColors.brand)
                    .frame(maxWidth: .infinity)
            } else if mentions.isEmpty {
                Text("Sin resultados")
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
            } else {
                ScrollView {
                    LazyVStack(spacing: 4) {
                        ForEach(mentions) { mention in
                            row(mention)
                        }
                    }
                }
                .frame(maxHeight: 280)
            }
        }
    }

    private func row(_ mention: ChatMentionRow) -> some View {
        Button {
            onPick(mention)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: mention.kind == "ACTIVITY" ? "doc.text" : "photo")
                    .foregroundStyle(NxColors.muted)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(mention.label)
                        .font(NxType.bodyMedium.weight(.semibold))
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(1)
                    if !mention.subtitle.isEmpty {
                        Text(mention.subtitle)
                            .font(NxType.bodySmall)
                            .foregroundStyle(NxColors.muted)
                            .lineLimit(2)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(NxColors.sunken, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(NxPressableStyle())
        .disabled(loading)
    }
}

// MARK: - Menciones de la lista

/// Android `MentionsPanel`: directorio «Personas y entidades (@)».
struct ChatMentionsPanel: View {
    let loading: Bool
    let mentions: [ChatMentionRow]
    let onRetry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Personas y entidades (@)")
                .font(NxType.bodyMedium.weight(.semibold))
                .foregroundStyle(NxColors.fg)
            if loading {
                HStack(spacing: 8) {
                    ProgressView().tint(NxColors.brand)
                    Text("Cargando menciones…")
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                }
            } else if mentions.isEmpty {
                Text("Sin resultados")
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                Button("Reintentar", action: onRetry)
                    .buttonStyle(ChatTextButtonStyle())
            } else {
                ForEach(mentions.prefix(8)) { mention in
                    HStack(alignment: .top, spacing: 8) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(mention.label)
                                .font(NxType.bodyMedium.weight(.medium))
                                .foregroundStyle(NxColors.fg)
                                .lineLimit(1)
                            Text(mention.subtitle)
                                .font(NxType.bodySmall)
                                .foregroundStyle(NxColors.muted)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        Text(mention.kind)
                            .font(NxType.labelSmall)
                            .foregroundStyle(NxColors.brand)
                    }
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nxCardSurface(radius: NxRadius.m, elevation: 1)
    }
}

// MARK: - Búsqueda de mensajes

/// Android `SearchHitsBody`: aviso, cargando, «escribe dos letras», sin
/// coincidencias o los resultados (con el aviso del tope de 30).
struct ChatSearchHitsBody: View {
    @ObservedObject var store: ChatStore
    /// Dentro del panel de la conversación la lista se acota en alto.
    var maxHeight: CGFloat?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let error = store.searchError, !error.isEmpty {
                Text(error)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.danger)
            }
            content
        }
    }

    @ViewBuilder
    private var content: some View {
        if store.searchLoading {
            HStack(spacing: 8) {
                ProgressView().tint(NxColors.brand)
                Text("Buscando…")
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
            }
        } else if store.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 {
            note("Escribe al menos dos letras para buscar.")
        } else if store.searchResults.isEmpty {
            note("Sin coincidencias.")
        } else {
            if let maxHeight {
                ScrollView { hits }
                    .frame(maxHeight: maxHeight)
            } else {
                hits
            }
            if store.searchResults.count >= 30 {
                Text("Se muestran los 30 mensajes más recientes; afina la búsqueda para ver otros.")
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
            }
        }
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(NxType.bodySmall)
            .foregroundStyle(NxColors.muted)
    }

    private var hits: some View {
        LazyVStack(spacing: 4) {
            ForEach(store.searchResults) { hit in
                Button {
                    Task { await store.openSearchHit(hit) }
                } label: {
                    hitRow(hit)
                }
                .buttonStyle(NxPressableStyle())
            }
        }
    }

    private func hitRow(_ hit: ChatSearchHit) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
                Text(hit.authorName.nilIfEmpty ?? "Usuario")
                    .font(NxType.bodySmall.weight(.semibold))
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Text(ChatTime.channelTime(hit.createdAt))
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
            }
            if !hit.channelName.isEmpty {
                HStack(spacing: 3) {
                    if let icon = ChatChannelKind.systemImage(hit.channelKind) {
                        Image(systemName: icon)
                            .font(.system(size: 10))
                            .accessibilityHidden(true)
                    }
                    Text(ChatChannelKind.prefix(hit.channelKind) + hit.channelName)
                        .lineLimit(1)
                }
                .font(NxType.labelSmall)
                .foregroundStyle(NxColors.brand)
            }
            Text(hitBody(hit))
                .font(NxType.bodySmall)
                .foregroundStyle(NxColors.fg)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.sunken, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
        .contentShape(Rectangle())
    }

    private func hitBody(_ hit: ChatSearchHit) -> String {
        let readable = ChatMarkup.readable(hit.body)
        if !readable.isEmpty { return readable }
        return hit.attachmentName.nilIfEmpty ?? "(adjunto)"
    }
}

/// Android `ChatSearchPanel`: «Buscar en el chat» dentro de la conversación.
struct ChatSearchPanel: View {
    @ObservedObject var store: ChatStore

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Buscar en el chat")
                    .font(NxType.bodyMedium.weight(.semibold))
                    .foregroundStyle(NxColors.fg)
                Spacer(minLength: 0)
                Button {
                    store.toggleSearch()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(NxColors.fg2)
                        .frame(width: 40, height: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Cerrar búsqueda")
            }
            HStack(spacing: 0) {
                TextField("", text: $store.searchQuery, prompt: Text("Palabra o frase…").foregroundColor(NxColors.muted))
                    .font(NxType.bodyLarge)
                    .foregroundStyle(NxColors.fg)
                    .tint(NxColors.brand)
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                    .onSubmit { Task { await store.runSearch() } }
                    .padding(.leading, 14)
                Button {
                    Task { await store.runSearch() }
                } label: {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 17))
                        .foregroundStyle(NxColors.fg2)
                        .frame(width: 48, height: 48)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(store.searchLoading)
                .accessibilityLabel("Buscar")
            }
            .overlay(
                RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                    .strokeBorder(NxColors.borderStrong, lineWidth: 1)
            )
            if store.selectedChannel != nil {
                HStack(spacing: 6) {
                    NxFilterPill(label: "Este canal", selected: store.searchInChannel) {
                        store.setSearchInChannel(true)
                    }
                    NxFilterPill(label: "Todos", selected: !store.searchInChannel) {
                        store.setSearchInChannel(false)
                    }
                }
            }
            ChatSearchHitsBody(store: store, maxHeight: 280)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nxCardSurface(radius: NxRadius.m, elevation: 1)
        .padding(.horizontal, 12)
        .padding(.vertical, 4)
    }
}

/// Android `ChatSearchResults`: «En los mensajes», arriba de la lista de conversaciones.
struct ChatSearchResultsCard: View {
    @ObservedObject var store: ChatStore
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("En los mensajes")
                    .font(NxType.bodyMedium.weight(.semibold))
                    .foregroundStyle(NxColors.fg)
                Spacer(minLength: 0)
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(NxColors.fg2)
                        .frame(width: 40, height: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Cerrar resultados")
            }
            ChatSearchHitsBody(store: store)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nxCardSurface(radius: NxRadius.m, elevation: 1)
    }
}
