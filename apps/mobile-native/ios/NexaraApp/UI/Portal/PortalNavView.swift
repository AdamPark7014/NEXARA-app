import SwiftUI

/// Rutas del portal de clientes y sucursales — las de Android `TicketsNavHost`
/// (`TicketsRoutes`). Es la única parte de la app fuera de «solo ERP»: la ven
/// las cuentas cliente y sucursal.
enum PortalRoute: Hashable {
    case profile
    case branches
    case branchNew
    case branchEdit(Int64)
    case requests
    case requestNew
    case tickets
    case ticketDetail(Int64)
    case feedback
    case inventories
    case inventoryDetail(Int64)
    case services
    case help

    /// Título de la barra en el inicio del portal.
    static let homeTitle = "Portal"

    /// Títulos de Android (`TicketsNavHost`).
    var title: String {
        switch self {
        case .profile: return "Perfil"
        case .branches: return "Sucursales"
        case .branchNew: return "Nueva sucursal"
        case .branchEdit: return "Sucursal"
        case .requests: return "Solicitudes"
        case .requestNew: return "Nueva solicitud"
        case .tickets: return "Tickets"
        case .ticketDetail: return "Ticket"
        case .feedback: return "Confirmación"
        case .inventories: return "Inventarios"
        case .inventoryDetail: return "Inventario"
        case .services: return "Servicios"
        case .help: return "Ayuda"
        }
    }

    /// Módulo de un enlace (Android `TicketsRoutes.routeForModuleKey`); `nil` = inicio.
    static func forModuleKey(_ key: String) -> PortalRoute? {
        switch key {
        case "profile", "my-profile", "mi-perfil": return .profile
        case "branches", "sucursales": return .branches
        case "requests", "solicitudes": return .requests
        case "tickets", "client-tickets": return .tickets
        case "inventories", "inventarios": return .inventories
        case "feedback-pending", "feedback": return .feedback
        case "mis-servicios", "services", "my-services": return .services
        case "help", "ayuda", "centro-de-ayuda": return .help
        default: return nil
        }
    }
}

/// Pila del portal (Android `TicketsNavHost`): inicio con tarjetas de módulos,
/// barra clara con volver y cerrar sesión en todas las pantallas.
struct PortalNavView: View {
    let onExit: () -> Void
    @State private var path: [PortalRoute] = []
    @ObservedObject private var deepLink = DeepLinkCoordinator.shared

    var body: some View {
        NavigationStack(path: $path) {
            PortalHomeView(onExit: onExit, onNavigate: push)
                .portalChrome(PortalRoute.homeTitle)
                .navigationDestination(for: PortalRoute.self) { route in
                    destination(route)
                        .portalChrome(route.title)
                }
        }
        .environment(\.portalLogout, onExit)
        .onAppear { consumePortalDeepLink() }
        .onChange(of: deepLink.pending) { _, _ in consumePortalDeepLink() }
    }

    /// `navigate(…) { launchSingleTop = true }`: no apila dos veces la misma pantalla.
    private func push(_ route: PortalRoute) {
        guard path.last != route else { return }
        path.append(route)
    }

    @ViewBuilder
    private func destination(_ route: PortalRoute) -> some View {
        switch route {
        case .profile:
            PortalProfileView()
        case .branches:
            PortalBranchesView(
                onCreate: { push(.branchNew) },
                onEdit: { push(.branchEdit($0)) }
            )
        case .branchNew:
            PortalBranchEditView(branchId: nil)
        case .branchEdit(let id):
            PortalBranchEditView(branchId: id)
        case .requests:
            PortalRequestsView(onCreate: { push(.requestNew) })
        case .requestNew:
            PortalRequestNewView()
        case .tickets:
            PortalTicketsView(onOpenTicket: { push(.ticketDetail($0)) })
        case .ticketDetail(let id):
            PortalTicketDetailView(ticketId: id)
        case .feedback:
            PortalFeedbackView()
        case .inventories:
            PortalInventoriesView(onOpenInventory: { push(.inventoryDetail($0)) })
        case .inventoryDetail(let id):
            PortalInventoryDetailView(inventoryId: id)
        case .services:
            PortalServicesView()
        case .help:
            PortalHelpView()
        }
    }

    /// Enlace pendiente (push o URL). Como Android: se abre DENTRO de la pila del
    /// portal (antes iOS lo ponía en una hoja aparte, con «volver» que no hacía
    /// nada); un enlace de Core deja a la cuenta de portal en su inicio.
    private func consumePortalDeepLink() {
        guard deepLink.pending != nil else { return }
        guard let link = deepLink.consumePortal() else {
            path.removeAll()
            return
        }
        if link.key == "tickets" || link.key == "client-tickets", let id = link.entityId {
            push(.ticketDetail(id))
            return
        }
        if let route = PortalRoute.forModuleKey(link.key) {
            push(route)
        } else {
            path.removeAll()
        }
    }
}

// MARK: - Inicio del portal

/// Inicio del portal (Android `TicketsPortalScreen`): cabecera del cliente o de
/// la sucursal, cuatro cifras, tarjetas de módulos y «Cerrar sesión».
struct PortalHomeView: View {
    let onExit: () -> Void
    let onNavigate: (PortalRoute) -> Void

    private struct Stats {
        var totalTickets = 0
        var pendingTickets = 0
        var closedTickets = 0
        var openRequests = 0
        var pendingFeedback = 0
    }

    @State private var isLoading = true
    @State private var didStart = false
    @State private var downloadingPortalReport = false
    @State private var error: String?
    @State private var message: String?
    @State private var profile: PortalClientProfile?
    @State private var stats = Stats()
    @State private var pdfItem: PortalPDFItem?

    private var isClient: Bool { profile?.isBranch == false }

    var body: some View {
        Group {
            if isLoading {
                NxLoadingState(text: "Cargando portal…")
                    .padding(16)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        content
                    }
                    .padding(16)
                }
                .refreshable { await Task { await refresh(initial: false) }.value }
            }
        }
        .nxScreenBackground()
        .onAppear {
            guard !didStart else { return }
            didStart = true
            Task { await refresh(initial: true) }
        }
        .sheet(item: $pdfItem) { PortalPDFSheet(item: $0) }
    }

    @ViewBuilder
    private var content: some View {
        if let p = profile, !p.name.trimmingCharacters(in: .whitespaces).isEmpty {
            if let error {
                PortalFrase(text: error, retry: { Task { await refresh(initial: false) } })
            }
            if let message {
                Text(message)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(1)
            }
            header(p)
            NxKpiGrid(items: [
                NxKpi(label: "Tickets", value: "\(stats.totalTickets)", tone: .brand),
                NxKpi(label: "En proceso", value: "\(stats.pendingTickets)",
                      tone: stats.pendingTickets > 0 ? .warning : .success),
                NxKpi(label: "Cerrados", value: "\(stats.closedTickets)", tone: .neutral),
                NxKpi(label: "Solicitudes", value: "\(stats.openRequests)",
                      tone: stats.openRequests > 0 ? .info : .neutral),
            ])
            modules(p)
        } else {
            PortalFrase(
                text: error ?? "No hay perfil del portal.",
                retry: { Task { await refresh(initial: true) } },
                actionLabel: "Cerrar sesión",
                onAction: onExit
            )
        }
    }

    private func header(_ p: PortalClientProfile) -> some View {
        NxPanelShell(padding: 16) {
            if !p.logoUrl.isEmpty {
                AuthenticatedImage(url: p.logoUrl, contentMode: .fit, background: .clear)
                    .frame(maxWidth: .infinity)
                    .frame(height: 96)
                    .accessibilityLabel("Logo cliente")
                Spacer().frame(height: 8)
            }
            Text(p.name)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(NxColors.fg)
                .lineLimit(1)
            if p.isBranch && !p.branchNumber.isEmpty {
                Text(p.branchNumber)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(1)
            }
        }
    }

    @ViewBuilder
    private func modules(_ p: PortalClientProfile) -> some View {
        PortalNavCard(
            title: "Tickets",
            subtitle: "\(stats.pendingTickets) en proceso",
            onClick: { onNavigate(.tickets) }
        )
        PortalNavCard(
            title: "Solicitudes",
            subtitle: stats.openRequests > 0 ? "\(stats.openRequests) activas" : "",
            badge: stats.openRequests > 0 ? "\(stats.openRequests)" : nil,
            onClick: { onNavigate(.requests) }
        )
        if isClient && stats.pendingFeedback > 0 {
            PortalNavCard(
                title: "Confirmación",
                subtitle: "\(stats.pendingFeedback) por confirmar",
                badge: "\(stats.pendingFeedback)",
                tone: .warning,
                onClick: { onNavigate(.feedback) }
            )
        }
        if isClient {
            PortalNavCard(title: "Servicios", subtitle: "", onClick: { onNavigate(.services) })
        }
        PortalNavCard(title: "Inventarios", subtitle: "", onClick: { onNavigate(.inventories) })
        PortalNavCard(title: "Ayuda", subtitle: "", onClick: { onNavigate(.help) })
        PortalNavCard(title: "Perfil", subtitle: "", onClick: { onNavigate(.profile) })
        if isClient {
            PortalNavCard(title: "Sucursales", subtitle: "", onClick: { onNavigate(.branches) })
            if stats.pendingFeedback == 0 {
                PortalNavCard(title: "Confirmación", subtitle: "Sin pendientes", onClick: { onNavigate(.feedback) })
            }
            PortalNavCard(
                title: "Reporte",
                subtitle: downloadingPortalReport ? "Descargando…" : "",
                onClick: { if !downloadingPortalReport { Task { await downloadPortalReport() } } }
            )
        }
    }

    /// Perfil, tickets, solicitudes y (cliente) servicios por calificar, como el
    /// `TicketsPortalViewModel` de Android: si una de las cuatro falla, aviso.
    private func refresh(initial: Bool) async {
        if initial { isLoading = true }
        error = nil
        do {
            let repo = TicketsRepository.shared
            let nuevoPerfil = try await repo.portalProfile()
            let tickets = try await repo.portalTickets()
            let requests = try await repo.portalRequests()
            var feedback: [PendingFeedbackItem] = []
            if nuevoPerfil?.isBranch == false {
                feedback = try await repo.pendingFeedbackItems()
            }
            profile = nuevoPerfil
            let closed = tickets.filter { !$0.isOpen }.count
            stats = Stats(
                totalTickets: tickets.count,
                pendingTickets: tickets.count - closed,
                closedTickets: closed,
                openRequests: requests.filter { $0.status.uppercased() != "CLOSED" }.count,
                pendingFeedback: feedback.count
            )
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo cargar el portal")
        }
        isLoading = false
    }

    private func downloadPortalReport() async {
        downloadingPortalReport = true
        error = nil
        message = nil
        do {
            let data = try await TicketsRepository.shared.portalReportPdf()
            pdfItem = PortalPDFItem(title: "Reporte del portal", data: data)
            message = "Reporte descargado"
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo descargar el reporte")
        }
        downloadingPortalReport = false
    }
}
