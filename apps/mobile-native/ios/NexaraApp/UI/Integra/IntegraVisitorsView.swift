import SwiftUI

/// Visitantes recurrentes. Paridad `IntegraVisitorsScreen` (lista recurrente).
struct IntegraVisitorsView: View {
    @StateObject private var vm = IntegraVisitorsVM()

    var body: some View {
        Group {
            if vm.loading && vm.items.isEmpty {
                ProgressView("Cargando visitantes…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = vm.error, vm.items.isEmpty {
                NxEmptyState(title: "No se pudieron cargar", subtitle: error, actionLabel: "Reintentar") {
                    Task { await vm.refresh() }
                }
            } else {
                listBody
            }
        }
        .navigationTitle("Visitantes")
        .task { await vm.refresh() }
        .refreshable { await vm.refresh(initial: false) }
    }

    private var listBody: some View {
        List {
            if !vm.note.isEmpty {
                Section {
                    NxAlertBanner(alert: NxAlert(id: "note", title: vm.note, tone: .info))
                }
            }

            Section {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Nombre, anfitrión o teléfono", text: $vm.query)
                        .autocorrectionDisabled()
                }
                Text("\(vm.filtered.count) de \(vm.items.count)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if vm.filtered.isEmpty {
                Section {
                    NxEmptyState(
                        title: "Sin visitantes",
                        subtitle: "No hay visitas recurrentes registradas en este sitio."
                    )
                }
            } else {
                ForEach(vm.filtered) { row in
                    visitorRow(row)
                }
            }
        }
    }

    private func visitorRow(_ row: IntegraRow) -> some View {
        let name = IntegraDict.str(row.raw, "visitorName", "name", "personName").nilIfEmpty ?? row.id
        let host = IntegraDict.str(row.raw, "hostName", "host")
        let phone = IntegraDict.str(row.raw, "phone")
        let weekdays = IntegraDict.str(row.raw, "weekdays", "days")
        let window = [
            IntegraDict.str(row.raw, "timeFrom", "from"),
            IntegraDict.str(row.raw, "timeTo", "to"),
        ].filter { !$0.isEmpty }.joined(separator: " – ")
        let valid = [
            IntegraDict.str(row.raw, "validFrom"),
            IntegraDict.str(row.raw, "validTo"),
        ].filter { !$0.isEmpty }.joined(separator: " → ")

        return VStack(alignment: .leading, spacing: 4) {
            Text(name).font(.subheadline.weight(.semibold))
            if !host.isEmpty {
                Text("Anfitrión: \(host)").font(.caption).foregroundColor(.secondary)
            }
            if !phone.isEmpty {
                Text(phone).font(.caption).foregroundColor(.secondary)
            }
            if !weekdays.isEmpty || !window.isEmpty {
                Text([weekdays, window].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            if !valid.isEmpty {
                Text(valid).font(.caption2).foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

@MainActor
final class IntegraVisitorsVM: ObservableObject {
    @Published var items: [IntegraRow] = []
    @Published var note = ""
    @Published var query = ""
    @Published var loading = true
    @Published var error: String?

    private let repo = IntegraRepository.shared

    var filtered: [IntegraRow] {
        items.filter {
            IntegraDict.matchesQuery(
                $0.raw, query: query,
                "visitorName", "name", "personName", "hostName", "host", "phone"
            )
        }
    }

    func refresh(initial: Bool = true) async {
        if initial && items.isEmpty { loading = true }
        error = nil
        do {
            let result = try await repo.recurringVisitors()
            note = result.note
            items = result.items.enumerated().map { idx, raw in
                let id = IntegraDict.str(raw, "id").nilIfEmpty ?? "vis-\(idx)"
                return IntegraRow(id: id, raw: raw)
            }
            loading = false
        } catch {
            loading = false
            self.error = error.localizedDescription
        }
    }
}
