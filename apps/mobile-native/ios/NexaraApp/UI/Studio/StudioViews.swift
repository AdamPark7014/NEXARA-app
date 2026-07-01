import SwiftUI

struct StudioDashboardView: View {
    @State private var contacts: Int?
    @State private var casesTotal = 0
    @State private var casesPublished = 0
    @State private var socialDrafts = 0
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if isLoading { ProgressView() }
                if let error { Text(error).foregroundColor(.red).font(.footnote) }

                Text("STUDIO · Marca y marketing").font(.caption).foregroundColor(.secondary)
                Text("Dashboard").font(.title2).bold()

                HStack(spacing: 12) {
                    kpi("📥", "Contactos", contacts.map(String.init) ?? "—")
                    kpi("🏆", "Casos", "\(casesPublished)/\(casesTotal)")
                }
                HStack(spacing: 12) {
                    kpi("📱", "Social", "\(socialDrafts)")
                }

                Text("Usa el menú del panel para gestionar hero, noticias, casos y más.")
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
            .padding()
        }
        .navigationTitle("NEXARA STUDIO")
        .task { await load() }
        .refreshable { await load() }
    }

    private func kpi(_ icon: String, _ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(icon).font(.title2)
            Text(label).font(.caption).foregroundColor(.secondary)
            Text(value).font(.title3).bold()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(14)
    }

    private func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            let s = try await StudioRepository.shared.dashboardStats()
            contacts = s.contacts
            casesTotal = s.casesTotal
            casesPublished = s.casesPublished
            socialDrafts = s.socialDrafts
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct StudioListModuleView: View {
    let title: String
    let loader: () async throws -> [[String: Any]]
    let rowTitle: ([String: Any]) -> String
    let rowSubtitle: ([String: Any]) -> String

    @State private var rows: [[String: Any]] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        List {
            if isLoading { ProgressView() }
            if let error { Text(error).foregroundColor(.red) }
            ForEach(rows.indices, id: \.self) { i in
                let r = rows[i]
                VStack(alignment: .leading, spacing: 4) {
                    Text(rowTitle(r)).font(.headline)
                    Text(rowSubtitle(r)).font(.caption).foregroundColor(.secondary)
                }
            }
        }
        .navigationTitle(title)
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            rows = try await loader()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
