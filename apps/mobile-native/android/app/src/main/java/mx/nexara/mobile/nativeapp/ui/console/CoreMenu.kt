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

object CoreMenu {

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
