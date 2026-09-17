import SwiftUI

/// SF Symbol de cada notificación, para las listas dentro de la app.
///
/// El push trae la clave `icon` (entrada, comida_sale, por_revisar…). Los banners
/// del sistema no pueden pintar iconos propios sin una Notification Service
/// Extension, así que el icono solo se ve en `NotificationsCenterView`. La bandeja
/// del API no siempre trae `icon`: entonces se deduce de `type` y `category`.
enum NotificationIcon {
    /// Clave `icon` del servidor → SF Symbol. `nil` si la clave no se conoce.
    static func symbol(forIcon icon: String?) -> String? {
        switch (icon ?? "").lowercased() {
        case "entrada": return "arrow.right.circle"
        case "entrada_tarde": return "clock.badge.exclamationmark"
        case "salida": return "rectangle.portrait.and.arrow.right"
        case "comida_sale": return "fork.knife"
        case "comida_regresa": return "arrow.uturn.backward.circle"
        case "comida_tarde": return "clock.badge.exclamationmark"
        case "comida_aprobada": return "checkmark.circle"
        case "comida_rechazada": return "xmark.circle"
        case "actividad_nueva": return "doc.badge.plus"
        case "actividad_inicio": return "play.circle"
        case "fotos": return "camera"
        case "documento": return "doc.text"
        case "formulario": return "checklist"
        case "reasignada": return "arrow.left.arrow.right"
        case "reprogramada": return "calendar.badge.clock"
        case "despacho": return "paperplane"
        case "por_revisar": return "text.magnifyingglass"
        case "correccion": return "arrow.uturn.backward"
        case "aprobada": return "checkmark.seal"
        case "devuelta": return "arrow.uturn.left"
        case "finalizada": return "flag.checkered"
        case "atraso": return "hourglass"
        case "vencida": return "exclamationmark.triangle"
        case "chat": return "bubble.left.and.bubble.right"
        case "mencion": return "at"
        case "seguridad": return "lock.shield"
        case "aviso": return "bell"
        default: return nil
        }
    }

    /// `NotificationType` del API (+ `category` de respaldo) → SF Symbol.
    static func symbol(forType type: String?, category: String?) -> String {
        let t = (type ?? "").uppercased()
        switch t {
        case "ATTENDANCE_CHECKIN": return "arrow.right.circle"
        case "ATTENDANCE_CHECKOUT": return "rectangle.portrait.and.arrow.right"
        case "ATTENDANCE_ABSENCE": return "person.crop.circle.badge.exclamationmark"
        case "LUNCH_CHECKIN": return "fork.knife"
        case "LUNCH_CHECKOUT": return "arrow.uturn.backward.circle"
        case "ACTIVITY_ASSIGNED": return "doc.badge.plus"
        case "ACTIVITY_STARTED": return "play.circle"
        case "ACTIVITY_RESCHEDULED": return "calendar.badge.clock"
        case "ACTIVITY_COMPLETED", "PROJECT_COMPLETED": return "flag.checkered"
        case "ACTIVITY_APPROVED", "EVIDENCE_APPROVED": return "checkmark.seal"
        case "ACTIVITY_REJECTED", "EVIDENCE_REJECTED": return "arrow.uturn.left"
        case "ACTIVITY_RESUBMIT_REQUESTED", "EVIDENCE_RESUBMIT_REQUESTED": return "arrow.uturn.backward"
        case "EVIDENCE_SUBMITTED": return "text.magnifyingglass"
        case "SLA_ALERT": return "hourglass"
        case "TOOL_EXPIRATION_WARNING", "TOOL_EXPIRATION_DUE": return "exclamationmark.triangle"
        case "QUALITY_NCR_CREATED": return "exclamationmark.triangle"
        case "ACS_ACCESS_DENIED": return "lock.shield"
        case "CHAT_MENTION": return "at"
        case "USER_ACTION_CONFIRMED": return "checkmark.circle"
        case "MARGIN_ALERT": return "chart.line.downtrend.xyaxis"
        default: break
        }
        if t.hasPrefix("ATTENDANCE_") { return "clock" }
        if t.hasPrefix("TOOL_") || t.hasPrefix("MAINTENANCE_") { return "wrench.and.screwdriver" }
        if t.hasPrefix("VIATICO_") || t.hasPrefix("FINE_") || t.hasPrefix("PAYMENT_")
            || t.hasPrefix("INVOICE_") || t.hasPrefix("JOURNAL_") { return "banknote" }
        if t.hasPrefix("PROFILE_DOCUMENT_") { return "doc.text" }
        if t.hasPrefix("VEHICLE_") { return "car" }
        if t.hasPrefix("QUOTE_") { return "doc.plaintext" }
        if t.hasPrefix("SALES_") { return "briefcase" }
        if t.hasPrefix("PURCHASE_") { return "cart" }
        if t.hasPrefix("ORDER_") || t.hasPrefix("GOODS_") || t.hasPrefix("STOCK_") { return "shippingbox" }
        if t.hasPrefix("PRODUCTION_") { return "gearshape.2" }
        return Self.symbol(forCategory: category)
    }

    /// Solo con `category` (lo que ya usaba la bandeja).
    static func symbol(forCategory category: String?) -> String {
        let c = (category ?? "").lowercased()
        switch c {
        case "attendance": return "clock"
        case "lunch_break", "lunch_breaks": return "fork.knife"
        case "activity", "activities": return "checklist"
        case "tool": return "wrench.and.screwdriver"
        case "finance": return "banknote"
        case "noc": return "exclamationmark.triangle"
        case "crm": return "briefcase"
        case "approval": return "checkmark.seal"
        case "evidence", "evidences": return "camera"
        case "sla-alert", "sla-breach": return "hourglass"
        case "chat": return "bubble.left.and.bubble.right"
        case "profile": return "person.crop.circle"
        case "confirmations": return "checkmark.circle"
        default: return "bell"
        }
    }

    /// Icono de una fila de la bandeja (`[String: Any]` del API): primero la clave
    /// `icon` (en raíz, `data` o `metadata`), luego `type`, luego `category`.
    static func symbol(for notification: [String: Any]) -> String {
        let candidates: [Any?] = [
            notification["icon"],
            (notification["data"] as? [String: Any])?["icon"],
            (notification["metadata"] as? [String: Any])?["icon"],
        ]
        for candidate in candidates {
            if let key = candidate as? String, let found = Self.symbol(forIcon: key) { return found }
        }
        return Self.symbol(forType: notification["type"] as? String, category: notification["category"] as? String)
    }

    /// Color del icono: semántico para aprobado / avisos / errores, marca para lo demás.
    static func tint(forSymbol symbol: String) -> Color {
        switch symbol {
        case "checkmark.seal", "checkmark.circle", "flag.checkered":
            return CorePalette.green
        case "hourglass", "clock.badge.exclamationmark", "exclamationmark.triangle",
             "arrow.uturn.backward", "arrow.uturn.left", "person.crop.circle.badge.exclamationmark",
             "chart.line.downtrend.xyaxis":
            return CorePalette.orange
        case "xmark.circle", "lock.shield":
            return CorePalette.red
        default:
            return NxBrand.primary
        }
    }
}
