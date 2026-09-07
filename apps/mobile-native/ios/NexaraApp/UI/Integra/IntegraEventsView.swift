import SwiftUI

/// Bitácora ACS (push events). Paridad `IntegraEventsScreen`.
struct IntegraEventsView: View {
    @StateObject private var vm = IntegraEventsVM()

    var body: some View {
        Group {
            if vm.loading && vm.items.isEmpty {
                ProgressView("Cargando eventos…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = vm.error, vm.items.isEmpty {
                NxEmptyState(title: "No se pudieron cargar", subtitle: error, actionLabel: "Reintentar") {
                    Task { await vm.refresh() }
                }
            } else {
                listBody
            }
        }
        .navigationTitle("Eventos")
        .task { await vm.refresh() }
        .refreshable { await vm.refresh(initial: false) }
    }

    private var listBody: some View {
        List {
            Section {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Persona o dispositivo", text: $vm.query)
                        .autocorrectionDisabled()
                        .onSubmit { Task { await vm.refresh() } }
                }
                Picker("Resultado", selection: $vm.outcome) {
                    Text("Todos").tag("")
                    Text("Permitido").tag("granted")
                    Text("Denegado").tag("denied")
                }
                .onChange(of: vm.outcome) { _, _ in Task { await vm.refresh() } }
                Text("\(vm.filtered.count) eventos")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if vm.filtered.isEmpty {
                Section {
                    NxEmptyState(
                        title: "Sin eventos",
                        subtitle: "No hay eventos ACS en el rango consultado."
                    )
                }
            } else {
                ForEach(vm.filtered) { ev in
                    eventRow(ev)
                }
            }
        }
    }

    private func eventRow(_ ev: IntegraRow) -> some View {
        let label = IntegraDict.str(ev.raw, "label", "eventType", "title").nilIfEmpty ?? "Evento"
        let person = IntegraDict.str(ev.raw, "personName", "name")
        let door = IntegraDict.str(ev.raw, "doorName", "deviceName", "deviceIp")
        let when = IntegraDict.str(ev.raw, "occurredAt", "time", "createdAt")
        let outcome = IntegraDict.str(ev.raw, "outcome", "eventState").lowercased()
        let tone: NxTone = outcome.contains("denied") || outcome.contains("fail")
            ? .danger
            : (outcome.contains("grant") || outcome.contains("success") ? .success : .neutral)

        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(.subheadline.weight(.semibold))
                Spacer()
                if !outcome.isEmpty {
                    NxStatusChip(text: outcome, tone: tone)
                }
            }
            if !person.isEmpty {
                Text(person).font(.caption).foregroundColor(.secondary)
            }
            HStack {
                if !door.isEmpty {
                    Text(door).font(.caption2).foregroundColor(.secondary)
                }
                Spacer()
                if !when.isEmpty {
                    Text(when).font(.caption2).foregroundColor(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

@MainActor
final class IntegraEventsVM: ObservableObject {
    @Published var items: [IntegraRow] = []
    @Published var query = ""
    @Published var outcome = ""
    @Published var loading = true
    @Published var error: String?

    private let repo = IntegraRepository.shared

    var filtered: [IntegraRow] {
        items.filter {
            IntegraDict.matchesQuery(
                $0.raw, query: query,
                "personName", "name", "label", "doorName", "deviceName", "deviceIp"
            )
        }
    }

    func refresh(initial: Bool = true) async {
        if initial && items.isEmpty { loading = true }
        error = nil
        do {
            let page = try await repo.pushEvents(
                outcome: outcome.nilIfEmpty,
                personName: query.nilIfEmpty
            )
            items = page.items.enumerated().map { idx, raw in
                let id = IntegraDict.str(raw, "id").nilIfEmpty ?? "ev-\(idx)"
                return IntegraRow(id: id, raw: raw)
            }
            loading = false
        } catch {
            loading = false
            self.error = error.localizedDescription
        }
    }
}
