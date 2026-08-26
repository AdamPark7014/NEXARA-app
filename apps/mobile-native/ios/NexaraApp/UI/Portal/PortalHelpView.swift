import SwiftUI

@MainActor
final class PortalHelpVM: ObservableObject {
    @Published var isLoading = true
    @Published var isRefreshing = false
    @Published var isMarkingHelpful = false
    @Published var error: String?
    @Published var search = ""
    @Published var articles: [KbPublicArticle] = []
    @Published var selected: KbPublicArticle?

    private var searchTask: Task<Void, Never>?

    init() {
        refresh(initial: true)
    }

    func setSearch(_ value: String) {
        search = value
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            let q = value.trimmingCharacters(in: .whitespacesAndNewlines)
            await fetchArticles(query: q.isEmpty ? nil : q)
        }
    }

    func refresh(initial: Bool = false) {
        if initial {
            isLoading = true
            error = nil
        } else {
            isRefreshing = true
            error = nil
        }
        Task {
            let q = search.trimmingCharacters(in: .whitespacesAndNewlines)
            await fetchArticles(query: q.isEmpty ? nil : q)
        }
    }

    func selectArticle(_ article: KbPublicArticle?) {
        selected = article
    }

    func markHelpful(id: Int64) {
        isMarkingHelpful = true
        Task {
            defer { isMarkingHelpful = false }
            do {
                _ = try await KbPublicRepository.markHelpful(id: id)
                let q = search.trimmingCharacters(in: .whitespacesAndNewlines)
                await fetchArticles(query: q.isEmpty ? nil : q)
                if let updated = articles.first(where: { $0.id == id }) {
                    selected = updated
                }
            } catch {
                // Silencioso — paridad Android
            }
        }
    }

    private func fetchArticles(query: String?) async {
        do {
            let list = try await KbPublicRepository.listArticles(query: query)
            let selectedId = selected?.id
            articles = list
            error = nil
            isLoading = false
            isRefreshing = false
            if let selectedId {
                selected = list.first { $0.id == selectedId }
            }
        } catch let err {
            self.error = err.localizedDescription.isEmpty
                ? "No se pudieron cargar los artículos"
                : err.localizedDescription
            isLoading = false
            isRefreshing = false
        }
    }
}

struct PortalHelpView: View {
    let onBack: () -> Void
    @StateObject private var vm = PortalHelpVM()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Button("← Portal", action: onBack)
                    .buttonStyle(.bordered)

                Text("🆘 Centro de ayuda")
                    .font(.title2.bold())
                Text("Encuentra respuestas a las preguntas más frecuentes sobre nuestros servicios.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField("Buscar artículos…", text: Binding(
                        get: { vm.search },
                        set: { vm.setSearch($0) }
                    ))
                    .autocorrectionDisabled()
                }
                .padding(10)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))

                contentBody
            }
            .padding()
        }
        .navigationTitle("Centro de ayuda")
        .refreshable { vm.refresh(initial: false) }
    }

    @ViewBuilder
    private var contentBody: some View {
        if vm.isLoading {
            ProgressView("Cargando artículos…")
                .frame(maxWidth: .infinity)
                .padding(.top, 40)
        } else if let err = vm.error {
            VStack(spacing: 12) {
                Text(err).foregroundStyle(.red).font(.footnote)
                Button("Reintentar") { vm.refresh(initial: true) }
                    .buttonStyle(.bordered)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 24)
        } else if let article = vm.selected {
            PortalHelpArticleDetail(
                article: article,
                isMarkingHelpful: vm.isMarkingHelpful,
                onBack: { vm.selectArticle(nil) },
                onMarkHelpful: { vm.markHelpful(id: article.id) }
            )
        } else if vm.articles.isEmpty {
            VStack(spacing: 8) {
                Text("Sin artículos").font(.headline)
                Text(vm.search.isEmpty
                     ? "No hay artículos publicados por ahora."
                     : "No se encontraron artículos para \"\(vm.search)\".")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 32)
        } else {
            LazyVStack(spacing: 10) {
                ForEach(vm.articles) { article in
                    Button { vm.selectArticle(article) } label: {
                        PortalHelpArticleCard(article: article)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private struct PortalHelpArticleCard: View {
    let article: KbPublicArticle

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let category = article.category {
                Text("\(category.icon) \(category.name)".trimmingCharacters(in: .whitespaces))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Text(article.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
            if !article.excerpt.isEmpty {
                Text(article.excerpt)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
            Text("👁️ \(article.viewCount) · 👍 \(article.helpfulCount)")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

private struct PortalHelpArticleDetail: View {
    let article: KbPublicArticle
    let isMarkingHelpful: Bool
    let onBack: () -> Void
    let onMarkHelpful: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button("← Volver al listado", action: onBack)
                .buttonStyle(.bordered)

            VStack(alignment: .leading, spacing: 8) {
                if let category = article.category {
                    Text("\(category.icon) \(category.name)".trimmingCharacters(in: .whitespaces))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text(article.title).font(.title3.bold())
                Text(metaLine).font(.caption2).foregroundStyle(.secondary)
                Text(article.content)
                    .font(.body)
                    .padding(.top, 4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 8) {
                Text("¿Te fue útil este artículo?")
                Button(isMarkingHelpful ? "…" : "👍 Sí, gracias", action: onMarkHelpful)
                    .buttonStyle(.borderedProminent)
                    .disabled(isMarkingHelpful)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var metaLine: String {
        var parts: [String] = []
        let published = formatPublishedAt(article.publishedAt)
        if !published.isEmpty { parts.append(published) }
        parts.append("👁️ \(article.viewCount)")
        parts.append("👍 \(article.helpfulCount)")
        return parts.joined(separator: " · ")
    }

    private func formatPublishedAt(_ raw: String) -> String {
        guard !raw.isEmpty else { return "" }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = iso.date(from: raw)
        if date == nil {
            iso.formatOptions = [.withInternetDateTime]
            date = iso.date(from: raw)
        }
        guard let date else { return String(raw.prefix(10)) }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "es_MX")
        fmt.dateFormat = "d MMM yyyy"
        return fmt.string(from: date)
    }
}
