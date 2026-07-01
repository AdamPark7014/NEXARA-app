import Foundation

/// Resuelve paneles accesibles — alineado con apps/web/lib/access-matrix.ts.
enum PanelAccessResolver {
    private static let clientPrefixes = [
        "client-portal.", "branch-portal.", "client-auth.", "branch-auth.", "client-tickets.",
    ]

    private static func normalizePerms(_ perms: [String]) -> Set<String> {
        Set(perms.map { $0.trimmingCharacters(in: .whitespaces).lowercased()
            .replacingOccurrences(of: "_", with: ".")
            .replacingOccurrences(of: "-", with: ".") })
    }

    private static func hasAny(_ perms: Set<String>, _ required: [String], superAdmin: Bool) -> Bool {
        if superAdmin { return true }
        return required.contains { perms.contains($0) }
    }

    private static func isClientOrBranch(role: String, permissions: [String]) -> Bool {
        let roleMatch = role.range(of: "(cliente|client|sucursal|branch)", options: .regularExpression) != nil
        let permMatch = permissions.contains { p in
            let n = p.trimmingCharacters(in: .whitespaces).lowercased()
            return clientPrefixes.contains { n.hasPrefix($0) }
        }
        return roleMatch || permMatch
    }

    static func accessiblePanels(user: SessionUser?) -> [PanelId] {
        guard let user else { return [] }

        if user.isClient || user.isBranchUser || isClientOrBranch(role: user.role ?? "", permissions: user.permissions) {
            return [.portal]
        }

        let perms = normalizePerms(user.permissions)
        let role = (user.role ?? "").lowercased()

        if user.isSuperAdmin {
            return [.erp, .crm, .ops, .studio, .lab]
        }

        let erp = hasAny(perms, [
            "console.access", "console.admin", "users.manage",
            "contabilidad.view", "contabilidad.manage",
            "attendance.view", "attendance.manage",
            "console_access", "console_admin",
        ], superAdmin: user.isSuperAdmin)
            || role.contains("admin") || role.contains("rh") || role.contains("contab")

        let crm = hasAny(perms, [
            "panel.ventas", "sales.view", "sales.manage", "sales.reports.view",
        ], superAdmin: user.isSuperAdmin)
            || role.contains("vendedor") || role.contains("ventas")

        let ops = hasAny(perms, [
            "console.access", "console.admin", "gps.view", "gps.manage", "activities.view",
        ], superAdmin: user.isSuperAdmin)
            || role.contains("ingenier") || role.contains("soporte") || role.contains("campo")
            || role.contains("operac") || role.contains("noc")

        let studio = hasAny(perms, ["panel.web", "studio.access"], superAdmin: user.isSuperAdmin)
            || role.contains("diseño") || role.contains("diseno") || role.contains("studio")

        let lab = user.isSuperAdmin || role.contains("developer") || role.contains("desarroll")

        var out: [PanelId] = []
        if erp { out.append(.erp) }
        if crm { out.append(.crm) }
        if ops { out.append(.ops) }
        if studio { out.append(.studio) }
        if lab { out.append(.lab) }
        return out
    }

    static func singlePanelRoute(user: SessionUser?) -> PanelId? {
        let panels = accessiblePanels(user: user)
        return panels.count == 1 ? panels[0] : nil
    }
}
