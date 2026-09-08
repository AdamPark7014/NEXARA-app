import Foundation
import SwiftUI

/// Fechas, edad del espejo y etiquetas ligeras — paridad Android `IntegraFormat` / `IntegraRules`.
enum IntegraFormat {
    static let empty = "—"
    static let syncStaleMs: TimeInterval = 60 * 60

    struct SyncAge: Hashable {
        let label: String
        let stale: Bool
    }

    /// Interpreta ISO-Z, ISO con desfase, o hora de pared sin TZ.
    static func parseMs(_ raw: String?) -> TimeInterval? {
        guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty,
              raw != "null", raw != "undefined" else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = iso.date(from: raw) { return d.timeIntervalSince1970 }
        iso.formatOptions = [.withInternetDateTime]
        if let d = iso.date(from: raw) { return d.timeIntervalSince1970 }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        let sliced = String(raw.replacingOccurrences(of: " ", with: "T").prefix(19))
        if let d = f.date(from: sliced) { return d.timeIntervalSince1970 }
        f.dateFormat = "yyyy-MM-dd"
        if let d = f.date(from: String(raw.prefix(10))) { return d.timeIntervalSince1970 }
        return nil
    }

    static func syncAge(lastSyncMs: TimeInterval, now: Date = Date()) -> SyncAge {
        let edad = now.timeIntervalSince1970 - lastSyncMs
        if edad < 0 { return SyncAge(label: "recién", stale: false) }
        let minutos = Int(edad / 60)
        let label: String
        switch minutos {
        case ..<1: label = "hace menos de 1 min"
        case ..<60: label = "hace \(minutos) min"
        case ..<(60 * 24): label = "hace \(minutos / 60) h"
        default: label = "hace \(minutos / (60 * 24)) d"
        }
        return SyncAge(label: label, stale: edad > syncStaleMs)
    }

    static func syncAge(raw: String?, now: Date = Date()) -> SyncAge? {
        guard let ms = parseMs(raw) else { return nil }
        return syncAge(lastSyncMs: ms, now: now)
    }

    static func shortDateTime(_ raw: String?) -> String {
        guard let ms = parseMs(raw) else { return empty }
        let d = Date(timeIntervalSince1970: ms)
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "dd/MM HH:mm"
        return f.string(from: d)
    }

    static func relative(_ raw: String?, now: Date = Date()) -> String {
        guard let ms = parseMs(raw) else { return empty }
        let seconds = Int(now.timeIntervalSince1970 - ms)
        switch seconds {
        case ..<60: return "ahora"
        case ..<3600: return "hace \(seconds / 60) min"
        case ..<86_400: return "hace \(seconds / 3600) h"
        case ..<172_800: return "ayer"
        case ..<2_592_000: return "hace \(seconds / 86_400) d"
        default: return shortDateTime(raw)
        }
    }

    static func duration(minutes: Int?) -> String {
        guard let minutes, minutes >= 0 else { return empty }
        if minutes < 60 { return "\(minutes) min" }
        let h = minutes / 60
        let m = minutes % 60
        return m == 0 ? "\(h) h" : "\(h) h \(m) min"
    }

    static func dateOnly(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}

/// Alias de compatibilidad con pantallas core que ya llaman `IntegraCoreFormat`.
typealias IntegraCoreFormat = IntegraFormat

enum IntegraRules {
    static func providerLabel(_ raw: String?) -> String {
        switch raw?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
        case "ISAPI": return "ISAPI (equipo en sitio)"
        case "ARTEMIS": return "HikCentral (Artemis)"
        case "HCT": return "Hik-Connect for Teams"
        case nil, "": return IntegraFormat.empty
        case let v?: return v
        }
    }

    static func syncStatusLabel(_ raw: String?) -> String {
        switch raw?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
        case "SYNCED": return "Sincronizada"
        case "ERROR": return "Error de sincronización"
        case "CANCELLED": return "Cancelada"
        case "PENDING": return "Pendiente"
        case nil, "": return IntegraFormat.empty
        case let v?: return v
        }
    }

    static func syncStatusTone(_ raw: String?) -> NxTone {
        switch raw?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
        case "SYNCED": return .success
        case "ERROR": return .danger
        case "CANCELLED": return .neutral
        case "PENDING": return .warning
        default: return .neutral
        }
    }
}

// MARK: - Notification triage (Android NotificationTriage)

enum IntegraNotifBucket: String, CaseIterable, Identifiable {
    case todas = "all"
    case integra
    case ops
    case sales
    case erp
    case otras = "other"

    var id: String { rawValue }

    var etiqueta: String {
        switch self {
        case .todas: return "Todas"
        case .integra: return "INTEGRA"
        case .ops: return "Ops / SLA"
        case .sales: return "CRM / Cotiz."
        case .erp: return "ERP / OC"
        case .otras: return "Otras"
        }
    }

    static func from(category: String?) -> IntegraNotifBucket {
        let c = category?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        if c.isEmpty { return .otras }
        if c.contains("acs") || c.contains("integra") || c.contains("access")
            || c.contains("door") || c.contains("visitor") || c == "security" {
            return .integra
        }
        if c.contains("sla") || c == "activity" || c == "activities" || c == "noc"
            || c == "evidence" || c == "evidences" {
            return .ops
        }
        if c.contains("quote") || c == "crm" || c == "sales" || c == "margin-alert" {
            return .sales
        }
        if c == "erp" || c.contains("purchase") || c.contains("stock")
            || c == "finance" || c == "approval" || c == "orders" || c == "workflow" {
            return .erp
        }
        return .otras
    }
}

enum IntegraNotifVista: String, CaseIterable, Identifiable {
    case accion = "Acción ahora"
    case bandeja = "Bandeja"
    case senales = "Señales INTEGRA"

    var id: String { rawValue }
}

enum IntegraNotificationTriage {
    private static let categoriaLabels: [String: String] = [
        "attendance": "Asistencia", "activity": "OT", "activities": "OT",
        "finance": "Finanzas", "noc": "NOC", "crm": "CRM", "approval": "Aprobación",
        "workflow": "Aprobación", "evidence": "Evidencias", "evidences": "Evidencias",
        "sales": "Ventas", "quotes": "Cotizaciones", "sla-alert": "SLA", "sla-breach": "SLA",
        "erp": "ERP", "security": "Seguridad", "ops-acs": "Accesos", "profile": "Perfil",
        "orders": "Órdenes", "vehicles": "Vehículos", "stock-alert": "Inventario",
        "margin-alert": "Margen",
    ]

    static func etiquetaCategoria(_ category: String?) -> String {
        let c = category?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if c.isEmpty { return "Sin categoría" }
        return categoriaLabels[c.lowercased()] ?? c
    }

    static func esAccionable(read: Bool, priority: String?, category: String?) -> Bool {
        if read { return false }
        if priority?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "high" {
            return true
        }
        switch IntegraNotifBucket.from(category: category) {
        case .integra, .ops, .sales, .erp: return true
        default: return false
        }
    }

    static func ordenar(_ items: [IntegraNotificationRow]) -> [IntegraNotificationRow] {
        items.sorted { a, b in
            let ra = rank(a)
            let rb = rank(b)
            if ra != rb { return ra < rb }
            let ta = IntegraFormat.parseMs(a.createdAt) ?? -.infinity
            let tb = IntegraFormat.parseMs(b.createdAt) ?? -.infinity
            return ta > tb
        }
    }

    static func filtrar(
        _ items: [IntegraNotificationRow],
        vista: IntegraNotifVista,
        bucket: IntegraNotifBucket
    ) -> [IntegraNotificationRow] {
        let base: [IntegraNotificationRow]
        switch vista {
        case .accion:
            base = items.filter {
                esAccionable(read: $0.read, priority: $0.priority, category: $0.category)
            }
        case .senales:
            base = items.filter { IntegraNotifBucket.from(category: $0.category) == .integra }
        case .bandeja:
            base = bucket == .todas
                ? items
                : items.filter { IntegraNotifBucket.from(category: $0.category) == bucket }
        }
        return ordenar(base)
    }

    private static func rank(_ n: IntegraNotificationRow) -> Int {
        let high = !n.read && n.priority?.lowercased() == "high"
        if high { return 0 }
        if !n.read { return 1 }
        return 2
    }
}

// MARK: - Profile credentials (Android ProfileCredentials)

struct IntegraCredencialDetalle: Identifiable, Hashable {
    var id: String { nombre }
    let nombre: String
    let presente: Bool
    let detalle: String
    let queAbre: String
    let fuente: String
}

struct IntegraEstadoVinculo: Hashable {
    let titulo: String
    let explicacion: String
    let vinculado: Bool
}

enum IntegraProfileCredentials {
    static func puertasDe(_ person: [String: Any]) -> [String] {
        if let list = person["doorNames"] as? [String] {
            return list.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        }
        if let any = person["doorNames"] as? [Any] {
            return any.compactMap { $0 as? String }.filter { !$0.isEmpty }
        }
        return []
    }

    static func descripcionPuertas(_ person: [String: Any]) -> String {
        let puertas = puertasDe(person)
        if !puertas.isEmpty { return puertas.joined(separator: ", ") }
        if let plan = person.integraStr("rightPlan", "doorRight") {
            return "Plan «\(plan)» — el sitio no devolvió los nombres de las puertas"
        }
        return "Ninguna puerta asignada"
    }

    static func descripcionVigencia(_ person: [String: Any]) -> String {
        let habilitado = person.integraBool("validEnable")
        let desde = person.integraStr("validFrom")
        let hasta = person.integraStr("validTo")
        let ventana: String = {
            if let desde, let hasta {
                return "del \(IntegraFormat.shortDateTime(desde)) al \(IntegraFormat.shortDateTime(hasta))"
            }
            if let hasta { return "hasta el \(IntegraFormat.shortDateTime(hasta))" }
            if let desde { return "desde el \(IntegraFormat.shortDateTime(desde))" }
            return "sin ventana declarada"
        }()
        switch habilitado {
        case true?: return "Activa · \(ventana)"
        case false?: return "Desactivada en el terminal · \(ventana)"
        case nil: return "Estado desconocido · \(ventana)"
        }
    }

    static func credencialesDe(_ person: [String: Any]) -> [IntegraCredencialDetalle] {
        let abre = descripcionPuertas(person)
        let rostros = person.integraInt("numOfFace") ?? 0
        let rostroLocal = person.integraBool("hasLocalFace") == true
        let tieneRostro = person.integraBool("hasFace") == true || rostros > 0 || rostroLocal
        let huellas = person.integraInt("numOfFP")
            ?? ((person["localFpIds"] as? [Any])?.count ?? 0)
        let tarjetas = (person["cardNos"] as? [String]) ?? []
        let numTarjetas = person.integraInt("numOfCard") ?? tarjetas.count
        let employeeNo = person.integraStr("id", "employeeNo", "personId")
        let codigo = person.integraStr("code", "personCode")

        return [
            IntegraCredencialDetalle(
                nombre: "Rostro",
                presente: tieneRostro,
                detalle: {
                    if rostros > 0 { return "\(rostros) registrado(s) en el terminal" }
                    if rostroLocal { return "Foto guardada en NEXARA, aún sin confirmar en el terminal" }
                    if tieneRostro { return "Registrado" }
                    return "No registrado"
                }(),
                queAbre: abre,
                fuente: "integra/people/{id} · numOfFace · hasLocalFace"
            ),
            IntegraCredencialDetalle(
                nombre: "Huella",
                presente: huellas > 0,
                detalle: huellas > 0 ? "\(huellas) registrada(s)" : "No registrada",
                queAbre: abre,
                fuente: "integra/people/{id} · numOfFP · localFpIds"
            ),
            IntegraCredencialDetalle(
                nombre: "Tarjeta",
                presente: numTarjetas > 0,
                detalle: {
                    if !tarjetas.isEmpty { return "\(tarjetas.count): \(tarjetas.joined(separator: ", "))" }
                    if numTarjetas > 0 { return "\(numTarjetas) registrada(s), sin número visible" }
                    return "No registrada"
                }(),
                queAbre: abre,
                fuente: "integra/people/{id} · numOfCard · cardNos"
            ),
            IntegraCredencialDetalle(
                nombre: "Número de empleado (employeeNo)",
                presente: !(employeeNo ?? "").isEmpty,
                detalle: {
                    guard let employeeNo else { return "Sin número en el terminal" }
                    if let codigo, codigo != employeeNo {
                        return "\(employeeNo) · código de persona \(codigo)"
                    }
                    return employeeNo
                }(),
                queAbre: abre,
                fuente: "integra/people/{id} · clave ERP↔ACS"
            ),
            IntegraCredencialDetalle(
                nombre: "Vigencia del permiso",
                presente: person.integraBool("validEnable") != false,
                detalle: descripcionVigencia(person),
                queAbre: abre,
                fuente: "integra/people/{id} · validEnable · validFrom · validTo"
            ),
        ]
    }

    static func estadoVinculo(status: String?, nombreAcs: String?) -> IntegraEstadoVinculo {
        switch status {
        case "linked":
            return .init(
                titulo: "Vinculado a \(nombreAcs ?? "una persona ACS")",
                explicacion: "Tu número de empleado coincide con el employeeNo de un terminal.",
                vinculado: true
            )
        case "erp_only":
            return .init(
                titulo: "Con número de empleado, sin persona en el ACS",
                explicacion: "Tienes código en el ERP pero ningún terminal tiene esa persona.",
                vinculado: false
            )
        case "acs_only":
            return .init(
                titulo: "Con persona en el ACS, sin número en el ERP",
                explicacion: "El terminal te conoce pero el ERP no guarda tu employeeNo.",
                vinculado: false
            )
        case "unlinked":
            return .init(
                titulo: "Sin número de empleado",
                explicacion: "No hay dato con el que unir tu usuario ERP con una persona ACS.",
                vinculado: false
            )
        case nil:
            return .init(
                titulo: "Estado no disponible",
                explicacion: "El servidor no devolvió el estado del vínculo.",
                vinculado: false
            )
        default:
            return .init(
                titulo: "Estado desconocido: \(status ?? "")",
                explicacion: "Se muestra tal cual en vez de suponer.",
                vinculado: false
            )
        }
    }
}
