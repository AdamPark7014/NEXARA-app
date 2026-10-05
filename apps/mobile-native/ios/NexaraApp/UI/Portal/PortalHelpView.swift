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
            self.error = err.toUserMessage(fallback: "No se pudieron cargar los artículos")
            isLoading = false
            isRefreshing = false
        }
    }
}

/// Centro de ayuda del portal (Android `PortalHelpScreen`): título, buscador,
/// tarjetas de artículos y el detalle con «¿Te fue útil este artículo?». El
/// volver lo da la barra teal de la pila del portal.
struct PortalHelpView: View {
    @StateObject private var vm = PortalHelpVM()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Centro de ayuda")
                    .font(NxType.headlineSmall.bold())
                    .foregroundStyle(NxColors.fg)
                Text("Encuentra respuestas a las preguntas más frecuentes sobre nuestros servicios.")
                    .nxTextStyle(.bodyMedium)
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, NxSpacing.xs)

                NxSearchField(
                    text: Binding(get: { vm.search }, set: { vm.setSearch($0) }),
                    placeholder: "Buscar artículos…"
                )
                .padding(.top, NxSpacing.m)

                contentBody
                    .padding(.top, NxSpacing.m)
            }
            .padding(NxSpacing.l)
        }
        .nxScreenBackground()
        .refreshable { vm.refresh(initial: false) }
    }

    @ViewBuilder
    private var contentBody: some View {
        if vm.isLoading {
            NxLoadingState(text: "Cargando artículos…")
        } else if let err = vm.error, !err.isEmpty {
            NxErrorBlock(message: err, onRetry: { vm.refresh(initial: true) })
        } else if let article = vm.selected {
            PortalHelpArticleDetail(
                article: article,
                isMarkingHelpful: vm.isMarkingHelpful,
                onBack: { vm.selectArticle(nil) },
                onMarkHelpful: { vm.markHelpful(id: article.id) }
            )
        } else if vm.articles.isEmpty {
            NxEmptyState(
                title: "Sin artículos",
                subtitle: vm.search.trimmingCharacters(in: .whitespaces).isEmpty
                    ? "No hay artículos publicados por ahora."
                    : "No se encontraron artículos para \"\(vm.search)\"."
            )
        } else {
            LazyVStack(spacing: NxSpacing.listGap) {
                ForEach(vm.articles) { article in
                    PortalHelpArticleCard(article: article) { vm.selectArticle(article) }
                }
            }
            .padding(.bottom, NxSpacing.l)
        }
    }
}

/// «(ojo) 12   (pulgar) 3» en 11 Medium gris.
private struct PortalHelpStats: View {
    let views: Int
    let helpful: Int
    var published: String = ""

    var body: some View {
        HStack(spacing: NxSpacing.m) {
            if !published.isEmpty {
                Text(published)
            }
            NxIconText(systemName: "eye", text: "\(views)", tint: NxColors.muted)
            NxIconText(systemName: "hand.thumbsup", text: "\(helpful)", tint: NxColors.muted)
        }
        .font(NxType.labelSmall)
        .foregroundStyle(NxColors.muted)
    }
}

private func portalHelpCategory(_ category: KbPublicCategory) -> String {
    "\(category.icon) \(category.name)".trimmingCharacters(in: .whitespaces)
}

private struct PortalHelpArticleCard: View {
    let article: KbPublicArticle
    let onClick: () -> Void

    var body: some View {
        NxPanelShell(onClick: onClick) {
            if let category = article.category {
                Text(portalHelpCategory(category))
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
            }
            Text(article.title)
                .font(NxType.titleMedium)
                .foregroundStyle(NxColors.fg)
                .multilineTextAlignment(.leading)
                .padding(.top, NxSpacing.xs)
            let excerpt = article.excerpt.trimmingCharacters(in: .whitespacesAndNewlines)
            if !excerpt.isEmpty {
                Text(excerpt)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                    .multilineTextAlignment(.leading)
                    .padding(.top, NxSpacing.xs)
            }
            PortalHelpStats(views: article.viewCount, helpful: article.helpfulCount)
                .padding(.top, NxSpacing.s)
        }
    }
}

private struct PortalHelpArticleDetail: View {
    let article: KbPublicArticle
    let isMarkingHelpful: Bool
    let onBack: () -> Void
    let onMarkHelpful: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: NxSpacing.m) {
            NxSecondaryButton("← Volver al listado", action: onBack)

            NxPanelShell(padding: NxSpacing.l) {
                if let category = article.category {
                    Text(portalHelpCategory(category))
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.muted)
                }
                Text(article.title)
                    .font(NxType.titleLarge.bold())
                    .foregroundStyle(NxColors.fg)
                    .padding(.top, NxSpacing.xs)
                PortalHelpStats(
                    views: article.viewCount,
                    helpful: article.helpfulCount,
                    published: formatPublishedAt(article.publishedAt)
                )
                .padding(.top, NxSpacing.s)
                .padding(.bottom, NxSpacing.m)
                Text(article.content)
                    .nxTextStyle(.bodyMedium)
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
            }

            NxPanelShell(padding: NxSpacing.l) {
                Text("¿Te fue útil este artículo?")
                    .nxTextStyle(.bodyMedium)
                    .foregroundStyle(NxColors.fg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                NxPrimaryButton(
                    isMarkingHelpful ? "…" : "Sí, gracias",
                    systemImage: isMarkingHelpful ? nil : "hand.thumbsup",
                    enabled: !isMarkingHelpful,
                    fullWidth: false,
                    action: onMarkHelpful
                )
                .padding(.top, NxSpacing.s)
            }
        }
        .padding(.bottom, NxSpacing.l)
    }

    /// Android `formatPublishedAt`: «d MMM yyyy»; si no se puede leer, los 10 primeros.
    private func formatPublishedAt(_ raw: String) -> String {
        guard !raw.isEmpty else { return "" }
        guard let date = NxFormat.parseISO(raw) else { return String(raw.prefix(10)) }
        return NxFormat.day(date)
    }
}
