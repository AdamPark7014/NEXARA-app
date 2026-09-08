import SwiftUI

/// Búsqueda de mensajes — GET `chat/search`.
///
/// Por qué es la primera pieza que faltaba del chat en el teléfono: en la web
/// se busca con Ctrl+F del propio panel; en el móvil la lista sólo carga los
/// últimos 50 mensajes y todo lo anterior era inalcanzable. Buscar es la forma
/// natural de volver a algo que se dijo hace dos semanas.
///
/// El backend exige `q` de dos caracteres o más y acota el alcance a los canales
/// que el usuario puede ver, así que no hay que filtrar nada aquí.
struct ChatSearchSheet: View {
    /// Cuando viene con valor, la búsqueda *puede* limitarse a ese canal.
    var channelId: Int64?
    var channelName: String = ""
    /// `true` cuando se entra desde el menú del canal («buscar aquí»); `false`
    /// desde la lupa de la barra, donde lo que se espera es buscar en todo.
    var startScoped: Bool = false
    /// Devuelve (canal, mensaje) para que la pantalla de chat abra el hilo.
    var onOpen: (Int64, Int64) -> Void
    var onDismiss: () -> Void

    @State private var query = ""
    @State private var results: [ChatSearchHit] = []
    @State private var searching = false
    @State private var error: String?
    @State private var scopeToChannel = false
    /// Se guarda la última búsqueda lanzada para descartar respuestas que
    /// lleguen tarde y pisen un resultado más reciente.
    @State private var lastQuery = ""

    private var effectiveChannelId: Int64? {
        (scopeToChannel && channelId != nil) ? channelId : nil
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField("Buscar en mensajes…", text: $query)
                        .autocorrectionDisabled()
                        .submitLabel(.search)
                        .onSubmit { Task { await run() } }
                    if !query.isEmpty {
                        Button { query = ""; results = []; error = nil } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(10)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)
                .padding(.top, 8)

                if channelId != nil {
                    Toggle(isOn: $scopeToChannel) {
                        Text(channelName.isEmpty ? "Sólo este canal" : "Sólo en \(channelName)")
                            .font(.caption)
                    }
                    .padding(.horizontal)
                    .padding(.top, 6)
                    .onChange(of: scopeToChannel) { _, _ in Task { await run() } }
                }

                if let error {
                    Text(error).font(.caption).foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal).padding(.top, 6)
                }

                if searching {
                    ProgressView().padding()
                }

                if results.isEmpty && !searching {
                    Spacer()
                    Text(
                        query.trimmingCharacters(in: .whitespacesAndNewlines).count < 2
                            ? "Escribe al menos dos letras."
                            : "Sin coincidencias."
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    Spacer()
                } else {
                    List(results) { hit in
                        Button {
                            onOpen(hit.channelId, hit.id)
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                HStack {
                                    Text(hit.displayChannel)
                                        .font(.caption.bold())
                                        .foregroundStyle(.teal)
                                    Spacer()
                                    if !hit.createdAt.isEmpty {
                                        Text(String(hit.createdAt.prefix(10)))
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                Text(hit.body)
                                    .font(.subheadline)
                                    .foregroundStyle(.primary)
                                    .lineLimit(3)
                                if !hit.authorName.isEmpty {
                                    Text(hit.authorName).font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Buscar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar", action: onDismiss)
                }
            }
            .task { scopeToChannel = startScoped && channelId != nil }
            // Un pequeño retardo evita lanzar una petición por pulsación.
            .onChange(of: query) { _, _ in
                Task {
                    let snapshot = query
                    try? await Task.sleep(nanoseconds: 350_000_000)
                    guard snapshot == query else { return }
                    await run()
                }
            }
        }
    }

    private func run() async {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= 2 else {
            results = []
            error = nil
            return
        }
        lastQuery = q
        searching = true
        defer { searching = false }
        do {
            let hits = try await ChatRepository.shared.searchMessages(
                query: q,
                channelId: effectiveChannelId
            )
            // Si mientras tanto el usuario siguió escribiendo, esta respuesta ya
            // no corresponde a lo que hay en pantalla.
            guard lastQuery == q else { return }
            results = hits
            error = nil
        } catch {
            self.error = error.toUserMessage()
        }
    }
}

/// Ficha del canal — GET `chat/channels/:id`, PATCH `…/mute`, DELETE `…/leave`.
///
/// Silenciar es una necesidad puramente de móvil: el canal ruidoso no molesta en
/// una pestaña del navegador, pero sí cuando vibra el teléfono. Salir del canal
/// estaba sólo en la web.
struct ChatChannelInfoSheet: View {
    let channelId: Int64
    var onDismiss: () -> Void
    /// Se avisa al salir para que la pantalla de chat recargue la lista y
    /// deseleccione el canal del que ya no somos miembros.
    var onLeft: () -> Void

    @State private var detail: ChatChannelDetail?
    @State private var loading = true
    @State private var acting = false
    @State private var error: String?
    @State private var showLeaveConfirm = false

    var body: some View {
        NavigationStack {
            Group {
                if loading && detail == nil {
                    ProgressView()
                } else if let d = detail {
                    List {
                        if let error {
                            Section { Text(error).font(.footnote).foregroundStyle(.red) }
                        }
                        Section("Canal") {
                            infoRow("Nombre", d.displayName)
                            infoRow("Tipo", kindLabel(d.kind))
                            infoRow("Tema", d.topic)
                            infoRow("Descripción", d.description)
                            infoRow("Miembros", "\(d.memberCount)")
                            if d.supervised {
                                Label(
                                    "Ves este canal como supervisor: no puedes escribir ni salir.",
                                    systemImage: "eye"
                                )
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            } else if d.readOnly {
                                Label("Canal de sólo lectura", systemImage: "lock")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }

                        Section("Notificaciones") {
                            Toggle(isOn: Binding(
                                get: { d.muted },
                                set: { newValue in Task { await setMuted(newValue) } }
                            )) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Silenciar canal")
                                    Text("Deja de recibir avisos push de este canal.")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            .disabled(acting || d.supervised)
                        }

                        if !d.members.isEmpty {
                            Section("Miembros (\(d.members.count))") {
                                ForEach(d.members) { m in
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(m.displayName).font(.subheadline)
                                        if !m.email.isEmpty {
                                            Text(m.email).font(.caption2).foregroundStyle(.secondary)
                                        }
                                    }
                                }
                            }
                        }

                        if d.canLeave {
                            Section {
                                Button(role: .destructive) {
                                    showLeaveConfirm = true
                                } label: {
                                    Label("Salir del canal", systemImage: "rectangle.portrait.and.arrow.right")
                                }
                                .disabled(acting)
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                } else {
                    NxEmptyState(
                        title: "Canal no disponible",
                        subtitle: error ?? "No se pudo cargar la ficha del canal."
                    )
                }
            }
            .navigationTitle("Información")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar", action: onDismiss)
                }
            }
            .task { await reload() }
            .alert("Salir del canal", isPresented: $showLeaveConfirm) {
                Button("Salir", role: .destructive) { Task { await leave() } }
                Button("Cancelar", role: .cancel) {}
            } message: {
                Text("Dejarás de ver los mensajes. Para volver, alguien del canal tendrá que invitarte otra vez.")
            }
        }
    }

    @ViewBuilder private func infoRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack {
                Text(label).foregroundStyle(.secondary)
                Spacer()
                Text(value).multilineTextAlignment(.trailing)
            }
        }
    }

    private func kindLabel(_ kind: String) -> String {
        switch kind.uppercased() {
        case "DIRECT": return "Mensaje directo"
        case "PRIVATE": return "Privado"
        case "PUBLIC": return "Público"
        case "DOCUMENT": return "Documento"
        default: return kind
        }
    }

    private func reload() async {
        loading = true
        defer { loading = false }
        do {
            detail = try await ChatRepository.shared.channelDetail(channelId: channelId)
            error = nil
        } catch {
            self.error = error.toUserMessage()
        }
    }

    private func setMuted(_ muted: Bool) async {
        acting = true
        defer { acting = false }
        do {
            _ = try await ChatRepository.shared.setChannelMuted(channelId: channelId, muted: muted)
            error = nil
            // La respuesta del PATCH no trae miembros; se recarga la ficha entera
            // para no dejar la lista vacía tras silenciar.
            await reload()
        } catch {
            self.error = error.toUserMessage()
        }
    }

    private func leave() async {
        acting = true
        defer { acting = false }
        do {
            try await ChatRepository.shared.leaveChannel(channelId: channelId)
            onLeft()
        } catch {
            self.error = error.toUserMessage()
        }
    }
}
