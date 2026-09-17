package mx.nexara.mobile.nativeapp.ui.console.screens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Espejo de `getAttendanceViewMode` en `apps/web/lib/section-views.ts`: quién
 * administra asistencia y quién checa.
 */
class AttendanceViewModeTest {

    private fun mode(
        email: String? = "alguien@nexara.com.mx",
        roleKey: String? = null,
        orgRoleKey: String? = null,
        isSuperAdmin: Boolean = false,
    ) = attendanceViewMode(email, roleKey, orgRoleKey, isSuperAdmin)

    @Test
    fun `direccion administra pero no checa`() {
        // Christian aparecía con botones de Entrada/Salida que la web no le da.
        assertEquals(AttendanceViewMode.MANAGE, mode(email = "gerencia@nexara.com.mx", isSuperAdmin = true))
        assertEquals(AttendanceViewMode.MANAGE, mode(roleKey = "ceo"))
        assertEquals(AttendanceViewMode.MANAGE, mode(roleKey = "dir_operaciones"))
        assertFalse(mode(roleKey = "ceo").canRegisterSelf)
        assertTrue(mode(roleKey = "ceo").canManageTeam)
    }

    @Test
    fun `super admin solo administra`() {
        val m = mode(email = "developer@nexara.com.mx", isSuperAdmin = true)
        assertEquals(AttendanceViewMode.MANAGE, m)
        assertFalse(m.canRegisterSelf)
    }

    @Test
    fun `claudia administra igual que christian, sin ser super admin`() {
        // Owner rule: Claudia (tester) tiene EXACTAMENTE los permisos de Christian.
        val m = mode(email = "claudia.bernal@nexara.com.mx", isSuperAdmin = false)
        assertEquals(AttendanceViewMode.MANAGE, m)
        assertFalse(m.canRegisterSelf)
    }

    @Test
    fun `rrhh y coordinadores administran y checan`() {
        listOf("rh", "dir_admin", "coord_admin", "coord_operaciones", "arquitecto", "ing_soporte")
            .forEach { key ->
                val m = mode(roleKey = key)
                assertEquals("rol $key", AttendanceViewMode.MANAGE_REGISTER, m)
                assertTrue("rol $key checa", m.canRegisterSelf)
                assertTrue("rol $key ve equipo", m.canManageTeam)
            }
    }

    @Test
    fun `campo solo checa`() {
        val m = mode(roleKey = "ing_campo")
        assertEquals(AttendanceViewMode.REGISTER, m)
        assertTrue(m.canRegisterSelf)
        assertFalse(m.canManageTeam)
    }

    @Test
    fun `sin rol se asume campo`() {
        assertEquals(AttendanceViewMode.REGISTER, mode(roleKey = null, orgRoleKey = null))
    }

    @Test
    fun `orgRoleKey sirve de respaldo`() {
        assertEquals(AttendanceViewMode.MANAGE_REGISTER, mode(roleKey = null, orgRoleKey = "coord_operaciones"))
    }

    @Test
    fun `solo direccion y plataforma consultan la empresa entera`() {
        // El fallo real: cualquier attendance.manage veía a toda la empresa.
        assertNull(attendanceScopeParamFor("gerencia@nexara.com.mx", "ceo", isSuperAdmin = true))
        assertNull(attendanceScopeParamFor("developer@nexara.com.mx", null, isSuperAdmin = true))
        // Claudia (tester) ve la empresa completa como Christian, sin ser super admin.
        assertNull(attendanceScopeParamFor("claudia.bernal@nexara.com.mx", null, isSuperAdmin = false))
        assertEquals("subtree", attendanceScopeParamFor("rh@nexara.com.mx", "rh", isSuperAdmin = false))
        assertEquals(
            "subtree",
            attendanceScopeParamFor("coord@nexara.com.mx", "coord_operaciones", isSuperAdmin = false),
        )
    }

    private fun attendanceScopeParamFor(email: String?, roleKey: String?, isSuperAdmin: Boolean): String? =
        if (attendanceIsCompanyWideViewer(email, roleKey, isSuperAdmin)) null else "subtree"
}
