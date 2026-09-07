import SwiftUI

/// Inventario de equipos ACS. Caídos primero; paginación local. Paridad `IntegraDevicesScreen`.
private let integraDevicePage = 40

struct IntegraDevicesView: View {
    @StateObject private var vm = IntegraDevicesVM()

    var body: some View {
        Group {
            if vm.loading && vm.items.isEmpty {
                ProgressView("Cargando equipos…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = vm.error, vm.items.isEmpty {
                NxEmptyState(title: "No se pudieron cargar", subtitle: error, actionLabel: "Reintentar") {
                    Task { await vm.refresh() }
                }
            } else {
                listBody
            }
        }
        .navigationTitle("Equipos")
        .task { await vm.refresh() }
        .refreshable { await vm.refresh(initial: false) }
    }

    private var listBody: some View {
        let matching = vm.filtered
        let shown = Array(matching.prefix(vm.limit))
        let online = vm.items.filter { IntegraDict.bool($0.raw, "online") != false }.count
        let offline = max(0, vm.items.count - online)

        return List {
            Section {
                NxKpiGrid(items: [
                    NxKpi(label: "Equipos", value: "\(vm.items.count)", tone: .brand),
                    NxKpi(
                        label: "En línea",
                        value: "\(online)",
                        hint: offline > 0 ? "\(offline) caídos" : nil,
                        tone: offline > 0 ? .warning : .success
                    ),
                ])
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                .listRowBackground(Color.clear)

                HStack {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Nombre, IP o modelo", text: $vm.query)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onChange(of: vm.query) { _, _ in vm.limit = integraDevicePage }
                }
                Text("Mostrando \(shown.count) de \(matching.count)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if shown.isEmpty {
                Section {
                    NxEmptyState(
                        title: "Sin equipos",
                        subtitle: "No hay dispositivos ACS en el inventario de este sitio."
                    )
                }
            } else {
                ForEach(shown) { device in
                    deviceRow(device)
                }
                if matching.count > vm.limit {
                    Section {
                        Button("Ver más equipos") { vm.limit += integraDevicePage }
                    }
                }
            }
        }
    }

    private func deviceRow(_ device: IntegraRow) -> some View {
        let name = IntegraDict.str(device.raw, "name", "deviceName").nilIfEmpty ?? device.id
        let ip = IntegraDict.str(device.raw, "ip", "deviceIp", "host")
        let model = IntegraDict.str(device.raw, "model", "devType", "type", "kind")
        let online = IntegraDict.bool(device.raw, "online")

        return HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(name).font(.subheadline.weight(.semibold))
                if !ip.isEmpty {
                    Text(ip).font(.caption).foregroundColor(.secondary)
                }
                if !model.isEmpty {
                    Text(model).font(.caption2).foregroundColor(.secondary)
                }
            }
            Spacer()
            NxStatusChip(
                text: online == false ? "Fuera de línea" : "En línea",
                tone: online == false ? .danger : .success
            )
        }
        .padding(.vertical, 2)
    }
}

@MainActor
final class IntegraDevicesVM: ObservableObject {
    @Published var items: [IntegraRow] = []
    @Published var query = ""
    @Published var limit = integraDevicePage
    @Published var loading = true
    @Published var error: String?

    private let repo = IntegraRepository.shared

    var filtered: [IntegraRow] {
        // Caídos primero — el inventario existe para encontrar lo que no contesta.
        items
            .filter {
                IntegraDict.matchesQuery(
                    $0.raw, query: query,
                    "name", "deviceName", "ip", "deviceIp", "host", "model", "devType", "type", "kind"
                )
            }
            .sorted { a, b in
                let ao = IntegraDict.bool(a.raw, "online") != false
                let bo = IntegraDict.bool(b.raw, "online") != false
                if ao != bo { return !ao && bo }
                let an = IntegraDict.str(a.raw, "name", "deviceName").lowercased()
                let bn = IntegraDict.str(b.raw, "name", "deviceName").lowercased()
                return an < bn
            }
    }

    func refresh(initial: Bool = true) async {
        if initial && items.isEmpty { loading = true }
        error = nil
        do {
            let rows = try await repo.devices()
            items = rows.enumerated().map { idx, raw in
                let id = IntegraDict.str(raw, "id", "deviceIndexCode", "serial").nilIfEmpty ?? "dev-\(idx)"
                return IntegraRow(id: id, raw: raw)
            }
            loading = false
        } catch {
            loading = false
            self.error = error.toUserMessage(fallback: "No se pudieron cargar los equipos")
        }
    }
}
