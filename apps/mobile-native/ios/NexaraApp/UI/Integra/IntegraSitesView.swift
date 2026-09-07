import SwiftUI

/// Sitios INTEGRA — lista real + selección de alcance (`IntegraSiteScope`).
/// Paridad operativa con la barra de sitios Android / ajustes de consulta.
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
                Text("Sitio activo: \(vm.selectedLabel)")
                    .font(.subheadline.weight(.semibold))
                if let sync = vm.syncLabel {
                    Text("Última reconciliación: \(sync)")
                        .font(.caption)
                        .foregroundColor(vm.syncStale ? .orange : .secondary)
                } else if !vm.loading {
                    Text("Sin fecha de reconciliación del espejo.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Text("Al elegir un sitio, el resto de pantallas INTEGRA consulta ese alcance.")
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }

            if let message = vm.message {
                Section {
                    NxAlertBanner(alert: NxAlert(id: "msg", title: message, tone: .success))
                }
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

            Section {
                Button {
                    vm.select(nil)
                } label: {
                    HStack {
                        Text("Predeterminado del servidor")
                        Spacer()
                        if vm.selectedId == nil {
                            Image(systemName: "checkmark.circle.fill").foregroundColor(.teal)
                        }
                    }
                }
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
                    Button { vm.select(Int(site.id)) } label: {
                        siteRow(site)
                    }
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
        let selected = vm.selectedId.map { String($0) } == site.id

        return HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(name).font(.subheadline.weight(.semibold)).foregroundColor(.primary)
                    if isDefault {
                        NxStatusChip(text: "Predeterminado", tone: .brand)
                    }
                    if selected {
                        NxStatusChip(text: "Activo ahora", tone: .info)
                    }
                }
                if !region.isEmpty {
                    Text(region).font(.caption).foregroundColor(.secondary)
                }
                Text("ID \(site.id)").font(.caption2).foregroundColor(.secondary)
            }
            Spacer()
            if selected {
                Image(systemName: "checkmark.circle.fill").foregroundColor(.teal)
            } else if let active {
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
    @Published var message: String?
    @Published var selectedId: Int? = IntegraSiteScope.current
    @Published var syncLabel: String?
    @Published var syncStale = false

    private let repo = IntegraRepository.shared

    var selectedLabel: String {
        guard let id = selectedId else { return "Predeterminado del servidor" }
        if let hit = items.first(where: { $0.id == String(id) }) {
            return IntegraDict.str(hit.raw, "name", "label", "siteName").nilIfEmpty ?? "Sitio \(id)"
        }
        return "Sitio \(id)"
    }

    var filtered: [IntegraRow] {
        items.filter {
            IntegraDict.matchesQuery(
                $0.raw, query: query,
                "name", "label", "siteName", "region", "regionName", "location"
            )
        }
    }

    func select(_ siteId: Int?) {
        let value = siteId.flatMap { $0 > 0 ? $0 : nil }
        repo.selectSite(value)
        selectedId = IntegraSiteScope.current
        message = value == nil
            ? "Usando el sitio predeterminado del servidor"
            : "Sitio \(selectedLabel) seleccionado"
        Task { await loadSync() }
    }

    func refresh(initial: Bool = true) async {
        if initial && items.isEmpty { loading = true }
        error = nil
        selectedId = IntegraSiteScope.current
        do {
            let rows = try await repo.sites()
            items = rows.enumerated().map { idx, raw in
                let id = IntegraDict.str(raw, "id", "siteId").nilIfEmpty ?? "site-\(idx)"
                return IntegraRow(id: id, raw: raw)
            }
            await loadSync()
            loading = false
        } catch {
            loading = false
            self.error = error.toUserMessage(fallback: "No se pudieron cargar los sitios")
        }
    }

    private func loadSync() async {
        let syncMap = (try? await repo.lastSync()) ?? [:]
        let dash = (try? await repo.dashboard()) ?? [:]
        let raw = IntegraDict.str(dash, "lastSync", "lastSyncAt").nilIfEmpty
            ?? IntegraDict.str(syncMap, "lastSync", "lastSyncAt", "at").nilIfEmpty
        if let ms = IntegraCoreFormat.parseMs(raw) {
            let age = IntegraCoreFormat.syncAge(lastSyncMs: ms)
            syncLabel = age.label
            syncStale = age.stale
        } else {
            syncLabel = nil
            syncStale = false
        }
    }
}
