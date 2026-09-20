import Foundation

/// Pantalla de Core a la que lleva un enlace.
struct CoreLink: Equatable {
    var module: CoreModule
    /// Detalle de actividad (`/erp/actividades/:id`).
    var activityId: Int? = nil
    /// Actividades: `detalle` / `evidencias` / `historial`. Asistencias: `comidas`.
    var tab: String? = nil
    /// Día de una persona (`/erp/pizarra/:userId`).
    var boardUserId: Int? = nil
    /// Vista de Actividades (`mias` / `equipo`).
    var vista: String? = nil
    var chatChannelId: Int64? = nil
    var chatMessageId: Int64? = nil
    /// Cliente (`/erp/clientes/:id`).
    var entityId: Int64? = nil
    /// Módulo del hub «Más» (Almacén, Vehículos…). Con él, `module` se queda en
    /// `.actividades`: el shell lo abre encima de la pestaña actual.
    var extra: CoreExtraModule? = nil

    /// `CORE_HOME_PATH` = `/erp/pizarra`.
    static let home = CoreLink(module: .actividades)
}

/// Destino de un deep link (`nexara://`, URL https o ruta web relativa).
enum DeepLinkDestination: Equatable {
    case notifications
    case core(CoreLink)
    /// Portal externo de clientes (`/tickets/...`, «NO se toca» en la web).
    case portal(key: String, entityId: Int64?)
}

/// Solo existe ERP (Core): todo lo demás cae en Actividades, igual que
/// `coreSurfaceRedirect` en `apps/web/lib/core-surface.ts`.
enum DeepLinkParser {
    /// `NON_ERP_PANEL_RE` de la web.
    private static let nonErpHeads: Set<String> = [
        "ops", "crm", "studio", "lab", "integra", "finance", "hr", "sales", "console", "consola",
        "contabilidad", "people", "operacion", "noc", "support", "ventas",
    ]
    private static let portalHeads: Set<String> = ["tickets", "portal"]
    private static let activityHeads: Set<String> = ["activities", "actividades"]
    private static let myActivityHeads: Set<String> = ["my-activities", "mis-actividades"]
    private static let evidenceHeads: Set<String> = ["evidences", "evidencias", "my-evidences", "mis-evidencias"]

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

    private static func positiveInt(_ raw: String?) -> Int? {
        guard let raw, let value = Int(raw), value > 0 else { return nil }
        return value
    }

    private static func positiveInt64(_ raw: String?) -> Int64? {
        guard let raw, let value = Int64(raw), value > 0 else { return nil }
        return value
    }

    /// Enlace a un módulo del hub «Más».
    private static func extraLink(_ module: CoreExtraModule) -> CoreLink {
        CoreLink(module: .actividades, extra: module)
    }

    private static func parse(segments rawSegments: [String], params: [String: String]) -> DeepLinkDestination? {
        let segments = rawSegments.map { $0.lowercased() }.filter { !$0.isEmpty }
        guard let head = segments.first else { return nil }

        if segments.contains("notifications-center") || segments == ["notifications"] {
            return .notifications
        }
        if portalHeads.contains(head) {
            let rest = Array(segments.dropFirst())
            let entityId = positiveInt64(rest.last)
            let parts = entityId != nil ? Array(rest.dropLast()) : rest
            return .portal(key: parts.last ?? "home", entityId: entityId)
        }
        if nonErpHeads.contains(head) {
            return .core(redirectNonErp(segments: segments, params: params))
        }
        let parts = head == "erp" ? Array(segments.dropFirst()) : segments
        return erpDestination(parts: parts, params: params)
    }

    /// `coreSurfaceRedirect`: detalle y evidencias de actividad conservan el id,
    /// «Mi perfil» y «Mis actividades» van a su equivalente; lo demás, a casa.
    private static func redirectNonErp(segments: [String], params: [String: String]) -> CoreLink {
        let head = segments[0]
        let rest = Array(segments.dropFirst())

        if head == "ops", rest.count >= 2, activityHeads.contains(rest[0]), let id = positiveInt(rest[1]) {
            let suffix = rest.count >= 3 ? rest[2] : ""
            let tab = (suffix == "evidences" || suffix == "evidencias") ? "evidencias" : "detalle"
            return CoreLink(module: .actividades, activityId: id, tab: tab)
        }

        if head == "ops", rest.count == 1, let activityId = positiveInt(params["activityId"] ?? params["activityid"]) {
            if evidenceHeads.contains(rest[0]) {
                return CoreLink(module: .actividades, activityId: activityId, tab: "evidencias")
            }
            if activityHeads.contains(rest[0]) || myActivityHeads.contains(rest[0]) {
                return CoreLink(module: .actividades, activityId: activityId, tab: "detalle")
            }
        }

        if segments.last == "my-profile" {
            return CoreLink(module: .perfil)
        }
        if head == "ops", rest.count == 1, myActivityHeads.contains(rest[0]) {
            return CoreLink(module: .actividades, vista: "mias")
        }
        // Vehículos, herramientas y proyectos de Operaciones viven ahora en
        // /erp (la web ya manda `/ops/projects` a `/erp/proyectos`).
        if head == "ops", let first = rest.first {
            switch first {
            case "vehicles", "vehiculos", "my-vehicles", "mis-vehiculos":
                return extraLink(.vehiculos)
            case "tools", "herramientas":
                return extraLink(.herramientas)
            case "projects", "proyectos":
                return extraLink(.proyectos)
            default:
                break
            }
        }
        return CoreLink.home
    }

    /// Rutas de `/erp` que existen en Core; cualquier otra cae en Actividades.
    private static func erpDestination(parts: [String], params: [String: String]) -> DeepLinkDestination {
        guard let first = parts.first else { return .core(CoreLink.home) }
        let second: String? = parts.count >= 2 ? parts[1] : nil
        let queryActivityId = positiveInt(params["activityId"] ?? params["activityid"])

        if activityHeads.contains(first) || myActivityHeads.contains(first) {
            if parts.count >= 2, let id = positiveInt(parts[1]) {
                let suffix = parts.count >= 3 ? parts[2] : ""
                let tab: String
                switch suffix {
                case "evidencias", "evidences": tab = "evidencias"
                case "historial", "history": tab = "historial"
                default: tab = "detalle"
                }
                return .core(CoreLink(module: .actividades, activityId: id, tab: tab))
            }
            if let queryActivityId {
                return .core(CoreLink(module: .actividades, activityId: queryActivityId, tab: "detalle"))
            }
            let vista = myActivityHeads.contains(first) ? "mias" : params["vista"]
            return .core(CoreLink(module: .actividades, vista: vista))
        }

        switch first {
        case "pizarra":
            var link = CoreLink(module: .actividades, vista: params["vista"])
            if parts.count >= 2, let userId = positiveInt(parts[1]) {
                link.boardUserId = userId
                link.vista = "equipo"
            }
            return .core(link)
        case "asistencias", "asistencia", "attendance":
            // KPIs del equipo cuelga de Asistencias en la web, pero es otro módulo.
            if second == "indicadores" {
                return .core(extraLink(.kpisEquipo))
            }
            return .core(CoreLink(module: .asistencias, tab: params["tab"]))
        case "almacen", "warehouse":
            return .core(extraLink(second == "herramientas" ? .herramientas : .almacen))
        case "vehiculos":
            // Incluye `mis-vehiculos`, `:id` y `gps`.
            return .core(extraLink(.vehiculos))
        case "organigrama":
            return .core(extraLink(.organigrama))
        case "hr":
            // `/erp/hr/orgchart`; lo demás de RH no existe en Core.
            return .core(second == "orgchart" ? extraLink(.organigrama) : CoreLink.home)
        case "cotizaciones":
            return .core(extraLink(.cotizaciones))
        case "proyectos":
            return .core(extraLink(.proyectos))
        case "chat":
            let channel = parts.count >= 2 ? positiveInt64(parts[1]) : nil
            return .core(CoreLink(
                module: .chat,
                chatChannelId: channel ?? positiveInt64(params["channel"] ?? params["channelid"]),
                chatMessageId: positiveInt64(params["msg"] ?? params["messageid"])
            ))
        case "my-profile", "mi-perfil":
            return .core(CoreLink(module: .perfil))
        case "clientes":
            return .core(CoreLink(
                module: .clientes,
                vista: params["sector"],
                entityId: parts.count >= 2 ? positiveInt64(parts[1]) : nil
            ))
        case "notificaciones":
            return .notifications
        default:
            return .core(CoreLink.home)
        }
    }
}
