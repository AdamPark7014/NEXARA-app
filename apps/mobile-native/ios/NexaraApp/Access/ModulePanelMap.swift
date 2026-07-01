import Foundation

/// Qué módulos del catálogo console pertenecen a ERP vs OPS (paridad web).
enum ModulePanelMap {
    private static let opsKeys: Set<String> = [
        "dashboard",
        "activities", "my-activities",
        "evidences", "my-evidences",
        "viatics", "my-viatics",
        "vehicles", "my-vehicles",
        "gps", "tools",
        "projects", "work-projects",
        "assets", "maintenance",
        "service-sheets", "client-tickets",
        "cvs",
    ]

    private static let erpKeys: Set<String> = [
        "dashboard",
        "attendance", "lunch-breaks", "my-lunch-breaks",
        "hr", "fines", "users", "employee-payments",
        "accounting", "banking", "invoicing", "expenses",
        "warehouse", "stock", "procurement",
        "documents", "audit", "analytics",
        "clients", "projects", "cotizaciones", "gestion-vendedores",
        "contact-messages", "news", "newsletter",
        "settings", "my-profile", "my-preferences",
    ]

    static func consoleKeys(for panel: PanelId) -> Set<String>? {
        switch panel {
        case .ops: return opsKeys
        case .erp: return erpKeys
        default: return nil
        }
    }
}
