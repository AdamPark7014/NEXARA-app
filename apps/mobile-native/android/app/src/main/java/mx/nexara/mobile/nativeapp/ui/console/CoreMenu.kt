package mx.nexara.mobile.nativeapp.ui.console

import mx.nexara.mobile.nativeapp.access.ClientSectors
import mx.nexara.mobile.nativeapp.access.CoreKeys
import mx.nexara.mobile.nativeapp.access.RoleKeys
import mx.nexara.mobile.nativeapp.data.SessionUser

/**
 * Menú de NEXARA Core — exactamente los módulos de `CORE_OLA1_MODULE_IDS`
 * (`apps/web/lib/core-surface.ts`), con `mis-actividades` y `pizarra` como una
 * sola entrada, «Actividades».
 *
 * Quién ve qué:
 *   1. Super admin → todo (bypass de url-matrix).
 *   2. `GET me/navigation` → `paths` (reglas de url-matrix del rol), con la
 *      coincidencia estricta de `checkUrlAccess`: `/erp` con doble comodín abre
 *      todo /erp, una regla sin comodín solo abre esa ruta exacta. La coincidencia
 *      laxa de la web (`base.startsWith(full)`) dejaba pasar todo con un `/erp` suelto.
 *   3. Sin navegación (sin conexión, sesión restaurada) → la misma tabla por rol.
 *   4. Clientes, además, exige sectores por correo (`client-sectors.ts`): el
 *      ingeniero tiene la ruta pero no el padrón, así que no lo ve.
 */
enum class CoreModule(
    val key: String,
    val label: String,
    /** Rutas web que abren el módulo; basta con una. */
    val webPaths: List<String>,
) {
    ACTIVIDADES(CoreKeys.ACTIVITIES, "Actividades", listOf("/erp/pizarra", "/erp/mis-actividades")),
    ASISTENCIAS(CoreKeys.ATTENDANCE, "Asistencias", listOf("/erp/asistencias")),
    CHAT(CoreKeys.CHAT, "Chat", listOf("/erp/chat")),
    CLIENTES(CoreKeys.CLIENTS, "Clientes", listOf("/erp/clientes")),
    MI_PERFIL(CoreKeys.MY_PROFILE, "Mi perfil", listOf("/erp/my-profile")),
}

/**
 * El resto de Core, en «Más»: módulos que la web ya tiene y la app todavía no. Cada uno abre
 * una pantalla «Disponible pronto en la app» con el botón a su página web; los frentes de
 * trabajo los irán sustituyendo por pantallas propias.
 *
 * [key] es la misma clave que manda `GET me/navigation` en `moduleKeys`
 * (`apps/api/src/me/navigation-module-map.ts`, `CORE_EXTRA_MODULES`).
 */
enum class CoreExtraModule(
    val key: String,
    val label: String,
    /** Página web del módulo (se abre en `https://core.nexara.com.mx`). */
    val webPath: String,
    val summary: String,
    /** Grupo del hub «Más», alineado con la web: Hoy / Recursos / Finanzas / Gobierno. */
    val group: Group,
    /**
     * Lo ve todo el personal, tenga o no su clave en `me/navigation`.
     *
     * Solo Viáticos. Los demás módulos de «Más» se conceden por rol, pero el
     * gasto de bolsillo lo hace cualquiera y lo autoriza la dirección: las
     * reglas del CEO son comodines de ruta (todo `/erp`, y `/api` en GET, con
     * doble asterisco) y no producen
     * la clave `viatics`, así que filtrar por navegación se lo escondería justo
     * a quien tiene que aprobar desde la calle. Quien no tenga el permiso ve el
     * mensaje del 403 del API, que es quien de verdad decide.
     */
    val paraTodoElPersonal: Boolean = false,
) {
    EXECUTIVE(
        CoreKeys.EXECUTIVE,
        "Hoy",
        "/erp/executive",
        "KPIs del negocio visibles para dirección.",
        Group.HOY,
    ),
    COTIZACIONES(CoreKeys.COTIZACIONES, "Cotizaciones", "/erp/cotizaciones", "Propuestas técnicas: folio, envío y seguimiento.", Group.HOY),
    PROYECTOS(CoreKeys.PROYECTOS, "Proyectos", "/erp/proyectos", "Cronograma, alcance, equipo y documentos.", Group.HOY),
    KPIS_EQUIPO(CoreKeys.KPIS_EQUIPO, "KPIs del equipo", "/erp/asistencias/indicadores", "Retardos, uniforme y horas del equipo.", Group.HOY),
    ALMACEN(CoreKeys.ALMACEN, "Almacén", "/erp/almacen", "Inventario, entradas y salidas, y reabastecimiento.", Group.RECURSOS),
    HERRAMIENTAS(CoreKeys.HERRAMIENTAS, "Herramientas", "/erp/almacen/herramientas", "Solicita herramienta, revisa tu kit y tus préstamos.", Group.RECURSOS),
    VEHICULOS(CoreKeys.VEHICULOS, "Vehículos", "/erp/vehiculos", "Solicita un vehículo; entrega y recepción con fotos.", Group.RECURSOS),
    ORGANIGRAMA(CoreKeys.ORGANIGRAMA, "Organigrama", "/erp/organigrama", "Quién reporta a quién en NEXARA.", Group.RECURSOS),
    GASTOS(CoreKeys.GASTOS, "Gastos", "/erp/finance/expenses", "Gastos de la operación: captura, comprobación y estado.", Group.FINANZAS),
    APROBACIONES(CoreKeys.APROBACIONES, "Aprobaciones", "/erp/approvals", "Lo que espera tu visto bueno, en un solo sitio.", Group.HOY),
    PAGOS_EMPLEADOS(
        CoreKeys.PAGOS_EMPLEADOS,
        "Pagos a empleados",
        "/erp/finance/employee-payments",
        "Pagos y anticipos al personal, con su comprobante.",
        Group.FINANZAS,
    ),
    DOCUMENTOS(CoreKeys.DOCUMENTOS, "Documentos", "/erp/documents", "Manuales, planos y papeles de la operación.", Group.GOBIERNO),
    VIATICOS(
        CoreKeys.VIATICOS,
        "Viáticos",
        "/erp/finance/viatics",
        "Pide un viático con la foto del ticket, repártelo y compruébalo.",
        Group.FINANZAS,
        paraTodoElPersonal = true,
    ),
    ;

    /** URL completa en la web de Core. */
    val webUrl: String get() = CoreMenu.CORE_WEB_BASE + webPath

    /**
     * Claves con las que `me/navigation` puede nombrar este módulo. Casi
     * siempre una; Viáticos llega como `viatics` o como `my-viatics` según la
     * ruta que tenga el rol en url-matrix.
     */
    val claves: Set<String>
        get() = if (this == VIATICOS) setOf(CoreKeys.VIATICOS, CoreKeys.MIS_VIATICOS) else setOf(key)

    companion object {
        fun fromKey(key: String?): CoreExtraModule? =
            key?.trim()?.lowercase()?.let { k -> entries.firstOrNull { k in it.claves } }
    }

    /** Grupos del hub «Más», alineados con la web ERP. */
    enum class Group(val title: String) {
        HOY("Hoy"),
        RECURSOS("Recursos"),
        FINANZAS("Finanzas"),
        GOBIERNO("Gobierno"),
    }
}

object CoreMenu {

    /** Donde vive la web de Core; «Abrir en la web» arma sus enlaces aquí. */
    const val CORE_WEB_BASE = "https://core.nexara.com.mx"

    /**
     * Los de «Más» que todo el personal tiene: herramientas, vehículos,
     * organigrama y viáticos (ver [CoreExtraModule.paraTodoElPersonal]).
     */
    private val EVERYONE_EXTRAS = listOf(
        CoreExtraModule.HERRAMIENTAS,
        CoreExtraModule.VEHICULOS,
        CoreExtraModule.ORGANIGRAMA,
        CoreExtraModule.VIATICOS,
    )

    /**
     * Módulos de «Más» que el rol puede abrir, en el orden de [CoreExtraModule]:
     *   1. Super admin → todos.
     *   2. `GET me/navigation` → los de `moduleKeys` (la API ya los deriva de url-matrix:
     *      las reglas de cada página y el comodín de todo /erp que tiene dirección).
     *   3. Sin navegación (sin conexión, sesión restaurada) → los que tiene todo el personal.
     * Cuentas de cliente o sucursal nunca ven Core.
     */
    fun extraModulesFor(user: SessionUser?): List<CoreExtraModule> {
        if (user == null || user.isClient || user.isBranchUser) return emptyList()
        if (user.isSuperAdmin) return CoreExtraModule.entries.toList()
        val keys = user.navModuleKeys?.map { it.trim().lowercase() }?.filter { it.isNotEmpty() }?.toSet()
        if (keys.isNullOrEmpty()) return EVERYONE_EXTRAS
        return CoreExtraModule.entries.filter { modulo ->
            modulo.paraTodoElPersonal || modulo.claves.any { it in keys }
        }
    }

    fun canOpenExtra(user: SessionUser?, key: String): Boolean {
        val buscado = key.trim().lowercase()
        return extraModulesFor(user).any { buscado in it.claves }
    }

    /** Roles con todo Core en url-matrix (todo /erp o `CORE_OLA1_URL_RULES`). */
    private val FULL_CORE_ROLES = setOf(
        RoleKeys.SUPER_ADMIN, RoleKeys.CEO, RoleKeys.ARQUITECTO, RoleKeys.DIR_ADMIN,
        RoleKeys.ADMINISTRATIVO, RoleKeys.COORD_OPERACIONES, RoleKeys.ING_CAMPO, RoleKeys.ING_SOPORTE,
    )

    fun canonicalRole(user: SessionUser): String? = RoleKeys.canonicalRoleKey(
        roleKey = user.roleKey,
        orgRoleKey = user.orgRoleKey,
        roleDisplayName = user.role,
    )

    /** Módulos visibles, en el orden de la barra inferior. Nunca vacío con sesión. */
    fun modulesFor(user: SessionUser?): List<CoreModule> {
        if (user == null) return emptyList()
        val byRoute = CoreModule.entries.filter { module -> routeAllows(user, module) }
        return byRoute.filter { module ->
            module != CoreModule.CLIENTES || ClientSectors.canSeeModule(user.email)
        }
    }

    fun canOpen(user: SessionUser?, key: String): Boolean =
        modulesFor(user).any { it.key == key || (key == CoreKeys.MY_ACTIVITIES && it == CoreModule.ACTIVIDADES) }

    private fun routeAllows(user: SessionUser, module: CoreModule): Boolean {
        if (user.isSuperAdmin) return true
        // `me/navigation` siempre suma Mi perfil.
        if (module == CoreModule.MI_PERFIL) return true
        val rules = user.navPaths?.map { it.trim() }?.filter { it.isNotEmpty() && !it.startsWith("/api") }
        if (!rules.isNullOrEmpty()) {
            return module.webPaths.any { path -> rules.any { rule -> ruleMatches(rule, path) } }
        }
        val role = canonicalRole(user)
        return when {
            role in FULL_CORE_ROLES -> true
            else -> module == CoreModule.CHAT
        }
    }

    /** `checkUrlAccess` de url-matrix: doble comodín → prefijo, sin comodín → igualdad exacta. */
    internal fun ruleMatches(rule: String, path: String): Boolean {
        val clean = rule.trimEnd('/')
        if (clean.isEmpty() || clean == "/**") return true
        return when {
            clean.endsWith("/**") -> {
                val base = clean.removeSuffix("/**")
                path == base || path.startsWith("$base/")
            }
            clean.endsWith("/*") -> {
                val base = clean.removeSuffix("/*")
                path.startsWith("$base/") && !path.removePrefix("$base/").contains('/')
            }
            else -> path == clean
        }
    }
}
