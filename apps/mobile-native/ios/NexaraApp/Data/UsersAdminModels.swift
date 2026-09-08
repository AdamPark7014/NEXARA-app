import Foundation

/// Ficha de un usuario — `GET users/:id`.
///
/// La lista (`GET users`) devuelve un resumen; el detalle trae los campos de
/// RR. HH. y de seguridad que la pantalla de identidad necesita para explicar
/// por qué alguien no puede entrar (inactivo, bloqueado, sin MFA).
struct UserAdminDetail: Hashable, Identifiable {
    let id: Int64
    let nombre: String
    let email: String
    let telefono: String
    let roleId: Int64
    let roleName: String
    let orgRoleKey: String
    let departmentId: Int64
    let departmentName: String
    let puesto: String
    let tipoContrato: String
    let estadoRRHH: String
    let employeeNumber: String
    let fechaIngreso: String
    let lastLoginAt: String
    let lockedUntil: String
    let failedLoginCount: Int
    let mfaEnabled: Bool
    let isActive: Bool
    let managerId: Int64
    let managerName: String
    let raw: [String: Any]

    var displayName: String { nombre.isEmpty ? (email.isEmpty ? "Usuario #\(id)" : email) : nombre }

    /// Bloqueado ahora mismo. `lockedUntil` es una fecha futura, no un booleano:
    /// una marca vencida NO es un bloqueo, y pintarla como tal confunde.
    var isLocked: Bool {
        guard !lockedUntil.isEmpty else { return false }
        guard let until = ISO8601DateFormatter().date(from: lockedUntil)
            ?? UsersAdminParse.isoFractional.date(from: lockedUntil) else { return false }
        return until > Date()
    }

    /// Anonimizado por la rutina de privacidad; el API marca el correo.
    var isAnonymized: Bool { email.contains("@privacy.nexara.local") }

    static func == (lhs: UserAdminDetail, rhs: UserAdminDetail) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let role = raw["role"] as? [String: Any]
        let department = raw["department"] as? [String: Any]
        let manager = raw["manager"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        nombre = StockParse.str(raw["nombre"], raw["name"])
        email = StockParse.str(raw["email"], raw["correo"])
        telefono = StockParse.str(raw["telefono"], raw["phone"])
        roleId = StockParse.int64(raw["roleId"], role?["id"]) ?? 0
        roleName = StockParse.str(raw["roleName"], role?["nombre"], role?["name"], raw["rol"], raw["role"])
        orgRoleKey = StockParse.str(raw["orgRoleKey"], role?["orgRoleKey"])
        departmentId = StockParse.int64(raw["departmentId"], department?["id"]) ?? 0
        departmentName = StockParse.str(
            raw["departmentName"], department?["nombre"], department?["name"], raw["departamento"]
        )
        puesto = StockParse.str(raw["puesto"], raw["position"])
        tipoContrato = StockParse.str(raw["tipoContrato"], raw["contractType"])
        estadoRRHH = StockParse.str(raw["estadoRRHH"], raw["hrStatus"])
        employeeNumber = StockParse.str(raw["employeeNumber"], raw["numeroEmpleado"])
        fechaIngreso = StockParse.str(raw["fechaIngreso"], raw["hireDate"])
        lastLoginAt = StockParse.str(raw["lastLoginAt"], raw["ultimoAcceso"])
        lockedUntil = StockParse.str(raw["lockedUntil"])
        failedLoginCount = StockParse.int(raw["failedLoginCount"]) ?? 0
        mfaEnabled = UsersAdminParse.bool(raw["mfaEnabled"])
        isActive = UsersAdminParse.bool(raw["isActive"], default: true)
        managerId = StockParse.int64(raw["managerId"], manager?["id"]) ?? 0
        managerName = StockParse.str(raw["managerName"], manager?["nombre"], manager?["name"])
    }
}

/// Sesión abierta de un usuario — `GET users/:id/sessions`.
struct UserSessionInfo: Hashable, Identifiable {
    let id: Int64
    let device: String
    let ipAddress: String
    let userAgent: String
    let createdAt: String
    let lastSeenAt: String
    let expiresAt: String
    let revokedAt: String
    let revokeReason: String

    /// Viva = ni revocada ni caducada. El API no manda una bandera, así que se
    /// calcula igual que la web: `!revokedAt && expiresAt > ahora`.
    var isLive: Bool {
        guard revokedAt.isEmpty else { return false }
        guard let expires = ISO8601DateFormatter().date(from: expiresAt)
            ?? UsersAdminParse.isoFractional.date(from: expiresAt) else { return false }
        return expires > Date()
    }

    var displayDevice: String { device.isEmpty ? "Dispositivo desconocido" : device }

    var statusLabel: String {
        if !revokedAt.isEmpty { return "Revocada" }
        return isLive ? "Activa" : "Caducada"
    }

    static func == (lhs: UserSessionInfo, rhs: UserSessionInfo) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        id = StockParse.int64(raw["id"]) ?? 0
        device = StockParse.str(raw["device"], raw["deviceName"])
        ipAddress = StockParse.str(raw["ipAddress"], raw["ip"])
        userAgent = StockParse.str(raw["userAgent"])
        createdAt = StockParse.str(raw["createdAt"])
        lastSeenAt = StockParse.str(raw["lastSeenAt"])
        expiresAt = StockParse.str(raw["expiresAt"])
        revokedAt = StockParse.str(raw["revokedAt"])
        revokeReason = StockParse.str(raw["revokeReason"])
    }
}

/// Evento de autenticación — `GET users/:id/auth-activity`.
struct UserAuthActivity: Hashable, Identifiable {
    let id: Int64
    let action: String
    let ipAddress: String
    let userAgent: String
    let createdAt: String

    /// Etiqueta legible; el API manda claves tipo `LOGIN_FAILED`.
    var actionLabel: String {
        switch action.uppercased() {
        case "LOGIN", "LOGIN_SUCCESS": return "Inicio de sesión"
        case "LOGIN_FAILED", "LOGIN_FAILURE": return "Intento fallido"
        case "LOGOUT": return "Cierre de sesión"
        case "PASSWORD_CHANGED": return "Cambio de contraseña"
        case "MFA_ENABLED": return "MFA activado"
        case "MFA_DISABLED": return "MFA desactivado"
        case "SESSION_REVOKED": return "Sesión revocada"
        case "ACCOUNT_LOCKED": return "Cuenta bloqueada"
        case "ACCOUNT_UNLOCKED": return "Cuenta desbloqueada"
        default: return action.isEmpty ? "Evento" : action
        }
    }

    /// Los fallos se pintan en rojo: son la señal que se busca en esta lista.
    var isFailure: Bool {
        let key = action.uppercased()
        return key.contains("FAIL") || key.contains("LOCK") || key.contains("DENIED")
    }

    static func == (lhs: UserAuthActivity, rhs: UserAuthActivity) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        id = StockParse.int64(raw["id"]) ?? 0
        action = StockParse.str(raw["action"], raw["accion"], raw["event"])
        ipAddress = StockParse.str(raw["ipAddress"], raw["ip"])
        userAgent = StockParse.str(raw["userAgent"])
        createdAt = StockParse.str(raw["createdAt"], raw["timestamp"], raw["fecha"])
    }
}

/// Horario de acceso INTEGRA derivado del rol — `GET users/:id/integra-access-schedule`.
/// Es una **vista previa** calculada por el API; esta pantalla no la edita.
struct UserAccessSchedule: Hashable {
    let employeeNumber: String
    let label: String
    let hint: String
    let beginTime: String
    let endTime: String
    let doorScope: String
    let integraEditorPath: String
    let targetIps: [String]
    let note: String

    var isEmpty: Bool { label.isEmpty && targetIps.isEmpty && employeeNumber.isEmpty }

    var timeRange: String {
        guard !beginTime.isEmpty || !endTime.isEmpty else { return "" }
        return "\(beginTime) – \(endTime)"
    }

    init(raw: [String: Any]) {
        let schedule = raw["schedule"] as? [String: Any] ?? [:]
        employeeNumber = StockParse.str(raw["employeeNumber"])
        label = StockParse.str(schedule["label"], schedule["key"])
        hint = StockParse.str(schedule["hint"], schedule["description"])
        beginTime = StockParse.str(schedule["beginTime"])
        endTime = StockParse.str(schedule["endTime"])
        doorScope = StockParse.str(schedule["doorScope"])
        integraEditorPath = StockParse.str(schedule["integraEditorPath"])
        targetIps = (raw["targetIps"] as? [Any] ?? []).compactMap { $0 as? String }
        note = StockParse.str(raw["note"])
    }
}

/// Estado del segundo factor de la **propia** cuenta — `GET users/mfa/status`.
struct UserMfaStatus: Hashable {
    let mfaEnabled: Bool
    let mfaEnabledAt: String

    init(raw: [String: Any]) {
        mfaEnabled = UsersAdminParse.bool(raw["mfaEnabled"])
        mfaEnabledAt = StockParse.str(raw["mfaEnabledAt"])
    }
}

/// Alta de TOTP — `POST users/mfa/setup`. El secreto se enseña una sola vez.
struct UserMfaSetup: Hashable {
    let secret: String
    let otpauthUrl: String

    var isUsable: Bool { !secret.isEmpty }

    init(raw: [String: Any]) {
        secret = StockParse.str(raw["secret"])
        otpauthUrl = StockParse.str(raw["otpauthUrl"], raw["otpauth_url"])
    }
}

/// Usuario en riesgo dentro de `users/iam/insights`.
struct IamRiskItem: Hashable, Identifiable {
    let id: Int64
    let nombre: String
    let email: String
    let riskScore: Double
    let riskLevel: String
    let riskFactors: [String]
    let lastLoginAt: String
    let failedLoginCount: Int

    var displayName: String { nombre.isEmpty ? (email.isEmpty ? "Usuario #\(id)" : email) : nombre }

    var levelLabel: String {
        switch riskLevel.lowercased() {
        case "high", "alto": return "Alto"
        case "medium", "medio": return "Medio"
        case "low", "bajo": return "Bajo"
        default: return riskLevel.isEmpty ? "—" : riskLevel
        }
    }

    static func == (lhs: IamRiskItem, rhs: IamRiskItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        id = StockParse.int64(raw["id"]) ?? 0
        nombre = StockParse.str(raw["nombre"], raw["name"])
        email = StockParse.str(raw["email"])
        riskScore = StockParse.dbl(raw["riskScore"]) ?? 0
        riskLevel = StockParse.str(raw["riskLevel"])
        riskFactors = (raw["riskFactors"] as? [Any] ?? []).compactMap { $0 as? String }
        lastLoginAt = StockParse.str(raw["lastLoginAt"])
        failedLoginCount = StockParse.int(raw["failedLoginCount"]) ?? 0
    }
}

/// Aviso del panel IAM (`{severity, message}`).
struct IamAlert: Hashable, Identifiable {
    let severity: String
    let message: String
    var id: String { "\(severity)-\(message)" }

    var isDanger: Bool { severity.lowercased() == "danger" }

    init(raw: [String: Any]) {
        severity = StockParse.str(raw["severity"])
        message = StockParse.str(raw["message"])
    }
}

/// Cifras del panel IAM.
struct IamKpis: Hashable {
    let total: Int
    let active: Int
    let inactive: Int
    let neverLoggedIn: Int
    let activeLast7d: Int
    let activeLast30d: Int
    let stale30d: Int
    let locked: Int
    let highRisk: Int
    let createdLast7d: Int
    let createdLast30d: Int
    let mfaEnabled: Int
    let mfaCoveragePct: Double
    let activeSessions: Int
    let retentionProxy30d: Double

    init(raw: [String: Any]) {
        total = StockParse.int(raw["total"]) ?? 0
        active = StockParse.int(raw["active"]) ?? 0
        inactive = StockParse.int(raw["inactive"]) ?? 0
        neverLoggedIn = StockParse.int(raw["neverLoggedIn"]) ?? 0
        activeLast7d = StockParse.int(raw["activeLast7d"]) ?? 0
        activeLast30d = StockParse.int(raw["activeLast30d"]) ?? 0
        stale30d = StockParse.int(raw["stale30d"]) ?? 0
        locked = StockParse.int(raw["locked"]) ?? 0
        highRisk = StockParse.int(raw["highRisk"]) ?? 0
        createdLast7d = StockParse.int(raw["createdLast7d"]) ?? 0
        createdLast30d = StockParse.int(raw["createdLast30d"]) ?? 0
        mfaEnabled = StockParse.int(raw["mfaEnabled"]) ?? 0
        mfaCoveragePct = StockParse.dbl(raw["mfaCoveragePct"]) ?? 0
        activeSessions = StockParse.int(raw["activeSessions"]) ?? 0
        retentionProxy30d = StockParse.dbl(raw["retentionProxy30d"]) ?? 0
    }
}

/// Panel de identidad y acceso — `GET users/iam/insights`.
/// Es la misma carga que dibuja `/erp/users` en la web, entera y de solo lectura.
struct IamInsights: Hashable {
    let generatedAt: String
    let kpis: IamKpis
    let byDepartment: [HrNamedCount]
    let byRole: [HrNamedCount]
    let byDevice: [HrNamedCount]
    let loginsSuccess14d: [HrDatedCount]
    let loginsFailed14d: [HrDatedCount]
    let riskTop: [IamRiskItem]
    let alerts: [IamAlert]

    var isEmpty: Bool { kpis.total == 0 && riskTop.isEmpty && alerts.isEmpty }

    static func == (lhs: IamInsights, rhs: IamInsights) -> Bool {
        lhs.generatedAt == rhs.generatedAt && lhs.kpis.total == rhs.kpis.total
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(generatedAt)
        hasher.combine(kpis.total)
    }

    init(raw: [String: Any]) {
        generatedAt = StockParse.str(raw["generatedAt"])
        kpis = IamKpis(raw: raw["kpis"] as? [String: Any] ?? [:])
        let distributions = raw["distributions"] as? [String: Any] ?? [:]
        byDepartment = (distributions["byDepartment"] as? [[String: Any]] ?? []).map { HrNamedCount(raw: $0) }
        byRole = (distributions["byRole"] as? [[String: Any]] ?? []).map { HrNamedCount(raw: $0) }
        byDevice = (distributions["byDevice"] as? [[String: Any]] ?? []).map { HrNamedCount(raw: $0) }
        let trends = raw["trends"] as? [String: Any] ?? [:]
        loginsSuccess14d = (trends["loginsSuccess14d"] as? [[String: Any]] ?? []).map { HrDatedCount(raw: $0) }
        loginsFailed14d = (trends["loginsFailed14d"] as? [[String: Any]] ?? []).map { HrDatedCount(raw: $0) }
        riskTop = (raw["riskTop"] as? [[String: Any]] ?? []).map { IamRiskItem(raw: $0) }
        alerts = (raw["alerts"] as? [[String: Any]] ?? []).map { IamAlert(raw: $0) }
    }
}

/// Rol del catálogo — `GET roles` y `GET users/roles`.
struct RoleSummary: Hashable, Identifiable {
    let id: Int64
    let nombre: String
    let orgRoleKey: String
    let nivelAutoridad: Int
    /// Banderas `accesoX` del rol, ya filtradas a las que están en `true`.
    let grants: [String]

    var displayName: String { nombre.isEmpty ? "Rol #\(id)" : nombre }

    static func == (lhs: RoleSummary, rhs: RoleSummary) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        id = StockParse.int64(raw["id"]) ?? 0
        nombre = StockParse.str(raw["nombre"], raw["name"], raw["label"])
        orgRoleKey = StockParse.str(raw["orgRoleKey"])
        nivelAutoridad = StockParse.int(raw["nivelAutoridad"]) ?? 0
        grants = raw
            .filter { key, value in key.hasPrefix("acceso") && (value as? Bool) == true }
            .keys
            .map { UsersAdminParse.grantLabel($0) }
            .sorted()
    }
}

/// Plantilla de rol organizativo — `GET roles/org-templates`.
/// Solo lectura: sirve para entender qué concede cada plantilla antes de
/// pedirle a alguien con permiso que cree o cambie un rol.
struct OrgRoleTemplate: Hashable, Identifiable {
    let orgRoleKey: String
    let nombre: String
    let label: String
    let descripcion: String
    let nivelAutoridad: Int
    let departmentHint: String
    let grants: [String]

    var id: String { orgRoleKey }
    var displayName: String {
        if !label.isEmpty { return label }
        return nombre.isEmpty ? orgRoleKey : nombre
    }

    init(raw: [String: Any]) {
        orgRoleKey = StockParse.str(raw["orgRoleKey"])
        nombre = StockParse.str(raw["nombre"], raw["name"])
        label = StockParse.str(raw["label"])
        descripcion = StockParse.str(raw["description"], raw["descripcion"])
        nivelAutoridad = StockParse.int(raw["nivelAutoridad"]) ?? 0
        departmentHint = StockParse.str(raw["departmentHint"])
        let flags = raw["flags"] as? [String: Any] ?? [:]
        grants = flags
            .filter { _, value in (value as? Bool) == true }
            .keys
            .map { UsersAdminParse.grantLabel($0) }
            .sorted()
    }
}

/// Opción de un desplegable (`users/roles`, `users/departments`).
struct UserPickerOption: Hashable, Identifiable {
    let id: Int64
    let label: String

    init(raw: [String: Any]) {
        id = StockParse.int64(raw["id"]) ?? 0
        label = StockParse.str(raw["nombre"], raw["name"], raw["label"], raw["descripcion"])
    }
}

/// Utilidades de lectura compartidas por los modelos de este fichero.
enum UsersAdminParse {
    static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// El API manda booleanos a veces como `true`, a veces como `"true"`/`1`.
    static func bool(_ value: Any?, default fallback: Bool = false) -> Bool {
        if let b = value as? Bool { return b }
        if let n = value as? NSNumber { return n.intValue != 0 }
        if let s = value as? String {
            let key = s.lowercased()
            if ["true", "1", "yes", "si", "sí"].contains(key) { return true }
            if ["false", "0", "no"].contains(key) { return false }
        }
        return fallback
    }

    /// `accesoGestionUsuarios` → «Gestión usuarios». Las banderas del rol se
    /// guardan en camelCase y sin trocearlas no hay quien las lea en una lista.
    static func grantLabel(_ flag: String) -> String {
        var name = flag
        if name.hasPrefix("acceso") { name = String(name.dropFirst("acceso".count)) }
        var words: [String] = []
        var current = ""
        for char in name {
            if char.isUppercase && !current.isEmpty {
                words.append(current)
                current = String(char)
            } else {
                current.append(char)
            }
        }
        if !current.isEmpty { words.append(current) }
        let joined = words.joined(separator: " ").trimmingCharacters(in: .whitespaces)
        guard let first = joined.first else { return flag }
        return String(first).uppercased() + joined.dropFirst().lowercased()
    }
}
