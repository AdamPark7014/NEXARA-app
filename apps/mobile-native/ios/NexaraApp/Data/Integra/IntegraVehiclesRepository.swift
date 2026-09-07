import Foundation

// MARK: - Placa logic (port of Android PlacaLogic.kt / web _placas.ts)

enum PlacaLimites {
    static let max = 40
    static let alfanumEsperados = 5
}

struct IntegraVehiculo {
    let id: String
    let plate: String
    let personId: String?
    let personName: String?
}

struct IntegraPersonaResumen {
    let id: String
    let name: String
    let code: String?
    let orgName: String?
}

struct ValidacionPlaca {
    var valida: Bool = false
    let normalizada: String
    var error: String? = nil
    var aviso: String? = nil
}

enum FiltroDueno: String {
    case todas = ""
    case con = "con"
    case sin = "sin"
}

struct FiltrosVehiculos {
    var q: String = ""
    var dueno: FiltroDueno = .todas
}

enum DuenoVehiculo {
    case sinDueno
    case conocido(id: String, nombre: String, persona: IntegraPersonaResumen)
    case ausente(id: String, nombre: String?)
}

enum PlacaLogic {
    private static let espacios = try! NSRegularExpression(pattern: #"\s+"#)
    private static let noAlfanum = try! NSRegularExpression(pattern: #"[^A-Z0-9]"#)
    private static let permitidos = try! NSRegularExpression(pattern: #"^[A-Z0-9 -]+$"#)

    /// Same as server before save: trim + uppercase (invariant).
    static func normalizarPlaca(_ bruta: String) -> String {
        let trimmed = bruta.trimmingCharacters(in: .whitespacesAndNewlines)
        let spaced = espacios.stringByReplacingMatches(
            in: trimmed,
            range: NSRange(trimmed.startIndex..., in: trimmed),
            withTemplate: " "
        )
        return spaced.uppercased()
    }

    /// Identity key: letters+digits only (`ABC-123` ≡ `ABC 123`).
    static func claveDePlaca(_ placa: String) -> String {
        let n = normalizarPlaca(placa)
        return noAlfanum.stringByReplacingMatches(
            in: n,
            range: NSRange(n.startIndex..., in: n),
            withTemplate: ""
        )
    }

    static func validarPlaca(_ bruta: String) -> ValidacionPlaca {
        let normalizada = normalizarPlaca(bruta)
        if normalizada.isEmpty {
            return ValidacionPlaca(normalizada: normalizada, error: "Escribe una placa.")
        }
        if normalizada.count > PlacaLimites.max {
            return ValidacionPlaca(
                normalizada: normalizada,
                error: "La placa no puede pasar de \(PlacaLimites.max) caracteres; " +
                    "esta tiene \(normalizada.count)."
            )
        }
        let full = NSRange(normalizada.startIndex..., in: normalizada)
        if permitidos.firstMatch(in: normalizada, range: full) == nil {
            return ValidacionPlaca(
                normalizada: normalizada,
                error: "Solo se admiten letras, números, espacios y guiones."
            )
        }
        let alfanumericos = claveDePlaca(normalizada).count
        if alfanumericos == 0 {
            return ValidacionPlaca(
                normalizada: normalizada,
                error: "Una placa necesita alguna letra o número: el servidor los usa " +
                    "para construir su identificador."
            )
        }
        let aviso: String? = alfanumericos < PlacaLimites.alfanumEsperados
            ? "Solo \(alfanumericos) caracteres útiles. Se puede guardar, pero una placa " +
                "suele tener \(PlacaLimites.alfanumEsperados) o más."
            : nil
        return ValidacionPlaca(valida: true, normalizada: normalizada, aviso: aviso)
    }

    static func placaDuplicada(
        _ placa: String,
        vehiculos: [IntegraVehiculo],
        exceptoId: String? = nil
    ) -> IntegraVehiculo? {
        let clave = claveDePlaca(placa)
        if clave.isEmpty { return nil }
        return vehiculos.first { $0.id != exceptoId && claveDePlaca($0.plate) == clave }
    }

    static func avisoDuplicado(_ duplicado: IntegraVehiculo) -> String {
        "Ya existe una ficha con esa placa (\(duplicado.plate)). Guardarla otra vez no " +
            "crearía otra: el servidor sobrescribiría la actual, dueño incluido."
    }

    static func filtroDuenoDe(_ v: String?) -> FiltroDueno {
        FiltroDueno(rawValue: v ?? "") ?? .todas
    }

    static func tieneDueno(_ v: IntegraVehiculo) -> Bool {
        !(v.personId ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !(v.personName ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    static func filtrarVehiculos(_ items: [IntegraVehiculo], filtros: FiltrosVehiculos) -> [IntegraVehiculo] {
        let q = filtros.q.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let claveQ = claveDePlaca(filtros.q)
        return items.filter { v in
            switch filtros.dueno {
            case .con: if !tieneDueno(v) { return false }
            case .sin: if tieneDueno(v) { return false }
            case .todas: break
            }
            if q.isEmpty { return true }
            let enTexto =
                v.plate.lowercased().contains(q)
                || (v.personName ?? "").lowercased().contains(q)
                || (v.personId ?? "").lowercased().contains(q)
            let enClave = !claveQ.isEmpty && claveDePlaca(v.plate).contains(claveQ)
            return enTexto || enClave
        }
    }

    static func resolverDueno(_ v: IntegraVehiculo, personas: [IntegraPersonaResumen]) -> DuenoVehiculo {
        let id = (v.personId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if id.isEmpty {
            let nombre = (v.personName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return nombre.isEmpty ? .sinDueno : .ausente(id: "", nombre: nombre)
        }
        if let persona = personas.first(where: { $0.id == id }) {
            return .conocido(id: id, nombre: persona.name, persona: persona)
        }
        let nombre = v.personName?.trimmingCharacters(in: .whitespacesAndNewlines)
        return .ausente(id: id, nombre: (nombre?.isEmpty == false) ? nombre : nil)
    }

    static func etiquetaPersona(_ p: IntegraPersonaResumen) -> String {
        let extras = [p.code, p.orgName].compactMap { $0 }.filter { !$0.isEmpty }
        if extras.isEmpty { return p.name }
        return "\(p.name) (\(extras.joined(separator: " · ")))"
    }

    static func contarSinDueno(_ items: [IntegraVehiculo]) -> Int {
        items.filter { !tieneDueno($0) }.count
    }
}

// MARK: - Vehicles repository

final class IntegraVehiclesRepository {
    static let shared = IntegraVehiclesRepository()
    private init() {}

    private func siteQ(_ siteId: Int?) -> [String: String] {
        IntegraQuery.site(siteId ?? IntegraSiteScope.current)
    }

    struct Inventario {
        let items: [IntegraVehiculo]
        /// Server note («plates are not pushed to the device»).
        let syncNote: String?
        /// `mirror` | `live`
        let source: String?
    }

    func vehiculos(live: Bool = false, siteId: Int? = nil) async throws -> Inventario {
        var q = siteQ(siteId)
        if live { q["live"] = "1" }
        let root = IntegraJSON.decodeMap(try await IntegraHTTP.get("integra/vehicles", query: q))
        let items = IntegraJSON.itemsOf(root).compactMap { row -> IntegraVehiculo? in
            guard let id = row.integraStr("id"), !id.isEmpty else { return nil }
            return IntegraVehiculo(
                id: id,
                plate: row.integraStr("plate", "plateNo") ?? "",
                personId: row.integraStr("personId"),
                personName: row.integraStr("personName")
            )
        }
        return Inventario(
            items: items,
            syncNote: root.integraStr("syncNote"),
            source: root.integraStr("source")
        )
    }

    func personas(siteId: Int? = nil) async throws -> [IntegraPersonaResumen] {
        IntegraJSON.decodeList(try await IntegraHTTP.get("integra/people", query: siteQ(siteId)))
            .compactMap { row -> IntegraPersonaResumen? in
                guard let id = row.integraStr("id", "personId"), !id.isEmpty else { return nil }
                let name = row.integraStr("name", "personName") ?? "Persona \(id)"
                return IntegraPersonaResumen(
                    id: id,
                    name: name,
                    code: row.integraStr("code", "personCode"),
                    orgName: row.integraStr("orgName")
                )
            }
    }

    /// Caller MUST check `PlacaLogic.placaDuplicada` first — ISAPI path upserts silently.
    func altaVehiculo(placaNormalizada: String, personId: String?, siteId: Int? = nil) async throws -> [String: Any] {
        struct Body: Encodable {
            let plateNo: String
            let personId: String?
        }
        let pid = personId?.trimmingCharacters(in: .whitespacesAndNewlines)
        return IntegraJSON.decodeMap(
            try await IntegraHTTP.postJSON(
                "integra/vehicles",
                body: Body(
                    plateNo: placaNormalizada,
                    personId: (pid?.isEmpty == false) ? pid : nil
                ),
                query: siteQ(siteId)
            )
        )
    }

    /// `personId` always sent (even `""`) so PATCH can clear owner.
    func editarVehiculo(
        vehicleId: String,
        placaNormalizada: String,
        personId: String?,
        siteId: Int? = nil
    ) async throws -> [String: Any] {
        struct Body: Encodable {
            let plateNo: String
            let personId: String
        }
        return IntegraJSON.decodeMap(
            try await IntegraHTTP.patchJSON(
                "integra/vehicles/\(vehicleId)",
                body: Body(
                    plateNo: placaNormalizada,
                    personId: personId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                ),
                query: siteQ(siteId)
            )
        )
    }

    func borrarVehiculo(vehicleId: String, siteId: Int? = nil) async throws -> [String: Any] {
        IntegraJSON.decodeMap(
            try await IntegraHTTP.delete("integra/vehicles/\(vehicleId)", query: siteQ(siteId))
        )
    }

    struct CamaraOpcion {
        let id: String
        let name: String
        let anprCapable: Bool?
    }

    func camaras(siteId: Int? = nil) async throws -> [CamaraOpcion] {
        IntegraJSON.decodeList(try await IntegraHTTP.get("integra/cameras", query: siteQ(siteId)))
            .compactMap { c in
                guard let id = c.integraStr("id"), !id.isEmpty else { return nil }
                return CamaraOpcion(
                    id: id,
                    name: c.integraStr("name") ?? id,
                    anprCapable: c.integraBool("anprCapable")
                )
            }
    }

    struct AnprQuery {
        var pageNo: Int
        var pageSize: Int
        var startTime: String
        var endTime: String
        var cameraIndexCode: String? = nil
        var plateNo: String? = nil
        var ownerName: String? = nil
        var sortField: String? = "PassTime"
        var orderType: Int? = 1
    }

    struct PaginaAnpr {
        let registros: [[String: Any]]
        let total: Int?
    }

    /// Artemis-only. ISAPI sites return HTTP 400 («Artemis no disponible»).
    func anpr(_ query: AnprQuery, siteId: Int? = nil) async throws -> PaginaAnpr {
        struct Body: Encodable {
            let pageNo: Int
            let pageSize: Int
            let startTime: String
            let endTime: String
            let cameraIndexCode: String?
            let plateNo: String?
            let ownerName: String?
            let sortField: String?
            let orderType: Int?
        }
        let root = IntegraJSON.decodeMap(
            try await IntegraHTTP.postJSON(
                "integra/anpr/cross-records",
                body: Body(
                    pageNo: query.pageNo,
                    pageSize: query.pageSize,
                    startTime: query.startTime,
                    endTime: query.endTime,
                    cameraIndexCode: query.cameraIndexCode,
                    plateNo: query.plateNo,
                    ownerName: query.ownerName,
                    sortField: query.sortField,
                    orderType: query.orderType
                ),
                query: siteQ(siteId)
            )
        )
        let list = (root["list"] as? [[String: Any]])
            ?? IntegraJSON.asMapList(root["list"])
            ?? IntegraJSON.itemsOf(root)
        return PaginaAnpr(registros: list, total: root.integraInt("total"))
    }

    struct Diagnostico {
        let mensaje: String
        let noDisponible: Bool
    }

    /// Parse Nest/HTTP errors for ANPR (structural Artemis unavailability vs transient).
    static func diagnosticar(_ error: Error, fallback: String) -> Diagnostico {
        guard case let ApiError.http(code, body) = error else {
            return Diagnostico(mensaje: error.localizedDescription.isEmpty ? fallback : error.localizedDescription,
                               noDisponible: false)
        }
        let delServidor = body.flatMap { extraerMensaje($0) }
        let noDisponible: Bool = {
            guard code == 400, let msg = delServidor else { return false }
            return msg.localizedCaseInsensitiveContains("Artemis no disponible")
                || msg.localizedCaseInsensitiveContains("provider a ARTEMIS")
        }()
        let mensaje: String
        if let delServidor {
            mensaje = delServidor
        } else if code == 401 {
            mensaje = "Sesión expirada. Inicia sesión de nuevo."
        } else if code == 403 {
            mensaje = "Sin permisos para esta acción."
        } else if code == 404 {
            mensaje = "Recurso no encontrado."
        } else if code >= 500 {
            mensaje = "Error del servidor. Intenta más tarde."
        } else {
            mensaje = fallback
        }
        return Diagnostico(mensaje: mensaje, noDisponible: noDisponible)
    }

    private static func extraerMensaje(_ crudo: String) -> String? {
        let full = NSRange(crudo.startIndex..., in: crudo)
        if let listRe = try? NSRegularExpression(pattern: #"\"message\"\s*:\s*\[([^\]]*)\]"#),
           let m = listRe.firstMatch(in: crudo, range: full),
           m.numberOfRanges > 1,
           let innerRange = Range(m.range(at: 1), in: crudo) {
            let inner = String(crudo[innerRange])
            let textRe = try? NSRegularExpression(pattern: #"\"((?:[^\"\\]|\\.)*)\""#)
            var parts: [String] = []
            textRe?.enumerateMatches(in: inner, range: NSRange(inner.startIndex..., in: inner)) { match, _, _ in
                guard let match, match.numberOfRanges > 1,
                      let r = Range(match.range(at: 1), in: inner) else { return }
                let t = desescapar(String(inner[r]))
                if !t.isEmpty { parts.append(t) }
            }
            if !parts.isEmpty { return parts.joined(separator: " · ") }
        }
        if let msgRe = try? NSRegularExpression(pattern: #"\"message\"\s*:\s*\"((?:[^\"\\]|\\.)*)\""#),
           let m = msgRe.firstMatch(in: crudo, range: full),
           m.numberOfRanges > 1,
           let r = Range(m.range(at: 1), in: crudo) {
            let t = desescapar(String(crudo[r]))
            return t.isEmpty ? nil : t
        }
        let t = crudo.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : String(t.prefix(300))
    }

    private static func desescapar(_ s: String) -> String {
        s.replacingOccurrences(of: "\\\"", with: "\"")
            .replacingOccurrences(of: "\\n", with: " ")
            .replacingOccurrences(of: "\\\\", with: "\\")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
