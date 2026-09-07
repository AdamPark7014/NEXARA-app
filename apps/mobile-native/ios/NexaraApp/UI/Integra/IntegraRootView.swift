import SwiftUI

/// Raíz INTEGRA: un solo `NavigationStack` con rutas core + paquetes avanzados.
/// `ModuleRouter` puede montar esta vista para `.integra` sin 20 casos sueltos.
struct IntegraRootView: View {
    var onExit: (() -> Void)? = nil
    var allowedKeys: Set<String>? = nil
    var initialKey: String? = nil

    @State private var path: [String] = []

    var body: some View {
        NavigationStack(path: $path) {
            IntegraHomeView(
                onOpenKey: openKey,
                onExit: onExit,
                allowedKeys: allowedKeys
            )
            .navigationDestination(for: String.self) { route in
                destination(for: route)
                    .navigationTitle(IntegraRoutes.title(forRoute: route))
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
        .onAppear {
            if let initialKey, path.isEmpty {
                let route = IntegraRoutes.route(forKey: initialKey)
                if route != IntegraRoutes.home {
                    path = [route]
                }
            }
        }
    }

    /// Alias de montaje tipo Tab/panel (mismo host).
    static func tabHost(onExit: @escaping () -> Void) -> some View {
        IntegraRootView(onExit: onExit)
    }

    private func openKey(_ key: String) {
        let route = IntegraRoutes.route(forKey: key)
        if route != IntegraRoutes.home {
            path.append(route)
        }
    }

    private func navigate(_ route: String) {
        path.append(route)
    }

    @ViewBuilder
    private func destination(for route: String) -> some View {
        if route.hasPrefix(IntegraRoutes.people + "/"), route != IntegraRoutes.people {
            let personId = String(route.dropFirst(IntegraRoutes.people.count + 1))
            IntegraPersonDetailView(personId: personId) {
                if !path.isEmpty { path.removeLast() }
            }
        } else if IntegraAdvancedGraph.handles(route) {
            integraAdvancedDestination(
                route: route,
                onOpenKey: openKey,
                onNavigate: navigate
            )
        } else {
            switch route {
            case IntegraRoutes.access:
                IntegraAccessView()
            case IntegraRoutes.events:
                IntegraEventsView()
            case IntegraRoutes.people:
                IntegraPeopleView { personId in
                    path.append(IntegraRoutes.personDetail(personId))
                }
            case IntegraRoutes.attendance:
                IntegraAttendanceView()
            case IntegraRoutes.visitors:
                IntegraVisitorsView()
            case IntegraRoutes.alarms:
                IntegraAlarmsView()
            case IntegraRoutes.occupancy:
                IntegraOccupancyView()
            case IntegraRoutes.devices:
                IntegraDevicesView()
            case IntegraRoutes.sites:
                IntegraSitesView { path = [] }
            default:
                IntegraHomeView(onOpenKey: openKey)
            }
        }
    }
}

/// Alias pedido en el brief — mismo host que `IntegraRootView`.
typealias IntegraTabView = IntegraRootView
