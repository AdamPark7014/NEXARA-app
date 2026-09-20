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
) {
    COTIZACIONES(CoreKeys.COTIZACIONES, "Cotizaciones", "/erp/cotizaciones", "Propuestas técnicas: folio, envío y seguimiento."),
    PROYECTOS(CoreKeys.PROYECTOS, "Proyectos", "/erp/proyectos", "Cronograma, alcance, equipo y documentos."),
    KPIS_EQUIPO(CoreKeys.KPIS_EQUIPO, "KPIs del equipo", "/erp/asistencias/indicadores", "Retardos, uniforme y horas del equipo."),
    ALMACEN(CoreKeys.ALMACEN, "Almacén", "/erp/almacen", "Inventario, entradas y salidas, y reabastecimiento."),
    HERRAMIENTAS(CoreKeys.HERRAMIENTAS, "Herramientas", "/erp/almacen/herramientas", "Solicita herramienta, revisa tu kit y tus préstamos."),
    VEHICULOS(CoreKeys.VEHICULOS, "Vehículos", "/erp/vehiculos", "Solicita un vehículo; entrega y recepción con fotos."),
    ORGANIGRAMA(CoreKeys.ORGANIGRAMA, "Organigrama", "/erp/organigrama", "Quién reporta a quién en NEXARA."),
    ;

    /** URL completa en la web de Core. */
    val webUrl: String get() = CoreMenu.CORE_WEB_BASE + webPath

    companion object {
        fun fromKey(key: String?): CoreExtraModule? =
            key?.trim()?.lowercase()?.let { k -> entries.firstOrNull { it.key == k } }
    }
}

object CoreMenu {

    /** Donde vive la web de Core; «Abrir en la web» arma sus enlaces aquí. */
    const val CORE_WEB_BASE = "https://core.nexara.com.mx"

    /** Los tres de «Más» que todo el personal tiene (herramientas, vehículos, organigrama). */
    private val EVERYONE_EXTRAS = listOf(
        CoreExtraModule.HERRAMIENTAS,
        CoreExtraModule.VEHICULOS,
        CoreExtraModule.ORGANIGRAMA,
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
        return CoreExtraModule.entries.filter { it.key in keys }
    }

    fun canOpenExtra(user: SessionUser?, key: String): Boolean =
        extraModulesFor(user).any { it.key == key }

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
