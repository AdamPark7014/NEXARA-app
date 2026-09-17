package mx.nexara.mobile.nativeapp.ui.console.screens

import mx.nexara.mobile.nativeapp.access.PlatformAccounts
import mx.nexara.mobile.nativeapp.data.SessionUser

/**
 * Quién administra asistencia y quién checa — espejo de `getAttendanceViewMode`
 * en `apps/web/lib/section-views.ts`.
 *
 * Antes la pantalla decidía con `isSuperAdmin` / `console.admin`, que no es el
 * mismo reparto: Christian (dirección) aparecía con botones de entrada y salida
 * que en la web no tiene, y un coordinador con `attendance.manage` no veía a su
 * gente porque no era `console.admin`.
 */
enum class AttendanceViewMode {
    /** Dirección: tablero del equipo, sin checador propio. */
    MANAGE,

    /** Campo: solo su propia jornada. */
    REGISTER,

    /** RRHH y coordinadores: ven a su gente y además checan. */
    MANAGE_REGISTER,
    ;

    val canManageTeam: Boolean get() = this == MANAGE || this == MANAGE_REGISTER
    val canRegisterSelf: Boolean get() = this == REGISTER || this == MANAGE_REGISTER
}

/** Claves de rol RBAC v2 — espejo de `apps/web/lib/rbac/roles.ts`. */
internal object AttendanceRoles {
    const val SUPER_ADMIN = "super_admin"
    const val CEO = "ceo"
    const val ARQUITECTO = "arquitecto"
    const val DIR_OPERACIONES = "dir_operaciones"
    const val DIR_ADMIN = "dir_admin"
    const val COORD_ADMIN = "coord_admin"
    const val COORD_OPERACIONES = "coord_operaciones"
    const val ING_SOPORTE = "ing_soporte"
    const val RH = "rh"

    /** Dirección: tablero sin checador. */
    val EXECUTIVE = setOf(CEO, SUPER_ADMIN)

    /** Encargados de gente: equipo + checada propia. */
    val HR_MANAGERS = setOf(RH, DIR_ADMIN, COORD_ADMIN)
}

/**
 * Rol efectivo, como `resolveV2RoleKey`: el dueño de la plataforma (o su
 * equivalente, Claudia) es CEO aunque la base lo marque `isSuperAdmin`.
 */
internal fun resolveAttendanceRoleKey(
    email: String?,
    roleKey: String?,
    orgRoleKey: String?,
    isSuperAdmin: Boolean,
): String? {
    if (PlatformAccounts.isCeoEquivalentEmail(email)) return AttendanceRoles.CEO
    if (isSuperAdmin) return AttendanceRoles.SUPER_ADMIN
    roleKey?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }?.let { return it }
    return orgRoleKey?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
}

/** Espejo de `getAttendanceViewMode(user)`. */
fun attendanceViewMode(
    email: String?,
    roleKey: String?,
    orgRoleKey: String?,
    isSuperAdmin: Boolean,
): AttendanceViewMode {
    val v2 = resolveAttendanceRoleKey(email, roleKey, orgRoleKey, isSuperAdmin)
        ?: return AttendanceViewMode.REGISTER
    if (v2 in AttendanceRoles.EXECUTIVE || v2 == AttendanceRoles.DIR_OPERACIONES) {
        return AttendanceViewMode.MANAGE
    }
    if (v2 in AttendanceRoles.HR_MANAGERS ||
        v2 == AttendanceRoles.COORD_OPERACIONES ||
        v2 == AttendanceRoles.ARQUITECTO ||
        v2 == AttendanceRoles.ING_SOPORTE
    ) {
        return AttendanceViewMode.MANAGE_REGISTER
    }
    return AttendanceViewMode.REGISTER
}

fun attendanceViewMode(user: SessionUser?): AttendanceViewMode {
    if (user == null) return AttendanceViewMode.REGISTER
    return attendanceViewMode(
        email = user.email,
        roleKey = user.roleKey,
        orgRoleKey = user.orgRoleKey,
        isSuperAdmin = user.isSuperAdmin,
    )
}

/**
 * `true` cuando la consulta va sin `scope`: CEO, cuenta técnica y super admin
 * ven la empresa entera; el resto, su subárbol.
 */
fun attendanceIsCompanyWideViewer(
    email: String?,
    roleKey: String?,
    isSuperAdmin: Boolean,
): Boolean {
    if (isSuperAdmin) return true
    if (roleKey?.trim()?.lowercase() == AttendanceRoles.CEO) return true
    return PlatformAccounts.isCeoEquivalentEmail(email) || PlatformAccounts.isDeveloperEmail(email)
}

fun attendanceIsCompanyWideViewer(user: SessionUser?): Boolean =
    user != null && attendanceIsCompanyWideViewer(user.email, user.roleKey, user.isSuperAdmin)

/** `null` = sin `scope` (empresa completa); `"subtree"` = solo su organigrama. */
fun attendanceScopeParam(user: SessionUser?): String? =
    if (attendanceIsCompanyWideViewer(user)) null else "subtree"

/** La pestaña Trayectoria (gps/team + gps/trajectory) exige `gps.manage`. */
fun attendanceCanSeeTrajectory(user: SessionUser?): Boolean =
    user != null && (user.isSuperAdmin || user.permissions.contains("gps.manage"))
