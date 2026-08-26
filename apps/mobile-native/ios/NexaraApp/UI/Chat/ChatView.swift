import SwiftUI

/// Chat nativo iOS — lista de canales, mensajes y hilos (paridad Android `ChatScreen`).
struct ChatView: View {
    var initialChannelId: Int64? = nil
    var initialMessageId: Int64? = nil

    @State private var channels: [[String: Any]] = []
    @State private var selectedChannelId: Int64?
    @State private var messages: [[String: Any]] = []
    @State private var draft = ""
    @State private var loading = true
    @State private var error: String?
    @State private var sending = false
    @State private var uploading = false
    @State private var pdfItem: ChatPDFItem?
    @State private var pinned: [[String: Any]] = []
    @State private var threadRoot: [String: Any]?
    @State private var threadReplies: [[String: Any]] = []
    @State private var threadDraft = ""
    @State private var threadLoading = false
    @State private var showDocPicker = false
    @State private var showThreadDocPicker = false

    private var rootMessages: [[String: Any]] {
        messages.filter { msg in
            let parentId = ConsoleHelpers.mapInt64(msg, "parentId") ?? 0
            return parentId <= 0
        }
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
            .task { await loadChannels() }
            .onChange(of: messages.count) { _, _ in
                Task { await openInitialMessageIfNeeded() }
            }
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
        }
    }

    private var channelList: some View {
        List(selection: Binding(
            get: { selectedChannelId },
            set: { newId in
                selectedChannelId = newId
                threadRoot = nil
                threadReplies = []
                if let id = newId { Task { await loadMessages(channelId: id) } }
            }
        )) {
            if loading && channels.isEmpty {
                ProgressView()
            }
            ForEach(channels.indices, id: \.self) { idx in
                let ch = channels[idx]
                let id = ConsoleHelpers.mapInt64(ch, "id") ?? 0
                let name = ConsoleHelpers.mapStr(ch, "name", "nombre")
                let unread = ConsoleHelpers.mapInt(ch, "unreadCount")
                HStack {
                    Text(name.isEmpty ? "Canal" : name)
                    Spacer()
                    if unread > 0 {
                        Text("\(unread)")
                            .font(.caption2.bold())
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.teal.opacity(0.2))
                            .clipShape(Capsule())
                    }
                }
                .tag(id > 0 ? id : Int64(idx))
            }
        }
        .listStyle(.sidebar)
        .frame(minWidth: 200, maxWidth: 280)
    }

    private var messagePane: some View {
        VStack(spacing: 0) {
            if let error {
                Text(error).font(.caption).foregroundStyle(.red).padding(8)
            }
            if uploading {
                ProgressView("Subiendo adjunto…").padding(8)
            }
            if !pinned.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(pinned.indices, id: \.self) { idx in
                            let p = pinned[idx]
                            Text("📌 \(ConsoleHelpers.mapStr(p, "body", "message").prefix(40))")
                                .font(.caption)
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .background(Color.yellow.opacity(0.2))
                                .clipShape(Capsule())
                        }
                    }
                    .padding(.horizontal, 8)
                }
            }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    ForEach(rootMessages.indices, id: \.self) { idx in
                        messageRow(rootMessages[idx], showThreadHint: true)
                    }
                }
                .padding()
            }
            HStack {
                TextField("Mensaje…", text: $draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...4)
                Button {
                    showDocPicker = true
                } label: {
                    Image(systemName: "paperclip")
                }
                .disabled(sending || uploading || selectedChannelId == nil)
                Button {
                    Task { await sendMessage() }
                } label: {
                    Image(systemName: "paperplane.fill")
                }
                .disabled(sending || uploading || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || selectedChannelId == nil)
            }
            .padding()
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
                Task { await uploadAndSend(url: url) }
            case .failure(let err):
                error = err.localizedDescription
            }
        }
    }

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
                    Button {
                        showThreadDocPicker = true
                    } label: {
                        Image(systemName: "paperclip")
                    }
                    .disabled(sending || uploading || selectedChannelId == nil)
                    Button("Enviar") {
                        Task { await sendThreadMessage() }
                    }
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
                    Button("Cerrar") {
                        threadRoot = nil
                        threadReplies = []
                    }
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
                    error = err.localizedDescription
                }
            }
            .task {
                await loadThreadReplies(parentId: ConsoleHelpers.mapInt64(root, "id") ?? 0)
            }
        }
    }

    @ViewBuilder
    private func messageRow(_ m: [String: Any], showThreadHint: Bool) -> some View {
        let author = ConsoleHelpers.mapStr(m, "author", "nombre")
            .isEmpty
            ? ConsoleHelpers.mapStr(m["author"] as? [String: Any] ?? [:], "nombre")
            : ConsoleHelpers.mapStr(m, "author", "nombre")
        let body = ConsoleHelpers.mapStr(m, "body", "message")
        let attachmentUrl = ConsoleHelpers.mapStr(m, "attachmentUrl", "url")
        let attachmentName = ConsoleHelpers.mapStr(m, "attachmentName", "name", "fileName")
        let replyCount = ConsoleHelpers.mapInt(m, "replyCount")
        let messageId = ConsoleHelpers.mapInt64(m, "id") ?? 0
        let canThread = (ConsoleHelpers.mapInt64(m, "parentId") ?? 0) <= 0

        VStack(alignment: .leading, spacing: 4) {
            Text(author.isEmpty ? "Usuario" : author)
                .font(.caption.bold())
            if !body.isEmpty {
                Text(body).font(.body)
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
            HStack(spacing: 6) {
                ForEach(["👍", "✅", "🔥"], id: \.self) { emoji in
                    Button(emoji) {
                        Task { await react(messageId: messageId, emoji: emoji) }
                    }
                    .font(.caption)
                    .disabled(messageId <= 0)
                }
                Button("📌") {
                    Task { await pin(messageId: messageId) }
                }
                .font(.caption)
                .disabled(messageId <= 0)
            }
            if showThreadHint && canThread && replyCount > 0 {
                Button("\(replyCount) \(replyCount == 1 ? "respuesta" : "respuestas") · Ver hilo") {
                    threadRoot = m
                }
                .font(.caption)
                .buttonStyle(.bordered)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func loadChannels() async {
        loading = true
        error = nil
        do {
            channels = try await ChatRepository.shared.listChannels()
            if let preset = initialChannelId, preset > 0 {
                selectedChannelId = preset
                await loadMessages(channelId: preset)
            } else if selectedChannelId == nil, let first = channels.first {
                let id = ConsoleHelpers.mapInt64(first, "id")
                if let id, id > 0 {
                    selectedChannelId = id
                    await loadMessages(channelId: id)
                }
            }
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
        await openInitialMessageIfNeeded()
    }

    private func openInitialMessageIfNeeded() async {
        guard let msgId = initialMessageId, msgId > 0 else { return }
        guard threadRoot == nil else { return }
        let rootMessages = messages.filter {
            (ConsoleHelpers.mapInt64($0, "parentId") ?? 0) <= 0
        }
        if let msg = rootMessages.first(where: { ConsoleHelpers.mapInt64($0, "id") == msgId }) {
            threadRoot = msg
            await loadThreadReplies(parentId: msgId)
        }
    }

    private func loadMessages(channelId: Int64) async {
        do {
            messages = try await ChatRepository.shared.listMessages(channelId: channelId)
            pinned = (try? await ChatRepository.shared.listPins(channelId: channelId)) ?? []
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func loadThreadReplies(parentId: Int64) async {
        guard parentId > 0, let channelId = selectedChannelId else { return }
        threadLoading = true
        do {
            threadReplies = try await ChatRepository.shared.listMessages(channelId: channelId, parentId: parentId)
        } catch {
            self.error = error.localizedDescription
        }
        threadLoading = false
    }

    private func react(messageId: Int64, emoji: String) async {
        guard messageId > 0, let channelId = selectedChannelId else { return }
        do {
            try await ChatRepository.shared.toggleReaction(messageId: messageId, emoji: emoji)
            await loadMessages(channelId: channelId)
            if let root = threadRoot, (ConsoleHelpers.mapInt64(root, "id") ?? 0) > 0 {
                await loadThreadReplies(parentId: ConsoleHelpers.mapInt64(root, "id") ?? 0)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func pin(messageId: Int64) async {
        guard messageId > 0, let channelId = selectedChannelId else { return }
        do {
            try await ChatRepository.shared.pinMessage(messageId: messageId)
            pinned = (try? await ChatRepository.shared.listPins(channelId: channelId)) ?? []
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func sendMessage() async {
        guard let channelId = selectedChannelId else { return }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        sending = true
        do {
            try await ChatRepository.shared.postMessage(channelId: channelId, body: text)
            draft = ""
            await loadMessages(channelId: channelId)
        } catch {
            self.error = error.localizedDescription
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
            try await ChatRepository.shared.postMessage(channelId: channelId, body: text, parentId: rootId)
            threadDraft = ""
            await loadMessages(channelId: channelId)
            await loadThreadReplies(parentId: rootId)
        } catch {
            self.error = error.localizedDescription
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
            try await ChatRepository.shared.postMessage(
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
            }
            await loadMessages(channelId: channelId)
        } catch {
            self.error = error.localizedDescription
        }
        uploading = false
    }

    private func openAttachment(url: String, name: String) async {
        let path = url.hasPrefix("http") ? url : url.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        do {
            let data: Data
            if url.hasPrefix("http") {
                let req = URLRequest(url: URL(string: url)!)
                let (blob, _) = try await URLSession.shared.data(for: req)
                data = blob
            } else {
                data = try await ApiClient.shared.getBinary(path)
            }
            if name.lowercased().hasSuffix(".pdf") || path.lowercased().contains(".pdf") {
                pdfItem = ChatPDFItem(title: name, data: data)
            }
        } catch {
            self.error = error.localizedDescription
        }
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
