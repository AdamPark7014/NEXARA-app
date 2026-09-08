import SwiftUI

/// GET `kb/categories` + GET `kb/articles?categoryId=` — navegar la base de
/// conocimiento por categoría.
///
/// Las apps sólo listaban artículos sueltos (`ExtraRepository.kbArticles`); el
/// filtro por categoría es lo que hace usable una base con cientos de artículos
/// y sólo lo tenía la web (`erp/kb`).
///
/// SOLO LECTURA: crear y editar artículos son `POST`/`PATCH` reservados al rol
/// que gestiona la KB desde el escritorio; aquí se consulta.
struct PortalKbCategoriesView: View {
    @State private var categories: [PortalKbCategory] = []
    @State private var articles: [KbArticle] = []
    @State private var selectedCategory: PortalKbCategory?
    @State private var query = ""
    @State private var isLoading = true
    @State private var openArticle: KbArticle?

    var body: some View {
        VStack(spacing: 0) {
            categoryStrip
            Divider()
            if isLoading {
                Spacer(); ProgressView("Cargando…"); Spacer()
            } else if articles.isEmpty {
                Spacer()
                VStack(spacing: 8) {
                    Image(systemName: "books.vertical")
                        .font(.largeTitle).foregroundColor(.secondary)
                    Text("Sin artículos").font(.headline)
                    Text(selectedCategory == nil
                         ? "No hay artículos publicados."
                         : "Esta categoría no tiene artículos que coincidan.")
                        .font(.footnote).foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding()
                Spacer()
            } else {
                List(articles) { art in
                    Button { openArticle = art } label: { articleRow(art) }
                        .buttonStyle(.plain)
                }
                .listStyle(.plain)
            }
        }
        .searchable(text: $query, prompt: "Buscar en la base de conocimiento…")
        .onSubmit(of: .search) { Task { await loadArticles() } }
        .navigationTitle("Base de conocimiento")
        .task { await bootstrap() }
        .refreshable { await loadArticles() }
        .sheet(item: $openArticle) { art in
            NavigationStack { PortalKbArticleDetail(article: art) }
        }
    }

    private var categoryStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                categoryChip(title: "Todas", count: nil, selected: selectedCategory == nil) {
                    selectedCategory = nil
                    Task { await loadArticles() }
                }
                ForEach(categories) { cat in
                    categoryChip(
                        title: cat.displayName,
                        count: cat.articleCount,
                        selected: selectedCategory?.id == cat.id
                    ) {
                        selectedCategory = cat
                        Task { await loadArticles() }
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
    }

    private func categoryChip(
        title: String, count: Int?, selected: Bool, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Text(title).font(.caption).bold()
                if let count, count > 0 {
                    Text("\(count)")
                        .font(.caption2)
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .background(Color.primary.opacity(0.12))
                        .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(selected ? Color.teal.opacity(0.20) : Color(.secondarySystemGroupedBackground))
            .foregroundColor(selected ? .teal : .primary)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func articleRow(_ art: KbArticle) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(art.title.isEmpty ? art.slug : art.title)
                .font(.headline).lineLimit(2)
            if !art.excerpt.isEmpty {
                Text(art.excerpt).font(.footnote).foregroundColor(.secondary).lineLimit(3)
            }
            HStack(spacing: 8) {
                if !art.category.isEmpty { OpsStatusChip(text: art.category) }
                if !art.status.isEmpty {
                    Text(art.status).font(.caption2).foregroundColor(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func bootstrap() async {
        isLoading = true
        categories = await PortalExtraRepository.shared.kbCategories()
        await loadArticles()
    }

    private func loadArticles() async {
        isLoading = true
        defer { isLoading = false }
        articles = await PortalExtraRepository.shared.kbArticlesByCategory(
            categoryId: selectedCategory?.id,
            q: query.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        )
    }
}

/// Lectura de un artículo. El contenido llega en Markdown/HTML plano desde la
/// API; se muestra como texto porque no hay renderizador en el proyecto y
/// enseñar etiquetas crudas sería peor que enseñar el texto.
struct PortalKbArticleDetail: View {
    let article: KbArticle

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(article.title.isEmpty ? article.slug : article.title)
                    .font(.title3).bold()
                HStack(spacing: 8) {
                    if !article.category.isEmpty { OpsStatusChip(text: article.category) }
                    if !article.status.isEmpty {
                        Text(article.status).font(.caption).foregroundColor(.secondary)
                    }
                }
                if !article.excerpt.isEmpty {
                    Text(article.excerpt)
                        .font(.subheadline).foregroundColor(.secondary)
                }
                Divider()
                if article.content.isEmpty {
                    Text("Este artículo no tiene contenido publicado.")
                        .font(.footnote).foregroundColor(.secondary)
                } else {
                    Text(article.content).font(.body)
                }
                if !article.tags.isEmpty {
                    Text("Etiquetas: \(article.tags)")
                        .font(.caption).foregroundColor(.secondary)
                        .padding(.top, 4)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
        .navigationTitle("Artículo")
        .navigationBarTitleDisplayMode(.inline)
    }
}
