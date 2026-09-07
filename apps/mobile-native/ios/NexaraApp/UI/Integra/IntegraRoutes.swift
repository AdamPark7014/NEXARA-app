import Foundation
import SwiftUI

/// Rutas y claves de módulo INTEGRA — paridad Android `IntegraNavHost` / catálogo.
/// El agente de wiring monta `IntegraRootView` y resuelve deep links con estas constantes.
enum IntegraRoutes {
    static let home = "integra/home"
    static let access = "integra/access"
    static let events = "integra/events"
    static let people = "integra/people"
    static let personDetail = "integra/people/" // + personId
    static let attendance = "integra/attendance"
    static let visitors = "integra/visitors"
    static let alarms = "integra/alarms"
    static let occupancy = "integra/occupancy"
    static let devices = "integra/devices"
    /// Lista de consulta; `integra-sites` del catálogo resuelve a Ajustes (DetectionRoutes.settings).
    static let sites = "integra/sites"

    static func personDetail(_ personId: String) -> String {
        "integra/people/\(personId)"
    }

    /// Claves de catálogo de los 10 módulos core.
    enum ModuleKey {
        static let home = "integra-home"
        static let access = "integra-access"
        static let events = "integra-events"
        static let people = "integra-people"
        static let attendance = "integra-attendance"
        static let visitors = "integra-visitors"
        static let alarms = "integra-alarms"
        static let occupancy = "integra-occupancy"
        static let devices = "integra-devices"
        static let sites = "integra-sites"

        static let core: [String] = [
            home, access, events, people, attendance,
            visitors, alarms, occupancy, devices, sites,
        ]
    }

    /// Resuelve clave de módulo o alias → ruta interna del NavStack.
    /// Los paquetes avanzados se consultan vía `IntegraAdvancedGraph` (como Android).
    static func route(forKey key: String) -> String {
        let k = key.lowercased()
        if let r = IntegraAdvancedGraph.route(forModuleKey: k) { return r }
        switch k {
        case ModuleKey.home, "home", "inicio": return home
        case ModuleKey.access, "access", "acceso", "puertas", "doors": return access
        case ModuleKey.events, "events", "eventos": return events
        case ModuleKey.people, "people", "personas": return people
        case ModuleKey.attendance, "attendance", "asistencia": return attendance
        case ModuleKey.visitors, "visitors", "visitantes": return visitors
        case ModuleKey.alarms, "alarms", "alarmas": return alarms
        case ModuleKey.occupancy, "occupancy", "en-sitio", "presencia": return occupancy
        case ModuleKey.devices, "devices", "equipos": return devices
        case "sites", "sitios-lista": return sites
        default:
            if key.hasPrefix("integra/") { return key }
            return home
        }
    }

    static func title(forRoute route: String) -> String {
        if let t = IntegraAdvancedGraph.title(for: route) { return t }
        if route.hasPrefix(people + "/"), route != people { return "Persona" }
        switch route {
        case home: return "INTEGRA"
        case access: return "Acceso"
        case events: return "Eventos"
        case people: return "Personas"
        case attendance: return "Asistencia ACS"
        case visitors: return "Visitantes"
        case alarms: return "Alarmas"
        case occupancy: return "En sitio"
        case devices: return "Equipos"
        case sites: return "Sitios"
        default: return "INTEGRA"
        }
    }
}

// MARK: - Dict helpers (UI-local)

enum IntegraDict {
    static func str(_ m: [String: Any], _ keys: String...) -> String {
        for k in keys {
            if let v = m[k] {
                let s: String
                if let ss = v as? String { s = ss }
                else if let n = v as? NSNumber { s = n.stringValue }
                else { s = String(describing: v) }
                if !s.isEmpty && s != "null" { return s }
            }
        }
        return ""
    }

    static func bool(_ m: [String: Any], _ keys: String...) -> Bool? {
        for k in keys {
            if let b = m[k] as? Bool { return b }
            if let n = m[k] as? NSNumber { return n.boolValue }
            if let s = m[k] as? String {
                let t = s.lowercased()
                if ["1", "true", "yes", "si", "sí"].contains(t) { return true }
                if ["0", "false", "no"].contains(t) { return false }
            }
        }
        return nil
    }

    static func int(_ m: [String: Any], _ keys: String...) -> Int {
        for k in keys {
            if let i = m[k] as? Int { return i }
            if let n = m[k] as? NSNumber { return n.intValue }
            if let s = m[k] as? String, let i = Int(s) { return i }
        }
        return 0
    }

    static func matchesQuery(_ m: [String: Any], query: String, _ keys: String...) -> Bool {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if q.isEmpty { return true }
        return keys.contains { str(m, $0).lowercased().contains(q) }
    }
}

// MARK: - Door control (paridad Android DoorControl)

enum IntegraDoorControl: String, CaseIterable, Identifiable {
    case abrir = "2"
    case cerrar = "1"
    case quedarAbierta = "0"
    case quedarCerrada = "3"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .abrir: return "Abrir (momentáneo)"
        case .cerrar: return "Cerrar"
        case .quedarAbierta: return "Quedar abierta"
        case .quedarCerrada: return "Quedar cerrada"
        }
    }

    var controlType: String { rawValue }
    var franqueaPaso: Bool { self == .abrir || self == .quedarAbierta }
}

enum IntegraDoorRules {
    static let motivoMinimo = 3
    static func motivoValido(_ reason: String) -> Bool {
        reason.trimmingCharacters(in: .whitespacesAndNewlines).count >= motivoMinimo
    }

    static func doorState(online: Bool?, status: String?) -> String {
        if online == false { return "offline" }
        let s = (status ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let known = ["remain_open", "closed", "open", "remain_closed", "offline", "unknown"]
        return known.contains(s) ? s : "unknown"
    }

    static let stateFilters = ["offline", "remain_open", "open", "closed", "remain_closed", "unknown"]

    static func stateLabel(_ state: String) -> String {
        switch state {
        case "offline": return "Fuera de línea"
        case "remain_open": return "Queda abierta"
        case "open": return "Abierta"
        case "closed": return "Cerrada"
        case "remain_closed": return "Queda cerrada"
        default: return "Desconocido"
        }
    }

    static func stateTone(_ state: String) -> NxTone {
        switch state {
        case "offline": return .danger
        case "remain_open", "open": return .warning
        case "closed", "remain_closed": return .success
        default: return .neutral
        }
    }
}

/// Fila de lista UI sobre mapas del espejo/API.
struct IntegraRow: Identifiable, Hashable {
    let id: String
    let raw: [String: Any]

    static func == (lhs: IntegraRow, rhs: IntegraRow) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}
