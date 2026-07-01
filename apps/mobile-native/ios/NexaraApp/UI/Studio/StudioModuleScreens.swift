import SwiftUI
import PhotosUI

// MARK: - Hero

struct StudioHeroView: View {
    @State private var slides: [HeroSlide] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var showEditor = false
    @State private var editing: HeroSlide?
    @State private var altText = ""
    @State private var caption = ""
    @State private var href = ""
    @State private var isActive = true
    @State private var pickerItem: PhotosPickerItem?
    @State private var imageData: Data?
    @State private var saving = false

    var body: some View {
        Group {
            if showEditor { editorSheet } else { listContent }
        }
        .navigationTitle("Carrusel inicio")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { EditButton() }
        .task { await reload() }
        .refreshable { await reload() }
        .overlay(alignment: .bottomTrailing) {
            if !showEditor {
                StudioFab { openCreate() }.padding()
            }
        }
    }

    private var listContent: some View {
        Group {
            if isLoading { StudioLoadingView() }
            else if let error, slides.isEmpty { StudioErrorView(message: error, onRetry: { Task { await reload() } }) }
            else {
                List {
                    if let error { Text(error).foregroundColor(.red).font(.footnote) }
                    ForEach(slides) { slide in
                        heroRow(slide)
                    }
                    .onMove(perform: moveSlide)
                }
                .listStyle(.insetGrouped)
            }
        }
    }

    private func heroRow(_ slide: HeroSlide) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let url = slide.imageUrl, !url.isEmpty {
                AsyncImage(url: URL(string: ApiUrls.absoluteAsset(url))) { img in
                    img.resizable().scaledToFill()
                } placeholder: { Color.gray.opacity(0.2) }
                .frame(height: 120)
                .clipped()
                .cornerRadius(10)
            }
            HStack {
                VStack(alignment: .leading) {
                    Text(slide.caption ?? slide.altText ?? "Slide #\(slide.id)").font(.headline)
                    StudioStatusChip(text: slide.isActive == false ? "Inactivo" : "Activo",
                                     color: slide.isActive == false ? .gray : .green)
                }
                Spacer()
                Button { openEdit(slide) } label: { Image(systemName: "pencil") }
                Button(role: .destructive) { Task { await deleteSlide(slide.id) } } label: {
                    Image(systemName: "trash")
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var editorSheet: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(editing == nil ? "Nuevo slide" : "Editar slide").font(.headline)
                StudioField(label: "Texto alternativo", text: $altText)
                StudioField(label: "Caption", text: $caption)
                StudioField(label: "Enlace (href)", text: $href)
                Toggle("Activo", isOn: $isActive).tint(StudioTheme.accent)
                PhotosPicker(selection: $pickerItem, matching: .images) {
                    Label(imageData == nil ? "Seleccionar imagen" : "Cambiar imagen", systemImage: "photo")
                }
                .onChange(of: pickerItem) { item in
                    Task {
                        if let data = try? await item?.loadTransferable(type: Data.self) {
                            imageData = data
                        }
                    }
                }
                if saving { ProgressView() }
                HStack {
                    Button("Cancelar") { showEditor = false }.buttonStyle(.bordered)
                    Spacer()
                    Button("Guardar") { Task { await save() } }
                        .buttonStyle(.borderedProminent).tint(StudioTheme.accent).disabled(saving)
                }
            }
            .padding()
        }
    }

    private func openCreate() {
        editing = nil
        altText = ""; caption = ""; href = ""; isActive = true
        imageData = nil; pickerItem = nil
        showEditor = true
    }

    private func openEdit(_ slide: HeroSlide) {
        editing = slide
        altText = slide.altText ?? ""
        caption = slide.caption ?? ""
        href = slide.href ?? ""
        isActive = slide.isActive != false
        imageData = nil; pickerItem = nil
        showEditor = true
    }

    private func reload() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do { slides = try await StudioRepository.shared.heroSlides() }
        catch { self.error = error.localizedDescription }
    }

    private func save() async {
        saving = true; defer { saving = false }
        do {
            let name = "hero-\(UUID().uuidString).jpg"
            if let slide = editing {
                _ = try await StudioRepository.shared.updateHeroSlide(
                    id: slide.id, altText: altText, caption: caption, href: href,
                    position: slide.position, isActive: isActive,
                    imageData: imageData, fileName: imageData != nil ? name : nil
                )
            } else {
                _ = try await StudioRepository.shared.createHeroSlide(
                    altText: altText, caption: caption, href: href,
                    position: slides.count, isActive: isActive,
                    imageData: imageData, fileName: imageData != nil ? name : nil
                )
            }
            showEditor = false
            await reload()
        } catch { self.error = error.localizedDescription }
    }

    private func deleteSlide(_ id: Int64) async {
        do { try await StudioRepository.shared.deleteHeroSlide(id: id); await reload() }
        catch { self.error = error.localizedDescription }
    }

    private func moveSlide(from: IndexSet, to: Int) {
        slides.move(fromOffsets: from, toOffset: to)
        Task {
            do {
                try await StudioRepository.shared.reorderHeroSlides(ids: slides.map(\.id))
            } catch { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Cases

struct StudioCasesView: View {
    @State private var items: [CaseStudy] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var showEditor = false
    @State private var editing: CaseStudy?
    @State private var titulo = ""
    @State private var cliente = ""
    @State private var vertical = ""
    @State private var impacto = ""
    @State private var descripcion = ""
    @State private var publicado = false
    @State private var saving = false

    var body: some View {
        Group {
            if showEditor { editor } else { listBody }
        }
        .navigationTitle("Casos de éxito")
        .task { await reload() }
        .refreshable { await reload() }
        .overlay(alignment: .bottomTrailing) {
            if !showEditor { StudioFab { openCreate() }.padding() }
        }
    }

    private var listBody: some View {
        Group {
            if isLoading { StudioLoadingView() }
            else if let error, items.isEmpty { StudioErrorView(message: error, onRetry: { Task { await reload() } }) }
            else {
                List {
                    if items.isEmpty { StudioEmptyView(title: "Sin casos", subtitle: "Crea el primer caso de éxito.") }
                    ForEach(items) { item in
                        caseRow(item)
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
    }

    private func caseRow(_ item: CaseStudy) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(item.titulo ?? "—").font(.headline)
                Spacer()
                StudioStatusChip(text: item.publicado == true ? "Publicado" : "Borrador",
                                 color: item.publicado == true ? .green : .orange)
            }
            Text(item.cliente ?? "").font(.caption).foregroundColor(StudioTheme.muted)
            HStack {
                Button("Editar") { openEdit(item) }.font(.caption)
                Button("Publicar") { Task { await toggle(item.id) } }.font(.caption)
                Button("Eliminar", role: .destructive) { Task { await delete(item.id) } }.font(.caption)
            }
        }
        .padding(.vertical, 4)
    }

    private var editor: some View {
        ScrollView {
            VStack(spacing: 12) {
                StudioField(label: "Título *", text: $titulo)
                StudioField(label: "Cliente *", text: $cliente)
                StudioField(label: "Vertical", text: $vertical)
                StudioField(label: "Impacto", text: $impacto)
                StudioField(label: "Descripción", text: $descripcion, axis: .vertical, lines: 5)
                Toggle("Publicado", isOn: $publicado).tint(StudioTheme.accent)
                if let error { Text(error).foregroundColor(.red).font(.footnote) }
                HStack {
                    Button("Cancelar") { showEditor = false }
                    Spacer()
                    Button(saving ? "Guardando…" : "Guardar") { Task { await save() } }
                        .buttonStyle(.borderedProminent).tint(StudioTheme.accent).disabled(saving)
                }
            }
            .padding()
        }
    }

    private func openCreate() {
        editing = nil
        titulo = ""; cliente = ""; vertical = ""; impacto = ""; descripcion = ""; publicado = false
        showEditor = true
    }

    private func openEdit(_ item: CaseStudy) {
        editing = item
        titulo = item.titulo ?? ""; cliente = item.cliente ?? ""
        vertical = item.vertical ?? ""; impacto = item.impacto ?? ""
        descripcion = item.descripcion ?? ""; publicado = item.publicado == true
        showEditor = true
    }

    private func reload() async {
        isLoading = true; defer { isLoading = false }
        do { items = try await StudioRepository.shared.caseStudies() }
        catch { error = error.localizedDescription }
    }

    private func save() async {
        guard !titulo.trimmingCharacters(in: .whitespaces).isEmpty,
              !cliente.trimmingCharacters(in: .whitespaces).isEmpty else {
            error = "Título y cliente son obligatorios"; return
        }
        saving = true; defer { saving = false }
        do {
            if let e = editing {
                _ = try await StudioRepository.shared.updateCaseStudy(id: e.id, UpdateCaseStudyBody(
                    titulo: titulo.trimmingCharacters(in: .whitespaces),
                    cliente: cliente.trimmingCharacters(in: .whitespaces),
                    vertical: vertical.isEmpty ? nil : vertical,
                    impacto: impacto.isEmpty ? nil : impacto,
                    descripcion: descripcion.isEmpty ? nil : descripcion,
                    publicado: publicado
                ))
            } else {
                _ = try await StudioRepository.shared.createCaseStudy(CreateCaseStudyBody(
                    titulo: titulo.trimmingCharacters(in: .whitespaces),
                    cliente: cliente.trimmingCharacters(in: .whitespaces),
                    vertical: vertical.isEmpty ? "General" : vertical,
                    impacto: impacto.isEmpty ? "—" : impacto,
                    descripcion: descripcion.isEmpty ? nil : descripcion,
                    publicado: publicado
                ))
            }
            showEditor = false; await reload()
        } catch { error = error.localizedDescription }
    }

    private func toggle(_ id: Int64) async {
        do { _ = try await StudioRepository.shared.toggleCasePublicado(id: id); await reload() }
        catch { error = error.localizedDescription }
    }

    private func delete(_ id: Int64) async {
        do { try await StudioRepository.shared.deleteCaseStudy(id: id); await reload() }
        catch { error = error.localizedDescription }
    }
}

// MARK: - News

struct StudioNewsView: View {
    @State private var items: [NewsPost] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var showEditor = false
    @State private var editing: NewsPost?
    @State private var title = ""
    @State private var summary = ""
    @State private var content = ""
    @State private var status = "draft"
    @State private var saving = false

    var body: some View {
        Group { if showEditor { editor } else { listBody } }
            .navigationTitle("Noticias")
            .task { await reload() }
            .refreshable { await reload() }
            .overlay(alignment: .bottomTrailing) {
                if !showEditor { StudioFab { openCreate() }.padding() }
            }
    }

    private var listBody: some View {
        Group {
            if isLoading { StudioLoadingView() }
            else {
                List {
                    if let error { Text(error).foregroundColor(.red).font(.footnote) }
                    if items.isEmpty { StudioEmptyView(title: "Sin noticias", subtitle: "Publica el primer comunicado.") }
                    ForEach(items) { n in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(n.title ?? "—").font(.headline)
                            StudioStatusChip(text: n.status ?? "draft")
                            HStack {
                                Button("Editar") { openEdit(n) }.font(.caption)
                                Button("Eliminar", role: .destructive) { Task { await delete(n.id) } }.font(.caption)
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
    }

    private var editor: some View {
        ScrollView {
            VStack(spacing: 12) {
                StudioField(label: "Título *", text: $title)
                StudioField(label: "Resumen", text: $summary)
                StudioField(label: "Contenido *", text: $content, axis: .vertical, lines: 8)
                StudioField(label: "Estado (draft/published)", text: $status)
                HStack {
                    Button("Cancelar") { showEditor = false }
                    Spacer()
                    Button(saving ? "Guardando…" : "Guardar") { Task { await save() } }
                        .buttonStyle(.borderedProminent).tint(StudioTheme.accent).disabled(saving)
                }
            }
            .padding()
        }
    }

    private func openCreate() {
        editing = nil; title = ""; summary = ""; content = ""; status = "draft"; showEditor = true
    }

    private func openEdit(_ n: NewsPost) {
        editing = n
        title = n.title ?? ""
        summary = n.excerpt ?? n.summary ?? ""
        content = n.content ?? n.body ?? ""
        status = n.status ?? "draft"
        showEditor = true
    }

    private func reload() async {
        isLoading = true; defer { isLoading = false }
        do { items = try await StudioRepository.shared.news() }
        catch { error = error.localizedDescription }
    }

    private func save() async {
        guard !title.isEmpty, !content.isEmpty else { error = "Título y contenido obligatorios"; return }
        saving = true; defer { saving = false }
        do {
            if let e = editing {
                _ = try await StudioRepository.shared.updateNews(id: e.id, UpdateNewsBody(
                    title: title, summary: summary.isEmpty ? nil : summary,
                    content: content, status: status
                ))
            } else {
                _ = try await StudioRepository.shared.createNews(CreateNewsBody(
                    title: title, summary: summary.isEmpty ? nil : summary,
                    content: content, status: status
                ))
            }
            showEditor = false; await reload()
        } catch { error = error.localizedDescription }
    }

    private func delete(_ id: Int64) async {
        do { try await StudioRepository.shared.deleteNews(id: id); await reload() }
        catch { error = error.localizedDescription }
    }
}

// MARK: - Social

struct StudioSocialView: View {
    @State private var items: [SocialPost] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var showEditor = false
    @State private var editing: SocialPost?
    @State private var red = "LinkedIn"
    @State private var titulo = ""
    @State private var contenido = ""
    @State private var cuando = ""
    @State private var estado = "Borrador"
    @State private var mediaUrl = ""
    @State private var saving = false

    var body: some View {
        Group { if showEditor { editor } else { listBody } }
            .navigationTitle("Redes sociales")
            .task { await reload() }
            .refreshable { await reload() }
            .overlay(alignment: .bottomTrailing) {
                if !showEditor { StudioFab { openCreate() }.padding() }
            }
    }

    private var listBody: some View {
        Group {
            if isLoading { StudioLoadingView() }
            else {
                List {
                    if let error { Text(error).foregroundColor(.red).font(.footnote) }
                    ForEach(items) { p in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                StudioStatusChip(text: p.red ?? "Red")
                                StudioStatusChip(text: p.estado ?? "", color: StudioTheme.muted)
                            }
                            Text(p.titulo ?? "—").font(.headline)
                            if let c = p.cuando { Text(c).font(.caption2).foregroundColor(StudioTheme.muted) }
                            HStack {
                                Button("Editar") { openEdit(p) }.font(.caption)
                                if p.estado != "Publicado" {
                                    Button("Publicar") { Task { await publish(p.id) } }.font(.caption)
                                }
                                Button("Eliminar", role: .destructive) { Task { await delete(p.id) } }.font(.caption)
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
    }

    private var editor: some View {
        ScrollView {
            VStack(spacing: 12) {
                StudioField(label: "Red", text: $red)
                StudioField(label: "Título *", text: $titulo)
                StudioField(label: "Contenido *", text: $contenido, axis: .vertical, lines: 5)
                StudioField(label: "Fecha ISO (cuando) *", text: $cuando)
                StudioField(label: "Estado", text: $estado)
                StudioField(label: "Media URL", text: $mediaUrl)
                HStack {
                    Button("Cancelar") { showEditor = false }
                    Spacer()
                    Button(saving ? "Guardando…" : "Guardar") { Task { await save() } }
                        .buttonStyle(.borderedProminent).tint(StudioTheme.accent).disabled(saving)
                }
            }
            .padding()
        }
    }

    private func openCreate() {
        editing = nil
        red = "LinkedIn"; titulo = ""; contenido = ""; cuando = ""; estado = "Borrador"; mediaUrl = ""
        showEditor = true
    }

    private func openEdit(_ p: SocialPost) {
        editing = p
        red = p.red ?? ""; titulo = p.titulo ?? ""; contenido = p.contenido ?? ""
        cuando = p.cuando ?? ""; estado = p.estado ?? "Borrador"; mediaUrl = p.mediaUrl ?? ""
        showEditor = true
    }

    private func reload() async {
        isLoading = true; defer { isLoading = false }
        do { items = try await StudioRepository.shared.socialPosts() }
        catch { error = error.localizedDescription }
    }

    private func save() async {
        guard !titulo.isEmpty, !contenido.isEmpty, !cuando.isEmpty else {
            error = "Título, contenido y fecha son obligatorios"; return
        }
        saving = true; defer { saving = false }
        do {
            let media = mediaUrl.isEmpty ? nil : mediaUrl
            if let e = editing {
                _ = try await StudioRepository.shared.updateSocialPost(id: e.id, UpdateSocialPostBody(
                    red: red, titulo: titulo, contenido: contenido,
                    mediaUrl: media, cuando: cuando, estado: estado
                ))
            } else {
                _ = try await StudioRepository.shared.createSocialPost(CreateSocialPostBody(
                    red: red, titulo: titulo, contenido: contenido,
                    mediaUrl: media, cuando: cuando, estado: estado
                ))
            }
            showEditor = false; await reload()
        } catch { error = error.localizedDescription }
    }

    private func publish(_ id: Int64) async {
        do { _ = try await StudioRepository.shared.setSocialEstado(id: id, estado: "Publicado"); await reload() }
        catch { error = error.localizedDescription }
    }

    private func delete(_ id: Int64) async {
        do { try await StudioRepository.shared.deleteSocialPost(id: id); await reload() }
        catch { error = error.localizedDescription }
    }
}
