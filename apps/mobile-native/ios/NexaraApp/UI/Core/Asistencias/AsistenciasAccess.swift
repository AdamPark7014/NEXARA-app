import SwiftUI

// Quién gestiona y quién checa, y los formatos de la pantalla Asistencias.
// Espejo de `AttendanceViewMode.kt` / `ConsoleAttendanceScreen.kt` de Android, que a
// su vez copian `getAttendanceViewMode` (apps/web/lib/section-views.ts).

/// Igual que en Android y en la web: Dirección solo supervisa, campo solo checa y
/// los encargados de gente hacen las dos cosas.
enum AttendanceViewMode {
    /// Dirección: tablero del equipo, sin checador propio.
    case manage
    /// Campo: solo su propia jornada.
    case register
    /// RRHH y coordinadores: ven a su gente y además checan.
    case manageRegister

    var canRegisterSelf: Bool { self != .manage }
    var canManageTeam: Bool { self != .register }
}

enum AsistenciasAccess {
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

    /// Espejo de `attendanceViewMode(user)` de Android.
    static func mode(for user: SessionUser?) -> AttendanceViewMode {
        // Demo: ve a su equipo Y puede checar (es lo que se quiere enseñar).
        if DemoMode.isActive { return .manageRegister }
        // Sin sesión, Android cae en «solo su jornada» (antes iOS daba el tablero).
        guard let user else { return .register }
        // Dirección (Christian y su equivalente) supervisa: no tiene checador propio.
        if CoreOrg.isCeo(user.email) { return .manage }
        if user.isSuperAdmin { return .manage }
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
        if CoreOrg.isCeo(user.email) || CoreOrg.normalized(user.email) == CoreOrg.developerEmail { return true }
        return role(user) == RolePanelMatrix.ceo
    }

    /// Pestaña «Trayectoria»: **solo dirección** (Christian y su equivalente), igual
    /// que `attendanceCanSeeTrajectory` de Android. El API contesta 403 en `gps/team`
    /// y `gps/trajectory` a cualquier otro; antes iOS la abría con `gps.manage` y un
    /// coordinador chocaba contra ese 403. En demo la persona ficticia es dirección.
    static func canSeeTrajectory(_ user: SessionUser?) -> Bool {
        CoreOrg.isCeo(user?.email)
    }

    /// «Justificar falta»: solo Christian (y su equivalente); el API lo vuelve a exigir.
    static func canJustify(_ user: SessionUser?) -> Bool {
        CoreOrg.isCeo(user?.email)
    }
}

/// Estado de la persona en el día (mismos nombres y colores que Android).
enum AttendanceEstado: String, CaseIterable {
    case presente = "PRESENTE"
    case completo = "COMPLETO"
    /// Sin checada, pero Christian justificó el día.
    case justificada = "JUSTIFICADA"
    case ausente = "AUSENTE"

    var label: String {
        switch self {
        case .presente: return "En jornada"
        case .completo: return "Completó"
        case .justificada: return FaltasJustificadas.etiqueta
        case .ausente: return "Sin checada"
        }
    }

    /// #16A34A · #2563EB · #7C3AED · #94A3B8, como `AttendanceEstado` de Android.
    var color: Color {
        switch self {
        case .presente: return NxColors.verde
        case .completo: return NxColors.azul
        case .justificada: return NxColors.morado
        case .ausente: return NxColors.gris
        }
    }

    var order: Int {
        switch self {
        case .presente: return 0
        case .completo: return 1
        case .justificada: return 2
        case .ausente: return 3
        }
    }
}

/// Horas, días, cronómetros y enlaces a mapas de Asistencias.
///
/// Todo se calcula y se escribe en la hora de la empresa (`America/Mexico_City`),
/// no en la del teléfono: el API decide el día de una checada, la ventana de comida y
/// el recorrido con esa zona, y un teléfono con otra zona (viaje, simulador en UTC)
/// enseñaba entradas a las 4 de la mañana y pedía el día equivocado.
enum AttendanceClock {
    /// Zona de la empresa.
    static let zone: TimeZone = TimeZone(identifier: "America/Mexico_City") ?? .current

    /// Calendario gregoriano en la zona de la empresa (un iPhone con calendario
    /// budista o japonés escribía otro año en `yyyy`).
    static let calendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = zone
        cal.locale = Locale(identifier: "es_MX")
        return cal
    }()

    private static func formatter(_ pattern: String, locale: String = "es_MX") -> DateFormatter {
        let f = DateFormatter()
        f.calendar = calendar
        f.locale = Locale(identifier: locale)
        f.timeZone = zone
        f.dateFormat = pattern
        return f
    }

    private static let hourFormatter = formatter("HH:mm:ss")
    private static let shortFormatter = formatter("HH:mm")
    private static let dayFormatter = formatter("yyyy-MM-dd", locale: "en_US_POSIX")
    private static let dayLabelFormatter = formatter("EEEE d 'de' MMMM")
    private static let localNoZone = formatter("yyyy-MM-dd'T'HH:mm:ss", locale: "en_US_POSIX")
    private static let localNoZoneFraction = formatter("yyyy-MM-dd'T'HH:mm:ss.SSS", locale: "en_US_POSIX")

    private static let isoFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// Tolera `…Z`, con offset y sin zona (esa se lee en hora de la empresa), como
    /// `parseInstante` de Android.
    static func parse(_ iso: String?) -> Date? {
        let value = (iso ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return nil }
        if let d = isoFraction.date(from: value) { return d }
        if let d = isoPlain.date(from: value) { return d }
        if let d = localNoZoneFraction.date(from: value) { return d }
        if let d = localNoZone.date(from: value) { return d }
        return nil
    }

    /// «14:07:35» o «—» (`fmtHora` de Android).
    static func time(_ iso: String?) -> String {
        guard let date = parse(iso) else { return "—" }
        return hourFormatter.string(from: date)
    }

    /// «14:07» o «—» (`fmtHoraCorta`): la de la fila, donde los segundos estorban.
    static func shortTime(_ iso: String?) -> String {
        guard let date = parse(iso) else { return "—" }
        return shortFormatter.string(from: date)
    }

    /// «14:07» de un instante.
    static func shortTime(_ date: Date) -> String {
        shortFormatter.string(from: date)
    }

    /// «1:05:09», como `fmtHms`.
    static func hms(_ seconds: TimeInterval) -> String {
        guard seconds.isFinite, seconds > 0 else { return "0:00:00" }
        let total = Int(seconds)
        return String(format: "%d:%02d:%02d", total / 3600, (total % 3600) / 60, total % 60)
    }

    /// Tiempo de jornada: hasta la salida, o hasta ahora si sigue abierta.
    static func elapsed(from checkIn: String?, to checkOut: String?, now: Date) -> TimeInterval {
        guard let start = parse(checkIn) else { return 0 }
        let end = parse(checkOut) ?? now
        return max(0, end.timeIntervalSince(start))
    }

    /// `yyyy-MM-dd` del día **en México**, el formato que aceptan los endpoints.
    static func dayString(_ date: Date) -> String {
        dayFormatter.string(from: date)
    }

    /// Hoy en México.
    static func today() -> String {
        dayString(Date())
    }

    static func isToday(_ date: Date) -> Bool {
        dayString(date) == today()
    }

    /// Mediodía en México del día `yyyy-MM-dd` (para el calendario).
    static func date(fromDay day: String) -> Date? {
        guard let start = dayFormatter.date(from: String(day.prefix(10))) else { return nil }
        return calendar.date(byAdding: .hour, value: 12, to: start)
    }

    /// «Hoy, jueves 17 de septiembre» · «Lunes 14 de septiembre» (`etiquetaDia`).
    static func etiquetaDia(_ fecha: String, esHoy: Bool) -> String {
        let dia = date(fromDay: fecha).map { dayLabelFormatter.string(from: $0) } ?? fecha
        if esHoy { return "Hoy, \(dia)" }
        return dia.prefix(1).uppercased() + dia.dropFirst()
    }

    /// Mismo enlace que `mapaUrl` de Android / `googleMapsPointUrl` de la web.
    static func mapUrl(lat: Double?, lng: Double?) -> URL? {
        guard let lat, let lng, lat.isFinite, lng.isFinite, lat != 0 || lng != 0 else { return nil }
        return URL(string: String(format: "https://www.google.com/maps?q=%.6f,%.6f", lat, lng))
    }

    /// Recorrido trazado: como mucho 18 puntos, que es lo que aguanta una URL de
    /// indicaciones de Google Maps (mismo muestreo que Android).
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
