import SwiftUI

/// Inventarios vistos desde la consola — GET `inventories`,
/// PATCH `inventories/{id}/status`, GET `inventories/{id}/report`,
/// POST `inventories/sync`.
///
/// No es la misma pantalla que `PortalInventoriesView`: aquella es lo que ve el
/// cliente de su propia sucursal; ésta es la bandeja del revisor, con los
/// cuatro botones de estado que Android pinta en `ConsoleClientsScreen`
/// (Pend. / Real. / Aprobar / Rech.) y el alta manual que sólo tenía la web.
struct PortalConsoleInventoriesView: View {
    @State private var items: [PortalConsoleInventory] = []
    @State private var clients: [[String: Any]] = []
    @State private var isLoading = true
    @State private var busyId: Int64?
    @State private var error: String?
    @State private var message: String?

    @State private var statusFilter = ""
    @State private var clientFilter: Int64?
    @State private var onlyWithDifference = false

    @State private var reportData: Data?
    @State private var showSyncSheet = false

    /// Los cuatro estados que acepta el controlador. Cualquier otro devuelve 400.
    private static let statuses = ["PENDING", "COMPLETED", "APPROVED", "REJECTED"]

    private var visibleItems: [PortalConsoleInventory] {
        onlyWithDifference ? items.filter(\.hasDifference) : items
    }

    var body: some View {
        VStack(spacing: 0) {
            filterBar
            if let error { banner(error, color: .red) }
            if let message { banner(message, color: .green) }

            if isLoading {
                Spacer(); ProgressView("Cargando inventarios…"); Spacer()
            } else if visibleItems.isEmpty {
                // Vacío escrito a mano en vez de `ContentUnavailableView`: ese
                // es iOS 17 y el `deploymentTarget` del proyecto sigue en 16.
                Spacer()
                VStack(spacing: 8) {
                    Image(systemName: "archivebox")
                        .font(.largeTitle).foregroundColor(.secondary)
                    Text("Sin inventarios").font(.headline)
                    Text("No hay inventarios con los filtros actuales.")
                        .font(.footnote).foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding()
                Spacer()
            } else {
                List(visibleItems) { inv in
                    inventoryRow(inv)
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Inventarios (consola)")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showSyncSheet = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Nuevo inventario")
            }
        }
        .task { await loadAll() }
        .refreshable { await reload() }
        .sheet(isPresented: $showSyncSheet) {
            NavigationStack {
                PortalInventorySyncSheet(clients: clients) { created in
                    showSyncSheet = false
                    if created { Task { await reload() } }
                }
            }
        }
        .sheet(item: Binding(
            get: { reportData.map { PortalInventoryDocItem(data: $0) } },
            set: { reportData = $0?.data }
        )) { item in
            NavigationStack { PDFViewerScreen(title: "Inventario", data: item.data) }
        }
    }

    // MARK: Subvistas

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Menu {
                    Button("Todos los estados") { statusFilter = ""; Task { await reload() } }
                    ForEach(Self.statuses, id: \.self) { s in
                        Button(Self.statusLabel(s)) { statusFilter = s; Task { await reload() } }
                    }
                } label: {
                    filterChip(statusFilter.isEmpty ? "Estado: todos" : "Estado: \(Self.statusLabel(statusFilter))")
                }

                Menu {
                    Button("Todos los clientes") { clientFilter = nil; Task { await reload() } }
                    ForEach(clients.indices, id: \.self) { i in
                        let c = clients[i]
                        let id = ConsoleHelpers.mapInt64(c, "id")
                        Button(ConsoleHelpers.mapStr(c, "name", "nombre")) {
                            clientFilter = id
                            Task { await reload() }
                        }
                    }
                } label: {
                    filterChip(clientFilter == nil ? "Cliente: todos" : "Cliente: \(currentClientName)")
                }

                Button { onlyWithDifference.toggle() } label: {
                    filterChip(onlyWithDifference ? "Sólo con diferencia ✓" : "Sólo con diferencia")
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
    }

    private func filterChip(_ text: String) -> some View {
        Text(text)
            .font(.caption).bold()
            .padding(.horizontal, 12).padding(.vertical, 6)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(Capsule())
    }

    private func banner(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.footnote).foregroundColor(color)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal).padding(.bottom, 6)
    }

    private func inventoryRow(_ inv: PortalConsoleInventory) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(inv.displayTitle).font(.headline)
            if !inv.subtitle.isEmpty {
                Text(inv.subtitle).font(.caption).foregroundColor(.secondary)
            }

            HStack(spacing: 8) {
                OpsStatusChip(text: Self.statusLabel(inv.status))
                Text("\(inv.previousCount) → \(inv.currentCount)")
                    .font(.caption).foregroundColor(.secondary)
                Text(inv.deltaLabel)
                    .font(.caption).bold()
                    .foregroundColor(inv.hasDifference ? .orange : .secondary)
            }

            if !inv.updatedAt.isEmpty {
                Text(inv.updatedAt.prefix(16).replacingOccurrences(of: "T", with: " "))
                    .font(.caption2).foregroundColor(.secondary)
            }

            // Los cuatro estados + el PDF, igual que Android. Se deshabilita el
            // estado en el que ya está para no mandar un PATCH que no cambia nada.
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Self.statuses, id: \.self) { s in
                        Button(Self.statusShortLabel(s)) {
                            Task { await patch(inv, status: s) }
                        }
                        .buttonStyle(.bordered)
                        .tint(Self.statusTint(s))
                        .disabled(busyId == inv.id || inv.normalizedStatus == s)
                    }
                    Button {
                        Task { await openReport(inv) }
                    } label: {
                        Label("PDF", systemImage: "doc.richtext")
                    }
                    .buttonStyle(.bordered)
                    .disabled(busyId == inv.id)
                }
            }

            if busyId == inv.id { ProgressView().padding(.top, 2) }
        }
        .padding(.vertical, 6)
    }

    private var currentClientName: String {
        guard let id = clientFilter else { return "todos" }
        for c in clients where ConsoleHelpers.mapInt64(c, "id") == id {
            return ConsoleHelpers.mapStr(c, "name", "nombre")
        }
        return String(id)
    }

    // MARK: Etiquetas

    private static func statusLabel(_ raw: String) -> String {
        switch raw.uppercased() {
        case "PENDING": return "Pendiente"
        case "COMPLETED": return "Realizado"
        case "APPROVED": return "Aprobado"
        case "REJECTED": return "Rechazado"
        default: return raw.isEmpty ? "—" : raw
        }
    }

    private static func statusShortLabel(_ raw: String) -> String {
        switch raw.uppercased() {
        case "PENDING": return "Pend."
        case "COMPLETED": return "Real."
        case "APPROVED": return "Aprobar"
        case "REJECTED": return "Rech."
        default: return raw
        }
    }

    private static func statusTint(_ raw: String) -> Color {
        switch raw.uppercased() {
        case "APPROVED": return .green
        case "REJECTED": return .red
        case "COMPLETED": return .blue
        default: return .gray
        }
    }

    // MARK: Carga y acciones

    private func loadAll() async {
        // El listado de clientes sólo alimenta el filtro y la hoja de alta; si
        // el rol no puede verlo, la pantalla sigue siendo usable sin él.
        clients = (try? await ConsoleRepository.shared.serviceClients()) ?? []
        await reload()
    }

    private func reload() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        items = await PortalExtraRepository.shared.consoleInventories(
            clientId: clientFilter,
            status: statusFilter.nilIfEmpty
        )
    }

    private func patch(_ inv: PortalConsoleInventory, status: String) async {
        busyId = inv.id
        error = nil
        message = nil
        defer { busyId = nil }
        do {
            let updated = try await PortalExtraRepository.shared
                .updateInventoryStatus(id: inv.id, status: status)
            // Reemplazo en sitio: recargar la lista entera perdería el scroll.
            if let idx = items.firstIndex(where: { $0.id == inv.id }) {
                items[idx] = updated.id == 0 ? inv : updated
            }
            message = "Inventario \(inv.id): \(Self.statusLabel(status))"
            if updated.id == 0 { await reload() }
        } catch {
            self.error = error.toUserMessage()
        }
    }

    private func openReport(_ inv: PortalConsoleInventory) async {
        busyId = inv.id
        error = nil
        defer { busyId = nil }
        do {
            reportData = try await PortalExtraRepository.shared.consoleInventoryReportPdf(id: inv.id)
        } catch {
            self.error = error.toUserMessage()
        }
    }
}

// MARK: - Alta manual de inventario

/// POST `inventories/sync` — alta/actualización manual. El endpoint exige
/// `clientId` y `branchId`; sin los dos devuelve 400, así que el botón de
/// guardar sólo se habilita cuando ambos están elegidos.
struct PortalInventorySyncSheet: View {
    let clients: [[String: Any]]
    let onDone: (Bool) -> Void

    @State private var clientId: Int64?
    @State private var branchId: Int64?
    @State private var branches: [[String: Any]] = []
    @State private var loadingBranches = false
    @State private var title = ""
    @State private var notes = ""
    @State private var completed = false
    @State private var saving = false
    @State private var error: String?

    private var canSave: Bool { clientId != nil && branchId != nil && !saving }

    var body: some View {
        Form {
            if let error {
                Section { Text(error).foregroundColor(.red).font(.footnote) }
            }

            Section("Destino") {
                Picker("Cliente", selection: Binding(
                    get: { clientId ?? -1 },
                    set: { newValue in
                        clientId = newValue < 0 ? nil : newValue
                        branchId = nil
                        Task { await loadBranches() }
                    }
                )) {
                    Text("Elegir…").tag(Int64(-1))
                    ForEach(clients.indices, id: \.self) { i in
                        let c = clients[i]
                        Text(ConsoleHelpers.mapStr(c, "name", "nombre"))
                            .tag(ConsoleHelpers.mapInt64(c, "id") ?? Int64(-1))
                    }
                }

                if loadingBranches {
                    HStack { ProgressView(); Text("Cargando sucursales…").font(.caption) }
                } else {
                    Picker("Sucursal", selection: Binding(
                        get: { branchId ?? -1 },
                        set: { branchId = $0 < 0 ? nil : $0 }
                    )) {
                        Text("Elegir…").tag(Int64(-1))
                        ForEach(branches.indices, id: \.self) { i in
                            let b = branches[i]
                            Text(ConsoleHelpers.mapStr(b, "name", "nombre"))
                                .tag(ConsoleHelpers.mapInt64(b, "id") ?? Int64(-1))
                        }
                    }
                    .disabled(clientId == nil)
                }
            }

            Section("Detalle") {
                TextField("Título", text: $title)
                TextField("Notas", text: $notes, axis: .vertical).lineLimit(2...5)
                Toggle("Marcar como realizado", isOn: $completed)
            }

            Section {
                Button(saving ? "Guardando…" : "Guardar inventario") {
                    Task { await save() }
                }
                .disabled(!canSave)
            }
        }
        .navigationTitle("Nuevo inventario")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancelar") { onDone(false) }
            }
        }
    }

    private func loadBranches() async {
        guard let id = clientId else { branches = []; return }
        loadingBranches = true
        defer { loadingBranches = false }
        branches = await ExtraRepository.shared.serviceClientBranches(serviceClientId: String(id))
    }

    private func save() async {
        guard let clientId, let branchId else { return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            _ = try await PortalExtraRepository.shared.syncConsoleInventory(
                clientId: clientId,
                branchId: branchId,
                title: title.nilIfEmpty,
                notes: notes.nilIfEmpty,
                completed: completed
            )
            onDone(true)
        } catch {
            self.error = error.toUserMessage()
        }
    }
}

/// Envoltorio identificable para presentar el PDF en una hoja.
private struct PortalInventoryDocItem: Identifiable {
    let id = UUID()
    let data: Data
}
