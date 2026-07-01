import SwiftUI

struct StudioDashboardView: View {
    @State private var stats: StudioDashboardStats?
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                StudioGradientBar()

                if isLoading { ProgressView().tint(StudioTheme.accent).frame(maxWidth: .infinity) }
                if let error { Text(error).foregroundColor(.red).font(.footnote) }

                if let s = stats {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Sitio en producción").font(.headline)
                        Text("Gestiona contenido público, leads y calendario social.")
                            .font(.footnote).foregroundColor(StudioTheme.muted)
                    }

                    // ── KPI grid 2×3
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        StudioKpiCard(icon: "📥", label: "Contactos web", value: "\(s.contacts)",
                                      hint: "Formularios recibidos")
                        StudioKpiCard(icon: "🏆", label: "Casos de éxito",
                                      value: "\(s.casesPublished)/\(s.casesTotal)",
                                      hint: "Publicados / total", accent: .green)
                        StudioKpiCard(icon: "📰", label: "Noticias",
                                      value: "\(s.newsPublished)/\(s.newsTotal)",
                                      hint: "Publicadas / total", accent: .orange)
                        StudioKpiCard(icon: "📮", label: "Suscriptores",
                                      value: "\(s.newsletterActive)",
                                      hint: "Newsletter activos", accent: .purple)
                        StudioKpiCard(icon: "📱", label: "Social",
                                      value: "\(s.socialDrafts.count)",
                                      hint: "Pendientes de publicar", accent: .cyan)
                    }

                    if !s.socialDrafts.isEmpty {
                        Text("Próximas publicaciones").font(.headline).padding(.top, 8)
                        ForEach(s.socialDrafts) { post in
                            socialPreview(post)
                        }
                    }
                }
            }
            .padding()
        }
        .navigationTitle("STUDIO")
        .task { await load() }
        .refreshable { await load() }
    }

    private func socialPreview(_ post: SocialPost) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                StudioStatusChip(text: post.red ?? "Red")
                StudioStatusChip(text: post.estado ?? "", color: StudioTheme.muted)
            }
            Text(post.titulo ?? "Sin título").font(.subheadline.weight(.semibold))
            if let cuando = post.cuando {
                Text(cuando).font(.caption2).foregroundColor(StudioTheme.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    private func load() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do { stats = try await StudioRepository.shared.dashboardStats() }
        catch { self.error = error.localizedDescription }
    }
}
