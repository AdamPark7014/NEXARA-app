import Foundation

/// Reloj del demo. Todas las horas se calculan contra un instante de referencia
/// (`DemoStore.epoch`, el momento en que se entró al demo) y se escriben en la zona
/// horaria del teléfono: «entró hace 3 h» se ve creíble el día que se revisa la app,
/// y una hora que se ve una vez no se mueve sola en la siguiente petición.
enum DemoClock {
    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone.current
        return formatter
    }()

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    /// ISO-8601 con fracción y con el huso del teléfono (`2026-09-28T08:05:00.000-06:00`).
    static func iso(_ date: Date) -> String {
        isoFormatter.string(from: date)
    }

    /// `AAAA-MM-DD` en el huso del teléfono.
    static func day(_ date: Date) -> String {
        dayFormatter.string(from: date)
    }

    /// `AAAA-MM-DD` de un día que ya viene como texto, a la fecha correspondiente (mediodía local).
    static func date(fromDay text: String) -> Date? {
        guard let parsed = dayFormatter.date(from: String(text.prefix(10))) else { return nil }
        return Calendar.current.date(byAdding: .hour, value: 12, to: parsed)
    }

    /// Medianoche local de un día `AAAA-MM-DD`.
    static func startOfDay(_ text: String) -> Date? {
        guard let parsed = dayFormatter.date(from: String(text.prefix(10))) else { return nil }
        return Calendar.current.startOfDay(for: parsed)
    }

    /// Minutos entre dos instantes, nunca negativos.
    static func minutes(from start: Date, to end: Date) -> Int {
        max(0, Int(end.timeIntervalSince(start) / 60))
    }

    /// Número de días (inclusive) entre dos textos `AAAA-MM-DD`; 1 si no se entienden.
    static func daysBetween(_ from: String, _ to: String) -> Int {
        guard let start = dayFormatter.date(from: String(from.prefix(10))),
              let end = dayFormatter.date(from: String(to.prefix(10))) else { return 1 }
        let days = Calendar.current.dateComponents([.day], from: start, to: end).day ?? 0
        return max(1, days + 1)
    }
}
