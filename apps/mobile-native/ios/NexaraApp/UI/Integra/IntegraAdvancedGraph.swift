import SwiftUI

/// Destinos avanzados INTEGRA para que `IntegraRootView` (otro agente) no tenga
/// que conocer cada pantalla: llama `integraAdvancedDestination(route:onOpenKey:)`.
///
/// No toca ModuleRouter / ModuleCatalog / PanelId / pantallas core.
enum IntegraAdvancedGraph {
    /// Rutas que este paquete atiende (además de detalle con argumentos).
    static let knownRoots: Set<String> = [
        IntegraVideoRoutes.wall,
        IntegraVehiclesRoutes.vehicles,
        IntegraVehiclesRoutes.anpr,
        SchedulesRoutes.schedules,
        SchedulesRoutes.espacios,
        IntegraDetectionRoutes.detection,
        IntegraDetectionRoutes.capabilities,
        IntegraDetectionRoutes.settings,
        IntegraDetectionRoutes.settingsNew,
        IntegraGovernanceRoutes.audit,
        IntegraGovernanceRoutes.notifications,
        IntegraGovernanceRoutes.myProfile,
        IntegraMapRoutes.map,
        IntegraMapRoutes.dashboard,
    ]

    static func title(for route: String?) -> String? {
        IntegraVideoRoutes.title(for: route)
            ?? IntegraVehiclesRoutes.title(for: route)
            ?? SchedulesRoutes.title(for: route)
            ?? IntegraDetectionRoutes.title(for: route)
            ?? IntegraGovernanceRoutes.title(for: route)
            ?? IntegraMapRoutes.title(for: route)
    }

    static func route(forModuleKey key: String) -> String? {
        IntegraVideoRoutes.route(forModuleKey: key)
            ?? IntegraVehiclesRoutes.route(forModuleKey: key)
            ?? SchedulesRoutes.route(forModuleKey: key)
            ?? IntegraDetectionRoutes.route(forModuleKey: key)
            ?? IntegraGovernanceRoutes.route(forModuleKey: key)
            ?? IntegraMapRoutes.route(forModuleKey: key)
    }

    /// `true` si la ruta pertenece a módulos avanzados (incl. con path args).
    static func handles(_ route: String) -> Bool {
        if knownRoots.contains(route) { return true }
        if route.hasPrefix("integra/video/") { return true }
        if route.hasPrefix("integra/schedules/door/") { return true }
        if route.hasPrefix("integra/detection/camera/") { return true }
        if route.hasPrefix("integra/settings/site/") { return true }
        return false
    }
}

@ViewBuilder
func integraAdvancedDestination(
    route: String,
    onOpenKey: ((String) -> Void)? = nil,
    onNavigate: ((String) -> Void)? = nil
) -> some View {
    let go: (String) -> Void = { onNavigate?($0) ?? onOpenKey?($0) }

    switch route {
    case IntegraVideoRoutes.wall:
        IntegraVideoWallView(onOpenCamera: { go(IntegraVideoRoutes.cameraDetail($0)) })

    case IntegraVehiclesRoutes.vehicles:
        IntegraVehiclesView()

    case IntegraVehiclesRoutes.anpr:
        IntegraAnprView()

    case SchedulesRoutes.schedules:
        IntegraSchedulesView()

    case SchedulesRoutes.espacios:
        IntegraEspaciosView(onOpenSchedules: { doorId in
            go(SchedulesRoutes.schedulesForDoor(doorId))
        })

    case IntegraDetectionRoutes.detection:
        IntegraDetectionCamerasView(
            onOpenCamera: { go(IntegraDetectionRoutes.cameraRoute($0)) },
            onOpenCapabilities: { go(IntegraDetectionRoutes.capabilities) }
        )

    case IntegraDetectionRoutes.capabilities:
        IntegraDetectionCapabilitiesView()

    case IntegraDetectionRoutes.settings:
        IntegraSettingsView(
            onOpenSite: { go(IntegraDetectionRoutes.siteRoute($0)) },
            onOpenNewSite: { go(IntegraDetectionRoutes.settingsNew) }
        )

    case IntegraDetectionRoutes.settingsNew:
        IntegraNewSiteView(onCreated: { /* root pops */ })

    case IntegraGovernanceRoutes.audit:
        IntegraAuditView()

    case IntegraGovernanceRoutes.notifications:
        IntegraNotificationsCenterView(
            onOpenAlarms: { onOpenKey?("integra-alarms") }
        )

    case IntegraGovernanceRoutes.myProfile:
        IntegraMyProfileView()

    case IntegraMapRoutes.map:
        IntegraMapView(onOpenKey: onOpenKey)

    case IntegraMapRoutes.dashboard:
        IntegraDashboardView(onOpenKey: onOpenKey)

    default:
        if route.hasPrefix("integra/video/") {
            let id = String(route.dropFirst("integra/video/".count))
                .removingPercentEncoding ?? String(route.dropFirst("integra/video/".count))
            IntegraCameraDetailView(cameraId: id)
        } else if route.hasPrefix("integra/schedules/door/") {
            let raw = String(route.dropFirst("integra/schedules/door/".count))
            IntegraSchedulesView(initialDoorId: raw)
        } else if route.hasPrefix("integra/detection/camera/") {
            let id = String(route.dropFirst("integra/detection/camera/".count))
            IntegraDetectionTuningView(cameraId: id)
        } else if route.hasPrefix("integra/settings/site/") {
            let raw = String(route.dropFirst("integra/settings/site/".count))
            IntegraSiteDetailView(siteId: Int(raw) ?? 0)
        } else {
            Text("Ruta avanzada desconocida: \(route)")
                .foregroundStyle(.secondary)
                .padding()
        }
    }
}
