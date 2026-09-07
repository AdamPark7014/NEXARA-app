import Foundation

/// Resuelve paneles accesibles — alineado con `roles.v2.ts` y Android `PanelAccessResolver`.
///
/// Orden: externos → super admin → navPanels de sesión → RolePanelMatrix → permisos → ERP base.
enum PanelAccessResolver {
    private static let allInternalPanels: [PanelId] = [.erp, .crm, .ops, .studio, .lab, .integra]
    private static let baseInternalPanel: PanelId = .erp

    private static func normalizePerms(_ perms: [String]) -> Set<String> {
        Set(perms.map {
            $0.trimmingCharacters(in: .whitespaces).lowercased()
                .replacingOccurrences(of: "_", with: ".")
                .replacingOccurrences(of: "-", with: ".")
        })
    }

    private static func hasAny(_ perms: Set<String>, _ required: [String], superAdmin: Bool) -> Bool {
        if superAdmin { return true }
        return required.contains { perms.contains($0) }
    }

    private static func panelFromNavKey(_ key: String) -> PanelId? {
        switch key.trimmingCharacters(in: .whitespaces).lowercased() {
        case "erp", "core": return .erp
        case "crm", "sales": return .crm
        case "ops": return .ops
        case "studio": return .studio
        case "lab": return .lab
        case "integra": return .integra
        case "portal": return .portal
        default: return PanelId.fromLegacy(key)
        }
    }

    static func accessiblePanels(user: SessionUser?) -> [PanelId] {
        guard let user else { return [] }

        let canonicalRole = RolePanelMatrix.canonicalRoleKey(
            roleKey: user.roleKey,
            orgRoleKey: user.orgRoleKey,
            roleDisplayName: user.role
        )

        // 1. Externos
        if user.isClient || user.isBranchUser || RolePanelMatrix.isExternalRole(canonicalRole) {
            return [.portal]
        }

        // 2. Super admin
        if user.isSuperAdmin {
            return allInternalPanels
        }

        // 3. API navigation panels
        if let nav = user.navPanels, !nav.isEmpty {
            let fromNav = nav.compactMap { panelFromNavKey($0) }.filter { $0 != .portal }
            var seen = Set<PanelId>()
            let unique = fromNav.filter { seen.insert($0).inserted }
            if !unique.isEmpty { return unique }
        }

        // 4. RolePanelMatrix — igualdad exacta, nunca contains("rh")
        let fromRole = RolePanelMatrix.panelsForRole(canonicalRole).filter { $0 != .portal }
        if !fromRole.isEmpty { return fromRole }

        // 5. Permisos efectivos
        let fromPerms = panelsFromPermissions(user)
        if !fromPerms.isEmpty { return fromPerms }

        // 6. Nunca cero paneles con sesión interna válida
        return [baseInternalPanel]
    }

    private static func panelsFromPermissions(_ user: SessionUser) -> [PanelId] {
        let perms = normalizePerms(user.permissions)
        if perms.isEmpty { return [] }
        let superAdmin = user.isSuperAdmin

        let erp = hasAny(perms, [
            "console.access", "console.admin", "users.manage",
            "contabilidad.view", "contabilidad.manage",
            "attendance.view", "attendance.manage",
            "hr.view", "hr.manage", "cvs.manage",
        ], superAdmin: superAdmin)
        let crm = hasAny(perms, [
            "panel.ventas", "sales.view", "sales.manage", "sales.reports.view",
        ], superAdmin: superAdmin)
        let ops = hasAny(perms, [
            "gps.view", "gps.manage", "activities.view", "activities.manage",
            "evidences.view", "dispatch.manage",
        ], superAdmin: superAdmin)
        let studio = hasAny(perms, [
            "panel.web", "studio.content.view", "studio.content.manage",
        ], superAdmin: superAdmin)
        let lab = hasAny(perms, ["lab.access", "lab.ai.live"], superAdmin: superAdmin)
        let integra = superAdmin || perms.contains { $0.hasPrefix("integra.") }

        var out: [PanelId] = []
        if erp { out.append(.erp) }
        if crm { out.append(.crm) }
        if ops { out.append(.ops) }
        if studio { out.append(.studio) }
        if lab { out.append(.lab) }
        if integra { out.append(.integra) }
        return out
    }

    static func singlePanelRoute(user: SessionUser?) -> PanelId? {
        let panels = accessiblePanels(user: user)
        return panels.count == 1 ? panels[0] : nil
    }
}
