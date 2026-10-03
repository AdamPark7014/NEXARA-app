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
        toUserMessage()
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
        var req = try buildRequest(path, method: "GET", query: query)
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        return try await perform(req)
    }

    /// Descarga binaria (PDF, imágenes) sin forzar JSON en Accept.
    func getBinary(_ path: String, query: [String: String] = [:]) async throws -> Data {
        var req = try buildRequest(path, method: "GET", query: query)
        req.setValue("*/*", forHTTPHeaderField: "Accept")
        return try await perform(req)
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

    /// Multipart con varios archivos (p. ej. evidencias de solicitud sucursal).
    func uploadMultipartFiles(
        _ path: String,
        method: String = "POST",
        fields: [String: String],
        files: [(field: String, data: Data, fileName: String, mimeType: String)]
    ) async throws -> Data {
        let boundary = "NexaraBoundary\(UUID().uuidString)"
        var body = Data()
        for (key, value) in fields {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        for file in files {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(file.field)\"; filename=\"\(file.fileName)\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: \(file.mimeType)\r\n\r\n".data(using: .utf8)!)
            body.append(file.data)
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
        // Modelo y sistema del teléfono en cada petición (login incluido): el aviso de inicio de sesión
        // dice «desde iPhone 16 Pro Max (iOS 18.1)».
        for (header, value) in DeviceIdentity.headers {
            req.setValue(value, forHTTPHeaderField: header)
        }
        if let token = SessionStore.shared.token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let companyId = SessionStore.shared.currentUser?.companyId, companyId > 0 {
            req.setValue(String(companyId), forHTTPHeaderField: "X-Company-Id")
        }
        return req
    }

    private static let mutatingMethods: Set<String> = ["POST", "PUT", "PATCH", "DELETE"]
    private static let queuedBody = Data("{\"queued\":true,\"offline\":true}".utf8)

    /// Rutas que NUNCA van a la cola sin conexión (paridad con `NOT_QUEUEABLE` de
    /// `OfflineHttpInterceptor.kt`): el acceso y el registro del teléfono se repiten
    /// solos, y encolar un login guardaba el correo y la CONTRASEÑA en claro en
    /// `nexara-offline/mutations.json`. Además, un login «encolado» contestaba
    /// `{"queued":true}`, `staffLogin` no encontraba token y la pantalla decía
    /// «Sesión expirada» en vez de «Sin conexión».
    static func isNeverQueued(path relative: String) -> Bool {
        let path = relative.trimmingCharacters(in: CharacterSet(charactersIn: "/")).lowercased()
        return path == "auth"
            || path.hasPrefix("auth/")
            || path.hasPrefix("portal/login")
            || path.hasPrefix("devices/push-token")
            || isOnlineOnly(path: path)
    }

    /// Mutaciones que solo valen en el momento (paridad con `SOLO_EN_LINEA` de Android):
    /// pausar o reanudar el reloj, y lo que se registra con el escáner. Reenviadas horas
    /// después cambiarían la hora real o moverían inventario sobre un estado que ya no existe.
    private static func isOnlineOnly(path: String) -> Bool {
        if path.hasSuffix("/pausar") || path.hasSuffix("/reanudar") || path.hasSuffix("/por-codigo") {
            return true
        }
        if path.hasPrefix("tool-requests/") {
            return path.hasSuffix("/deliver") || path.hasSuffix("/return")
        }
        return false
    }

    /// Ruta de la petición sin el prefijo del API (`/api`), en minúsculas y sin barras en los bordes.
    private func relativePath(of req: URLRequest) -> String {
        var path = req.url?.path ?? ""
        let basePath = baseURL.path
        if !basePath.isEmpty, basePath != "/", path.hasPrefix(basePath) {
            path = String(path.dropFirst(basePath.count))
        }
        return path.trimmingCharacters(in: CharacterSet(charactersIn: "/")).lowercased()
    }

    /// `true` si esta petición puede esperar en la cola sin conexión.
    private func canQueueOffline(_ req: URLRequest) -> Bool {
        let method = (req.httpMethod ?? "GET").uppercased()
        guard Self.mutatingMethods.contains(method) else { return false }
        return !Self.isNeverQueued(path: relativePath(of: req))
    }

    /// Rutas cuyo 401 es la respuesta final: renovar la sesión no las arregla.
    private static let noRefreshPaths = ["/auth/login", "/portal/login", "/auth/session/refresh", "/auth/logout"]

    /// Un 401 en una petición autenticada no cierra la sesión: se renueva el token
    /// (una sola renovación para todas las peticiones que fallen a la vez) y se
    /// reintenta UNA vez. Solo `SessionRefresher` cierra sesión, y solo si el
    /// servidor responde 401 a la renovación.
    private func perform(_ req: URLRequest) async throws -> Data {
        do {
            return try await performOnce(req)
        } catch let error as ApiError {
            guard case .http(let code, _) = error, code == 401,
                  let retry = await requestAfterSessionRefresh(req) else {
                throw error
            }
            // Un solo reintento: si vuelve a fallar, se lanza ese error tal cual.
            return try await performOnce(retry)
        }
    }

    /// Petición lista para reintentar con el token renovado, o `nil` si no aplica
    /// (sin token, login/refresh/logout, portal de cliente o sucursal, o la
    /// renovación no se logró).
    private func requestAfterSessionRefresh(_ req: URLRequest) async -> URLRequest? {
        guard let header = req.value(forHTTPHeaderField: "Authorization"), header.hasPrefix("Bearer ") else {
            return nil
        }
        let path = req.url?.path ?? ""
        guard !Self.noRefreshPaths.contains(where: { path.hasSuffix($0) || path.contains($0 + "/") || path.contains($0 + "-") }) else {
            return nil
        }
        guard let user = SessionStore.shared.currentUser else { return nil }
        // El API solo renueva tokens de personal; a un token de portal un 401 en
        // la renovación lo sacaría sin que el servidor lo haya revocado. Como las
        // cuentas de portal no tienen segunda oportunidad, para ellas este 401 ya
        // es la palabra final: se avisa, igual que el `On401.NotifyExpired` de
        // Android, en vez de dejarlas mirando una pantalla que no carga.
        guard !user.isClient, !user.isBranchUser else {
            SessionExpiredNotice.shared.notify()
            return nil
        }
        let usedToken = String(header.dropFirst("Bearer ".count))
        // Otra petición ya renovó el token mientras esta viajaba: basta reintentar.
        if !user.token.isEmpty, user.token != usedToken {
            return Self.request(req, bearer: user.token)
        }
        switch await SessionRefresher.shared.refresh() {
        case .refreshed(let token):
            return Self.request(req, bearer: token)
        case .revoked, .failed:
            return nil
        }
    }

    private static func request(_ req: URLRequest, bearer token: String) -> URLRequest {
        var copy = req
        copy.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return copy
    }

    /// `POST auth/session/refresh` con el token vigente (puede estar vencido).
    /// Va directo por la red: sin cola offline (un refresh encolado no sirve de
    /// nada) y sin la renovación por 401 de `perform` (aquí el 401 es la respuesta).
    func refreshSessionToken(_ token: String) async throws -> Data {
        // Modo demostración: la sesión es local y no caduca; nada sale del teléfono.
        if DemoMode.isActive {
            return Data("{\"access_token\":\"demo-token\",\"expiresAt\":\"2099-01-01T00:00:00Z\"}".utf8)
        }
        var req = try buildRequest("auth/session/refresh", method: "POST")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.httpBody = Data("{}".utf8)
        do {
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse else {
                throw ApiError.http(-1, "Respuesta inválida")
            }
            guard (200..<300).contains(http.statusCode) else {
                throw ApiError.http(http.statusCode, String(data: data, encoding: .utf8))
            }
            return data
        } catch let e as ApiError {
            throw e
        } catch {
            throw ApiError.transport(error)
        }
    }

    /// Modo demostración: contesta `DemoBackend` en memoria, ANTES de `NetworkMonitor`,
    /// de la caché sin conexión y de la cola de mutaciones. Nunca hay red, nunca hay
    /// 401 y nunca se devuelve `queued:true`.
    private func demoResponse(for req: URLRequest) async throws -> Data {
        let method = (req.httpMethod ?? "GET").uppercased()
        var query: [String: String] = [:]
        if let url = req.url,
           let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems {
            for item in items { query[item.name] = item.value ?? "" }
        }
        let path = relativePath(of: req)
        if let result = await DemoBackend.handle(method: method, path: path, query: query, body: req.httpBody) {
            guard (200..<300).contains(result.status) else {
                throw ApiError.http(result.status, String(data: result.data, encoding: .utf8))
            }
            return result.data
        }
        return Data("{}".utf8)
    }

    private func performOnce(_ req: URLRequest) async throws -> Data {
        if DemoMode.isActive {
            return try await demoResponse(for: req)
        }
        let method = (req.httpMethod ?? "GET").uppercased()
        let urlStr = req.url?.absoluteString ?? ""
        let authTag = String((req.value(forHTTPHeaderField: "Authorization") ?? "anon").prefix(48))
        let online = await NetworkMonitor.shared.isOnline
        let queueable = canQueueOffline(req)

        if !online {
            if method == "GET", let hit = OfflineApiCache.shared.get(url: urlStr, authTag: authTag) {
                return hit
            }
            if queueable {
                enqueueOffline(req: req, urlStr: urlStr)
                return Self.queuedBody
            }
            // Acceso (`auth/*`, `portal/login`): no se encola. Se intenta la red de
            // todos modos; si de verdad no hay, sale `ApiError.transport` («Sin conexión»).
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
            if method == "GET" {
                OfflineApiCache.shared.put(url: urlStr, authTag: authTag, data: data)
            }
            return data
        } catch let e as ApiError {
            throw e
        } catch {
            if method == "GET", let hit = OfflineApiCache.shared.get(url: urlStr, authTag: authTag) {
                return hit
            }
            if queueable {
                enqueueOffline(req: req, urlStr: urlStr)
                return Self.queuedBody
            }
            throw ApiError.transport(error)
        }
    }

    private func enqueueOffline(req: URLRequest, urlStr: String) {
        // Última defensa: un cuerpo de acceso (contraseña) jamás se persiste.
        guard !Self.isNeverQueued(path: relativePath(of: req)) else { return }
        let rawBody = req.httpBody.flatMap { String(data: $0, encoding: .utf8) }
        let bodyStr = OfflineMediaStore.shared.externalizeDataUrls(rawBody)
        let ct = req.value(forHTTPHeaderField: "Content-Type") ?? "application/json"
        OfflineMutationQueue.shared.enqueue(QueuedMutation(
            id: UUID().uuidString,
            method: req.httpMethod ?? "POST",
            url: urlStr,
            body: bodyStr,
            contentType: ct
        ))
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
