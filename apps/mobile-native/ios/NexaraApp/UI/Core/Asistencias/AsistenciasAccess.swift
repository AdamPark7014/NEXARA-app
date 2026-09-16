import SwiftUI

// Quién gestiona y quién checa, y los formatos de la pantalla Asistencias.
// Espejo de `getAttendanceViewMode` (apps/web/lib/section-views.ts) y de los
// formatos de `apps/web/app/(panels)/erp/asistencias/page.tsx`.

/// Igual que en la web: Dirección solo supervisa, campo solo checa y los
/// encargados de gente hacen las dos cosas.
enum AttendanceViewMode {
    case manage
    case register
    case manageRegister

    var canRegisterSelf: Bool { self != .manage }
    var canManageTeam: Bool { self != .register }
}

enum AsistenciasAccess {
    /// `PERMISSIONS.GPS_MANAGE` del API.
    static let gpsManage = "gps.manage"

    /// Encargados de gente: ven a su equipo **y** registran su jornada.
    private static let manageAndRegister: Set<String> = [
        RolePanelMatrix.rh,
        RolePanelMatrix.dirAdmin,
        RolePanelMatrix.coordAdmin,
        RolePanelMatrix.coordOperaciones,
        RolePanelMatrix.arquitecto,
        RolePanelMatrix.ingSoporte,
    ]

    static func role(_ user: SessionUser?) -> String? {
        guard let user else { return nil }
        return RolePanelMatrix.canonicalRoleKey(
            roleKey: user.roleKey,
            orgRoleKey: user.orgRoleKey,
            roleDisplayName: user.role
        )
    }

    static func mode(for user: SessionUser?) -> AttendanceViewMode {
        guard let user else { return .manage }
        if user.isSuperAdmin { return .manage }
        // Dirección (Christian) supervisa: en Core no tiene checador propio.
        if CoreOrg.isCeo(user.email) { return .manage }
        guard let role = role(user) else { return .register }
        if role == RolePanelMatrix.ceo
            || role == RolePanelMatrix.superAdmin
            || role == RolePanelMatrix.dirOperaciones {
            return .manage
        }
        return manageAndRegister.contains(role) ? .manageRegister : .register
    }

    /// Dirección, plataforma y `developer@` ven a toda la empresa: piden el
    /// rango **sin** `scope`. Los demás encargados, su subárbol (`scope=subtree`).
    static func companyWide(_ user: SessionUser?) -> Bool {
        guard let user else { return false }
        if user.isSuperAdmin { return true }
        let email = CoreOrg.normalized(user.email)
        if email == CoreOrg.ceoEmail || email == CoreOrg.developerEmail { return true }
        return role(user) == RolePanelMatrix.ceo
    }

    /// GPS en vivo del equipo y trayecto propio: `gps.manage` (o plataforma).
    static func canLiveGps(_ user: SessionUser?) -> Bool {
        guard let user else { return false }
        return user.isSuperAdmin || user.permissions.contains(gpsManage)
    }
}

/// Estado de la persona en el día (mismos nombres y colores que la web).
enum AttendanceEstado: String, CaseIterable {
    case presente = "PRESENTE"
    case completo = "COMPLETO"
    case ausente = "AUSENTE"

    var label: String {
        switch self {
        case .presente: return "En jornada"
        case .completo: return "Completó"
        case .ausente: return "Sin checada"
        }
    }

    var color: Color {
        switch self {
        case .presente: return CorePalette.green
        case .completo: return CorePalette.blue
        case .ausente: return CorePalette.slate
        }
    }

    var order: Int {
        switch self {
        case .presente: return 0
        case .completo: return 1
        case .ausente: return 2
        }
    }
}

/// Horas, cronómetros y enlaces a mapas de Asistencias.
enum AttendanceClock {
    private static let hourFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_MX")
        formatter.dateFormat = "HH:mm:ss"
        return formatter
    }()

    /// «14:07:35» o «—», como `fmtTime` de la web.
    static func time(_ iso: String?) -> String {
        guard let date = CoreFormat.date(iso) else { return "—" }
        return hourFormatter.string(from: date)
    }

    /// «1:05:09», como `fmtHms` de la web.
    static func hms(_ seconds: TimeInterval) -> String {
        guard seconds.isFinite, seconds > 0 else { return "0:00:00" }
        let total = Int(seconds)
        return String(format: "%d:%02d:%02d", total / 3600, (total % 3600) / 60, total % 60)
    }

    /// Tiempo de jornada: hasta la salida, o hasta ahora si sigue abierta.
    static func elapsed(from checkIn: String?, to checkOut: String?, now: Date) -> TimeInterval {
        guard let start = CoreFormat.date(checkIn) else { return 0 }
        let end = CoreFormat.date(checkOut) ?? now
        return max(0, end.timeIntervalSince(start))
    }

    /// `yyyy-MM-dd` del día, el formato que aceptan los endpoints.
    static func dayString(_ date: Date) -> String {
        FieldOpsDayRepository.dayString(date)
    }

    static func isToday(_ date: Date) -> Bool {
        dayString(date) == dayString(Date())
    }

    /// Mismo enlace que `googleMapsPointUrl` en la web.
    static func mapUrl(lat: Double?, lng: Double?) -> URL? {
        guard let lat, let lng, lat != 0 || lng != 0 else { return nil }
        return URL(string: String(format: "https://www.google.com/maps?q=%.6f,%.6f", lat, lng))
    }

    /// Recorrido trazado (`googleMapsRouteUrl`): como mucho 18 puntos, que es
    /// lo que aguanta una URL de indicaciones de Google Maps.
    static func routeUrl(_ points: [(lat: Double, lng: Double)]) -> URL? {
        guard !points.isEmpty else { return nil }
        let sampled: [(lat: Double, lng: Double)]
        if points.count <= 18 {
            sampled = points
        } else {
            let step = Double(points.count - 1) / 17
            sampled = (0..<18).map { points[Int((Double($0) * step).rounded())] }
        }
        let path = sampled.map { String(format: "%.6f,%.6f", $0.lat, $0.lng) }.joined(separator: "/")
        return URL(string: "https://www.google.com/maps/dir/\(path)")
    }
}
