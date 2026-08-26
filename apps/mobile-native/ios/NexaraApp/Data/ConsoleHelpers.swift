import Foundation

enum ConsoleHelpers {
    static func dataUrl(for media: CapturedMedia) -> String {
        "data:\(media.mimeType);base64,\(media.data.base64EncodedString())"
    }

    static func weekRange() -> (from: String, to: String) {
        let cal = Calendar.current
        let today = Date()
        let weekday = cal.component(.weekday, from: today)
        let start = cal.date(byAdding: .day, value: -(weekday - 2), to: today) ?? today
        let end = cal.date(byAdding: .day, value: 6 - (weekday - 2), to: today) ?? today
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        return (fmt.string(from: start), fmt.string(from: end))
    }

    static func isoNow() -> String {
        ISO8601DateFormatter().string(from: Date())
    }

    static func mapStr(_ m: [String: Any], _ keys: String...) -> String {
        for k in keys {
            if let v = m[k] {
                let s: String
                if let ss = v as? String { s = ss }
                else if let n = v as? NSNumber { s = n.stringValue }
                else { s = String(describing: v) }
                if !s.isEmpty && s != "null" { return s }
            }
        }
        return ""
    }

    static func mapInt64(_ m: [String: Any], _ keys: String...) -> Int64? {
        for k in keys {
            if let v = m[k] as? Int64 { return v }
            if let v = m[k] as? Int { return Int64(v) }
            if let v = m[k] as? NSNumber { return v.int64Value }
            if let v = m[k] as? String, let i = Int64(v) { return i }
        }
        return nil
    }

    static func mapInt(_ m: [String: Any], _ keys: String...) -> Int {
        Int(mapInt64(m, keys) ?? 0)
    }

    static func mapDouble(_ m: [String: Any], _ keys: String...) -> Double {
        for k in keys {
            if let v = m[k] as? Double { return v }
            if let v = m[k] as? NSNumber { return v.doubleValue }
            if let v = m[k] as? String, let d = Double(v) { return d }
        }
        return 0
    }

    static func decodeMap(_ data: Data) -> [String: Any] {
        (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }
}

extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

extension CapturedMedia {
    var dataUrl: String { ConsoleHelpers.dataUrl(for: self) }
}
