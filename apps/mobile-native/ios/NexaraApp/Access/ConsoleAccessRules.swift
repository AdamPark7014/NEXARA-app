import Foundation

/// Grupo del menú «Más» (espejo de Android `ConsoleSidebarGroup`).
struct ConsoleSidebarGroup: Identifiable {
    let id: String
    let title: String
    let modules: [ModuleEntry]
}

/// Tab inferior del hub Console (ERP/OPS).
struct ConsoleBottomTabItem: Identifiable, Hashable {
    let id: String
    let label: String
    let systemImage: String
    /// `nil` = pantalla «Más».
    let moduleKey: String?
}

enum ConsoleAccessRules {

    // MARK: RBAC (espejo Android `ConsoleAccessRules.kt`)

    private enum ConsolePermissions {
        static let consoleAdmin = "console.admin"
        static let cotizacionesAccess = "cotizaciones.access"
        static let cvsManage = "cvs.manage"
        static let cvsAdminReview = "cvs.admin.review"
        static let cvsSuperadminReview = "cvs.superadmin.review"
        static let panelVentas = "panel.ventas"
        static let salesView = "sales.view"
        static let salesManage = "sales.manage"
        static let salesReportsView = "sales.reports.view"
    }

    private static func hasAnyPermission(_ user: SessionUser, _ required: [String]) -> Bool {
        if user.isSuperAdmin { return true }
        return required.contains { user.permissions.contains($0) }
    }

    private static func canAccessCotizaciones(_ user: SessionUser) -> Bool {
        hasAnyPermission(user, [ConsolePermissions.cotizacionesAccess])
    }

    private static func canAccessCvs(_ user: SessionUser) -> Bool {
        hasAnyPermission(user, [
            ConsolePermissions.cvsManage,
            ConsolePermissions.cvsAdminReview,
            ConsolePermissions.cvsSuperadminReview,
            ConsolePermissions.consoleAdmin,
        ])
    }

    private static func canAccessVentas(_ user: SessionUser) -> Bool {
        hasAnyPermission(user, [
            ConsolePermissions.panelVentas,
            ConsolePermissions.salesView,
            ConsolePermissions.salesManage,
            ConsolePermissions.salesReportsView,
        ])
    }

    private static func isPlatformAdmin(_ user: SessionUser) -> Bool {
        user.isSuperAdmin || user.permissions.contains(ConsolePermissions.consoleAdmin)
    }

    static func isAdministrativoRole(_ user: SessionUser?) -> Bool {
        guard let user, !user.isSuperAdmin, !isPlatformAdmin(user) else { return false }
        let r = (user.role ?? "").lowercased()
        if r == "coord_admin" || r == "dir_admin" { return false }
        if r.contains("coord") && r.contains("admin") { return false }
        if r.contains("director") && r.contains("admin") { return false }
        return r == "administrativo" || r.contains("administrativ")
    }

    /// Módulos ERP permitidos para personal administrativo (espejo `page-matrix.ts`).
    static let administrativoModuleKeys: Set<String> = [
        "dashboard", "approvals", "companies", "calendar", "documents",
        "viatics", "expenses", "notifications-center", "my-profile", "my-preferences",
        "news", "attendance", "my-lunch-breaks", "lunch-breaks",
    ]

    private static func normalizedConsolePath(_ module: ModuleEntry) -> String {
        if module.webPath.hasPrefix("/operacion") {
            return String(module.webPath.dropFirst("/operacion".count))
        }
        if module.webPath.hasPrefix("/console") {
            return String(module.webPath.dropFirst("/console".count))
        }
        return module.webPath
    }

    static func canAccessConsoleModule(user: SessionUser?, module: ModuleEntry) -> Bool {
        guard let user else { return false }

        if module.superAdminOnly && !user.isSuperAdmin { return false }
        if !module.permissions.isEmpty && !hasAnyPermission(user, module.permissions) { return false }

        let path = normalizedConsolePath(module)
        let roleLower = (user.role ?? "").lowercased()
        let platformAdmin = isPlatformAdmin(user)
        let isAdmin = !user.isSuperAdmin && platformAdmin
        let isIngeniero = !user.isSuperAdmin && !isAdmin && roleLower.contains("ingenier")
        let isAdministrativo = isAdministrativoRole(user)
        let isVendedor = !user.isSuperAdmin && !isAdmin && !isIngeniero && !isAdministrativo &&
            (roleLower.contains("vendedor") || roleLower.contains("ventas"))

        if user.isSuperAdmin {
            if path.hasPrefix("/my-") { return false }
            return true
        }

        if isAdmin {
            if path.hasPrefix("/my-") { return false }
            if path.hasPrefix("/ventas") || path.hasPrefix("/accounting")
                || path.hasPrefix("/newsletter") || path.hasPrefix("/news") { return false }
            if path == "/cotizaciones" && !canAccessCotizaciones(user) { return false }
            if path == "/cvs" && !canAccessCvs(user) { return false }
            return true
        }

        if isIngeniero {
            let baseAllowed: Set<String> = ["/dashboard", "/cotizaciones", "/cvs", "/ventas", "/attendance"]
            if !path.hasPrefix("/my-") && !baseAllowed.contains(path) { return false }
            if path == "/cotizaciones" && !canAccessCotizaciones(user) { return false }
            if path == "/cvs" && !canAccessCvs(user) { return false }
            if path == "/ventas" && !canAccessVentas(user) { return false }
            return true
        }

        if isAdministrativo {
            return administrativoModuleKeys.contains(module.key)
        }

        if isVendedor {
            let baseAllowed: Set<String> = ["/dashboard", "/ventas", "/cotizaciones", "/cvs", "/attendance"]
            if !path.hasPrefix("/my-") && !baseAllowed.contains(path) { return false }
            if path == "/cotizaciones" && !canAccessCotizaciones(user) { return false }
            if path == "/cvs" && !canAccessCvs(user) { return false }
            if path == "/ventas" && !canAccessVentas(user) { return false }
            return true
        }

        return true
    }

    private static func visibleModuleKeys(user: SessionUser?, panel: PanelId) -> Set<String> {
        guard let user else { return [] }
        let allowedKeys = ModulePanelMap.consoleKeys(for: panel)
            ?? Set(ModuleCatalog.console.map(\.key))
        return Set(
            ModuleCatalog.console
                .filter { allowedKeys.contains($0.key) && canAccessConsoleModule(user: user, module: $0) }
                .map(\.key)
        )
    }

    // MARK: Bottom tabs (paridad Android `ConsoleNavHost`)

    static func consoleBottomTabs(user: SessionUser?, panel: PanelId) -> [ConsoleBottomTabItem] {
        let visible = visibleModuleKeys(user: user, panel: panel)
        func has(_ key: String) -> Bool { visible.contains(key) }

        guard let user else {
            return [
                ConsoleBottomTabItem(id: "more", label: "Más", systemImage: "ellipsis.circle", moduleKey: nil),
            ]
        }

        let roleLower = (user.role ?? "").lowercased()
        let isSuperAdmin = user.isSuperAdmin
        let isAdmin = !isSuperAdmin && user.permissions.contains(ConsolePermissions.consoleAdmin)
        let isAdministrativo = isAdministrativoRole(user)

        var tabs: [ConsoleBottomTabItem] = []

        if has("dashboard") {
            tabs.append(ConsoleBottomTabItem(id: "dashboard", label: "Inicio", systemImage: "house", moduleKey: "dashboard"))
        }

        if isAdministrativo {
            if has("attendance") {
                tabs.append(ConsoleBottomTabItem(id: "attendance", label: "Asistencia", systemImage: "clock", moduleKey: "attendance"))
            }
        } else if isSuperAdmin || isAdmin {
            if has("activities") {
                tabs.append(ConsoleBottomTabItem(id: "activities", label: "Operación", systemImage: "list.clipboard", moduleKey: "activities"))
            }
            if has("evidences") {
                tabs.append(ConsoleBottomTabItem(id: "evidences", label: "Evidencias", systemImage: "camera", moduleKey: "evidences"))
            }
            if has("attendance") {
                tabs.append(ConsoleBottomTabItem(id: "attendance", label: "Asistencia", systemImage: "clock", moduleKey: "attendance"))
            }
        } else if roleLower.contains("ingenier") {
            if has("my-activities") {
                tabs.append(ConsoleBottomTabItem(id: "my-activities", label: "Mis act.", systemImage: "person.text.clipboard", moduleKey: "my-activities"))
            }
            if has("my-evidences") {
                tabs.append(ConsoleBottomTabItem(id: "my-evidences", label: "Mis evid.", systemImage: "photo", moduleKey: "my-evidences"))
            }
            if has("attendance") {
                tabs.append(ConsoleBottomTabItem(id: "attendance", label: "Asistencia", systemImage: "clock", moduleKey: "attendance"))
            } else if has("gps") {
                tabs.append(ConsoleBottomTabItem(id: "gps", label: "GPS", systemImage: "map", moduleKey: "gps"))
            }
        } else {
            if has("my-activities") {
                tabs.append(ConsoleBottomTabItem(id: "my-activities", label: "Mis act.", systemImage: "person.text.clipboard", moduleKey: "my-activities"))
            }
            if has("my-evidences") {
                tabs.append(ConsoleBottomTabItem(id: "my-evidences", label: "Mis evid.", systemImage: "photo", moduleKey: "my-evidences"))
            }
            if has("attendance") {
                tabs.append(ConsoleBottomTabItem(id: "attendance", label: "Asistencia", systemImage: "clock", moduleKey: "attendance"))
            } else if has("gps") {
                tabs.append(ConsoleBottomTabItem(id: "gps", label: "GPS", systemImage: "map", moduleKey: "gps"))
            }
        }

        if tabs.isEmpty {
            tabs.append(ConsoleBottomTabItem(id: "dashboard", label: "Inicio", systemImage: "house", moduleKey: "dashboard"))
        }
        tabs.append(ConsoleBottomTabItem(id: "more", label: "Más", systemImage: "ellipsis.circle", moduleKey: nil))
        return tabs
    }

    static func consoleBottomTabModuleKeys(user: SessionUser?, panel: PanelId) -> Set<String> {
        Set(consoleBottomTabs(user: user, panel: panel).compactMap(\.moduleKey))
    }

    // MARK: Console / ERP / OPS sidebar

    static func consoleSidebarGroupsForMore(user: SessionUser?, panel: PanelId) -> [ConsoleSidebarGroup] {
        let tabKeys = consoleBottomTabModuleKeys(user: user, panel: panel)
        return consoleSidebarGroups(user: user, panel: panel)
            .map { ConsoleSidebarGroup(id: $0.id, title: $0.title, modules: $0.modules.filter { !tabKeys.contains($0.key) }) }
            .filter { !$0.modules.isEmpty }
    }

    static func consoleSidebarGroups(user: SessionUser?, panel: PanelId) -> [ConsoleSidebarGroup] {
        guard let user else { return [] }
        if isAdministrativoRole(user) {
            return administrativoSidebarGroups(user: user, panel: panel)
        }
        let allowedKeys = ModulePanelMap.consoleKeys(for: panel)
            ?? Set(ModuleCatalog.console.map(\.key))
        let byKey = Dictionary(uniqueKeysWithValues: ModuleCatalog.console.map { ($0.key, $0) })

        func pick(_ keys: [String]) -> [ModuleEntry] {
            keys.compactMap { byKey[$0] }
                .filter { allowedKeys.contains($0.key) }
                .filter { canAccessConsoleModule(user: user, module: $0) }
        }

        let groups: [ConsoleSidebarGroup] = [
            ConsoleSidebarGroup(id: "profile", title: "Cuenta personal", modules: pick(["my-profile", "calendar"])),
            ConsoleSidebarGroup(id: "employee", title: "Mi espacio de trabajo", modules: pick([
                "dashboard", "my-activities", "my-evidences", "my-viatics", "my-vehicles", "my-lunch-breaks",
            ])),
            ConsoleSidebarGroup(id: "operations", title: "Supervisión operativa", modules: pick([
                "activities", "evidences", "viatics", "vehicles", "gps", "service-clients",
                "maintenance", "assets", "service-sheets",
            ])),
            ConsoleSidebarGroup(id: "people", title: "RRHH y control de personal", modules: pick([
                "attendance", "lunch-breaks", "fines", "cvs", "users", "hr", "orgchart", "kpis-hr",
            ])),
            ConsoleSidebarGroup(id: "commercial", title: "Clientes y comercial", modules: pick([
                "clients", "projects", "cotizaciones", "gestion-vendedores", "contact-messages",
            ])),
            ConsoleSidebarGroup(id: "system", title: "Administración interna", modules: pick([
                "tools", "news", "newsletter", "settings", "companies", "kb", "architecture",
            ])),
            ConsoleSidebarGroup(id: "inventory", title: "Inventario y compras", modules: pick([
                "warehouse", "stock", "procurement",
            ])),
            ConsoleSidebarGroup(id: "finance", title: "Finanzas y banca", modules: pick([
                "accounting", "employee-payments", "expenses", "work-projects", "invoicing", "banking",
            ])),
            ConsoleSidebarGroup(id: "compliance", title: "Cumplimiento y BI", modules: pick([
                "documents", "audit", "analytics", "bi", "executive", "approvals", "notifications-center", "exports",
            ])),
            ConsoleSidebarGroup(id: "ops-monitoring", title: "Monitoreo y soporte", modules: pick([
                "noc", "client-tickets", "support", "support-sla", "maintenance-contracts",
            ])),
        ]
        return groups.filter { !$0.modules.isEmpty }
    }

    /// Menú «Más» agrupado como sidebar web para rol Administrativo.
    private static func administrativoSidebarGroups(user: SessionUser, panel: PanelId) -> [ConsoleSidebarGroup] {
        let byKey = Dictionary(uniqueKeysWithValues: ModuleCatalog.console.map { ($0.key, $0) })
        func pick(_ keys: [String]) -> [ModuleEntry] {
            keys.compactMap { byKey[$0] }.filter { canAccessConsoleModule(user: user, module: $0) }
        }
        return [
            ConsoleSidebarGroup(id: "board", title: "Tablero", modules: pick(["dashboard", "approvals"])),
            ConsoleSidebarGroup(id: "governance", title: "Gobierno", modules: pick(["companies"])),
            ConsoleSidebarGroup(id: "finance", title: "Finanzas", modules: pick(["viatics", "expenses"])),
            ConsoleSidebarGroup(id: "people", title: "Personas", modules: pick(["attendance", "my-lunch-breaks"])),
            ConsoleSidebarGroup(id: "logistics", title: "Logística", modules: pick(["documents"])),
            ConsoleSidebarGroup(id: "audit", title: "Auditoría", modules: pick(["notifications-center"])),
            ConsoleSidebarGroup(id: "account", title: "Mi cuenta", modules: pick(["my-profile", "calendar", "news"])),
        ].filter { !$0.modules.isEmpty }
    }

    // MARK: CRM

    static let ventasBottomTabKeys: Set<String> = ["dashboard", "cotizaciones", "leads"]

    static func ventasSidebarGroups() -> [ConsoleSidebarGroup] {
        let byKey = Dictionary(uniqueKeysWithValues: ModuleCatalog.ventas.map { ($0.key, $0) })
        func pick(_ keys: [String]) -> [ModuleEntry] {
            keys.compactMap { byKey[$0] }.filter { !ventasBottomTabKeys.contains($0.key) }
        }
        return [
            ConsoleSidebarGroup(id: "pipeline", title: "Pipeline y catálogo", modules: pick([
                "oportunidades", "pipeline", "agenda", "plantillas",
                "clientes", "productos", "proyectos", "licitaciones",
            ])),
            ConsoleSidebarGroup(id: "team", title: "Equipo y métricas", modules: pick([
                "gestion-vendedores", "metas", "reportes", "crecimiento", "equipo-comparativa",
            ])),
            ConsoleSidebarGroup(id: "account", title: "Mi cuenta", modules: pick(["my-profile", "notificaciones"])),
        ].filter { !$0.modules.isEmpty }
    }
}
