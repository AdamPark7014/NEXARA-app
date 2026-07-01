import SwiftUI

/// Navegación Portal — paridad con Android `TicketsNavHost`.
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
}

struct PortalNavView: View {
    let onExit: () -> Void
    @State private var path: [PortalRoute] = []

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
                    }
                }
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
