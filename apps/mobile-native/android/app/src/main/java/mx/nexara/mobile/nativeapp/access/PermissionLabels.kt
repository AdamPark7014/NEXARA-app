package mx.nexara.mobile.nativeapp.access

/**
 * Traduce claves de permiso (`activities.manage`, `workflow.view`…) a lo que la persona entiende:
 * «Actividades: ver, administrar». Agrupa por módulo y separa lo que existe en NEXARA Core de
 * los permisos heredados de paneles que ya no están en la app.
 */
object PermissionLabels {

    data class Modulo(val clave: String, val nombre: String, val core: Boolean)

    data class Grupo(val modulo: Modulo, val acciones: List<String>)

    /** Prefijos más largos primero para que `company.settings` gane a `company`. */
    private val MODULOS: List<Modulo> = listOf(
        Modulo("company.settings", "Datos de la empresa", true),
        Modulo("executive.dashboard", "Tablero de dirección", true),
        Modulo("sales.targets", "Metas de ventas", false),
        Modulo("hr.approve", "Recursos humanos", true),
        Modulo("activities", "Actividades", true),
        Modulo("evidences", "Evidencias", true),
        Modulo("attendance", "Asistencia", true),
        Modulo("lunch_breaks", "Hora de comida", true),
        Modulo("gps", "Ubicación del equipo", true),
        Modulo("users", "Usuarios", true),
        Modulo("roles", "Roles y permisos", true),
        Modulo("console", "Consola de administración", true),
        Modulo("audit", "Bitácora de cambios", true),
        Modulo("hr", "Recursos humanos", true),
        Modulo("people", "Personal", true),
        Modulo("documents", "Documentos", true),
        Modulo("search", "Búsqueda", true),
        Modulo("clients", "Clientes", true),
        Modulo("chat", "Chat", true),
        Modulo("workflow", "Flujos de aprobación", false),
        Modulo("kb", "Base de conocimiento", false),
        Modulo("support", "Mesa de soporte", false),
        Modulo("panel", "Paneles de la plataforma", false),
        Modulo("cvs", "Revisión de CV", false),
        Modulo("sales", "Ventas", false),
        Modulo("cotizaciones", "Cotizaciones", false),
        Modulo("catalog", "Catálogo", false),
        Modulo("contabilidad", "Contabilidad", false),
        Modulo("accounting", "Contabilidad", false),
        Modulo("invoicing", "Facturación", false),
        Modulo("banking", "Bancos", false),
        Modulo("procurement", "Compras", false),
        Modulo("warehouse", "Almacén", false),
        Modulo("stock", "Inventario", false),
        Modulo("vehicles", "Vehículos", false),
        Modulo("tools", "Herramientas", false),
        Modulo("viatics", "Viáticos", false),
        Modulo("maintenance", "Mantenimiento", false),
        Modulo("assets", "Activos", false),
        Modulo("noc", "Centro de monitoreo", false),
        Modulo("lab", "Laboratorio", false),
        Modulo("bi", "Inteligencia de negocio", false),
    ).sortedByDescending { it.clave.length }

    private val ACCIONES: Map<String, String> = mapOf(
        "view" to "ver",
        "manage" to "administrar",
        "create" to "crear",
        "export" to "exportar",
        "review" to "revisar",
        "approve" to "aprobar",
        "request" to "solicitar",
        "access" to "entrar",
        "admin" to "administrar",
        "inventory" to "inventario",
        "leave" to "aprobar permisos y vacaciones",
        "superadmin.review" to "revisión de dirección",
        "admin.review" to "revisión de administración",
        "support" to "soporte",
        "people" to "personal",
        "noc" to "monitoreo",
        "lab" to "laboratorio",
    )

    fun accion(resto: String): String =
        ACCIONES[resto] ?: resto.split('.', '_').joinToString(" ") { it.lowercase() }

    /** Grupos en orden: primero los de Core, cada uno con sus acciones sin repetir. */
    fun agrupar(permisos: List<String>): List<Grupo> {
        val porModulo = linkedMapOf<String, Pair<Modulo, LinkedHashSet<String>>>()
        for (raw in permisos.map { it.trim() }.filter { it.isNotEmpty() }.distinct()) {
            val modulo = MODULOS.firstOrNull { raw == it.clave || raw.startsWith(it.clave + ".") }
                ?: Modulo(raw.substringBefore('.'), raw.substringBefore('.').replaceFirstChar { it.uppercase() }, false)
            val resto = raw.removePrefix(modulo.clave).trimStart('.').ifBlank { "view" }
            val entrada = porModulo.getOrPut(modulo.nombre) { modulo to linkedSetOf() }
            entrada.second += accion(resto)
        }
        return porModulo.values
            .map { (m, acciones) -> Grupo(m, acciones.toList()) }
            .sortedWith(compareByDescending<Grupo> { it.modulo.core }.thenBy { it.modulo.nombre })
    }

    /** «Ver, administrar y exportar». */
    fun unirAcciones(acciones: List<String>): String = when (acciones.size) {
        0 -> ""
        1 -> acciones[0].replaceFirstChar { it.uppercase() }
        else -> (acciones.dropLast(1).joinToString(", ") + " y " + acciones.last()).replaceFirstChar { it.uppercase() }
    }
}
