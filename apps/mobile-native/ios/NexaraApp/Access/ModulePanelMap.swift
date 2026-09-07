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
        "cvs", "recruiting",
        "dispatch", "chat",
    ]

    private static let erpKeys: Set<String> = [
        "dashboard",
        "executive", "approvals", "notifications-center", "bi",
        "reuniones",
        "attendance", "lunch-breaks", "my-lunch-breaks",
        "hr", "fines", "users", "employee-payments",
        "accounting", "banking", "invoicing", "expenses",
        "viatics", "my-viatics",
        "warehouse", "stock", "procurement",
        "documents", "audit", "analytics",
        "cvs", "recruiting",
        "clients", "projects", "cotizaciones", "gestion-vendedores",
        "contact-messages", "news", "newsletter",
        "settings", "my-profile", "my-preferences", "offline-queue",
        "companies", "kb", "exports", "architecture", "calendar", "orgchart", "kpis-hr",
        "chat",
    ]

    /// 21 claves INTEGRA — espejo de Android `ModulePanelMap.INTEGRA_KEYS`.
    static let integraKeys: Set<String> = [
        "integra-home",
        "integra-access",
        "integra-events",
        "integra-people",
        "integra-attendance",
        "integra-visitors",
        "integra-alarms",
        "integra-occupancy",
        "integra-devices",
        "integra-sites",
        "integra-video",
        "integra-vehicles",
        "integra-anpr",
        "integra-schedules",
        "integra-espacios",
        "integra-detection",
        "integra-audit",
        "integra-notifications",
        "integra-my-profile",
        "integra-map",
        "integra-dashboard",
    ]

    static func consoleKeys(for panel: PanelId) -> Set<String>? {
        switch panel {
        case .ops: return opsKeys
        case .erp: return erpKeys
        default: return nil
        }
    }

    static func integraKeys(for panel: PanelId) -> Set<String>? {
        switch panel {
        case .integra: return integraKeys
        default: return nil
        }
    }
}
