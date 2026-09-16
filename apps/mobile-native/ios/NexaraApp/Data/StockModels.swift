import Foundation

/// Lectura tolerante de JSON: la API manda números como número o como texto
/// (Prisma `Decimal`), y varios campos llegan con nombre distinto según el endpoint.
/// Lo usan asistencias, chat, comidas, portal y tickets.
enum StockParse {
    static func str(_ values: Any?...) -> String {
        for v in values {
            if let s = v as? String, !s.isEmpty, s != "null" { return s }
            if let n = v as? NSNumber { return n.stringValue }
        }
        return ""
    }

    static func dbl(_ values: Any?...) -> Double? {
        for v in values {
            if let n = v as? Double { return n }
            if let n = v as? NSNumber { return n.doubleValue }
            if let s = v as? String, let d = Double(s) { return d }
        }
        return nil
    }

    static func int64(_ values: Any?...) -> Int64? {
        for value in values {
            if let n = value as? Int64 { return n }
            if let n = value as? Int { return Int64(n) }
            if let n = value as? NSNumber { return n.int64Value }
            if let s = value as? String, let n = Int64(s) { return n }
        }
        return nil
    }

    static func int(_ values: Any?...) -> Int? {
        for v in values {
            if let n = int64(v) { return Int(n) }
        }
        return nil
    }
}
