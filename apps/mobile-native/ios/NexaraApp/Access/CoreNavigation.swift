import Foundation

/// Módulos de NEXARA Core — espejo de `CORE_OLA1_MODULE_IDS`
/// (`apps/web/lib/core-surface.ts`). «Mis actividades» y «Pizarra» son una
/// sola entrada: Actividades, la casa de todos (`/erp/pizarra`).
enum CoreModule: String, CaseIterable, Identifiable, Hashable {
    case actividades, asistencias, chat, clientes, perfil

    var id: String { rawValue }

    var title: String {
        switch self {
        case .actividades: return "Actividades"
        case .asistencias: return "Asistencias"
        case .chat: return "Chat"
        case .clientes: return "Clientes"
        case .perfil: return "Mi perfil"
        }
    }

    var systemImage: String {
        switch self {
        case .actividades: return "checklist"
        case .asistencias: return "calendar.badge.clock"
        case .chat: return "bubble.left.and.bubble.right"
        case .clientes: return "person.2"
        case .perfil: return "person.crop.circle"
        }
    }

    /// Claves de `GET me/navigation` (`moduleKeys` / `webModuleIds`) de este módulo.
    var navigationKeys: Set<String> {
        switch self {
        case .actividades: return ["pizarra", "mis-actividades"]
        case .asistencias: return ["asistencias"]
        case .chat: return ["chat"]
        case .clientes: return ["erp-clients"]
        case .perfil: return ["my-profile"]
        }
    }
}

/// Qué ve cada quien en la app: solo ERP (Core) para el personal y el portal
/// externo para cuentas de cliente o sucursal.
enum CoreNavigation {
    /// Cliente / sucursal: solo el portal de tickets, nunca Core.
    static func isExternal(_ user: SessionUser?) -> Bool {
        guard let user else { return false }
        if user.isClient || user.isBranchUser { return true }
        let canonical = RolePanelMatrix.canonicalRoleKey(
            roleKey: user.roleKey,
            orgRoleKey: user.orgRoleKey,
            roleDisplayName: user.role
        )
        return RolePanelMatrix.isExternalRole(canonical)
    }

    /// Menú del shell = Core ∩ `GET me/navigation`. Como el sidebar web
    /// (`shouldShowModuleInSidebar`), Clientes solo aparece con sector asignado.
    /// Actividades y Mi perfil nunca faltan; sin respuesta de navegación se
    /// usan los módulos de Core que la web da a todo el personal.
    static func modules(for user: SessionUser?) -> [CoreModule] {
        guard let user, !isExternal(user) else { return [] }
        let nav = Set((user.navModules ?? []).map { $0.lowercased() })
        let navHasCore = CoreModule.allCases.contains { !$0.navigationKeys.isDisjoint(with: nav) }
        func allowedByNavigation(_ module: CoreModule) -> Bool {
            !navHasCore || !module.navigationKeys.isDisjoint(with: nav)
        }
        return CoreModule.allCases.filter { module in
            switch module {
            case .actividades, .perfil:
                return true
            case .clientes:
                // Como el sidebar web: hace falta sector por correo Y que
                // `GET me/navigation` conceda `erp-clients`.
                return !ClientSector.sectors(for: user.email).isEmpty
                    && !module.navigationKeys.isDisjoint(with: nav)
            case .asistencias, .chat:
                return allowedByNavigation(module)
            }
        }
    }
}
