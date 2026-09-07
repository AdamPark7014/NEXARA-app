import Foundation

extension ApiError {
    /// Traduce el error a un mensaje que una persona pueda leer.
    /// Nunca muestra crudo «HTTP 502».
    func toUserMessage(fallback: String = "No se pudo completar la operación") -> String {
        switch self {
        case .invalidURL:
            return "URL inválida"
        case .http(let code, let body):
            if let body, body.localizedCaseInsensitiveContains("MFA_REQUIRED") {
                return "Se requiere verificación MFA. Completa el segundo factor en la web o contacta a soporte."
            }
            let server = Self.parseServerErrorBody(body)
            switch code {
            case 401:
                return "Sesión expirada. Inicia sesión de nuevo."
            case 403:
                return server ?? "Sin permisos para esta acción."
            case 404:
                return server ?? "Recurso no encontrado."
            case 500...599:
                return "Error del servidor. Intenta más tarde."
            case 400:
                return server ?? "Datos inválidos. Revisa el formulario."
            case 409:
                return server ?? "El registro cambió mientras lo editabas. Vuelve a intentarlo."
            default:
                return server ?? fallback
            }
        case .transport:
            return "Sin conexión. Revisa tu red e intenta de nuevo."
        case .decoding(let e):
            return "Decodificación: \(e.localizedDescription)"
        }
    }

    var isSessionExpired: Bool {
        if case .http(401, _) = self { return true }
        return false
    }

    /// Extrae mensaje legible del cuerpo NestJS / proxy.
    static func parseServerErrorBody(_ body: String?) -> String? {
        guard let body else { return nil }
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }
        if trimmed.hasPrefix("<") { return nil }
        if !trimmed.hasPrefix("{") {
            return (1...300).contains(trimmed.count) ? trimmed : nil
        }
        if let obj = try? JSONSerialization.jsonObject(with: Data(trimmed.utf8)) as? [String: Any] {
            for key in ["message", "error"] {
                if let s = obj[key] as? String, !s.isEmpty { return s }
                if let arr = obj[key] as? [String] {
                    let joined = arr.filter { !$0.isEmpty }.joined(separator: ". ")
                    if !joined.isEmpty { return joined }
                }
            }
        }
        return nil
    }
}

extension Error {
    func toUserMessage(fallback: String = "No se pudo completar la operación") -> String {
        if let api = self as? ApiError {
            return api.toUserMessage(fallback: fallback)
        }
        let ns = self as NSError
        if ns.domain == NSURLErrorDomain {
            return "Sin conexión. Revisa tu red e intenta de nuevo."
        }
        let msg = localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        return msg.isEmpty ? fallback : msg
    }
}
