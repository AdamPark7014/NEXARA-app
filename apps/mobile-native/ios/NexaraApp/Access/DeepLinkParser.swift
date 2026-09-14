import Foundation

/// Destino de un deep link (`nexara://`, URL https o ruta web relativa).
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
        "herramientas": "tools", "asistencia": "attendance", "asistencias": "attendance",
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
        "chat": "chat",
        "reuniones": "reuniones", "meetings": "reuniones",
        "smart-quote": "smart-quote", "cotizar": "smart-quote", "nueva-cotizacion": "smart-quote",
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
        "pizarra": "pizarra",
    ]

    private static let erpHeads: Set<String> = ["erp", "console", "consola", "people", "contabilidad"]
    /// Core: lo que era OPS vive dentro de ERP; nadie aterriza en un hub OPS.
    private static let legacyOpsHeads: Set<String> = ["ops", "operacion", "noc", "support"]

    private static let activityKeys: Set<String> = ["actividades", "activities", "mis-actividades", "my-activities"]
    private static let evidenceKeys: Set<String> = ["evidencias", "evidences", "mis-evidencias", "my-evidences"]

    static func parse(_ url: URL) -> DeepLinkDestination? {
        var segments = url.pathComponents.filter { $0 != "/" }
        let scheme = (url.scheme ?? "").lowercased()
        // En `nexara://erp/actividades/12` el primer segmento llega como host.
        if scheme != "http", scheme != "https", let host = url.host, !host.isEmpty, !host.contains(".") {
            segments.insert(host, at: 0)
        }
        var params: [String: String] = [:]
        if let components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            for item in components.queryItems ?? [] {
                guard let value = item.value else { continue }
                params[item.name] = value
                params[item.name.lowercased()] = value
            }
        }
        return parse(segments: segments, params: params)
    }

    /// Ruta web (`/erp/actividades/12/evidencias`) o URL absoluta, como llega en
    /// `relatedUrl` de las notificaciones.
    static func parseWebPath(_ pathOrUrl: String) -> DeepLinkDestination? {
        let trimmed = pathOrUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let lower = trimmed.lowercased()
        if lower.hasPrefix("http://") || lower.hasPrefix("https://") || lower.hasPrefix("nexara://") {
            guard let url = URL(string: trimmed)
                ?? URL(string: trimmed.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "") else {
                return nil
            }
            return parse(url)
        }
        let path = trimmed.hasPrefix("/") ? trimmed : "/" + trimmed
        let base = "https://app.nexara.local"
        guard let url = URL(string: base + path)
            ?? URL(string: base + (path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")) else {
            return nil
        }
        return parse(url)
    }

    private static func parse(segments rawSegments: [String], params: [String: String]) -> DeepLinkDestination? {
        let segments = rawSegments.map { $0.lowercased() }.filter { !$0.isEmpty }
        guard !segments.isEmpty else { return nil }

        let joined = segments.joined(separator: "/")
        if joined == "notifications-center" || joined == "notifications" || segments.last == "notifications-center" {
            return .notifications
        }

        let head = segments[0]
        let legacyOps = legacyOpsHeads.contains(head)
        let panel: PanelId
        let moduleParts: [String]
        if erpHeads.contains(head) || legacyOps {
            panel = .erp
            moduleParts = Array(segments.dropFirst())
        } else {
            switch head {
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
            case "integra":
                panel = .integra
                moduleParts = Array(segments.dropFirst())
            default:
                panel = .erp
                moduleParts = segments
            }
        }

        if panel == .erp, let core = coreDestination(parts: moduleParts, legacyOps: legacyOps, params: params) {
            return core
        }

        let pathEntityId: Int64? = {
            guard let last = moduleParts.last, last.allSatisfy(\.isNumber), let id = Int64(last), id > 0 else { return nil }
            return id
        }()
        let parts = (pathEntityId != nil && moduleParts.count > 1) ? Array(moduleParts.dropLast()) : moduleParts
        let rawKey = parts.last ?? "dashboard"
        let key = segmentAliases[rawKey] ?? rawKey
        if key == "notifications-center" { return .notifications }
        return .module(panel: panel, key: key, entityId: pathEntityId, params: params)
    }

    /// Rutas de Core y equivalencias de `coreSurfaceRedirect` (web) para OPS viejo.
    ///
    /// - `/erp/actividades/:id` → detalle; `/evidencias` y `/historial` → esa pestaña.
    /// - `/ops/activities/:id[/evidences]` → detalle o evidencias (lo demás, detalle).
    /// - `?activityId=N` en listas viejas de actividades o evidencias.
    /// - `/erp/pizarra?vista=…`, `/erp/mis-actividades`, `/ops/my-activities` → Actividades.
    private static func coreDestination(parts: [String], legacyOps: Bool, params: [String: String]) -> DeepLinkDestination? {
        guard let first = parts.first else {
            return legacyOps ? .module(panel: .erp, key: "pizarra") : nil
        }
        var cleanParams = params
        cleanParams.removeValue(forKey: "activityId")
        cleanParams.removeValue(forKey: "activityid")
        let queryActivityId = Int64(params["activityId"] ?? params["activityid"] ?? "") ?? 0

        if activityKeys.contains(first) {
            if parts.count >= 2, let id = Int64(parts[1]), id > 0 {
                let suffix = parts.count >= 3 ? parts[2] : ""
                var tab = "detalle"
                if evidenceKeys.contains(suffix) {
                    tab = "evidencias"
                } else if !legacyOps && (suffix == "historial" || suffix == "history") {
                    tab = "historial"
                }
                cleanParams["tab"] = tab
                return .module(panel: .erp, key: "activities", entityId: id, params: cleanParams)
            }
            if queryActivityId > 0 {
                cleanParams["tab"] = "detalle"
                return .module(panel: .erp, key: "activities", entityId: queryActivityId, params: cleanParams)
            }
            if first == "mis-actividades" || first == "my-activities" {
                cleanParams["vista"] = "mias"
            }
            return .module(panel: .erp, key: "pizarra", params: cleanParams)
        }

        if evidenceKeys.contains(first), queryActivityId > 0 {
            cleanParams["tab"] = "evidencias"
            return .module(panel: .erp, key: "activities", entityId: queryActivityId, params: cleanParams)
        }

        if first == "pizarra" {
            if parts.count >= 2, let userId = Int64(parts[1]), userId > 0 {
                cleanParams["vista"] = "equipo"
                cleanParams["userId"] = String(userId)
            }
            return .module(panel: .erp, key: "pizarra", params: cleanParams)
        }

        if first == "asistencias" {
            return .module(panel: .erp, key: "attendance", params: cleanParams)
        }
        return nil
    }
}
