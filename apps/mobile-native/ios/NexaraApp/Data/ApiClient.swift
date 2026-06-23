import Foundation

/// Cliente HTTP basado en URLSession. Paridad con `ApiClient` de Android (Retrofit).
/// La base URL termina en `/api` y cada request adjunta `Authorization: Bearer <token>`
/// si hay sesión activa.
enum ApiError: Error, LocalizedError {
    case invalidURL
    case http(Int, String?)
    case transport(Error)
    case decoding(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "URL inválida"
        case .http(let code, let msg): return "HTTP \(code)\(msg.map { ": \($0)" } ?? "")"
        case .transport(let e): return e.localizedDescription
        case .decoding(let e): return "Decodificación: \(e.localizedDescription)"
        }
    }
}

final class ApiClient {
    static let shared = ApiClient()

    /// URL base del API. Cambia aquí según el entorno.
    /// Producción: https://api.nexara.com.mx/api
    /// Dev local: http://localhost:3001/api
    let baseURL: URL

    private let session: URLSession

    private init() {
        // TODO: pasar a xcconfig / Info.plist por entorno (Debug/Release).
        #if DEBUG
        self.baseURL = URL(string: "http://localhost:3001/api")!
        #else
        self.baseURL = URL(string: "https://api.nexara.com.mx/api")!
        #endif

        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 30
        cfg.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: cfg)
    }

    // MARK: Requests

    func get(_ path: String, query: [String: String] = [:]) async throws -> Data {
        var comps = URLComponents(url: baseURL.appendingPathComponent(path),
                                  resolvingAgainstBaseURL: false)
        if !query.isEmpty {
            comps?.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = comps?.url else { throw ApiError.invalidURL }

        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Accept")
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

    func postJSON<T: Encodable>(_ path: String, body: T) async throws -> Data {
        let url = baseURL.appendingPathComponent(path)
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = SessionStore.shared.token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        do {
            req.httpBody = try JSONEncoder().encode(body)
        } catch {
            throw ApiError.decoding(error)
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

    // MARK: Helpers

    /// Decodifica `[T]` desde una respuesta que puede venir como array plano
    /// o paginada (`{items|data|results|rows: [...]}`).
    static func decodeList<T: Decodable>(_ data: Data) throws -> [T] {
        // Intento 1: array directo.
        if let arr = try? JSONDecoder().decode([T].self, from: data) {
            return arr
        }
        // Intento 2: objeto paginado.
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return []
        }
        for key in ["items", "data", "results", "rows"] {
            if let list = obj[key] as? [[String: Any]] {
                let subData = try JSONSerialization.data(withJSONObject: list)
                return (try? JSONDecoder().decode([T].self, from: subData)) ?? []
            }
        }
        return []
    }

    /// Variante genérica para pantallas sin DTO específico.
    static func decodeMapList(_ data: Data) -> [[String: Any]] {
        if let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            return arr
        }
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            for key in ["items", "data", "results", "rows"] {
                if let list = obj[key] as? [[String: Any]] { return list }
            }
        }
        return []
    }
}
