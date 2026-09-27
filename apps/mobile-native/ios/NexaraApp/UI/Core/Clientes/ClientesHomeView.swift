import SwiftUI

/// Clientes de Core (`/erp/clientes`): un padrón, tres usos. Pestañas por
/// sector según `clientSectorsForEmail`, búsqueda por nombre, RFC o encargado
/// y alta con «Nuevo cliente» (solo con `puedeAgregar`).
struct ClientesHomeView: View {
    /// Deep link `/erp/clientes/:id`.
    var initialClientId: Int? = nil
    /// `?sector=proyecto|corporativo|comercial`.
    var initialSectorSlug: String? = nil

    @EnvironmentObject var session: SessionStore
    @State private var sector: ClientSector?
    @State private var items: [CoreSalesClient] = []
    @State private var loading = true
    @State private var error: String?
    @State private var query = ""
    @State private var openClientId: Int?
    @State private var showNuevo = false
    @State private var didApplyInitial = false
    /// Hasta confirmar con el API nadie ve «Nuevo cliente».
    @State private var permisos = CoreClientPermissions.ninguno

    private var allowed: [ClientSector] { ClientSector.sectors(for: session.currentUser?.email) }

    /// Como la web: dirección general y superadmin ven al encargado en la fila.
    private var showOwner: Bool {
        CoreOrg.isCeo(session.currentUser?.email)
            || session.currentUser?.isSuperAdmin == true
    }

    private var visible: [CoreSalesClient] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return items }
        return items.filter { c in
            c.name.lowercased().contains(q)
                || (c.legalName ?? "").lowercased().contains(q)
                || (c.taxId ?? "").lowercased().contains(q)
                || (c.owner?.nombre ?? "").lowercased().contains(q)
        }
    }

    var body: some View {
        Group {
            if allowed.isEmpty {
                ContentUnavailableView(
                    "Sin acceso",
                    systemImage: "lock",
                    description: Text("No tienes acceso al módulo de clientes.")
                )
            } else {
                list
            }
        }
        .navigationTitle("Clientes")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                if permisos.puedeAgregar {
                    Button("Nuevo cliente") { showNuevo = true }
                        .disabled(sector == nil)
                }
            }
        }
        .navigationDestination(item: $openClientId) { id in
            ClienteDetailView(clientId: id) {
                Task { await load() }
            }
        }
        .navigationDestination(isPresented: $showNuevo) {
            ClienteNuevoView(presetSector: sector) { createdId in
                showNuevo = false
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                    openClientId = createdId
                }
                Task { await load() }
            }
        }
        .task {
            if !didApplyInitial {
                didApplyInitial = true
                if let initialClientId, initialClientId > 0 { openClientId = initialClientId }
                let slug = (initialSectorSlug ?? "").lowercased()
                let preset = allowed.first { $0.slug == slug || $0.rawValue.lowercased() == slug }
                let first = preset ?? allowed.first
                if sector != first {
                    sector = first
                    return
                }
            }
            await load()
        }
        .task { await loadPermisos() }
        .onChange(of: sector) { _, _ in
            items = []
            Task { await load() }
        }
    }

    private func loadPermisos() async {
        permisos = (try? await ClientesRepository.shared.permissions()) ?? .ninguno
    }

    private var list: some View {
        List {
            if allowed.count > 1 {
                Section {
                    Picker("Sector", selection: $sector) {
                        ForEach(allowed) { s in
                            // Segmentado: UISegmentedControl no pinta icono + texto a la vez.
                            Text(s.shortTitle).tag(Optional(s))
                        }
                    }
                    .pickerStyle(.segmented)
                }
            } else if let sector {
                Section {
                    Label(sector.title, systemImage: sector.symbol)
                        .symbolRenderingMode(.hierarchical)
                        .font(.subheadline.weight(.semibold))
                }
            }

            if let sector {
                Section {
                    HStack(alignment: .top) {
                        Text(sector.help).font(.caption).foregroundColor(.secondary)
                        Spacer()
                        Text(loading ? "…" : "\(visible.count)")
                            .font(.caption.monospacedDigit())
                            .foregroundColor(.secondary)
                    }
                }
            }

            if let error, !items.isEmpty {
                Section {
                    NxStaleBanner(message: error) { Task { await load() } }
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
            }

            if loading && items.isEmpty {
                Section { NxSkeletonRows(count: 5) }
            } else if let error, items.isEmpty {
                Section {
                    NxErrorState(message: error) { Task { await load() } }
                }
            } else if visible.isEmpty {
                Section {
                    NxEmptyState(
                        title: query.isEmpty ? "Nadie en este sector todavía" : "Sin coincidencias",
                        subtitle: query.isEmpty
                            ? "Cuando se registre un cliente aparecerá aquí."
                            : "Prueba con otro nombre, RFC o encargado.",
                        systemImage: query.isEmpty ? "person.2" : "magnifyingglass",
                        actionLabel: query.isEmpty && permisos.puedeAgregar ? "Crear el primero" : nil,
                        onAction: { showNuevo = true }
                    )
                }
            } else {
                Section {
                    ForEach(visible) { c in
                        Button { openClientId = c.id } label: { row(c) }
                            .buttonStyle(.plain)
                    }
                }
            }
        }
        .searchable(text: $query, prompt: "Buscar nombre, RFC…")
        .refreshable {
            await loadPermisos()
            await load()
        }
    }

    private func row(_ c: CoreSalesClient) -> some View {
        let fiscal = [c.taxId, c.legalName]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
        let ownerName = (c.owner?.nombre ?? "")
            .split(separator: " ")
            .prefix(2)
            .joined(separator: " ")
        return HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(c.name).font(.subheadline.weight(.semibold))
                    if c.isInactive {
                        CoreChip(text: "Inactivo")
                    }
                }
                Text(fiscal.isEmpty ? "Sin datos fiscales" : fiscal)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
                if !c.clientSectors.isEmpty {
                    Text(c.clientSectors.map(\.shortTitle).joined(separator: " · "))
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            Spacer(minLength: 8)
            if showOwner {
                Text(ownerName.isEmpty ? "Sin encargado" : ownerName)
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color(.tertiarySystemFill), in: Capsule())
            }
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
                .padding(.top, 2)
                .accessibilityHidden(true)
        }
        .frame(minHeight: NxMetrics.minTap)
        .contentShape(Rectangle())
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Abre la ficha del cliente")
    }

    private func load() async {
        guard let requested = sector else {
            loading = false
            return
        }
        loading = true
        error = nil
        do {
            let rows = try await ClientesRepository.shared.list(sector: requested)
            guard sector == requested else { return }
            items = rows
        } catch {
            guard sector == requested else { return }
            self.error = error.toUserMessage(fallback: "No se pudieron cargar los clientes")
        }
        loading = false
    }
}
