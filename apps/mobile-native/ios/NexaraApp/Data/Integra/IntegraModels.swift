import Foundation

// MARK: - Defensive map parsing (parity with Android IntegraVideoModels / MapJson)

enum IntegraJSON {
    static func decodeMap(_ data: Data) -> [String: Any] {
        guard !data.isEmpty else { return [:] }
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            return obj
        }
        if let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            return ["items": arr]
        }
        return [:]
    }

    static func decodeList(_ data: Data) -> [[String: Any]] {
        if let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            return arr
        }
        return itemsOf(decodeMap(data))
    }

    /// `items` (mirror), `list` (vendor), `data` / `results` / `rows`, or nested list.
    static func itemsOf(_ root: [String: Any]) -> [[String: Any]] {
        if let direct = root["items"] as? [[String: Any]] { return direct }
        if let direct = asMapList(root["items"]) { return direct }
        for key in ["list", "data", "results", "rows"] {
            let nested = root[key]
            if let list = asMapList(nested) { return list }
            if let nestedMap = asMap(nested) {
                if let inner = asMapList(nestedMap["list"]) ?? asMapList(nestedMap["items"]) {
                    return inner
                }
            }
        }
        return []
    }

    static func asMap(_ v: Any?) -> [String: Any]? {
        guard let m = v as? [String: Any] else { return nil }
        return m
    }

    static func asMapList(_ v: Any?) -> [[String: Any]]? {
        guard let list = v as? [Any] else { return nil }
        let mapped = list.compactMap { asMap($0) }
        return mapped
    }
}

extension Dictionary where Key == String, Value == Any {
    /// First non-empty string among `keys`. Numbers/bools stringify; `"null"` ignored.
    func integraStr(_ keys: String...) -> String? { integraStr(keys) }

    func integraStr(_ keys: [String]) -> String? {
        for k in keys {
            guard let v = self[k] else { continue }
            let s: String?
            switch v {
            case let str as String: s = str.trimmingCharacters(in: .whitespacesAndNewlines)
            case let n as NSNumber:
                // Avoid "1.0" for integers (JSONSerialization uses NSNumber).
                if CFGetTypeID(n) == CFBooleanGetTypeID() {
                    s = n.boolValue ? "true" : "false"
                } else if floor(n.doubleValue) == n.doubleValue {
                    s = String(n.intValue)
                } else {
                    s = n.stringValue
                }
            case let b as Bool: s = b ? "true" : "false"
            default: s = nil
            }
            if let s, !s.isEmpty, s != "null", s != "undefined" { return s }
        }
        return nil
    }

    func integraBool(_ keys: String...) -> Bool? { integraBool(keys) }

    func integraBool(_ keys: [String]) -> Bool? {
        for k in keys {
            guard let v = self[k] else { continue }
            switch v {
            case let b as Bool: return b
            case let n as NSNumber: return n.intValue != 0
            case let s as String:
                let t = s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                if t == "true" || t == "1" || t == "yes" || t == "si" || t == "sí" { return true }
                if t == "false" || t == "0" { return false }
            default: break
            }
        }
        return nil
    }

    func integraInt(_ keys: String...) -> Int? { integraInt(keys) }

    func integraInt(_ keys: [String]) -> Int? {
        for k in keys {
            guard let v = self[k] else { continue }
            switch v {
            case let n as NSNumber: return n.intValue
            case let i as Int: return i
            case let s as String:
                let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
                if let i = Int(t) { return i }
                if let d = Double(t) { return Int(d) }
            default: break
            }
        }
        return nil
    }

    func integraInt64(_ keys: String...) -> Int64? { integraInt64(keys) }

    func integraInt64(_ keys: [String]) -> Int64? {
        for k in keys {
            guard let v = self[k] else { continue }
            switch v {
            case let n as NSNumber: return n.int64Value
            case let i as Int64: return i
            case let i as Int: return Int64(i)
            case let s as String:
                let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
                if let i = Int64(t) { return i }
                if let d = Double(t) { return Int64(d) }
            default: break
            }
        }
        return nil
    }

    func integraDouble(_ keys: String...) -> Double? { integraDouble(keys) }

    func integraDouble(_ keys: [String]) -> Double? {
        for k in keys {
            guard let v = self[k] else { continue }
            switch v {
            case let n as NSNumber: return n.doubleValue
            case let d as Double: return d
            case let s as String:
                if let d = Double(s.trimmingCharacters(in: .whitespacesAndNewlines)) { return d }
            default: break
            }
        }
        return nil
    }

    func integraFloat(_ keys: String...) -> Float? { integraFloat(keys) }

    func integraFloat(_ keys: [String]) -> Float? {
        integraDouble(keys).map { Float($0) }
    }
}

// MARK: - Page / shared result types

struct IntegraPage {
    let items: [[String: Any]]
    let total: Int
    let hasMore: Bool
    let nextBeforeId: Int64?
    let newestId: Int64?
    let pageNo: Int

    init(
        items: [[String: Any]],
        total: Int,
        hasMore: Bool,
        nextBeforeId: Int64? = nil,
        newestId: Int64? = nil,
        pageNo: Int = 1
    ) {
        self.items = items
        self.total = total
        self.hasMore = hasMore
        self.nextBeforeId = nextBeforeId
        self.newestId = newestId
        self.pageNo = pageNo
    }
}

// MARK: - Active site (parity with Android IntegraSiteScope)

/// Process-scoped site selection with UserDefaults backup.
enum IntegraSiteScope {
    private static let prefsKey = "nexara_integra_site_id"
    private static let lock = NSLock()
    private static var cached: Int?
    private static var loaded = false

    /// `nil` = server default site (valid state).
    static var current: Int? {
        lock.lock(); defer { lock.unlock() }
        loadLocked()
        return cached
    }

    static func load() {
        lock.lock(); defer { lock.unlock() }
        loadLocked()
    }

    static func select(_ siteId: Int?) {
        lock.lock(); defer { lock.unlock() }
        let value = siteId.flatMap { $0 > 0 ? $0 : nil }
        cached = value
        loaded = true
        if let value {
            UserDefaults.standard.set(value, forKey: prefsKey)
        } else {
            UserDefaults.standard.removeObject(forKey: prefsKey)
        }
    }

    private static func loadLocked() {
        guard !loaded else { return }
        let stored = UserDefaults.standard.integer(forKey: prefsKey)
        cached = stored > 0 ? stored : nil
        loaded = true
    }
}

// MARK: - HTTP with siteId on every verb

/// ApiClient only attaches query params on GET. INTEGRA needs `siteId` on
/// POST/PATCH/DELETE too (multi-site companies). This helper mirrors ApiClient
/// auth and uses the same base URL.
enum IntegraHTTP {
    private static let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 30
        cfg.timeoutIntervalForResource = 60
        return URLSession(configuration: cfg)
    }()

    static func get(_ path: String, query: [String: String] = [:]) async throws -> Data {
        try await ApiClient.shared.get(path, query: query)
    }

    static func postJSON<T: Encodable>(_ path: String, body: T, query: [String: String] = [:]) async throws -> Data {
        if query.isEmpty {
            return try await ApiClient.shared.postJSON(path, body: body)
        }
        return try await send(path, method: "POST", query: query, encodable: body)
    }

    static func putJSON<T: Encodable>(_ path: String, body: T, query: [String: String] = [:]) async throws -> Data {
        if query.isEmpty {
            return try await ApiClient.shared.putJSON(path, body: body)
        }
        return try await send(path, method: "PUT", query: query, encodable: body)
    }

    static func patchJSON<T: Encodable>(_ path: String, body: T, query: [String: String] = [:]) async throws -> Data {
        if query.isEmpty {
            return try await ApiClient.shared.patchJSON(path, body: body)
        }
        return try await send(path, method: "PATCH", query: query, encodable: body)
    }

    static func postMap(_ path: String, body: [String: Any], query: [String: String] = [:]) async throws -> Data {
        let data = try JSONSerialization.data(withJSONObject: body, options: [])
        return try await send(path, method: "POST", query: query, rawBody: data)
    }

    static func patchMap(_ path: String, body: [String: Any], query: [String: String] = [:]) async throws -> Data {
        let data = try JSONSerialization.data(withJSONObject: body, options: [])
        return try await send(path, method: "PATCH", query: query, rawBody: data)
    }

    static func putMap(_ path: String, body: [String: Any], query: [String: String] = [:]) async throws -> Data {
        let data = try JSONSerialization.data(withJSONObject: body, options: [])
        return try await send(path, method: "PUT", query: query, rawBody: data)
    }

    static func delete(_ path: String, query: [String: String] = [:]) async throws -> Data {
        if query.isEmpty {
            try await ApiClient.shared.delete(path)
            return Data()
        }
        return try await send(path, method: "DELETE", query: query, rawBody: nil)
    }

    static func postEmpty(_ path: String, query: [String: String] = [:]) async throws -> Data {
        struct Empty: Encodable {}
        return try await postJSON(path, body: Empty(), query: query)
    }

    // MARK: Private

    private static func send<T: Encodable>(
        _ path: String,
        method: String,
        query: [String: String],
        encodable: T
    ) async throws -> Data {
        let body: Data
        do {
            body = try JSONEncoder().encode(encodable)
        } catch {
            throw ApiError.decoding(error)
        }
        return try await send(path, method: method, query: query, rawBody: body)
    }

    private static func send(
        _ path: String,
        method: String,
        query: [String: String],
        rawBody: Data?
    ) async throws -> Data {
        var comps = URLComponents(url: ApiClient.shared.baseURL.appendingPathComponent(path),
                                  resolvingAgainstBaseURL: false)
        if !query.isEmpty {
            comps?.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = comps?.url else { throw ApiError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let rawBody {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = rawBody
        }
        if let token = SessionStore.shared.token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        do {
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse else {
                throw ApiError.http(-1, "Respuesta inválida")
            }
            guard (200..<300).contains(http.statusCode) else {
                let msg = String(data: data, encoding: .utf8)
                throw ApiError.http(http.statusCode, msg)
            }
            return data
        } catch let e as ApiError {
            throw e
        } catch {
            throw ApiError.transport(error)
        }
    }
}

/// Builds the recurring `siteId` query used across INTEGRA endpoints.
enum IntegraQuery {
    static func site(_ siteId: Int? = IntegraSiteScope.current) -> [String: String] {
        var q: [String: String] = [:]
        if let siteId, siteId > 0 { q["siteId"] = String(siteId) }
        return q
    }

    static func merging(_ base: [String: String], siteId: Int? = IntegraSiteScope.current) -> [String: String] {
        var q = base
        if let siteId, siteId > 0 { q["siteId"] = String(siteId) }
        return q
    }
}
