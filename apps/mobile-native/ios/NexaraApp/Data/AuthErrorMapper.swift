import Foundation

/// Mensajes claros para el acceso (paridad con `AuthErrorMapper.kt` de Android).
///
/// Por qué existe: `ApiError.toUserMessage` contesta «Sesión expirada. Inicia sesión de
/// nuevo.» a CUALQUIER 401. En un login eso es una mentira: no hay sesión que haya
/// expirado. Quien se equivocó de contraseña, quien tiene la cuenta bloqueada y quien
/// no tenía conexión veían la misma frase. Apple reportó justamente eso al revisar la
/// app («no pudimos iniciar sesión con la cuenta demo»).
///
/// Solo se usa en la pantalla de acceso; el resto de la app sigue con `toUserMessage`.
enum AuthErrorMapper {
    /// Mensajes fríos que manda el servidor (o nuestro propio código) cuando la
    /// contraseña no coincide: se cambian por nuestra copia. Cualquier otro mensaje
    /// (cuenta bloqueada, usuario inactivo) sí se muestra: dice algo que la persona
    /// no puede adivinar.
    private static let genericos: Set<String> = [
        "credenciales inválidas",
        "credenciales invalidas",
        "invalid credentials",
        "unauthorized",
        "sin token",
    ]

    static let credencialesIncorrectas = "Correo o contraseña incorrectos. Verifica tus datos e intenta de nuevo."
    static let sinConexion = "Sin conexión a internet. Revisa tu red e intenta de nuevo."
    static let tiempoAgotado = "La conexión tardó demasiado. Comprueba tu internet e intenta de nuevo."
    static let problemaDeConexion = "Problema de conexión. Revisa tu internet e intenta de nuevo."
    static let generico = "No se pudo iniciar sesión. Intenta de nuevo."

    static func loginMessage(_ error: Error) -> String {
        if let api = error as? ApiError {
            switch api {
            case .http(let code, let body):
                return mensaje(status: code, body: body)
            case .transport(let inner):
                return mensajeDeRed(inner)
            case .invalidURL, .decoding:
                return generico
            }
        }
        // Errores de red que llegaron sin envolver.
        if (error as NSError).domain == NSURLErrorDomain {
            return mensajeDeRed(error)
        }
        return generico
    }

    // MARK: HTTP

    private static func mensaje(status: Int, body: String?) -> String {
        if let body, body.localizedCaseInsensitiveContains("MFA_REQUIRED") {
            return "Se requiere verificación MFA. Completa el segundo factor en la web o contacta a soporte."
        }
        switch status {
        case 401:
            let server = mensajeDelServidor(body)
            // «Cuenta bloqueada temporalmente. Reintenta en N min.»: el texto del servidor
            // manda, porque dice cuánto esperar.
            if let server, esBloqueo(server) { return server }
            return server ?? credencialesIncorrectas
        case 403:
            let server = mensajeDelServidor(body)
            if let server, esBloqueo(server) { return server }
            return server ?? "Tu cuenta no tiene acceso a esta aplicación."
        case 404:
            // No es «contraseña mal»: ese correo no existe en la tabla que se consultó.
            return "No encontramos ninguna cuenta con ese correo."
        case 423:
            return mensajeDelServidor(body) ?? "Tu cuenta está bloqueada temporalmente. Intenta de nuevo más tarde."
        case 429:
            return "Demasiados intentos. Espera un momento e intenta de nuevo."
        case 500...599:
            return "El servidor no está disponible en este momento. Intenta más tarde."
        default:
            return generico
        }
    }

    private static func esBloqueo(_ texto: String) -> Bool {
        let plano = texto.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "es_MX"))
        return plano.contains("bloquead")
    }

    /// Lee `message` del cuerpo (NestJS lo manda como texto o como lista) y descarta
    /// los genéricos.
    private static func mensajeDelServidor(_ body: String?) -> String? {
        guard let crudo = body?.trimmingCharacters(in: .whitespacesAndNewlines), !crudo.isEmpty else { return nil }
        var texto: String?
        if crudo.hasPrefix("{") {
            if let objeto = try? JSONSerialization.jsonObject(with: Data(crudo.utf8)) as? [String: Any] {
                if let uno = objeto["message"] as? String {
                    texto = uno
                } else if let lista = objeto["message"] as? [String] {
                    texto = lista.filter { !$0.isEmpty }.joined(separator: " ")
                }
            }
        } else if !crudo.hasPrefix("<"), (1...300).contains(crudo.count) {
            texto = crudo
        }
        guard let limpio = texto?.trimmingCharacters(in: .whitespacesAndNewlines), !limpio.isEmpty else { return nil }
        return genericos.contains(limpio.lowercased()) ? nil : limpio
    }

    // MARK: Red

    private static func mensajeDeRed(_ error: Error) -> String {
        let ns = error as NSError
        guard ns.domain == NSURLErrorDomain else { return problemaDeConexion }
        switch ns.code {
        case NSURLErrorTimedOut:
            return tiempoAgotado
        case NSURLErrorNotConnectedToInternet,
             NSURLErrorDataNotAllowed,
             NSURLErrorInternationalRoamingOff,
             NSURLErrorNetworkConnectionLost,
             NSURLErrorCannotFindHost,
             NSURLErrorCannotConnectToHost,
             NSURLErrorDNSLookupFailed,
             NSURLErrorSecureConnectionFailed,
             NSURLErrorServerCertificateUntrusted,
             NSURLErrorServerCertificateHasBadDate,
             NSURLErrorServerCertificateHasUnknownRoot,
             NSURLErrorServerCertificateNotYetValid,
             NSURLErrorClientCertificateRejected,
             NSURLErrorCannotLoadFromNetwork:
            return sinConexion
        default:
            return problemaDeConexion
        }
    }
}
