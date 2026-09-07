import SwiftUI

/// Sitios INTEGRA (lista de consulta). Alta/baja profunda vive en ajustes cuando
/// el agente de datos cablee sync; aquí se listan sitios y se orienta al hub.
struct IntegraSitesView: View {
    @StateObject private var vm = IntegraSitesVM()
    var onOpenSettingsHint: (() -> Void)? = nil

    var body: some View {
        Group {
            if vm.loading && vm.items.isEmpty {
                ProgressView("Cargando sitios…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = vm.error, vm.items.isEmpty {
                NxEmptyState(title: "No se pudieron cargar", subtitle: error, actionLabel: "Reintentar") {
                    Task { await vm.refresh() }
                }
            } else {
                listBody
            }
        }
        .navigationTitle("Ajustes")
        .task { await vm.refresh() }
        .refreshable { await vm.refresh(initial: false) }
    }

    private var listBody: some View {
        List {
            Section {
                Text("Sitios vinculados al control de acceso. La sincronización y el alta/baja completa se cablean con la capa de datos.")
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }

            Section {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Nombre o región", text: $vm.query)
                        .autocorrectionDisabled()
                }
                Text("\(vm.filtered.count) de \(vm.items.count)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if vm.filtered.isEmpty {
                Section {
                    NxEmptyState(
                        title: "Sin sitios",
                        subtitle: "No hay sitios INTEGRA configurados todavía."
                    )
                }
            } else {
                ForEach(vm.filtered) { site in
                    siteRow(site)
                }
            }

            if onOpenSettingsHint != nil {
                Section {
                    Button("Volver al inicio INTEGRA") {
                        onOpenSettingsHint?()
                    }
                }
            }
        }
    }

    private func siteRow(_ site: IntegraRow) -> some View {
        let name = IntegraDict.str(site.raw, "name", "label", "siteName").nilIfEmpty ?? site.id
        let region = IntegraDict.str(site.raw, "region", "regionName", "location")
        let active = IntegraDict.bool(site.raw, "active", "enabled", "isDefault")
        let isDefault = IntegraDict.bool(site.raw, "isDefault", "default") == true

        return HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(name).font(.subheadline.weight(.semibold))
                    if isDefault {
                        NxStatusChip(text: "Predeterminado", tone: .brand)
                    }
                }
                if !region.isEmpty {
                    Text(region).font(.caption).foregroundColor(.secondary)
                }
                Text("ID \(site.id)").font(.caption2).foregroundColor(.secondary)
            }
            Spacer()
            if let active {
                NxStatusChip(
                    text: active ? "Activo" : "Inactivo",
                    tone: active ? .success : .neutral
                )
            }
        }
        .padding(.vertical, 2)
    }
}

@MainActor
final class IntegraSitesVM: ObservableObject {
    @Published var items: [IntegraRow] = []
    @Published var query = ""
    @Published var loading = true
    @Published var error: String?

    private let repo = IntegraRepository.shared

    var filtered: [IntegraRow] {
        items.filter {
            IntegraDict.matchesQuery(
                $0.raw, query: query,
                "name", "label", "siteName", "region", "regionName", "location"
            )
        }
    }

    func refresh(initial: Bool = true) async {
        if initial && items.isEmpty { loading = true }
        error = nil
        do {
            let rows = try await repo.sites()
            items = rows.enumerated().map { idx, raw in
                let id = IntegraDict.str(raw, "id", "siteId").nilIfEmpty ?? "site-\(idx)"
                return IntegraRow(id: id, raw: raw)
            }
            loading = false
        } catch {
            loading = false
            self.error = error.localizedDescription
        }
    }
}
