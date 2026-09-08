import SwiftUI

/// Día ACS tal cual lo publica `WeekPlanCfg` (claves en inglés).
enum ScheduleWeekDay: String, CaseIterable, Identifiable {
    case monday = "Monday"
    case tuesday = "Tuesday"
    case wednesday = "Wednesday"
    case thursday = "Thursday"
    case friday = "Friday"
    case saturday = "Saturday"
    case sunday = "Sunday"

    var id: String { rawValue }
    var short: String {
        switch self {
        case .monday: return "Lun"
        case .tuesday: return "Mar"
        case .wednesday: return "Mié"
        case .thursday: return "Jue"
        case .friday: return "Vie"
        case .saturday: return "Sáb"
        case .sunday: return "Dom"
        }
    }

    static func fromKey(_ raw: String?) -> ScheduleWeekDay? {
        guard let v = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !v.isEmpty else {
            return nil
        }
        return Self.allCases.first { $0.rawValue.caseInsensitiveCompare(v) == .orderedSame }
    }
}

struct ScheduleSegment: Hashable {
    let beginTime: String
    let endTime: String
}

struct ScheduleDayPlan: Hashable {
    let week: ScheduleWeekDay
    let segments: [ScheduleSegment]
}

/// Utilidades de hora de pared ACS (sin conversión de zona).
enum AcsTimeUI {
    static func acsHhMm(_ raw: String?) -> String {
        let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if value.isEmpty { return "??:??" }
        if let r = value.range(of: #"(\d{1,2}):(\d{2})"#, options: .regularExpression) {
            let parts = value[r].split(separator: ":")
            guard parts.count >= 2,
                  let h = Int(parts[0]), let m = Int(parts[1]) else { return value }
            return String(format: "%02d:%02d", h, m)
        }
        return value
    }

    static func minutesOfDay(_ raw: String?) -> Int? {
        let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard let r = value.range(of: #"(\d{1,2}):(\d{2})"#, options: .regularExpression) else {
            return nil
        }
        let parts = value[r].split(separator: ":")
        guard parts.count >= 2, let h = Int(parts[0]), let m = Int(parts[1]),
              h >= 0, m >= 0, m <= 59 else { return nil }
        return min(1440, h * 60 + m)
    }

    /// Franja como fracción del día `[inicio, ancho]` en 0…1. Fin `00:00` = medianoche siguiente.
    static func bandGeometry(beginTime: String?, endTime: String?) -> (start: CGFloat, width: CGFloat)? {
        guard let a = minutesOfDay(beginTime), let rawEnd = minutesOfDay(endTime) else { return nil }
        let b = rawEnd <= a ? 1440 : rawEnd
        let start = CGFloat(a) / 1440
        let width = max(0.01, CGFloat(b - a) / 1440)
        return (start, width)
    }
}

/// Vista semanal de una plantilla ACS: siete barras de 24 h con franjas reales.
struct ScheduleWeekGrid: View {
    let templateId: String
    let templateName: String
    let weekPlanNo: Int?
    let days: [ScheduleDayPlan]

    var body: some View {
        if templateId == "0" {
            Text("Sin acceso en esta puerta — no abre en ningún horario.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.vertical, 6)
        } else if days.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text("El terminal no publica el detalle semanal de «\(templateName)».")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let weekPlanNo {
                    Text("Plantilla \(templateId) → plan semanal \(weekPlanNo)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 6)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text("Horario semanal · \(templateName)")
                    .font(.subheadline.weight(.semibold))
                ForEach(ScheduleWeekDay.allCases) { day in
                    let plan = days.first { $0.week == day }
                    ScheduleDayRow(day: day, plan: plan)
                }
                Text("Franjas leídas del terminal (hora del ACS en sitio, sin convertir).")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct ScheduleDayRow: View {
    let day: ScheduleWeekDay
    let plan: ScheduleDayPlan?

    private var segments: [ScheduleSegment] { plan?.segments ?? [] }

    private var text: String {
        if segments.isEmpty { return "Cerrado" }
        return segments.map {
            "\(AcsTimeUI.acsHhMm($0.beginTime))–\(AcsTimeUI.acsHhMm($0.endTime))"
        }.joined(separator: " · ")
    }

    var body: some View {
        HStack(spacing: 8) {
            Text(day.short)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .frame(width: 28, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.tertiarySystemFill))
                    ForEach(Array(segments.enumerated()), id: \.offset) { _, segment in
                        if let g = AcsTimeUI.bandGeometry(
                            beginTime: segment.beginTime,
                            endTime: segment.endTime
                        ) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.teal)
                                .frame(width: geo.size.width * g.width)
                                .offset(x: geo.size.width * g.start)
                        }
                    }
                }
            }
            .frame(height: 14)
            Text(text)
                .font(.caption2)
                .foregroundStyle(segments.isEmpty ? .secondary : .primary)
                .frame(width: 110, alignment: .leading)
                .lineLimit(2)
        }
        .accessibilityLabel("\(day.short): \(text)")
    }
}

/// Extrae franjas por weekPlan id desde `devices[].weekPlans` del catálogo.
enum ScheduleWeekCatalog {
    static func daysByWeekPlan(from catalog: [String: Any]) -> [Int: [ScheduleDayPlan]] {
        var out: [Int: [ScheduleDayPlan]] = [:]
        let devices = IntegraJSON.asMapList(catalog["devices"]) ?? []
        for device in devices {
            for plan in IntegraJSON.asMapList(device["weekPlans"]) ?? [] {
                guard let planId = plan.integraInt("id"), out[planId] == nil else { continue }
                let days = daysFromSegments(IntegraJSON.asMapList(plan["enabledSegments"]) ?? [])
                if !days.isEmpty { out[planId] = days }
            }
        }
        return out
    }

    static func weekPlanNoByTemplate(from catalog: [String: Any]) -> [String: Int] {
        var out: [String: Int] = [:]
        let devices = IntegraJSON.asMapList(catalog["devices"]) ?? []
        for device in devices {
            for tpl in IntegraJSON.asMapList(device["templates"]) ?? [] {
                guard let id = tpl.integraStr("id", "planTemplateNo") else { continue }
                if out[id] == nil, let no = tpl.integraInt("weekPlanNo") {
                    out[id] = no
                }
            }
        }
        return out
    }

    static func daysFromSegments(_ segments: [[String: Any]]) -> [ScheduleDayPlan] {
        var byDay: [ScheduleWeekDay: [ScheduleSegment]] = [:]
        for row in segments {
            guard let day = ScheduleWeekDay.fromKey(row.integraStr("week")),
                  let begin = row.integraStr("beginTime"),
                  let end = row.integraStr("endTime") else { continue }
            byDay[day, default: []].append(ScheduleSegment(beginTime: begin, endTime: end))
        }
        return ScheduleWeekDay.allCases.compactMap { day in
            guard let segs = byDay[day], !segs.isEmpty else { return nil }
            return ScheduleDayPlan(
                week: day,
                segments: segs.sorted { $0.beginTime < $1.beginTime }
            )
        }
    }
}
