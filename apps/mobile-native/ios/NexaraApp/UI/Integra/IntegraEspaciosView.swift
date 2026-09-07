import SwiftUI

struct IntegraEspacioCard: Identifiable, Hashable {
    let id: String
    var name: String
    var policyLabel: String?
    var peopleCount: Int
    var doorId: String?
}

enum IntegraEspaciosDataStub {
    static func overview() async throws -> [IntegraEspacioCard] {
        let root = try await IntegraSchedulesRepository.shared.spacesOverview()
        let list = IntegraJSON.itemsOf(root)
            + (IntegraJSON.asMapList(root["spaces"]) ?? [])
            + (IntegraJSON.asMapList(root["doors"]) ?? [])
        return list.compactMap { m in
            guard let id = m.integraStr("id", "doorId") else { return nil }
            return IntegraEspacioCard(
                id: id,
                name: m.integraStr("name", "doorName") ?? id,
                policyLabel: m.integraStr("policy", "templateName", "templateKey"),
                peopleCount: m.integraInt("peopleCount", "personCount") ?? 0,
                doorId: m.integraStr("doorId", "id")
            )
        }
    }
}

/// Espacios / puertas con política. No es un mapa de planta.
struct IntegraEspaciosView: View {
    /// NavHost can jump to schedules for that door when wired.
    var onOpenSchedules: ((String) -> Void)? = nil

    @State private var spaces: [IntegraEspacioCard] = []
    @State private var selected: IntegraEspacioCard?
    @State private var query = ""
    @State private var isLoading = true
    @State private var errorText: String?

    private var filtered: [IntegraEspacioCard] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return spaces }
        return spaces.filter { $0.name.lowercased().contains(q) }
    }

    var body: some View {
        Group {
            if let selected {
                detail(selected)
            } else if isLoading {
                ProgressView("Cargando espacios…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorText, spaces.isEmpty {
                VStack(spacing: 12) {
                    Text(errorText).foregroundStyle(.secondary)
                    Button("Reintentar") { Task { await reload() } }
                }
            } else {
                listBody
            }
        }
        .navigationTitle(SchedulesRoutes.titleEspacios)
        .task { await reload() }
        .refreshable { await reload() }
    }

    private var listBody: some View {
        List {
            Section {
                Text("Política de acceso y ventanas de uso. No es un mapa de planta.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextField("Buscar espacio…", text: $query)
            }
            if filtered.isEmpty {
                NxEmptyState(
                    title: "Sin espacios",
                    subtitle: "El sitio no devolvió espacios o puertas con política."
                )
            } else {
                ForEach(filtered) { s in
                    Button { selected = s } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(s.name).font(.headline)
                                Text(s.policyLabel ?? "Sin política")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            NxStatusChip(text: "\(s.peopleCount) pers.", tone: .neutral)
                        }
                    }
                }
            }
        }
    }

    private func detail(_ s: IntegraEspacioCard) -> some View {
        List {
            Section {
                Button("Volver") { selected = nil }
                Text(s.name).font(.title3.weight(.semibold))
                Text(s.policyLabel ?? "Sin política").foregroundStyle(.secondary)
            }
            Section("Acceso") {
                Text("\(s.peopleCount) personas con acceso")
                if let doorId = s.doorId, let onOpenSchedules {
                    Button("Ver horarios de esta puerta") {
                        onOpenSchedules(doorId)
                    }
                } else if s.doorId != nil {
                    Text("onOpenSchedules no cableado — el root puede pasar el callback.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Section {
                Text("Reservas / cancelación: cablear IntegraSchedulesRepository (Data/Integra/Schedules).")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func reload() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }
        do {
            spaces = try await IntegraEspaciosDataStub.overview()
        } catch {
            errorText = error.localizedDescription
        }
    }
}
