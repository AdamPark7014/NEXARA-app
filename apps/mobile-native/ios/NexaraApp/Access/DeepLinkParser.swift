import Foundation

/// Destino de un deep link (`nexara://` o URL https con path de panel).
enum DeepLinkDestination: Equatable {
    case notifications
    case module(panel: PanelId, key: String, entityId: Int64? = nil, params: [String: String] = [:])
}

enum DeepLinkParser {
    /// Segmentos legacy ES → keys de catálogo móvil.
    private static let segmentAliases: [String: String] = [
        "clientes": "clients", "clients": "clients", "oportunidades": "oportunidades", "productos": "productos",
        "proyectos": "projects", "licitaciones": "licitaciones", "cotizaciones": "cotizaciones",
        "plantillas": "plantillas", "templates": "plantillas",
        "service-clients": "service-clients", "clientes-servicio": "service-clients", "viaticos": "viatics", "mis-viaticos": "my-viatics",
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
        "cola-offline": "offline-queue", "offline": "offline-queue",
        "leads": "leads", "noticias": "news", "contactos": "contacts",
        "dashboard": "dashboard", "flags": "flags", "health": "health", "ai": "ai",
        "soporte": "client-tickets", "support": "client-tickets", "client-tickets": "client-tickets",
        "executive": "executive", "approvals": "approvals", "bi": "bi", "analytics": "analytics",
        "dispatch": "dispatch",
        "noc": "noc", "sla": "support-sla", "support-sla": "support-sla",
        "maintenance-contracts": "maintenance-contracts", "contratos": "maintenance-contracts",
        "companies": "companies", "kb": "kb", "exports": "exports",
        "architecture": "architecture", "calendar": "calendar",
        "orgchart": "orgchart", "kpis-hr": "kpis-hr", "kpis": "kpis-hr",
        "branches": "branches", "sucursales": "branches",
        "requests": "requests", "solicitudes": "requests",
        "inventories": "inventories", "inventarios": "inventories",
        "feedback": "feedback-pending", "feedback-pending": "feedback-pending",
        "mis-servicios": "mis-servicios", "my-services": "mis-servicios", "services": "mis-servicios",
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

        if let activityDetail = parseActivityDetailPath(moduleParts) {
            var merged = params
            merged["tab"] = activityDetail.tab
            return .module(panel: panel, key: activityDetail.key, entityId: activityDetail.entityId, params: merged)
        }

        let pathEntityId: Int64? = {
            guard let last = moduleParts.last, last.allSatisfy(\.isNumber), let id = Int64(last), id > 0 else { return nil }
            return id
        }()
        let parts: [String] = {
            if pathEntityId != nil && moduleParts.count > 1 {
                return Array(moduleParts.dropLast())
            }
            return moduleParts
        }()

        let rawKey = parts.last ?? "dashboard"
        let key = segmentAliases[rawKey.lowercased()] ?? rawKey

        if key == "notifications-center" { return .notifications }

        var params: [String: String] = [:]
        if let components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            components.queryItems?.forEach { item in
                if let value = item.value { params[item.name] = value }
            }
        }

        return .module(panel: panel, key: key, entityId: pathEntityId, params: params)
    }

    private static let activityDetailSuffixes: Set<String> = [
        "operacion", "info", "evidencias", "viaticos", "equipo",
        "materiales", "historial", "incidencias", "aprobaciones", "edit",
    ]

    private static func parseActivityDetailPath(moduleParts: [String]) -> (key: String, entityId: Int64, tab: String)? {
        guard moduleParts.count >= 2 else { return nil }
        let tab = moduleParts.last!.lowercased()
        guard activityDetailSuffixes.contains(tab) else { return nil }
        let idSeg = moduleParts[moduleParts.count - 2]
        guard idSeg.allSatisfy(\.isNumber), let entityId = Int64(idSeg), entityId > 0 else { return nil }
        let prefixParts = Array(moduleParts.dropLast(2))
        let rawKey = prefixParts.last ?? "activities"
        let key = segmentAliases[rawKey.lowercased()] ?? rawKey
        guard key == "activities" || key == "my-activities" else { return nil }
        return (key, entityId, tab)
    }
}
