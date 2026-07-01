import SwiftUI

// MARK: - Contacts / Leads

struct StudioContactsView: View {
    var leadsOnly: Bool = false

    @State private var items: [ContactMessage] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var selected: ContactMessage?
    @State private var statusDraft = "new"
    @State private var responseDraft = ""
    @State private var saving = false

    var body: some View {
        Group {
            if let sel = selected { detailView(sel) } else { listView }
        }
        .navigationTitle(leadsOnly ? "Leads" : "Contactos")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private var listView: some View {
        Group {
            if isLoading { StudioLoadingView() }
            else if let error, items.isEmpty { StudioErrorView(message: error, onRetry: { Task { await reload() } }) }
            else {
                List {
                    if items.isEmpty {
                        StudioEmptyView(
                            title: "Sin mensajes",
                            subtitle: "Los formularios del sitio aparecerán aquí."
                        )
                    }
                    ForEach(items) { m in
                        Button { open(m) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(m.subject ?? m.name ?? "—").font(.headline).foregroundColor(.primary)
                                Text([m.name, m.email].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption).foregroundColor(StudioTheme.muted)
                                StudioStatusChip(text: m.status ?? "new")
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
    }

    private func detailView(_ m: ContactMessage) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(m.message ?? "").font(.body)
                Text("Categoría: \(m.category ?? "—") · Tel: \(m.phone ?? "—")")
                    .font(.caption).foregroundColor(StudioTheme.muted)
                StudioField(label: "Estado", text: $statusDraft)
                StudioField(label: "Respuesta interna", text: $responseDraft, axis: .vertical, lines: 4)
                if let error { Text(error).foregroundColor(.red).font(.footnote) }
                Button(saving ? "Guardando…" : "Guardar cambios") { Task { await save() } }
                    .buttonStyle(.borderedProminent).tint(StudioTheme.accent).disabled(saving)
                Button("Eliminar", role: .destructive) { Task { await deleteMsg() } }
                Button("Volver") { selected = nil }
            }
            .padding()
        }
        .navigationTitle(m.subject ?? m.name ?? "Contacto")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func open(_ m: ContactMessage) {
        selected = m
        statusDraft = m.status ?? "new"
        responseDraft = ""
    }

    private func reload() async {
        isLoading = true; defer { isLoading = false }
        do { items = try await StudioRepository.shared.contactMessages() }
        catch { error = error.localizedDescription }
    }

    private func save() async {
        guard let id = selected?.id else { return }
        saving = true; defer { saving = false }
        do {
            _ = try await StudioRepository.shared.updateContactMessage(id: id, UpdateContactMessageBody(
                status: statusDraft.isEmpty ? nil : statusDraft,
                responseMessage: responseDraft.isEmpty ? nil : responseDraft
            ))
            selected = nil; await reload()
        } catch { error = error.localizedDescription }
    }

    private func deleteMsg() async {
        guard let id = selected?.id else { return }
        do { try await StudioRepository.shared.deleteContactMessage(id: id); selected = nil; await reload() }
        catch { error = error.localizedDescription }
    }
}

// MARK: - Newsletter

struct StudioNewsletterView: View {
    @State private var items: [NewsletterSubscriber] = []
    @State private var search = ""
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        VStack(spacing: 0) {
            TextField("Buscar email", text: $search)
                .textFieldStyle(.roundedBorder)
                .padding()
                .onSubmit { Task { await reload() } }

            Group {
                if isLoading { StudioLoadingView() }
                else if let error, items.isEmpty { StudioErrorView(message: error, onRetry: { Task { await reload() } }) }
                else {
                    List(items) { s in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(s.email ?? "—").font(.headline)
                            Text(s.name ?? "—").font(.caption).foregroundColor(StudioTheme.muted)
                            StudioStatusChip(text: s.status ?? "active")
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
        }
        .navigationTitle("Newsletter")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        isLoading = true; defer { isLoading = false }
        do {
            let q = search.trimmingCharacters(in: .whitespaces).isEmpty ? nil : search
            items = try await StudioRepository.shared.newsletter(search: q)
        } catch { error = error.localizedDescription }
    }
}

// MARK: - Pages (JSON editor)

struct StudioPagesView: View {
    @State private var sections: [String] = []
    @State private var selected: String?
    @State private var jsonDraft = ""
    @State private var isLoading = true
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        Group {
            if let section = selected { editorView(section) } else { listView }
        }
        .navigationTitle("Secciones del sitio")
        .task { await reload() }
    }

    private var listView: some View {
        Group {
            if isLoading { StudioLoadingView() }
            else if let error, sections.isEmpty { StudioErrorView(message: error, onRetry: { Task { await reload() } }) }
            else {
                List(sections, id: \.self) { section in
                    Button { Task { await openSection(section) } } label: {
                        Text(section.replacingOccurrences(of: "_", with: " "))
                            .font(.body)
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
    }

    private func editorView(_ section: String) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Edita el JSON de contenido (métricas, servicios, CTA…)")
                    .font(.caption).foregroundColor(StudioTheme.muted)
                TextEditor(text: $jsonDraft)
                    .font(.system(.caption, design: .monospaced))
                    .frame(minHeight: 280)
                    .padding(8)
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(10)
                if let error { Text(error).foregroundColor(.red).font(.footnote) }
                Button(saving ? "Guardando…" : "Guardar sección") { Task { await save(section) } }
                    .buttonStyle(.borderedProminent).tint(StudioTheme.accent).disabled(saving)
                Button("Volver") { selected = nil; jsonDraft = "" }
            }
            .padding()
        }
        .navigationTitle(section.replacingOccurrences(of: "_", with: " "))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func reload() async {
        isLoading = true; defer { isLoading = false }
        do { sections = try await StudioRepository.shared.pageSections() }
        catch { error = error.localizedDescription }
    }

    private func openSection(_ section: String) async {
        selected = section; isLoading = true
        defer { isLoading = false }
        do {
            let row = try await StudioRepository.shared.getPageContent(section: section)
            if let content = row.content?.value,
               let data = try? JSONSerialization.data(withJSONObject: content, options: [.prettyPrinted, .sortedKeys]),
               let str = String(data: data, encoding: .utf8) {
                jsonDraft = str
            } else {
                jsonDraft = "{}"
            }
        } catch { error = error.localizedDescription }
    }

    private func save(_ section: String) async {
        saving = true; defer { saving = false }
        do {
            guard let data = jsonDraft.data(using: .utf8),
                  let obj = try JSONSerialization.jsonObject(with: data) else {
                error = "JSON inválido"; return
            }
            _ = try await StudioRepository.shared.upsertPageContent(section: section, content: obj)
            selected = nil; jsonDraft = ""
        } catch { error = error.localizedDescription }
    }
}
