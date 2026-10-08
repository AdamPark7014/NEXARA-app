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
        case .asistencias: return ["asistencias", "attendance"]
        case .chat: return ["chat"]
        case .clientes: return ["erp-clients"]
        case .perfil: return ["my-profile"]
        }
    }

    /// Páginas web del módulo: se comparan con las rutas permitidas (`navPaths`), igual que
    /// `CoreModule.webPaths` de Android.
    var webPaths: [String] {
        switch self {
        case .actividades: return ["/erp/pizarra", "/erp/mis-actividades"]
        case .asistencias: return ["/erp/asistencias"]
        case .chat: return ["/erp/chat"]
        case .clientes: return ["/erp/clientes"]
        case .perfil: return ["/erp/my-profile"]
        }
    }
}

/// Módulos de Core que no son pestaña: viven en el hub «Más» del shell.
/// `rawValue` = clave de `GET me/navigation` (`moduleKeys` / `webModuleIds`),
/// las mismas que la web registra en `apps/web/lib/core-surface.ts`. Mismo
/// orden, textos y grupos que el hub «Más» de Android.
///
/// Ejecutivo (`executive`) y Documentos (`erp-documentos`) ya no están: solo
/// mandaban a la web. Si `me/navigation` los nombra, se ignoran.
enum CoreExtraModule: String, CaseIterable, Identifiable, Hashable {
    case cotizaciones = "erp-cotizaciones"
    case proyectos = "erp-proyectos"
    case kpisEquipo = "kpis-equipo"
    case almacen = "erp-almacen"
    case herramientas = "erp-herramientas"
    case vehiculos = "erp-vehiculos"
    case gastos = "erp-gastos"
    case aprobaciones = "erp-aprobaciones"
    case pagosEmpleados = "erp-pagos-empleados"
    /// Viáticos. La clave NO sale de `CORE_EXTRA_MODULES` —ahí no está—, sino de
    /// la que `me/navigation` ya emite para cualquier ruta que contenga
    /// `viatic` (`navigation-module-map.ts`: `viatics`, `my-viatics`).
    case viaticos = "viatics"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .cotizaciones: return "Cotizaciones"
        case .proyectos: return "Proyectos"
        case .kpisEquipo: return "KPIs del equipo"
        case .almacen: return "Almacén"
        case .herramientas: return "Herramientas"
        case .vehiculos: return "Vehículos"
        case .gastos: return "Gastos"
        case .aprobaciones: return "Aprobaciones"
        case .pagosEmpleados: return "Pagos a empleados"
        case .viaticos: return "Viáticos"
        }
    }

    /// SF Symbol equivalente al icono relleno de Android (`CoreExtraModule.icon()`
    /// en `MoreHubScreen.kt`).
    var systemImage: String {
        switch self {
        case .cotizaciones: return "doc.text.fill"                     // RequestQuote
        case .proyectos: return "folder.fill"                          // Folder
        case .kpisEquipo: return "chart.line.uptrend.xyaxis"           // Insights
        case .almacen: return "archivebox.fill"                        // Inventory2
        case .herramientas: return "wrench.and.screwdriver.fill"       // Build
        case .vehiculos: return "car.fill"                             // DirectionsCar
        case .gastos: return "doc.plaintext.fill"                      // ReceiptLong
        case .aprobaciones: return "list.bullet.clipboard.fill"        // FactCheck
        case .pagosEmpleados: return "wallet.pass.fill"                // AccountBalanceWallet
        case .viaticos: return "banknote.fill"                         // Payments
        }
    }

    /// Ruta del módulo en la web de Core (la misma que reconocen los enlaces).
    var webPath: String {
        switch self {
        case .cotizaciones: return "/erp/cotizaciones"
        case .proyectos: return "/erp/proyectos"
        case .kpisEquipo: return "/erp/asistencias/indicadores"
        case .almacen: return "/erp/almacen"
        case .herramientas: return "/erp/almacen/herramientas"
        case .vehiculos: return "/erp/vehiculos"
        case .gastos: return "/erp/finance/expenses"
        case .aprobaciones: return "/erp/approvals"
        case .pagosEmpleados: return "/erp/finance/employee-payments"
        case .viaticos: return "/erp/finance/viatics"
        }
    }

    /// Una línea para la lista del hub «Más» (mismos textos que `CoreMenu.kt`).
    var summary: String {
        switch self {
        case .cotizaciones: return "Propuestas técnicas: folio, envío y seguimiento."
        case .proyectos: return "Cronograma, alcance, equipo y documentos."
        case .kpisEquipo: return "Retardos, uniforme y horas del equipo."
        case .almacen: return "Inventario, entradas y salidas, y reabastecimiento."
        case .herramientas: return "Solicita herramienta, revisa tu kit y tus préstamos."
        case .vehiculos: return "Solicita un vehículo; entrega y recepción con fotos."
        case .gastos: return "Gastos de la operación: captura, comprobación y estado."
        case .aprobaciones: return "Lo que espera tu visto bueno, en un solo sitio."
        case .pagosEmpleados: return "Pagos y anticipos al personal, con su comprobante."
        case .viaticos: return "Pide un viático con la foto del ticket, repártelo y compruébalo."
        }
    }

    /// Claves con las que `me/navigation` puede nombrar el módulo. Casi siempre
    /// una; Viáticos llega como `viatics` o como `my-viatics` según la ruta que
    /// tenga el rol en url-matrix.
    var claves: Set<String> {
        switch self {
        case .viaticos: return ["viatics", "my-viatics"]
        default: return [rawValue]
        }
    }

    /// Lo ve todo el personal, tenga o no su clave en `me/navigation`.
    ///
    /// Solo Viáticos. Los demás módulos de «Más» se conceden por rol, pero el
    /// gasto de bolsillo lo hace cualquiera y lo autoriza la dirección: las
    /// reglas del CEO son comodines de panel y no producen la clave `viatics`,
    /// así que filtrar por navegación se lo escondería justo a quien tiene que
    /// aprobar desde la calle. Quien no tenga el permiso ve el mensaje del 403
    /// del API, que es quien de verdad decide.
    var paraTodoElPersonal: Bool { self == .viaticos }

    enum Group: String {
        case hoy = "Hoy"
        case recursos = "Recursos"
        case finanzas = "Finanzas"
        /// Sin módulos desde que salió Documentos; se conserva por paridad con Android.
        case gobierno = "Gobierno"
    }

    var group: Group {
        switch self {
        case .cotizaciones, .proyectos, .kpisEquipo, .aprobaciones: return .hoy
        case .almacen, .herramientas, .vehiculos: return .recursos
        case .gastos, .pagosEmpleados, .viaticos: return .finanzas
        }
    }
}

/// Qué ve cada quien en la app: solo ERP (Core) para el personal y el portal
/// externo para cuentas de cliente o sucursal.
enum CoreNavigation {
    /// Módulos del hub «Más». Salen de `GET me/navigation` (`navModules`), con
    /// las mismas claves que la web registra en `core-surface.ts`:
    /// - cliente / sucursal o sin sesión: ninguno;
    /// - super admin: todos;
    /// - con navegación: los que ésta concede;
    /// - sin navegación todavía (primer arranque u offline): Herramientas,
    ///   Vehículos y Viáticos, los tres que tiene todo el personal. (El
    ///   organigrama se quedó en la web: es una pantalla de escritorio.)
    static func extraModules(for user: SessionUser?) -> [CoreExtraModule] {
        guard let user, !isExternal(user) else { return [] }
        // Modo demostración: solo los módulos con pantalla propia y datos de muestra.
        // Los demás todavía no tienen pantalla y harían parecer la app incompleta.
        if DemoMode.isActive {
            return CoreExtraModule.allCases.filter { CoreExtraDestination.tienePantallaNativa($0) }
        }
        if user.isSuperAdmin { return CoreExtraModule.allCases }
        let nav = Set((user.navModules ?? []).map { $0.lowercased() })
        guard !nav.isEmpty else { return [.herramientas, .vehiculos, .viaticos] }
        return CoreExtraModule.allCases.filter { modulo in
            modulo.paraTodoElPersonal || !modulo.claves.isDisjoint(with: nav)
        }
    }

    /// El módulo de «Más» que nombra esta clave de `me/navigation`.
    static func extraModule(forKey key: String) -> CoreExtraModule? {
        let buscada = key.trimmingCharacters(in: .whitespaces).lowercased()
        return CoreExtraModule.allCases.first { $0.claves.contains(buscada) }
    }

    /// ¿Puede abrir este módulo de «Más»? Espejo de `CoreMenu.canOpenExtra` en Android
    /// (p. ej. el escáner de Herramientas solo busca artículos si abre Almacén).
    static func canOpenExtra(_ user: SessionUser?, _ module: CoreExtraModule) -> Bool {
        extraModules(for: user).contains(module)
    }

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
        // Con rutas de `me/navigation` manda la ruta, como en Android: a dirección (CEO,
        // dir_admin) le llegan comodines (`/erp/**`) y sus `moduleKeys` no traen `chat` ni
        // `asistencias`, así que filtrar por claves le escondía Chat y Asistencia.
        if user.isSuperAdmin {
            return CoreModule.allCases.filter { $0 != .clientes || !ClientSector.sectors(for: user.email).isEmpty }
        }
        if let paths = user.navPaths, !paths.isEmpty {
            return CoreModule.allCases.filter { module in
                switch module {
                case .actividades, .perfil:
                    return true
                case .clientes:
                    return !ClientSector.sectors(for: user.email).isEmpty && routeAllows(paths, module)
                case .asistencias, .chat:
                    return routeAllows(paths, module)
                }
            }
        }
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

    /// ¿Alguna ruta permitida abre una página del módulo?
    static func routeAllows(_ paths: [String], _ module: CoreModule) -> Bool {
        module.webPaths.contains { path in paths.contains { ruleMatches($0, path) } }
    }

    /// `checkUrlAccess` de url-matrix (espejo de `CoreMenu.ruleMatches` en Android):
    /// `/**` = prefijo, `/*` = un solo nivel, sin comodín = igualdad exacta.
    static func ruleMatches(_ rule: String, _ path: String) -> Bool {
        var clean = rule.trimmingCharacters(in: .whitespaces)
        while clean.count > 1 && clean.hasSuffix("/") { clean.removeLast() }
        if clean.isEmpty || clean == "/**" { return true }
        if clean.hasSuffix("/**") {
            let base = String(clean.dropLast(3))
            return path == base || path.hasPrefix(base + "/")
        }
        if clean.hasSuffix("/*") {
            let base = String(clean.dropLast(2))
            guard path.hasPrefix(base + "/") else { return false }
            return !path.dropFirst(base.count + 1).contains("/")
        }
        return path == clean
    }
}
