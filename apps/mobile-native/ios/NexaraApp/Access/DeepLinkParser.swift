import Foundation

/// Destino de un deep link (`nexara://` o URL https con path de panel).
enum DeepLinkDestination: Equatable {
    case notifications
    case module(panel: PanelId, key: String)
}

enum DeepLinkParser {
    /// Segmentos legacy ES → keys de catálogo móvil.
    private static let segmentAliases: [String: String] = [
        "clientes": "clients", "oportunidades": "oportunidades", "productos": "productos",
        "proyectos": "projects", "licitaciones": "licitaciones", "cotizaciones": "cotizaciones",
        "plantillas": "cotizaciones", "viaticos": "viatics", "mis-viaticos": "my-viatics",
        "actividades": "activities", "mis-actividades": "my-activities",
        "evidencias": "evidences", "mis-evidencias": "my-evidences",
        "vehiculos": "vehicles", "mis-vehiculos": "my-vehicles",
        "herramientas": "tools", "asistencia": "attendance",
        "empleados": "hr", "multas": "fines", "gastos": "expenses",
        "banca": "banking", "bancos": "banking", "facturacion": "invoicing",
        "contabilidad": "accounting", "almacen": "warehouse", "inventario": "stock",
        "compras": "procurement", "auditoria": "audit", "documentos": "documents",
        "notificaciones": "notifications-center", "notifications-center": "notifications-center",
        "mi-perfil": "my-profile", "configuracion": "settings", "usuarios": "users",
        "leads": "leads", "noticias": "news", "contactos": "contacts",
        "dashboard": "dashboard", "flags": "flags", "health": "health", "ai": "ai",
    ]

    static func parse(_ url: URL) -> DeepLinkDestination? {
        let segments: [String]
        if let host = url.host?.lowercased(), !host.contains(".") {
            let pathSegs = url.pathComponents.filter { $0 != "/" }
            segments = [host] + pathSegs
        } else {
            segments = url.pathComponents.filter { $0 != "/" }
        }
        guard !segments.isEmpty else { return nil }

        let joined = segments.joined(separator: "/")
        if joined == "notifications-center" || joined == "notifications" || segments.last == "notifications-center" {
            return .notifications
        }

        let panel: PanelId
        let moduleParts: [String]
        let head = segments[0].lowercased()

        switch head {
        case "erp", "console", "people", "contabilidad":
            panel = .erp
            moduleParts = Array(segments.dropFirst())
        case "ops", "operacion", "noc", "support":
            panel = .ops
            moduleParts = Array(segments.dropFirst())
        case "crm", "ventas":
            panel = .crm
            moduleParts = Array(segments.dropFirst())
        case "studio", "web":
            panel = .studio
            moduleParts = Array(segments.dropFirst())
        case "lab":
            panel = .lab
            moduleParts = Array(segments.dropFirst())
        case "portal", "tickets":
            panel = .portal
            moduleParts = Array(segments.dropFirst())
        default:
            panel = .erp
            moduleParts = segments
        }

        let rawKey = moduleParts.last ?? "dashboard"
        let key = segmentAliases[rawKey.lowercased()] ?? rawKey

        if key == "notifications-center" { return .notifications }
        return .module(panel: panel, key: key)
    }
}
