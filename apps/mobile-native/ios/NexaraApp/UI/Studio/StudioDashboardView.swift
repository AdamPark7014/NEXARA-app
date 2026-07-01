import SwiftUI

// MARK: – ViewModel

@MainActor
final class StudioDashboardVM: ObservableObject {
    @Published var news:     [[String: Any]] = []
    @Published var contacts: [[String: Any]] = []
    @Published var cases:    [[String: Any]] = []
    @Published var isLoading = false
    @Published var error: String?

    func load() {
        isLoading = true; error = nil
        Task {
            async let n = ExtraRepository.shared.news()
            async let c = ExtraRepository.shared.contactMessages()
            async let cs = ExtraRepository.shared.clientTicketRequests()
            let (nw, cm, cs2) = await (n, c, cs)
            news     = nw
            contacts = cm
            cases    = cs2
            isLoading = false
        }
    }
}

// MARK: – View

struct StudioDashboardView: View {
    @StateObject private var vm = StudioDashboardVM()

    var body: some View {
        Group {
            if vm.isLoading && vm.news.isEmpty {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            } else {
                content
            }
        }
        .navigationTitle("NEXARA STUDIO")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { vm.load() } label: { Image(systemName: "arrow.clockwise") }
            }
        }
        .refreshable { vm.load() }
        .task { vm.load() }
    }

    private var content: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                kpiSection
                newsSection
                contactsSection
                Spacer(minLength: 24)
            }
            .padding(.vertical)
        }
    }

    // ── KPI cards
    private var kpiSection: some View {
        let published = vm.news.filter { stStr($0, "status").lowercased().contains("published") }.count
        let drafts    = vm.news.filter { !stStr($0, "status").lowercased().contains("published") }.count
        let newMsg    = vm.contacts.count
        let newMsgU   = vm.contacts.filter { stStr($0, "status").lowercased() == "new" || stStr($0, "status").isEmpty }.count

        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            StKpi(icon: "📰", label: "Publicaciones", value: "\(vm.news.count)", sub: "\(published) publicadas", accent: .purple)
            StKpi(icon: "📝", label: "Borradores", value: "\(drafts)", sub: "Pendientes de publicar", accent: .orange)
            StKpi(icon: "✉️", label: "Mensajes", value: "\(newMsg)", sub: "\(newMsgU) sin leer", accent: .blue)
            StKpi(icon: "🏆", label: "Casos", value: "\(vm.cases.count)", sub: "Portafolio", accent: .teal)
        }
        .padding(.horizontal)
    }

    // ── Recent news
    @ViewBuilder
    private var newsSection: some View {
        if !vm.news.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                StSectionRow(title: "Blog · Publicaciones recientes", detail: "\(vm.news.count) total")
                    .padding(.horizontal)
                ForEach(vm.news.prefix(6), id: \.stId) { n in
                    NewsRow(item: n).padding(.horizontal)
                }
            }
        }
    }

    // ── Recent contact messages
    @ViewBuilder
    private var contactsSection: some View {
        if !vm.contacts.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                StSectionRow(title: "Mensajes de contacto", detail: "\(vm.contacts.count) total")
                    .padding(.horizontal)
                ForEach(vm.contacts.prefix(5), id: \.stId) { m in
                    ContactMsgRow(item: m).padding(.horizontal)
                }
            }
        }
    }
}

// MARK: – Subviews

private struct StKpi: View {
    let icon: String; let label: String; let value: String; let sub: String; let accent: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(icon).font(.title3)
                Text(label).font(.caption).foregroundColor(accent).lineLimit(1)
            }
            Text(value).font(.title2).bold()
            Text(sub).font(.caption2).foregroundColor(.secondary).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(accent.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

private struct StSectionRow: View {
    let title: String; let detail: String
    var body: some View {
        HStack {
            Text(title).font(.headline)
            Spacer()
            Text(detail).font(.caption).foregroundColor(.secondary)
        }
    }
}

private struct NewsRow: View {
    let item: [String: Any]
    var body: some View {
        let title   = stStr(item, "title", "titulo").stBlank("Sin título")
        let slug    = stStr(item, "slug")
        let status  = stStr(item, "status")
        let isPublished = status.lowercased().contains("published")
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 8).fill(isPublished ? Color.green.opacity(0.15) : Color.orange.opacity(0.15))
                .frame(width: 42, height: 42)
                .overlay(Text("📰").font(.title3))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline).bold().lineLimit(1)
                Text("/" + slug).font(.caption2).foregroundColor(.secondary)
            }
            Spacer()
            Text(isPublished ? "Publicada" : "Borrador")
                .font(.caption2).bold()
                .foregroundColor(isPublished ? .green : .orange)
                .padding(.horizontal, 7).padding(.vertical, 2)
                .background((isPublished ? Color.green : Color.orange).opacity(0.12))
                .clipShape(Capsule())
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

private struct ContactMsgRow: View {
    let item: [String: Any]
    var body: some View {
        let name    = stStr(item, "name", "nombre").stBlank("Contacto")
        let subject = stStr(item, "subject", "mensaje", "message").stBlank("Sin asunto")
        let email   = stStr(item, "email")
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 8).fill(Color.blue.opacity(0.1))
                .frame(width: 42, height: 42)
                .overlay(Text("✉️").font(.title3))
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.subheadline).bold()
                Text(subject).font(.caption).foregroundColor(.secondary).lineLimit(1)
                if !email.isEmpty { Text(email).font(.caption2).foregroundColor(.secondary) }
            }
            Spacer()
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

// MARK: – Helpers

private func stStr(_ m: [String: Any], _ keys: String...) -> String {
    for k in keys {
        if let v = m[k] {
            let s: String
            if let ss = v as? String { s = ss }
            else if let n = v as? NSNumber { s = n.stringValue }
            else { s = String(describing: v) }
            if !s.isEmpty && s != "null" { return s }
        }
    }
    return ""
}

extension String {
    fileprivate func stBlank(_ fallback: String) -> String { isEmpty ? fallback : self }
}

extension [String: Any] {
    fileprivate var stId: String {
        if let n = self["id"] as? Int { return String(n) }
        if let s = self["id"] as? String { return s }
        return UUID().uuidString
    }
}
