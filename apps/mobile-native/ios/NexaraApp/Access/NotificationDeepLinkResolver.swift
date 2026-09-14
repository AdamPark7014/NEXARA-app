import Foundation

/// Resuelve una notificación (push o bandeja) a una pantalla nativa.
///
/// Orden, igual que Android `NotificationDeepLinkResolver`: `relatedUrl`
/// (`url`/`deepLink` en el push) → `entityType` + `relatedEntityId` →
/// `category`. A diferencia de Android, todo lo que era OPS abre dentro de ERP:
/// Core ya no tiene un hub OPS (ver `coreSurfaceRedirect` en la web).
enum NotificationDeepLinkResolver {
    /// Datos del push FCM/APNs (`userInfo`). El API manda `url`, `entityType`,
    /// `relatedEntityId`, `category` y `nexara_notification_id` como texto.
    static func resolve(userInfo: [AnyHashable: Any]) -> DeepLinkDestination? {
        func text(_ key: String) -> String? {
            let value = userInfo[AnyHashable(key)]
            if let string = value as? String {
                let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed.isEmpty ? nil : trimmed
            }
            if let number = value as? NSNumber {
                return number.stringValue
            }
            return nil
        }
        let url = text("relatedUrl") ?? text("url") ?? text("deepLink")
        let entityId = (text("relatedEntityId") ?? text("entityId")).flatMap { Int64($0) }
        return resolve(
            relatedUrl: url,
            entityType: text("entityType"),
            relatedEntityId: entityId,
            category: text("category")
        )
    }

    /// Fila de `GET notifications` (mapa crudo).
    static func resolve(notification: [String: Any]) -> DeepLinkDestination? {
        func text(_ key: String) -> String? {
            if let string = notification[key] as? String {
                let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed.isEmpty ? nil : trimmed
            }
            if let number = notification[key] as? NSNumber {
                return number.stringValue
            }
            return nil
        }
        return resolve(
            relatedUrl: text("relatedUrl") ?? text("url"),
            entityType: text("entityType"),
            relatedEntityId: text("relatedEntityId").flatMap { Int64($0) },
            category: text("category")
        )
    }

    static func resolve(
        relatedUrl: String?,
        entityType: String?,
        relatedEntityId: Int64?,
        category: String?
    ) -> DeepLinkDestination? {
        if let relatedUrl, !relatedUrl.isEmpty, let destination = DeepLinkParser.parseWebPath(relatedUrl) {
            return destination
        }
        let id: Int64? = (relatedEntityId ?? 0) > 0 ? relatedEntityId : nil
        let type = (entityType ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if !type.isEmpty, let destination = forEntityType(type, id: id) {
            return destination
        }
        let cat = (category ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if !cat.isEmpty, let destination = forCategory(cat, id: id) {
            return destination
        }
        return nil
    }

    /// Detalle de actividad en una pestaña, o la pizarra si no hay id.
    private static func activity(_ id: Int64?, tab: String) -> DeepLinkDestination {
        if let id {
            return .module(panel: .erp, key: "activities", entityId: id, params: ["tab": tab])
        }
        return .module(panel: .erp, key: "pizarra")
    }

    private static func forEntityType(_ type: String, id: Int64?) -> DeepLinkDestination? {
        switch type {
        case "activity", "activities", "activity_assignee", "activity_team", "dispatch", "despacho":
            return activity(id, tab: "detalle")
        case "evidence", "evidences", "activity_evidence", "activityevidence", "evidence_review":
            return activity(id, tab: "evidencias")
        case "activity_schedule", "schedule_change", "reprogramacion":
            return activity(id, tab: "historial")
        case "viatic", "viatico", "viatics":
            return .module(panel: .erp, key: "viatics", entityId: id)
        case "tool_request", "tool", "tools":
            return .module(panel: .erp, key: "tools", entityId: id)
        case "vehicle", "vehicles":
            return .module(panel: .erp, key: "vehicles", entityId: id)
        case "attendance", "lunch_break":
            return .module(panel: .erp, key: "attendance")
        case "saleslead", "lead", "leads":
            return .module(panel: .crm, key: "leads", entityId: id)
        case "salesopportunity", "opportunity", "opportunities":
            return .module(panel: .crm, key: "oportunidades", entityId: id)
        case "client", "clients", "salesclient":
            return .module(panel: .crm, key: "clients", entityId: id)
        case "cotizacion", "quote", "quotes":
            return .module(panel: .crm, key: "cotizaciones", entityId: id)
        case "ticket", "tickets", "service_sheet":
            return .module(panel: .portal, key: "tickets", entityId: id)
        case "chat_message":
            // relatedEntityId es el mensaje; el canal viene en relatedUrl.
            return .module(panel: .erp, key: "chat")
        case "chat_channel", "chat", "channel":
            if let id {
                return .module(panel: .erp, key: "chat", entityId: id, params: ["channel": String(id)])
            }
            return .module(panel: .erp, key: "chat")
        case "requisition", "purchase_order", "procurement":
            return .module(panel: .erp, key: "procurement", entityId: id)
        case "stocklevel", "warehouse", "movement":
            return .module(panel: .erp, key: "warehouse", entityId: id)
        case "salesproject", "project", "projects":
            return .module(panel: .erp, key: "projects", entityId: id)
        case "maintenancecontractvisit", "maintenance":
            return .module(panel: .erp, key: "maintenance-contracts", entityId: id)
        case "user", "users":
            return .module(panel: .erp, key: "users", entityId: id)
        case "fine", "fines":
            return .module(panel: .erp, key: "fines", entityId: id)
        case "accounting", "entry":
            return .module(panel: .erp, key: "accounting", entityId: id)
        default:
            return nil
        }
    }

    private static func forCategory(_ category: String, id: Int64?) -> DeepLinkDestination? {
        switch category {
        case "activity", "activities", "dispatch":
            return activity(id, tab: "detalle")
        case "evidence", "evidences":
            return activity(id, tab: "evidencias")
        case "attendance", "lunch_breaks":
            return .module(panel: .erp, key: "attendance")
        case "viatics":
            return .module(panel: .erp, key: "viatics", entityId: id)
        case "tool", "tools":
            return .module(panel: .erp, key: "tools", entityId: id)
        case "fines":
            return .module(panel: .erp, key: "fines", entityId: id)
        case "profile":
            return .module(panel: .erp, key: "my-profile")
        case "vehicles":
            return .module(panel: .erp, key: "vehicles", entityId: id)
        case "quotes":
            return .module(panel: .crm, key: "cotizaciones", entityId: id)
        case "orders":
            return .module(panel: .erp, key: "procurement", entityId: id)
        case "projects":
            return .module(panel: .erp, key: "projects", entityId: id)
        case "sales", "crm":
            return .module(panel: .crm, key: "dashboard")
        case "erp", "ops", "noc":
            return .module(panel: .erp, key: "pizarra")
        case "chat":
            return .module(panel: .erp, key: "chat")
        case "approval", "confirmations":
            return .module(panel: .erp, key: "approvals")
        case "tickets":
            return .module(panel: .portal, key: "tickets", entityId: id)
        default:
            return nil
        }
    }
}
