import SwiftUI

// MARK: – Stage helpers

private let STAGE_LABEL: [String: String] = [
    "INBOX": "Postulado",
    "RECRUITER_SHORTLIST": "Entrevista técnica",
    "RECRUITER_REJECTED": "Rechazado (técnico)",
    "ADMIN_SHORTLIST": "Entrevista admin",
    "ADMIN_REJECTED": "Rechazado (admin)",
    "SUPERADMIN_SHORTLIST": "Oferta",
    "SUPERADMIN_REJECTED": "Rechazado (dir.)",
    "APPROVED": "Contratado",
]

private let STAGE_ORDER = [
    "INBOX", "RECRUITER_SHORTLIST", "ADMIN_SHORTLIST", "SUPERADMIN_SHORTLIST", "APPROVED",
    "RECRUITER_REJECTED", "ADMIN_REJECTED", "SUPERADMIN_REJECTED",
]

private func stageColor(_ key: String) -> Color {
    switch key {
    case "INBOX":                return .secondary
    case "RECRUITER_SHORTLIST":  return .blue
    case "ADMIN_SHORTLIST":      return .purple
    case "SUPERADMIN_SHORTLIST": return .orange
    case "APPROVED":             return .green
    default:                     return .red
    }
}

// MARK: – View

struct RecruitingView: View {
    @State private var candidates: [CandidateItem] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var query = ""
    @State private var showRejected = false
    @State private var selected: CandidateItem?

    private var filtered: [CandidateItem] {
        candidates.filter { c in
            if !showRejected && c.isRejected { return false }
            if query.isEmpty { return true }
            let q = query.lowercased()
            return c.displayName.lowercased().contains(q)
                || c.email.lowercased().contains(q)
                || c.category.lowercased().contains(q)
        }
    }

    private var grouped: [(String, [CandidateItem])] {
        var dict: [String: [CandidateItem]] = [:]
        for c in filtered {
            dict[c.stageKey, default: []].append(c)
        }
        return STAGE_ORDER
            .filter { dict[$0] != nil }
            .map { ($0, dict[$0]!) }
    }

    var body: some View {
        Group {
            if let c = selected {
                candidateDetail(c)
            } else if isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let err = error {
                VStack(spacing: 12) {
                    Text(err).foregroundColor(.red).font(.footnote)
                    Button("Reintentar") { Task { await load() } }.buttonStyle(.bordered)
                }.padding()
            } else {
                content
            }
        }
        .navigationTitle(selected == nil ? "Reclutamiento" : "")
        .task { await load() }
        .refreshable { if selected == nil { await load() } }
    }

    @ViewBuilder
    private func candidateDetail(_ c: CandidateItem) -> some View {
        let color = stageColor(c.stageKey)
        List {
            Section { Button("← Candidatos") { selected = nil } }
            Section {
                HStack {
                    ZStack {
                        Circle().fill(color.opacity(0.15)).frame(width: 56, height: 56)
                        Text(String(c.displayName.prefix(1))).font(.title2).bold().foregroundColor(color)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text(c.displayName).font(.headline)
                        Text(STAGE_LABEL[c.stageKey] ?? c.stageKey)
                            .font(.caption).foregroundColor(color)
                    }
                }
            }
            Section("Contacto") {
                if !c.email.isEmpty { labeled("Email", c.email) }
                if !c.whatsapp.isEmpty { labeled("WhatsApp", c.whatsapp) }
                if !c.category.isEmpty { labeled("Categoría", c.category) }
                if !c.position.isEmpty { labeled("Posición", c.position) }
                if !c.experience.isEmpty { labeled("Experiencia", c.experience) }
                if !c.expectedSalary.isEmpty { labeled("Salario", c.expectedSalary) }
                if !c.source.isEmpty { labeled("Fuente", c.source) }
                if !c.cvUrl.isEmpty { labeled("CV", c.cvUrl) }
            }
            if !c.notes.isEmpty {
                Section("Notas") { Text(c.notes).font(.subheadline) }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func labeled(_ k: String, _ v: String) -> some View {
        HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary).multilineTextAlignment(.trailing) }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 0) {
                    kpiChip("Total", "\(candidates.count)", .primary)
                    kpiChip("Proceso", "\(candidates.filter { !$0.isRejected && !$0.isApproved }.count)", .blue)
                    kpiChip("Contratados", "\(candidates.filter { $0.isApproved }.count)", .green)
                    kpiChip("Rechazados", "\(candidates.filter { $0.isRejected }.count)", .red)
                }
                .padding(.horizontal)

                HStack {
                    HStack {
                        Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                        TextField("Buscar candidato…", text: $query)
                    }
                    .padding(8)
                    .background(Color(.secondarySystemFill))
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                    Toggle("Rechazados", isOn: $showRejected)
                        .toggleStyle(.button)
                        .tint(.red)
                        .font(.caption)
                }
                .padding(.horizontal)

                if grouped.isEmpty {
                    Text("Sin candidatos").foregroundColor(.secondary).padding()
                } else {
                    ForEach(grouped, id: \.0) { stageKey, list in
                        stageSection(stageKey, list)
                    }
                }

                Spacer(minLength: 24)
            }
            .padding(.vertical)
        }
    }

    @ViewBuilder
    private func stageSection(_ key: String, _ list: [CandidateItem]) -> some View {
        let color = stageColor(key)
        let label = STAGE_LABEL[key] ?? key

        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(label).font(.headline).foregroundColor(color)
                Spacer()
                Text("\(list.count)").font(.caption).foregroundColor(.secondary)
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .background(color.opacity(0.12)).clipShape(Capsule())
            }
            .padding(.horizontal)

            ForEach(list) { c in
                Button { selected = c } label: {
                    CandidateCard(candidate: c, stageColor: color)
                }
                .buttonStyle(.plain)
                .padding(.horizontal)
            }
        }
    }

    private func kpiChip(_ label: String, _ value: String, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.title3).bold().foregroundColor(color)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(Color(.secondarySystemGroupedBackground))
    }

    private func load() async {
        isLoading = true; error = nil
        candidates = await ExtraRepository.shared.candidateItems()
        isLoading = false
    }
}

private struct CandidateCard: View {
    let candidate: CandidateItem
    let stageColor: Color

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(stageColor.opacity(0.15)).frame(width: 44, height: 44)
                Text(String(candidate.displayName.prefix(1))).font(.headline).foregroundColor(stageColor)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(candidate.displayName).font(.subheadline).bold()
                if !candidate.category.isEmpty {
                    Text(candidate.category).font(.caption).foregroundColor(.secondary)
                }
                if !candidate.email.isEmpty {
                    Text(candidate.email).font(.caption2).foregroundColor(.secondary)
                }
            }
            Spacer()
            if !candidate.whatsapp.isEmpty {
                Image(systemName: "phone.fill").font(.caption).foregroundColor(.secondary)
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
