import SwiftUI

/// Textos e iconos del padrón como en Android (`ClientSector.shortLabel` y su
/// glifo): «Proyecto», «Corporativos», «Comerciales»; carpeta, edificio y maletín.
extension ClientSector {
    var padronEtiqueta: String {
        switch self {
        case .proyecto: return "Proyecto"
        case .corporativo: return "Corporativos"
        case .comercial: return "Comerciales"
        }
    }

    var padronSimbolo: String {
        switch self {
        case .proyecto: return "folder"
        case .corporativo: return "building.2"
        case .comercial: return "briefcase"
        }
    }
}

/// Clientes de Core (`/erp/clientes`) — igual que `ClientsListScreen` de Android:
/// buscador arriba, chips de sector con icono (si ves más de uno), la ayuda del
/// sector con su conteo, filas-tarjeta con el encargado (o «Inactivo» / «Ver»)
/// y el botón flotante «Nuevo cliente» solo con `puedeAgregar`.
///
/// La barra teal con «Clientes» la pone quien abre la pantalla; la ficha
/// («Cliente») y el alta («Nuevo cliente») llevan la suya desde aquí.
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

    /// Solo dirección general y super admin ven de quién es cada cliente.
    private var showOwner: Bool {
        CoreOrg.isCeo(session.currentUser?.email)
            || session.currentUser?.isSuperAdmin == true
    }

    /// Búsqueda por nombre, razón social, RFC o encargado (la de la web).
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
                ScrollView {
                    NxEmptyState(
                        title: "Sin acceso al padrón",
                        subtitle: "Tu correo no tiene sectores de clientes asignados."
                    )
                    .padding(.horizontal, NxSpacing.l)
                }
            } else {
                lista
                    .nxFab("Nuevo cliente", systemImage: "plus", visible: permisos.puedeAgregar) {
                        showNuevo = true
                    }
            }
        }
        .nxScreenBackground()
        .navigationDestination(item: $openClientId) { id in
            ClienteDetailView(clientId: id) {
                Task { await load(refresh: true) }
            }
            .nxBrandNavBar(title: "Cliente")
        }
        .navigationDestination(isPresented: $showNuevo) {
            ClienteNuevoView(presetSector: sector) { createdId in
                // Como la web y Android: del alta se sale a la ficha recién creada.
                showNuevo = false
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                    openClientId = createdId
                }
                Task { await load(refresh: true) }
            }
            .nxBrandNavBar(title: "Nuevo cliente")
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
            Task { await load() }
        }
    }

    private func loadPermisos() async {
        // Un fallo aquí no tumba la lista: se queda lo que ya había.
        if let fresh = try? await ClientesRepository.shared.permissions() {
            permisos = fresh
        }
    }

    // MARK: Lista

    private var lista: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: NxSpacing.m) {
                NxSearchField(text: $query, placeholder: "Buscar nombre, RFC o razón social")

                if allowed.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: NxSpacing.s) {
                            ForEach(allowed) { s in
                                NxFiltroChipM3(
                                    label: s.padronEtiqueta,
                                    systemImage: s.padronSimbolo,
                                    selected: sector == s
                                ) {
                                    if sector != s { sector = s }
                                }
                            }
                        }
                    }
                }

                if let sector {
                    HStack(alignment: .center, spacing: 0) {
                        Text(sector.help)
                            .font(NxType.bodySmall)
                            .foregroundStyle(NxColors.muted)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.trailing, NxSpacing.s)
                        Text(loading ? "…" : "\(visible.count)")
                            .font(.system(size: 12.5, weight: .semibold))
                            .foregroundStyle(NxColors.fg)
                    }
                }

                if let error {
                    if items.isEmpty {
                        NxErrorBlock(message: error) { Task { await load() } }
                    } else {
                        NxRefreshErrorBanner(message: error, onRetry: { Task { await load(refresh: true) } })
                    }
                }

                contenido
            }
            .padding(.horizontal, NxSpacing.l)
            .padding(.top, NxSpacing.l)
            // Espacio para que el botón «Nuevo cliente» no tape la última fila.
            .padding(.bottom, 96)
        }
        .scrollDismissesKeyboard(.interactively)
        .refreshable {
            await loadPermisos()
            await load(refresh: true)
        }
    }

    @ViewBuilder
    private var contenido: some View {
        if loading {
            NxSkeletonList()
        } else if error != nil && items.isEmpty {
            EmptyView()
        } else if !items.isEmpty && visible.isEmpty {
            NxEmptyState(
                title: "Sin coincidencias",
                subtitle: "Ningún cliente de este sector coincide con «\(query.trimmingCharacters(in: .whitespacesAndNewlines))».",
                actionLabel: "Limpiar búsqueda",
                onAction: { query = "" }
            )
        } else if visible.isEmpty {
            if permisos.puedeAgregar {
                NxEmptyState(
                    title: "Nadie en este sector todavía",
                    subtitle: "Da de alta el primer cliente del sector.",
                    actionLabel: "Crear el primero",
                    onAction: { showNuevo = true }
                )
            } else {
                NxEmptyState(
                    title: "Nadie en este sector todavía",
                    subtitle: "Aún no hay clientes dados de alta en este sector."
                )
            }
        } else {
            ForEach(visible) { c in fila(c) }
        }
    }

    private func fila(_ c: CoreSalesClient) -> some View {
        let fiscal = [c.taxId, c.legalName]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
        let ownerName = (c.owner?.nombre ?? "")
            .split(whereSeparator: { $0.isWhitespace })
            .prefix(2)
            .joined(separator: " ")
        let encargado = ownerName.isEmpty ? "Sin encargado" : ownerName
        let sectores = c.clientSectors.map(\.padronEtiqueta).joined(separator: " · ")
        // El chip dice «Inactivo»: el encargado baja a esta línea.
        let meta = [sectores, (c.isInactive && showOwner) ? encargado : ""]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
        let chip: String = c.isInactive ? "Inactivo" : (showOwner ? encargado : "Ver")
        let nombre = c.name.trimmingCharacters(in: .whitespaces)
        return NxListRow(
            title: nombre.isEmpty ? "Sin nombre" : nombre,
            subtitle: fiscal.isEmpty ? "Sin datos fiscales" : fiscal,
            meta: meta.isEmpty ? nil : meta,
            chipText: chip,
            chipTone: c.isInactive ? .warning : .neutral,
            onClick: { openClientId = c.id }
        )
        .accessibilityHint("Abre la ficha del cliente")
    }

    // MARK: Datos

    /// `refresh`: deslizar o volver de la ficha. La lista se queda a la vista
    /// mientras llega la nueva y, si falla, no se borra.
    private func load(refresh: Bool = false) async {
        guard let requested = sector else {
            loading = false
            items = []
            return
        }
        if !refresh { loading = true }
        error = nil
        do {
            let rows = try await ClientesRepository.shared.list(sector: requested)
            guard sector == requested else { return }
            items = rows
        } catch {
            guard sector == requested else { return }
            if !refresh { items = [] }
            self.error = error.toUserMessage(fallback: "No se pudieron cargar los clientes")
        }
        loading = false
    }
}
