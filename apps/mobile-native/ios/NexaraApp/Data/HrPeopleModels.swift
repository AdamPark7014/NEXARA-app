import Foundation

/// Tipo de permiso del catálogo (clave del API + etiqueta en español).
struct HrLeaveTypeOption: Hashable, Identifiable {
    let key: String
    let label: String
    var id: String { key }
}

/// Días usados de un tipo de permiso dentro del saldo del año.
struct HrLeaveBalanceRow: Hashable, Identifiable {
    let label: String
    let days: Double
    var id: String { label }

    var daysText: String {
        days == days.rounded() ? String(Int(days)) : String(format: "%.1f", days)
    }
}

/// Catálogo de RR. HH. — espejo de los enums `LeaveType` y `LeaveStatus` de
/// `schema.prisma`, copiado del `HrLeaveCatalog` de Android.
///
/// El API devuelve las claves en inglés y en mayúsculas (`VACATION`,
/// `PENDING`). La pantalla iOS las comparaba contra `"pendiente"`, así que el
/// contador de pendientes daba siempre cero y al empleado se le enseñaba
/// «PENDING» en crudo. La traducción vive aquí, una sola vez, en el mismo sitio
/// donde se decide qué es aprobable.
enum HrLeaveCatalog {

    /// `LeaveType` → etiqueta. El orden es el del formulario de alta.
    ///
    /// Es una lista de structs y no de tuplas a propósito: `ForEach(_, id:)`
    /// necesita un `KeyPath`, y Swift no sabe formar `\.key` sobre una tupla.
    static let types: [HrLeaveTypeOption] = [
        HrLeaveTypeOption(key: "VACATION", label: "Vacaciones"),
        HrLeaveTypeOption(key: "SICK", label: "Incapacidad / enfermedad"),
        HrLeaveTypeOption(key: "PERSONAL", label: "Permiso personal"),
        HrLeaveTypeOption(key: "MATERNITY", label: "Maternidad"),
        HrLeaveTypeOption(key: "PATERNITY", label: "Paternidad"),
        HrLeaveTypeOption(key: "BEREAVEMENT", label: "Duelo"),
        HrLeaveTypeOption(key: "UNPAID", label: "Sin goce de sueldo"),
    ]

    private static let typeLabels: [String: String] = Dictionary(
        uniqueKeysWithValues: types.map { ($0.key, $0.label) }
    )

    private static let statusLabels: [String: String] = [
        "PENDING": "Pendiente",
        "APPROVED": "Aprobado",
        "REJECTED": "Rechazado",
        "CANCELLED": "Cancelado",
    ]

    static func typeLabel(_ raw: String) -> String {
        let key = raw.trimmingCharacters(in: .whitespaces).uppercased()
        if let label = typeLabels[key] { return label }
        return raw.isEmpty ? "Permiso" : raw
    }

    static func statusLabel(_ raw: String) -> String {
        let key = raw.trimmingCharacters(in: .whitespaces).uppercased()
        if let label = statusLabels[key] { return label }
        return raw.isEmpty ? "—" : raw
    }

    /// Sigue esperando decisión: es lo único aprobable o cancelable.
    ///
    /// Acepta la clave del API y la palabra en español porque hay filas
    /// antiguas guardadas con el texto ya traducido.
    static func isPending(_ raw: String) -> Bool {
        let key = raw.trimmingCharacters(in: .whitespaces).uppercased()
        return key == "PENDING" || key == "PENDIENTE"
    }
}

/// Validación del alta de permiso, separada de la vista.
///
/// El servidor rechaza el rango invertido, pero contarlo aquí evita gastar un
/// viaje de red en un error evitable y —sobre todo— hace que los días que ve el
/// empleado antes de enviar sean los mismos que guarda el servidor.
enum HrLeaveDraft {
    enum Outcome {
        case valid(type: String, startDate: String, endDate: String, reason: String?, days: Int)
        case invalid(String)
    }

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    static func today() -> String { dayFormatter.string(from: Date()) }

    /// Días naturales inclusive entre dos fechas `AAAA-MM-DD`; `nil` si alguna
    /// no se puede leer o el rango está invertido.
    static func dayCount(from: String, to: String) -> Int? {
        guard let start = dayFormatter.date(from: from),
              let end = dayFormatter.date(from: to),
              end >= start else { return nil }
        let seconds = end.timeIntervalSince(start)
        return Int(seconds / 86_400) + 1
    }

    static func validate(type: String, startDate: String, endDate: String, reason: String) -> Outcome {
        let known = HrLeaveCatalog.types.map(\.key)
        let cleanType = type.trimmingCharacters(in: .whitespaces).uppercased()
        guard known.contains(cleanType) else {
            return .invalid("Elige un tipo de permiso")
        }
        guard dayFormatter.date(from: startDate) != nil else {
            return .invalid("Fecha de inicio inválida (AAAA-MM-DD)")
        }
        guard dayFormatter.date(from: endDate) != nil else {
            return .invalid("Fecha de fin inválida (AAAA-MM-DD)")
        }
        guard let days = dayCount(from: startDate, to: endDate) else {
            return .invalid("La fecha de fin no puede ser anterior a la de inicio")
        }
        let cleanReason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        return .valid(
            type: cleanType,
            startDate: startDate,
            endDate: endDate,
            reason: cleanReason.isEmpty ? nil : cleanReason,
            days: days
        )
    }
}

/// Saldo de permisos del año — `GET hr/leaves/balance/:userId`.
///
/// El servidor sólo suma lo **aprobado**; no hay cuota configurada en base de
/// datos. Por eso esto informa días usados y nunca «días restantes», que serían
/// un número inventado.
struct HrLeaveBalance: Hashable {
    let year: Int
    let totalUsed: Double
    /// Días usados por tipo, ya con la etiqueta en español y de mayor a menor.
    let usedByType: [HrLeaveBalanceRow]

    var isEmpty: Bool { usedByType.isEmpty && totalUsed == 0 }

    var totalUsedText: String {
        totalUsed == totalUsed.rounded()
            ? String(Int(totalUsed))
            : String(format: "%.1f", totalUsed)
    }

    init(raw: [String: Any]) {
        year = StockParse.int(raw["year"]) ?? Calendar.current.component(.year, from: Date())
        totalUsed = StockParse.dbl(raw["totalUsed"]) ?? 0
        let byType = raw["usedByType"] as? [String: Any] ?? [:]
        usedByType = byType
            .compactMap { key, value -> HrLeaveBalanceRow? in
                guard let days = StockParse.dbl(value) else { return nil }
                return HrLeaveBalanceRow(label: HrLeaveCatalog.typeLabel(key), days: days)
            }
            .sorted { $0.days > $1.days }
    }

    /// Saldo vacío mientras no se haya podido leer: la pantalla sigue sirviendo.
    init() {
        year = Calendar.current.component(.year, from: Date())
        totalUsed = 0
        usedByType = []
    }
}

/// Evaluación de desempeño — `GET hr/reviews`.
struct HrReviewItem: Hashable, Identifiable {
    let id: Int64
    let period: String
    let reviewDate: String
    let overallRating: Double
    let status: String
    let strengths: String
    let areasOfImprovement: String
    let goals: String
    let comments: String
    let userId: Int64
    let userName: String
    let reviewerId: Int64
    let reviewerName: String

    /// Borrador: sólo el evaluador la puede enviar.
    var isDraft: Bool { status.uppercased() == "DRAFT" }
    /// Enviada: espera que el evaluado confirme que la recibió.
    var isSubmitted: Bool { status.uppercased() == "SUBMITTED" }

    var statusLabel: String {
        switch status.uppercased() {
        case "DRAFT": return "Borrador"
        case "SUBMITTED": return "Enviada"
        case "ACKNOWLEDGED": return "Confirmada"
        default: return status.isEmpty ? "—" : status
        }
    }

    var ratingText: String {
        overallRating > 0 ? String(format: "%.1f", overallRating) : "—"
    }

    var displayPeriod: String { period.isEmpty ? "Evaluación #\(id)" : period }

    static func == (lhs: HrReviewItem, rhs: HrReviewItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        let user = raw["user"] as? [String: Any]
        let reviewer = raw["reviewer"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        period = StockParse.str(raw["period"], raw["periodo"])
        reviewDate = StockParse.str(raw["reviewDate"], raw["fecha"])
        overallRating = StockParse.dbl(raw["overallRating"], raw["rating"]) ?? 0
        status = StockParse.str(raw["status"], raw["estado"])
        strengths = StockParse.str(raw["strengths"], raw["fortalezas"])
        areasOfImprovement = StockParse.str(raw["areasOfImprovement"], raw["areasMejora"])
        goals = StockParse.str(raw["goals"], raw["objetivos"])
        comments = StockParse.str(raw["comments"], raw["comentarios"])
        userId = StockParse.int64(raw["userId"], user?["id"]) ?? 0
        userName = StockParse.str(raw["userName"], user?["nombre"], user?["name"])
        reviewerId = StockParse.int64(raw["reviewerId"], reviewer?["id"]) ?? 0
        reviewerName = StockParse.str(raw["reviewerName"], reviewer?["nombre"], reviewer?["name"])
    }
}

/// Par nombre/conteo de las distribuciones de `hr/dashboard` y `users/iam/insights`.
struct HrNamedCount: Hashable, Identifiable {
    let name: String
    let count: Int
    var id: String { name }

    init(raw: [String: Any]) {
        name = StockParse.str(raw["name"], raw["nombre"], raw["label"])
        count = StockParse.int(raw["count"], raw["total"]) ?? 0
    }
}

/// Punto de una serie diaria (`{date, count}`).
struct HrDatedCount: Hashable, Identifiable {
    let date: String
    let count: Int
    var id: String { date }

    init(raw: [String: Any]) {
        date = StockParse.str(raw["date"], raw["fecha"])
        count = StockParse.int(raw["count"], raw["total"]) ?? 0
    }
}

/// Fila de carga de trabajo del panel de personas.
struct HrWorkloadRow: Hashable, Identifiable {
    let userId: Int64
    let nombre: String
    let department: String
    let daysPresent: Int
    let avgMinutes: Int
    let lateCount: Int

    var id: Int64 { userId }

    /// Minutos medios en horas y minutos: «7 h 42 min» se lee, «462» no.
    var avgWorkedText: String {
        guard avgMinutes > 0 else { return "—" }
        let h = avgMinutes / 60
        let m = avgMinutes % 60
        return h > 0 ? "\(h) h \(m) min" : "\(m) min"
    }

    init(raw: [String: Any]) {
        userId = StockParse.int64(raw["userId"]) ?? 0
        nombre = StockParse.str(raw["nombre"], raw["name"])
        department = StockParse.str(raw["department"], raw["departamento"])
        daysPresent = StockParse.int(raw["daysPresent"]) ?? 0
        avgMinutes = StockParse.int(raw["avgMinutes"]) ?? 0
        lateCount = StockParse.int(raw["lateCount"]) ?? 0
    }
}

/// Panel de personas — `GET hr/dashboard` (que el API resuelve con
/// `getPeopleInsights`, el mismo cálculo que alimenta `/erp/hr/kpis` en la web).
///
/// Todo lo que se enseña sale del JSON. Cuando una cifra no viene, la fila no
/// se dibuja: es preferible una pantalla más corta que un cero inventado.
struct HrPeopleDashboard: Hashable {
    let generatedAt: String
    let headcount: Int
    let inactiveOrBaja: Int
    let turnoverPct: Double
    let hires12m: Int
    let punctualityPct: Double
    let lateEvents30d: Int
    let lunchLate30d: Int
    let avgDailyPresent: Double
    let openAttendanceDays: Int
    let pendingLeaves: Int
    let approvedLeavesThisMonth: Int
    let avgPerformanceRating: Double
    let reviewsCount: Int
    let present14d: [HrDatedCount]
    let byDepartment: [HrNamedCount]
    let workloadTop: [HrWorkloadRow]
    let lateLeaders: [HrWorkloadRow]
    let pendingLeaveQueue: [HrLeave]
    let recentReviews: [HrReviewItem]

    var isEmpty: Bool { headcount == 0 && reviewsCount == 0 && pendingLeaves == 0 }

    static func == (lhs: HrPeopleDashboard, rhs: HrPeopleDashboard) -> Bool {
        lhs.generatedAt == rhs.generatedAt && lhs.headcount == rhs.headcount
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(generatedAt)
        hasher.combine(headcount)
    }

    init(raw: [String: Any]) {
        generatedAt = StockParse.str(raw["generatedAt"])
        let kpis = raw["kpis"] as? [String: Any] ?? [:]
        headcount = StockParse.int(kpis["headcount"]) ?? 0
        inactiveOrBaja = StockParse.int(kpis["inactiveOrBaja"]) ?? 0
        turnoverPct = StockParse.dbl(kpis["turnoverPct"]) ?? 0
        hires12m = StockParse.int(kpis["hires12m"]) ?? 0
        punctualityPct = StockParse.dbl(kpis["punctualityPct"]) ?? 0
        lateEvents30d = StockParse.int(kpis["lateEvents30d"]) ?? 0
        lunchLate30d = StockParse.int(kpis["lunchLate30d"]) ?? 0
        avgDailyPresent = StockParse.dbl(kpis["avgDailyPresent"]) ?? 0
        openAttendanceDays = StockParse.int(kpis["openAttendanceDays"]) ?? 0
        // `pendingLeaves` viene duplicado en la raíz y dentro de `kpis`; se lee
        // de los dos sitios porque el API los ha movido de sitio antes.
        pendingLeaves = StockParse.int(kpis["pendingLeaves"], raw["pendingLeaves"]) ?? 0
        approvedLeavesThisMonth = StockParse.int(
            kpis["approvedLeavesThisMonth"], raw["approvedLeavesThisMonth"]
        ) ?? 0
        avgPerformanceRating = StockParse.dbl(kpis["avgPerformanceRating"], raw["avgRating"]) ?? 0
        reviewsCount = StockParse.int(kpis["reviewsCount"], raw["totalReviews"]) ?? 0

        let trends = raw["trends"] as? [String: Any] ?? [:]
        present14d = (trends["present14d"] as? [[String: Any]] ?? []).map { HrDatedCount(raw: $0) }

        let distributions = raw["distributions"] as? [String: Any] ?? [:]
        byDepartment = (distributions["byDepartment"] as? [[String: Any]] ?? []).map { HrNamedCount(raw: $0) }

        workloadTop = (raw["workloadTop"] as? [[String: Any]] ?? []).map { HrWorkloadRow(raw: $0) }
        lateLeaders = (raw["lateLeaders"] as? [[String: Any]] ?? []).map { HrWorkloadRow(raw: $0) }
        pendingLeaveQueue = (raw["pendingLeaveQueue"] as? [[String: Any]] ?? []).map { HrLeave(raw: $0) }
        recentReviews = (raw["recentReviews"] as? [[String: Any]] ?? []).map { HrReviewItem(raw: $0) }
    }
}
