import Foundation

/// Contrato de cableado de bitácora, notificaciones y perfil ACS.
enum IntegraGovernanceRoutes {
    static let audit = "integra/audit"
    static let notifications = "integra/notifications-center"
    static let myProfile = "integra/my-profile"

    static let keyAudit = "integra-audit"
    static let keyNotifications = "integra-notifications"
    static let keyMyProfile = "integra-my-profile"

    static func title(for route: String?) -> String? {
        switch route {
        case audit: return "Bitácora y auditoría"
        case notifications: return "Centro de notificaciones"
        case myProfile: return "Mi perfil"
        default: return nil
        }
    }

    static func route(forModuleKey key: String) -> String? {
        switch key.lowercased() {
        case keyAudit, "audit", "bitacora", "auditoria":
            return audit
        case keyNotifications, "notifications", "notifications-center", "notificaciones":
            return notifications
        case keyMyProfile, "my-profile", "mi-perfil", "perfil":
            return myProfile
        default:
            return nil
        }
    }
}
