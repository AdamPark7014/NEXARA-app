import Foundation

/// Espejo iOS de `apps/api/src/common/rbac/roles.v2.ts`: resuelve la clave
/// canónica del rol (CEO, cliente, sucursal…). Nunca decide por subcadena del
/// nombre visible del rol.
enum RolePanelMatrix {
    static let superAdmin = "super_admin"
    static let ceo = "ceo"
    static let arquitecto = "arquitecto"
    static let dirOperaciones = "dir_operaciones"
    static let dirAdmin = "dir_admin"
    static let coordAdmin = "coord_admin"
    static let administrativo = "administrativo"
    static let coordOperaciones = "coord_operaciones"
    static let ingCampo = "ing_campo"
    static let ingSoporte = "ing_soporte"
    static let coordVentas = "coord_ventas"
    static let vendedor = "vendedor"
    static let liderDiseno = "lider_diseno"
    static let disenador = "disenador"
    static let rh = "rh"
    static let contabilidad = "contabilidad"
    static let cliente = "cliente"
    /// No existe en roles.v2 (la sucursal entra por `portal/login`), pero sí como rol legacy.
    static let sucursal = "sucursal"

    /// Cuentas externas: solo portal, nunca paneles internos.
    static let externalRoles: Set<String> = [cliente, sucursal]

    /// Roles canónicos de roles.v2.ts (más la sucursal legacy).
    private static let knownRoles: [String] = [
        superAdmin, ceo, arquitecto, dirOperaciones, dirAdmin, coordAdmin, administrativo, rh,
        contabilidad, coordOperaciones, ingCampo, ingSoporte, coordVentas, vendedor, liderDiseno,
        disenador, cliente, sucursal,
    ]

    /// Alias → clave canónica, por cadena completa normalizada.
    private static let roleAliases: [String: String] = {
        var map: [String: String] = [:]
        for key in knownRoles {
            map[key] = key
        }
        // Nombres visibles (ROLE_LABELS.es)
        map["super_administrador"] = superAdmin
        map["super_admin"] = superAdmin
        map["superadmin"] = superAdmin
        map["arquitecto_dir_tecnico"] = arquitecto
        map["director_tecnico"] = arquitecto
        map["director_de_operaciones"] = dirOperaciones
        map["director_operaciones"] = dirOperaciones
        map["director_administrativo"] = dirAdmin
        map["directora_administrativa"] = dirAdmin
        map["coordinador_administrativo"] = coordAdmin
        map["coordinadora_administrativa"] = coordAdmin
        map["coordinador_de_operaciones"] = coordOperaciones
        map["coordinador_operaciones"] = coordOperaciones
        map["ingeniero_de_campo"] = ingCampo
        map["ingeniero_campo"] = ingCampo
        map["ingeniero_de_soporte"] = ingSoporte
        map["ingeniero_soporte"] = ingSoporte
        map["soporte_tecnico"] = ingSoporte
        map["coordinador_de_ventas"] = coordVentas
        map["coordinador_ventas"] = coordVentas
        map["gerente_comercial"] = coordVentas
        map["ejecutivo_de_ventas"] = vendedor
        map["lider_de_diseno"] = liderDiseno
        map["community_manager"] = disenador
        map["recursos_humanos"] = rh
        map["recursos_humanos_rh"] = rh
        map["capital_humano"] = rh
        map["contador"] = contabilidad
        map["facturacion"] = contabilidad
        map["cliente_externo"] = cliente
        map["client_portal"] = cliente
        map["branch_portal"] = sucursal
        // LEGACY_TO_V2
        map["admin"] = dirAdmin
        map["ingeniero"] = ingCampo
        map["director_admin"] = dirAdmin
        map["director_ops"] = dirOperaciones
        map["director_commercial"] = coordVentas
        map["sales_manager"] = coordVentas
        map["sales_rep"] = vendedor
        map["project_manager"] = coordOperaciones
        map["senior_engineer"] = ingSoporte
        map["field_engineer"] = ingCampo
        map["designer"] = disenador
        map["admin_staff"] = administrativo
        map["accountant"] = contabilidad
        map["hr_specialist"] = rh
        map["hr"] = rh
        map["warehouse_manager"] = coordAdmin
        map["procurement_officer"] = coordAdmin
        map["maintenance_coordinator"] = coordOperaciones
        map["support_agent"] = ingSoporte
        map["noc_lead"] = ingSoporte
        map["noc_operator"] = ingSoporte
        map["client"] = cliente
        map["branch"] = sucursal
        return map
    }()

    /// Tokens sueltos sin ambigüedad («Recursos Humanos (RH)», «Ventas · Vendedor»).
    private static let roleTokenAliases: [String: String] = [
        "rh": rh,
        "ceo": ceo,
        "arquitecto": arquitecto,
        "vendedor": vendedor,
        "administrativo": administrativo,
        "contabilidad": contabilidad,
        "contador": contabilidad,
        "disenador": disenador,
        "cliente": cliente,
        "sucursal": sucursal,
        "superadmin": superAdmin,
    ]

    /// minúsculas · sin acentos · separadores → `_` · sin `_` repetidos ni en bordes.
    static func normalize(_ raw: String?) -> String {
        let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if value.isEmpty { return "" }
        let stripped = value
            .folding(options: .diacriticInsensitive, locale: Locale(identifier: "en_US_POSIX"))
            .lowercased()
        let mapped = stripped.map { ch -> Character in
            ch.isLetter || ch.isNumber ? ch : "_"
        }
        let collapsed = String(mapped)
            .replacingOccurrences(of: "_+", with: "_", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "_"))
        return collapsed
    }

    /// Prioridad: `roleKey` → `orgRoleKey` → nombre visible del rol.
    static func canonicalRoleKey(roleKey: String?, orgRoleKey: String?, roleDisplayName: String?) -> String? {
        for candidate in [roleKey, orgRoleKey, roleDisplayName] {
            if let resolved = resolveOne(candidate) { return resolved }
        }
        return nil
    }

    private static func resolveOne(_ candidate: String?) -> String? {
        let normalized = normalize(candidate)
        if normalized.isEmpty { return nil }
        if let exact = roleAliases[normalized] { return exact }
        for token in normalized.split(separator: "_").map(String.init) {
            if let hit = roleTokenAliases[token] { return hit }
        }
        return nil
    }

    static func isExternalRole(_ canonicalRole: String?) -> Bool {
        guard let canonicalRole else { return false }
        return externalRoles.contains(canonicalRole)
    }
}
