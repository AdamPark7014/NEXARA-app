import SwiftUI

/// Ocupación deducida del día (no conteo óptico). Paridad `IntegraOccupancyScreen`.
private let integraOccupancyPage = 40

struct IntegraOccupancyView: View {
    @StateObject private var vm = IntegraOccupancyVM()

    var body: some View {
        Group {
            if vm.loading && vm.items.isEmpty {
                ProgressView("Cargando presencia…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = vm.error, vm.items.isEmpty {
                NxEmptyState(title: "No se pudo cargar", subtitle: error, actionLabel: "Reintentar") {
                    Task { await vm.refresh() }
                }
            } else {
                listBody
            }
        }
        .navigationTitle("En sitio")
        .task { await vm.refresh() }
        .refreshable { await vm.refresh(initial: false) }
    }

    private var listBody: some View {
        let matching = vm.filtered
        let shown = Array(matching.prefix(vm.limit))

        return List {
            Section {
                NxKpiGrid(items: [
                    NxKpi(label: "En sitio", value: "\(vm.total)", tone: .brand),
                    NxKpi(label: "Día", value: vm.day.nilIfEmpty ?? "hoy", tone: .info),
                ])
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                .listRowBackground(Color.clear)

                if !vm.note.isEmpty {
                    NxAlertBanner(alert: NxAlert(
                        id: "note",
                        title: vm.note,
                        subtitle: "Ocupación deducida por accesos, no por sensores ópticos.",
                        tone: .info
                    ))
                } else {
                    Text("Ocupación deducida por accesos del día, no por sensores ópticos. Este ACS no emite salida.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Section {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Persona o zona", text: $vm.query)
                        .autocorrectionDisabled()
                        .onChange(of: vm.query) { _, _ in vm.limit = integraOccupancyPage }
                }
                Text("Mostrando \(shown.count) de \(matching.count)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if shown.isEmpty {
                Section {
                    NxEmptyState(
                        title: "Nadie en sitio",
                        subtitle: "No hay presencia deducida para hoy en este sitio."
                    )
                }
            } else {
                ForEach(shown) { row in
                    occupancyRow(row)
                }
                if matching.count > vm.limit {
                    Section {
                        Button("Ver más") { vm.limit += integraOccupancyPage }
                    }
                }
            }
        }
    }

    private func occupancyRow(_ row: IntegraRow) -> some View {
        let name = IntegraDict.str(row.raw, "personName", "name").nilIfEmpty ?? row.id
        let door = IntegraDict.str(row.raw, "doorName", "lastDoor", "location")
        let since = IntegraDict.str(row.raw, "since", "firstIn", "checkIn", "occurredAt")

        return VStack(alignment: .leading, spacing: 4) {
            Text(name).font(.subheadline.weight(.semibold))
            if !door.isEmpty {
                Text(door).font(.caption).foregroundColor(.secondary)
            }
            if !since.isEmpty {
                Text("Desde \(since)").font(.caption2).foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

@MainActor
final class IntegraOccupancyVM: ObservableObject {
    @Published var items: [IntegraRow] = []
    @Published var total = 0
    @Published var day = ""
    @Published var note = ""
    @Published var query = ""
    @Published var limit = integraOccupancyPage
    @Published var loading = true
    @Published var error: String?

    private let repo = IntegraRepository.shared

    var filtered: [IntegraRow] {
        items.filter {
            IntegraDict.matchesQuery(
                $0.raw, query: query,
                "personName", "name", "doorName", "lastDoor", "location"
            )
        }
    }

    func refresh(initial: Bool = true) async {
        if initial && items.isEmpty { loading = true }
        error = nil
        do {
            let result = try await repo.occupancy()
            total = result.total
            day = result.day
            note = result.note
            items = result.items.enumerated().map { idx, raw in
                let id = IntegraDict.str(raw, "personId", "id", "personName").nilIfEmpty ?? "occ-\(idx)"
                return IntegraRow(id: "\(id)-\(idx)", raw: raw)
            }
            loading = false
        } catch {
            loading = false
            self.error = error.toUserMessage(fallback: "No se pudo cargar la ocupación")
        }
    }
}
