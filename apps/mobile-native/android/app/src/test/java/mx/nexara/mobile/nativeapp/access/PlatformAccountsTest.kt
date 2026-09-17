package mx.nexara.mobile.nativeapp.access

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Owner rule (Adam): Claudia (tester) debe tener EXACTAMENTE los mismos
 * permisos que Christian (CEO) sin aparecer como empleada; developer@,
 * gerencia@, claudia.bernal@ y play.review@ nunca son "empleados" en listas
 * de equipo / asignar / asistencia.
 */
class PlatformAccountsTest {

    @Test
    fun claudiaIsCeoEquivalentJustLikeChristian() {
        assertTrue(PlatformAccounts.isCeoEquivalentEmail("gerencia@nexara.com.mx"))
        assertTrue(PlatformAccounts.isCeoEquivalentEmail(" Claudia.Bernal@Nexara.com.mx "))
        assertFalse(PlatformAccounts.isCeoEquivalentEmail("developer@nexara.com.mx"))
        assertFalse(PlatformAccounts.isCeoEquivalentEmail("play.review@nexara.com.mx"))
        assertFalse(PlatformAccounts.isCeoEquivalentEmail("joan.sanchez@nexara.com.mx"))
    }

    @Test
    fun nonEmployeeAccountsAreNeverListedAsStaff() {
        assertTrue(PlatformAccounts.isNonEmployeeEmail("gerencia@nexara.com.mx"))
        assertTrue(PlatformAccounts.isNonEmployeeEmail("developer@nexara.com.mx"))
        assertTrue(PlatformAccounts.isNonEmployeeEmail("claudia.bernal@nexara.com.mx"))
        assertTrue(PlatformAccounts.isNonEmployeeEmail("play.review@nexara.com.mx"))
        assertFalse(PlatformAccounts.isNonEmployeeEmail("joan.sanchez@nexara.com.mx"))
        assertFalse(PlatformAccounts.isNonEmployeeEmail(null))
    }

    @Test
    fun claudiaGetsAllClientSectorsLikeTheCeo() {
        assertEquals(
            ClientSectors.forEmail("gerencia@nexara.com.mx"),
            ClientSectors.forEmail("claudia.bernal@nexara.com.mx"),
        )
        assertTrue(ClientSectors.forEmail("claudia.bernal@nexara.com.mx").containsAll(ClientSector.entries))
    }
}
