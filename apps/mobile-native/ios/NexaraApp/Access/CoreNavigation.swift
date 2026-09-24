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

/// Módulos de Core que no son pestaña: viven en el hub «Más» del shell.
/// `rawValue` = clave de `GET me/navigation` (`moduleKeys` / `webModuleIds`),
/// las mismas que la web registra en `apps/web/lib/core-surface.ts`. Mismo
/// orden, textos y rutas que el hub «Más» de Android.
enum CoreExtraModule: String, CaseIterable, Identifiable, Hashable {
    case executive = "executive"
    case cotizaciones = "erp-cotizaciones"
    case proyectos = "erp-proyectos"
    case kpisEquipo = "kpis-equipo"
    case almacen = "erp-almacen"
    case herramientas = "erp-herramientas"
    case vehiculos = "erp-vehiculos"
    case organigrama = "erp-organigrama"
    /// Viáticos. La clave NO sale de `CORE_EXTRA_MODULES` —ahí no está—, sino de
    /// la que `me/navigation` ya emite para cualquier ruta que contenga
    /// `viatic` (`navigation-module-map.ts`: `viatics`, `my-viatics`).
    case viaticos = "viatics"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .executive: return "Hoy"
        case .cotizaciones: return "Cotizaciones"
        case .proyectos: return "Proyectos"
        case .kpisEquipo: return "KPIs del equipo"
        case .almacen: return "Almacén"
        case .herramientas: return "Herramientas"
        case .vehiculos: return "Vehículos"
        case .organigrama: return "Organigrama"
        case .viaticos: return "Viáticos"
        }
    }

    var systemImage: String {
        switch self {
        case .executive: return "chart.bar"
        case .cotizaciones: return "doc.text"
        case .proyectos: return "folder"
        case .kpisEquipo: return "chart.bar"
        case .almacen: return "shippingbox"
        case .herramientas: return "wrench.and.screwdriver"
        case .vehiculos: return "car"
        case .organigrama: return "person.3"
        case .viaticos: return "banknote"
        }
    }

    /// Ruta del módulo en la web de Core.
    var webPath: String {
        switch self {
        case .executive: return "/erp/executive"
        case .cotizaciones: return "/erp/cotizaciones"
        case .proyectos: return "/erp/proyectos"
        case .kpisEquipo: return "/erp/asistencias/indicadores"
        case .almacen: return "/erp/almacen"
        case .herramientas: return "/erp/almacen/herramientas"
        case .vehiculos: return "/erp/vehiculos"
        case .organigrama: return "/erp/organigrama"
        case .viaticos: return "/erp/finance/viatics"
        }
    }

    /// Una línea para la lista del hub «Más».
    var summary: String {
        switch self {
        case .executive: return "KPIs del negocio — vista de dirección."
        case .cotizaciones: return "Propuestas técnicas: folio, envío y seguimiento."
        case .proyectos: return "Cronograma, alcance, equipo y documentos."
        case .kpisEquipo: return "Retardos, uniforme y horas del equipo."
        case .almacen: return "Inventario, entradas y salidas, y reabastecimiento."
        case .herramientas: return "Solicita herramienta, revisa tu kit y tus préstamos."
        case .vehiculos: return "Solicita un vehículo; entrega y recepción con fotos."
        case .organigrama: return "Quién reporta a quién en NEXARA."
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
        case gobierno = "Gobierno"
    }

    var group: Group {
        switch self {
        case .executive, .cotizaciones, .proyectos, .kpisEquipo, .aprobaciones: return .hoy
        case .almacen, .herramientas, .vehiculos, .organigrama: return .recursos
        case .gastos, .pagosEmpleados, .viaticos: return .finanzas
        case .documentos: return .gobierno
        }
    }

    /// El módulo en la web (`CoreNavigation.coreWebBase` + `webPath`), mientras
    /// la app no tenga pantalla nativa.
    var webURL: URL {
        URL(string: CoreNavigation.coreWebBase + webPath) ?? URL(string: CoreNavigation.coreWebBase)!
    }
}

/// Qué ve cada quien en la app: solo ERP (Core) para el personal y el portal
/// externo para cuentas de cliente o sucursal.
enum CoreNavigation {
    /// Origen de la web de Core; los módulos del hub «Más» se abren aquí.
    static let coreWebBase = "https://core.nexara.com.mx"

    /// Módulos del hub «Más». Salen de `GET me/navigation` (`navModules`), con
    /// las mismas claves que la web registra en `core-surface.ts`:
    /// - cliente / sucursal o sin sesión: ninguno;
    /// - super admin: todos;
    /// - con navegación: los que ésta concede;
    /// - sin navegación todavía (primer arranque u offline): Herramientas,
    ///   Vehículos y Organigrama, los tres que tiene todo el personal.
    static func extraModules(for user: SessionUser?) -> [CoreExtraModule] {
        guard let user, !isExternal(user) else { return [] }
        if user.isSuperAdmin { return CoreExtraModule.allCases }
        let nav = Set((user.navModules ?? []).map { $0.lowercased() })
        guard !nav.isEmpty else { return [.herramientas, .vehiculos, .organigrama, .viaticos] }
        return CoreExtraModule.allCases.filter { modulo in
            modulo.paraTodoElPersonal || !modulo.claves.isDisjoint(with: nav)
        }
    }

    /// El módulo de «Más» que nombra esta clave de `me/navigation`.
    static func extraModule(forKey key: String) -> CoreExtraModule? {
        let buscada = key.trimmingCharacters(in: .whitespaces).lowercased()
        return CoreExtraModule.allCases.first { $0.claves.contains(buscada) }
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
