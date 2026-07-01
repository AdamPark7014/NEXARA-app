import SwiftUI

/// Paneles consolidados — espejo de apps/web/lib/access-matrix.ts (PANELS).
enum PanelId: String, CaseIterable, Identifiable {
    case erp, crm, ops, studio, lab, portal

    var id: String { rawValue }

    var key: String { rawValue }

    var displayName: String {
        switch self {
        case .erp: return "NEXARA ERP"
        case .crm: return "NEXARA CRM"
        case .ops: return "NEXARA OPS"
        case .studio: return "NEXARA STUDIO"
        case .lab: return "NEXARA LAB"
        case .portal: return "Portal clientes"
        }
    }

    var tagline: String {
        switch self {
        case .erp: return "Administración, finanzas, RH y gobierno"
        case .crm: return "Pipeline comercial y clientes"
        case .ops: return "Campo, NOC, soporte y mantenimiento"
        case .studio: return "Marca, sitio público y casos"
        case .lab: return "Sandbox técnico y API health"
        case .portal: return "Tickets, sucursales e inventarios"
        }
    }

    var icon: String {
        switch self {
        case .erp: return "gearshape.2"
        case .crm: return "chart.line.uptrend.xyaxis"
        case .ops: return "bolt.fill"
        case .studio: return "paintpalette"
        case .lab: return "flask"
        case .portal: return "ticket"
        }
    }

    var accent: Color {
        switch self {
        case .erp: return Color(red: 0.05, green: 0.65, blue: 0.91)
        case .crm: return Color(red: 0.06, green: 0.73, blue: 0.51)
        case .ops: return Color(red: 0.98, green: 0.45, blue: 0.09)
        case .studio: return Color(red: 0.66, green: 0.33, blue: 0.97)
        case .lab: return Color(red: 0.39, green: 0.45, blue: 0.55)
        case .portal: return Color(red: 0.05, green: 0.58, blue: 0.53)
        }
    }

    static func fromLegacy(_ legacy: String) -> PanelId {
        switch legacy {
        case "console", "contabilidad", "people": return .erp
        case "ventas": return .crm
        case "operacion", "noc", "support": return .ops
        case "web": return .studio
        case "tickets": return .portal
        case "lab": return .lab
        default: return PanelId(rawValue: legacy) ?? .erp
        }
    }
}

/// Puente para ModuleRouter (catálogo legacy console/ventas/web/tickets).
enum ModuleRoutingPortal {
    case console, ventas, web, studio, tickets, contabilidad, lab
}

extension PanelId {
    var routingPortal: ModuleRoutingPortal {
        switch self {
        case .erp, .ops: return .console
        case .crm: return .ventas
        case .studio: return .studio
        case .portal: return .tickets
        case .lab: return .lab
        }
    }
}
