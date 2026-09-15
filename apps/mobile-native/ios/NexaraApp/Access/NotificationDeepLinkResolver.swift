import Foundation

/// Resuelve una notificación (push o bandeja) a una pantalla nativa.
///
/// Orden: `relatedUrl` (`url`/`deepLink` en el push) → `entityType` +
/// `relatedEntityId` → `category`. Solo existe Core: lo que no es de Core abre
/// Actividades, igual que `coreSurfaceRedirect` en la web.
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
        // Había datos pero no son de Core: a casa, como la web.
        return (type.isEmpty && cat.isEmpty) ? nil : .core(CoreLink.home)
    }

    /// Detalle de actividad en una pestaña, o Actividades si no hay id.
    private static func activity(_ id: Int64?, tab: String) -> DeepLinkDestination {
        if let id, let activityId = Int(exactly: id) {
            return .core(CoreLink(module: .actividades, activityId: activityId, tab: tab))
        }
        return .core(CoreLink.home)
    }

    private static func forEntityType(_ type: String, id: Int64?) -> DeepLinkDestination? {
        switch type {
        case "activity", "activities", "activity_assignee", "activity_team", "dispatch", "despacho":
            return activity(id, tab: "detalle")
        case "evidence", "evidences", "activity_evidence", "activityevidence", "evidence_review":
            return activity(id, tab: "evidencias")
        case "activity_schedule", "schedule_change", "reprogramacion":
            return activity(id, tab: "historial")
        case "attendance":
            return .core(CoreLink(module: .asistencias))
        case "lunchbreak", "lunch_break", "lunch", "comida", "comidas":
            // Igual que la web: `/erp/asistencias?tab=comidas`.
            return .core(CoreLink(module: .asistencias, tab: "comidas"))
        case "chat_message":
            // relatedEntityId es el mensaje; el canal viene en relatedUrl.
            return .core(CoreLink(module: .chat))
        case "chat_channel", "chat", "channel":
            return .core(CoreLink(module: .chat, chatChannelId: id))
        case "ticket", "tickets", "service_sheet":
            // Solo el portal externo lo abre; en Core cae en Actividades.
            return .portal(key: "tickets", entityId: id)
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
        case "attendance":
            return .core(CoreLink(module: .asistencias))
        case "lunch_breaks", "lunch", "comidas":
            return .core(CoreLink(module: .asistencias, tab: "comidas"))
        case "chat":
            return .core(CoreLink(module: .chat))
        case "profile":
            return .core(CoreLink(module: .perfil))
        case "tickets":
            return .portal(key: "tickets", entityId: id)
        default:
            return nil
        }
    }
}
