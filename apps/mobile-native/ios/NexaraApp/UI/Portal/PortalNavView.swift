import SwiftUI

/// Navegación Portal — paridad con Android `TicketsNavHost`.
enum PortalRoute: Hashable, Identifiable {
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

    var id: String {
        switch self {
        case .profile: return "profile"
        case .branches: return "branches"
        case .branchNew: return "branchNew"
        case .branchEdit(let id): return "branchEdit-\(id)"
        case .requests: return "requests"
        case .requestNew: return "requestNew"
        case .tickets: return "tickets"
        case .ticketDetail(let id): return "ticket-\(id)"
        case .feedback: return "feedback"
        case .inventories: return "inventories"
        case .inventoryDetail(let id): return "inventory-\(id)"
        case .services: return "services"
        case .help: return "help"
        }
    }
}

struct PortalNavView: View {
    let onExit: () -> Void
    @State private var path: [PortalRoute] = []
    @State private var deepLinkRoute: PortalRoute?
    @ObservedObject private var deepLink = DeepLinkCoordinator.shared

    var body: some View {
        NavigationStack(path: $path) {
            PortalHomeView(onExit: onExit, onNavigate: { path.append($0) })
                .navigationDestination(for: PortalRoute.self) { route in
                    switch route {
                    case .profile: PortalProfileView()
                    case .branches: PortalBranchesView(
                        onNew: { path.append(.branchNew) },
                        onEdit: { path.append(.branchEdit($0)) }
                    )
                    case .branchNew: PortalBranchEditView(branchId: nil, onDone: { path.removeLast() })
                    case .branchEdit(let id): PortalBranchEditView(branchId: id, onDone: { path.removeLast() })
                    case .requests: PortalRequestsView(onNew: { path.append(.requestNew) })
                    case .requestNew: PortalRequestNewView(onDone: { path.removeLast() })
                    case .tickets: PortalTicketsView(onOpen: { path.append(.ticketDetail($0)) })
                    case .ticketDetail(let id): PortalTicketDetailView(ticketId: id)
                    case .feedback: PortalFeedbackView()
                    case .inventories: PortalInventoriesView(onOpen: { path.append(.inventoryDetail($0)) })
                    case .inventoryDetail(let id): PortalInventoryDetailView(inventoryId: id)
                    case .services: PortalServicesView()
                    case .help: PortalHelpView(onBack: { path.removeLast() })
                    }
                }
        }
        .sheet(item: $deepLinkRoute) { route in
            NavigationStack {
                portalDeepLinkScreen(route)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cerrar") { deepLinkRoute = nil }
                        }
                    }
            }
        }
        .onAppear { consumePortalDeepLink() }
        .onChange(of: deepLink.pending) { _, _ in consumePortalDeepLink() }
    }

    private func consumePortalDeepLink() {
        guard let key = deepLink.consumeModule(for: .portal) else { return }
        if let route = portalRoute(for: key) { deepLinkRoute = route }
    }

    @ViewBuilder
    private func portalDeepLinkScreen(_ route: PortalRoute) -> some View {
        switch route {
        case .profile: PortalProfileView()
        case .branches: PortalBranchesView(onNew: {}, onEdit: { _ in })
        case .branchNew: PortalBranchEditView(branchId: nil, onDone: {})
        case .branchEdit(let id): PortalBranchEditView(branchId: id, onDone: {})
        case .requests: PortalRequestsView(onNew: {})
        case .requestNew: PortalRequestNewView(onDone: {})
        case .tickets: PortalTicketsView(onOpen: { _ in })
        case .ticketDetail(let id): PortalTicketDetailView(ticketId: id)
        case .feedback: PortalFeedbackView()
        case .inventories: PortalInventoriesView(onOpen: { _ in })
        case .inventoryDetail(let id): PortalInventoryDetailView(inventoryId: id)
        case .services: PortalServicesView()
        case .help: PortalHelpView(onBack: {})
        }
    }

    private func portalRoute(for key: String) -> PortalRoute? {
        switch key {
        case "profile", "my-profile", "mi-perfil": return .profile
        case "branches", "sucursales": return .branches
        case "requests", "solicitudes": return .requests
        case "tickets": return .tickets
        case "inventories", "inventarios": return .inventories
        case "feedback-pending", "feedback": return .feedback
        case "mis-servicios", "my-services", "services": return .services
        case "help", "ayuda", "centro-de-ayuda": return .help
        default: return nil
        }
    }
}

// MARK: - Home

struct PortalHomeView: View {
    let onExit: () -> Void
    let onNavigate: (PortalRoute) -> Void

    @EnvironmentObject var session: SessionStore
    @State private var profile: [String: Any]?
    @State private var isLoading = true
    @State private var error: String?
    @State private var portalReportData: Data?

    private var isClient: Bool { session.currentUser?.isClient == true && !isBranch }
    private var isBranch: Bool { session.currentUser?.isBranchUser == true }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if isLoading { ProgressView().frame(maxWidth: .infinity).padding(.top, 40) }
                if let error { Text(error).foregroundColor(.red).font(.footnote) }

                if let p = profile {
                    portalHeader(p)
                    VStack(spacing: 10) {
                        portalBtn("person.circle", "Mi perfil", .profile)
                        if isClient {
                            portalBtn("building.2", "Sucursales", .branches)
                            portalBtn("star.bubble", "Feedback pendiente", .feedback)
                        }
                        portalBtn("tray.full", "Solicitudes", .requests)
                        portalBtn("ticket", "Tickets", .tickets)
                        portalBtn("archivebox", "Inventarios", .inventories)
                        portalBtn("briefcase", "Mis servicios", .services)
                        portalBtn("questionmark.circle", "Centro de ayuda", .help)
                        if isClient {
                            Button {
                                Task { portalReportData = try? await TicketsRepository.shared.portalReportPdf() }
                            } label: {
                                HStack(spacing: 14) {
                                    Image(systemName: "doc.richtext").font(.title3).foregroundColor(.teal).frame(width: 28)
                                    Text("Reporte del portal").font(.body)
                                    Spacer()
                                    Image(systemName: "chevron.right").foregroundColor(.secondary)
                                }
                                .padding()
                                .background(Color(.secondarySystemGroupedBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                Button("Cambiar panel", role: .destructive) { onExit() }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)
            }
            .padding()
        }
        .navigationTitle("Portal")
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: Binding(
            get: { portalReportData.map { PortalPDFItem(data: $0) } },
            set: { portalReportData = $0?.data }
        )) { item in
            NavigationStack { PDFViewerScreen(title: "Reporte portal", data: item.data) }
        }
    }

    private func portalHeader(_ p: [String: Any]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            let name = ConsoleHelpers.mapStr(p, "name", "nombre")
            Text(name).font(.title2).bold()
            if isBranch {
                let num = ConsoleHelpers.mapStr(p, "branchNumber")
                if !num.isEmpty { Text("Sucursal \(num)").font(.caption).foregroundColor(.secondary) }
            }
            let city = [ConsoleHelpers.mapStr(p, "city"), ConsoleHelpers.mapStr(p, "state")]
                .filter { !$0.isEmpty }.joined(separator: ", ")
            if !city.isEmpty { Text(city).font(.caption).foregroundColor(.secondary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func portalBtn(_ icon: String, _ label: String, _ route: PortalRoute) -> some View {
        Button { onNavigate(route) } label: {
            HStack(spacing: 14) {
                Image(systemName: icon).font(.title3).foregroundColor(.teal).frame(width: 28)
                Text(label).font(.body)
                Spacer()
                Image(systemName: "chevron.right").foregroundColor(.secondary)
            }
            .padding()
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    private func load() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do { profile = try await TicketsRepository.shared.profile() }
        catch { self.error = error.localizedDescription }
    }
}

private struct PortalPDFItem: Identifiable {
    let id = UUID()
    let data: Data
}
