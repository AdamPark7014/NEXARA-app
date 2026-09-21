import Foundation

/// Traduce claves de permiso (`activities.manage`, `workflow.view`…) a lo que la
/// persona entiende: «Actividades: ver, administrar». Agrupa por módulo y separa lo
/// que existe dentro de NEXARA Core de lo heredado de paneles que ya no están en la
/// app.
///
/// Espejo de `PermissionLabels` de Android: mismos módulos, mismos verbos, mismo
/// orden. Si allá se añade una clave, aquí también; si no, las dos apps le dirían a
/// la misma persona cosas distintas sobre lo que puede hacer.
enum PermissionLabels {

    struct Modulo: Equatable {
        let clave: String
        let nombre: String
        /// ¿Vive dentro de la app (Core) o es de un panel que solo existe en la web?
        let core: Bool
    }

    struct Grupo: Identifiable {
        let modulo: Modulo
        let acciones: [String]
        /// El nombre del módulo ya es único: se agrupa por él, no por la clave
        /// («Recursos humanos» junta `hr` y `hr.approve`).
        var id: String { modulo.nombre }
    }

    /// Prefijos más largos primero, para que `company.settings` gane a `company`.
    private static let modulos: [Modulo] = [
        Modulo(clave: "company.settings", nombre: "Datos de la empresa", core: true),
        Modulo(clave: "executive.dashboard", nombre: "Tablero de dirección", core: true),
        Modulo(clave: "sales.targets", nombre: "Metas de ventas", core: false),
        Modulo(clave: "hr.approve", nombre: "Recursos humanos", core: true),
        Modulo(clave: "activities", nombre: "Actividades", core: true),
        Modulo(clave: "evidences", nombre: "Evidencias", core: true),
        Modulo(clave: "attendance", nombre: "Asistencia", core: true),
        Modulo(clave: "lunch_breaks", nombre: "Hora de comida", core: true),
        Modulo(clave: "gps", nombre: "Ubicación del equipo", core: true),
        Modulo(clave: "users", nombre: "Usuarios", core: true),
        Modulo(clave: "roles", nombre: "Roles y permisos", core: true),
        Modulo(clave: "console", nombre: "Consola de administración", core: true),
        Modulo(clave: "audit", nombre: "Bitácora de cambios", core: true),
        Modulo(clave: "hr", nombre: "Recursos humanos", core: true),
        Modulo(clave: "people", nombre: "Personal", core: true),
        Modulo(clave: "documents", nombre: "Documentos", core: true),
        Modulo(clave: "search", nombre: "Búsqueda", core: true),
        Modulo(clave: "clients", nombre: "Clientes", core: true),
        Modulo(clave: "chat", nombre: "Chat", core: true),
        Modulo(clave: "workflow", nombre: "Flujos de aprobación", core: false),
        Modulo(clave: "kb", nombre: "Base de conocimiento", core: false),
        Modulo(clave: "support", nombre: "Mesa de soporte", core: false),
        Modulo(clave: "panel", nombre: "Paneles de la plataforma", core: false),
        Modulo(clave: "cvs", nombre: "Revisión de CV", core: false),
        Modulo(clave: "sales", nombre: "Ventas", core: false),
        Modulo(clave: "cotizaciones", nombre: "Cotizaciones", core: false),
        Modulo(clave: "catalog", nombre: "Catálogo", core: false),
        Modulo(clave: "contabilidad", nombre: "Contabilidad", core: false),
        Modulo(clave: "accounting", nombre: "Contabilidad", core: false),
        Modulo(clave: "invoicing", nombre: "Facturación", core: false),
        Modulo(clave: "banking", nombre: "Bancos", core: false),
        Modulo(clave: "procurement", nombre: "Compras", core: false),
        Modulo(clave: "warehouse", nombre: "Almacén", core: false),
        Modulo(clave: "stock", nombre: "Inventario", core: false),
        Modulo(clave: "vehicles", nombre: "Vehículos", core: false),
        Modulo(clave: "tools", nombre: "Herramientas", core: false),
        Modulo(clave: "viatics", nombre: "Viáticos", core: false),
        Modulo(clave: "maintenance", nombre: "Mantenimiento", core: false),
        Modulo(clave: "assets", nombre: "Activos", core: false),
        Modulo(clave: "noc", nombre: "Centro de monitoreo", core: false),
        Modulo(clave: "lab", nombre: "Laboratorio", core: false),
        Modulo(clave: "bi", nombre: "Inteligencia de negocio", core: false),
    ].sorted { $0.clave.count > $1.clave.count }

    private static let verbos: [String: String] = [
        "view": "ver",
        "manage": "administrar",
        "create": "crear",
        "export": "exportar",
        "review": "revisar",
        "approve": "aprobar",
        "request": "solicitar",
        "access": "entrar",
        "admin": "administrar",
        "inventory": "inventario",
        "leave": "aprobar permisos y vacaciones",
        "superadmin.review": "revisión de dirección",
        "admin.review": "revisión de administración",
        "support": "soporte",
        "people": "personal",
        "noc": "monitoreo",
        "lab": "laboratorio",
    ]

    /// Lo que queda de la clave después del módulo, en palabras. Sin traducción
    /// conocida se enseña tal cual, con puntos y guiones bajos vueltos espacios:
    /// mejor un verbo raro que esconderle a alguien un permiso que sí tiene.
    static func accion(_ resto: String) -> String {
        if let conocido = verbos[resto] { return conocido }
        return resto
            .split(whereSeparator: { $0 == "." || $0 == "_" })
            .map { $0.lowercased() }
            .joined(separator: " ")
    }

    /// Grupos en orden: primero los de Core, cada uno con sus acciones sin repetir.
    static func agrupar(_ permisos: [String]) -> [Grupo] {
        var ordenDeAparicion: [String] = []
        var porModulo: [String: (modulo: Modulo, acciones: [String])] = [:]
        var yaVistos = Set<String>()

        for crudo in permisos.map({ $0.trimmingCharacters(in: .whitespacesAndNewlines) }) {
            guard !crudo.isEmpty, yaVistos.insert(crudo).inserted else { continue }

            let modulo = modulos.first { crudo == $0.clave || crudo.hasPrefix($0.clave + ".") }
                ?? desconocido(crudo)

            var resto = String(crudo.dropFirst(modulo.clave.count))
            while resto.hasPrefix(".") { resto.removeFirst() }
            // `chat` a secas es «chat: ver», no «chat: chat».
            if resto.isEmpty { resto = "view" }
            let etiqueta = accion(resto)

            if var entrada = porModulo[modulo.nombre] {
                if !entrada.acciones.contains(etiqueta) { entrada.acciones.append(etiqueta) }
                porModulo[modulo.nombre] = entrada
            } else {
                ordenDeAparicion.append(modulo.nombre)
                porModulo[modulo.nombre] = (modulo, [etiqueta])
            }
        }

        return ordenDeAparicion
            .compactMap { porModulo[$0] }
            .map { Grupo(modulo: $0.modulo, acciones: $0.acciones) }
            .sorted { izq, der in
                // Core arriba; dentro de cada bloque, por nombre. El nombre es
                // único, así que el orden no depende de cómo llegó la lista.
                if izq.modulo.core != der.modulo.core { return izq.modulo.core }
                return izq.modulo.nombre.localizedCaseInsensitiveCompare(der.modulo.nombre) == .orderedAscending
            }
    }

    /// Permiso de un módulo que no está en la tabla: se le pone el prefijo como
    /// nombre y se trata como de fuera de la app.
    private static func desconocido(_ crudo: String) -> Modulo {
        let prefijo = String(crudo.prefix(while: { $0 != "." }))
        return Modulo(clave: prefijo, nombre: conMayuscula(prefijo), core: false)
    }

    /// «Ver, administrar y exportar».
    static func unirAcciones(_ acciones: [String]) -> String {
        switch acciones.count {
        case 0:
            return ""
        case 1:
            return conMayuscula(acciones[0])
        default:
            let todasMenosLaUltima = acciones.dropLast().joined(separator: ", ")
            return conMayuscula("\(todasMenosLaUltima) y \(acciones[acciones.count - 1])")
        }
    }

    private static func conMayuscula(_ texto: String) -> String {
        guard let primera = texto.first else { return texto }
        return primera.uppercased() + texto.dropFirst()
    }
}
