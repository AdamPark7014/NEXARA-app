import SwiftUI

// MARK: – Model

private struct Candidate: Identifiable {
    let id: Int
    let fullName: String
    let email: String?
    let whatsapp: String?
    let category: String?
    let stage: String?
    let employmentStatus: String?
}

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

private func parseCandidate(_ m: [String: Any]) -> Candidate? {
    guard let id = m["id"] as? Int ?? (m["id"] as? String).flatMap(Int.init) else { return nil }
    let fullName = (m["fullName"] as? String) ?? (m["nombre"] as? String) ?? "Candidato #\(id)"
    return Candidate(
        id: id,
        fullName: fullName,
        email: m["email"] as? String,
        whatsapp: m["whatsapp"] as? String,
        category: m["category"] as? String,
        stage: m["stage"] as? String ?? m["status"] as? String,
        employmentStatus: m["employmentStatus"] as? String
    )
}

// MARK: – View

struct RecruitingView: View {
    @State private var candidates: [Candidate] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var query = ""
    @State private var showRejected = false

    private var filtered: [Candidate] {
        candidates.filter { c in
            let stg = c.stage ?? ""
            let isRejected = stg.contains("REJECTED")
            if !showRejected && isRejected { return false }
            if query.isEmpty { return true }
            let q = query.lowercased()
            return c.fullName.lowercased().contains(q)
                || (c.email?.lowercased().contains(q) ?? false)
                || (c.category?.lowercased().contains(q) ?? false)
        }
    }

    private var grouped: [(String, [Candidate])] {
        var dict: [String: [Candidate]] = [:]
        for c in filtered {
            let key = c.stage ?? "INBOX"
            dict[key, default: []].append(c)
        }
        return STAGE_ORDER
            .filter { dict[$0] != nil }
            .map { ($0, dict[$0]!) }
    }

    var body: some View {
        Group {
            if isLoading {
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
        .navigationTitle("Reclutamiento")
        .task { await load() }
        .refreshable { await load() }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // KPI strip
                HStack(spacing: 0) {
                    kpiChip("Total", "\(candidates.count)", .primary)
                    kpiChip("Proceso", "\(candidates.filter { !($0.stage ?? "").contains("REJECTED") && $0.stage != "APPROVED" }.count)", .blue)
                    kpiChip("Contratados", "\(candidates.filter { $0.stage == "APPROVED" }.count)", .green)
                    kpiChip("Rechazados", "\(candidates.filter { ($0.stage ?? "").contains("REJECTED") }.count)", .red)
                }
                .padding(.horizontal)

                // Search + toggle
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
    private func stageSection(_ key: String, _ list: [Candidate]) -> some View {
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
                CandidateCard(candidate: c, stageColor: color)
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
        let raw = await ExtraRepository.shared.cvs()
        candidates = raw.compactMap { parseCandidate($0) }
        isLoading = false
    }
}

private struct CandidateCard: View {
    let candidate: Candidate
    let stageColor: Color

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(stageColor.opacity(0.15)).frame(width: 44, height: 44)
                Text(String(candidate.fullName.prefix(1))).font(.title3).bold().foregroundColor(stageColor)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(candidate.fullName).font(.subheadline).bold()
                if let cat = candidate.category, !cat.isEmpty {
                    Text(cat).font(.caption).foregroundColor(.secondary)
                }
                if let email = candidate.email, !email.isEmpty {
                    Text(email).font(.caption2).foregroundColor(.secondary)
                }
            }
            Spacer()
            if let ws = candidate.whatsapp, !ws.isEmpty {
                Image(systemName: "phone.fill").font(.caption).foregroundColor(.green)
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
