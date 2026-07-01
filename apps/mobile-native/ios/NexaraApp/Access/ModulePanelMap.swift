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
        "assets", "maintenance", "maintenance-contracts",
        "service-sheets", "client-tickets", "support", "noc", "support-sla",
        "service-clients",
        "cvs",
    ]

    private static let erpKeys: Set<String> = [
        "dashboard",
        "executive", "approvals", "notifications-center", "bi",
        "attendance", "lunch-breaks", "my-lunch-breaks",
        "hr", "fines", "users", "employee-payments",
        "accounting", "banking", "invoicing", "expenses",
        "warehouse", "stock", "procurement",
        "documents", "audit", "analytics",
        "clients", "projects", "cotizaciones", "gestion-vendedores",
        "contact-messages", "news", "newsletter",
        "settings", "my-profile", "my-preferences",
        "companies", "kb", "exports", "architecture", "calendar", "orgchart", "kpis-hr",
    ]

    static func consoleKeys(for panel: PanelId) -> Set<String>? {
        switch panel {
        case .ops: return opsKeys
        case .erp: return erpKeys
        default: return nil
        }
    }
}
