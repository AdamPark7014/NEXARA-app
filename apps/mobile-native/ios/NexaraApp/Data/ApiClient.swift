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
        try await sendJSON(path, method: "POST", body: body)
    }

    func putJSON<T: Encodable>(_ path: String, body: T) async throws -> Data {
        try await sendJSON(path, method: "PUT", body: body)
    }

    func patchJSON<T: Encodable>(_ path: String, body: T) async throws -> Data {
        try await sendJSON(path, method: "PATCH", body: body)
    }

    func delete(_ path: String) async throws {
        _ = try await request(path, method: "DELETE")
    }

    /// Multipart para hero slides (campos de texto + imagen opcional).
    func uploadMultipart(
        _ path: String,
        method: String = "POST",
        fields: [String: String],
        fileField: String? = nil,
        fileData: Data? = nil,
        fileName: String? = nil,
        mimeType: String = "image/jpeg"
    ) async throws -> Data {
        let boundary = "NexaraBoundary\(UUID().uuidString)"
        var body = Data()
        for (key, value) in fields {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        if let fileField, let fileData, let fileName {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(fileField)\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
            body.append(fileData)
            body.append("\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        var req = try buildRequest(path, method: method)
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.httpBody = body
        return try await perform(req)
    }

    // MARK: Helpers

    private func sendJSON<T: Encodable>(_ path: String, method: String, body: T) async throws -> Data {
        var req = try buildRequest(path, method: method)
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        do {
            req.httpBody = try JSONEncoder().encode(body)
        } catch {
            throw ApiError.decoding(error)
        }
        return try await perform(req)
    }

    private func request(_ path: String, method: String, query: [String: String] = [:]) async throws -> Data {
        var req = try buildRequest(path, method: method, query: query)
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        return try await perform(req)
    }

    private func buildRequest(_ path: String, method: String, query: [String: String] = [:]) throws -> URLRequest {
        var comps = URLComponents(url: baseURL.appendingPathComponent(path),
                                  resolvingAgainstBaseURL: false)
        if !query.isEmpty {
            comps?.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = comps?.url else { throw ApiError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        if let token = SessionStore.shared.token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return req
    }

    private func perform(_ req: URLRequest) async throws -> Data {
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

    static func decodeOne<T: Decodable>(_ data: Data) throws -> T {
        try JSONDecoder().decode(T.self, from: data)
    }

    // MARK: List helpers

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
