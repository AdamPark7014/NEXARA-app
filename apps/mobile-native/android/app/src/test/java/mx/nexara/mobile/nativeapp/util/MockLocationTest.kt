package mx.nexara.mobile.nativeapp.util

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Contrato A: `Location.isMock` (API 31+) o `isFromMockProvider`; cualquiera basta. */
class MockLocationTest {

    @Test
    fun `api 31 usa isMock`() {
        assertTrue(MockLocation.isSimulated(sdkInt = 34, isMock = true, isFromMockProvider = false))
        assertFalse(MockLocation.isSimulated(sdkInt = 34, isMock = false, isFromMockProvider = false))
    }

    @Test
    fun `antes de api 31 vale isFromMockProvider`() {
        assertTrue(MockLocation.isSimulated(sdkInt = 28, isMock = null, isFromMockProvider = true))
        assertFalse(MockLocation.isSimulated(sdkInt = 28, isMock = null, isFromMockProvider = false))
    }

    @Test
    fun `la senal vieja tambien cuenta en telefonos nuevos`() {
        // Hay fabricantes donde isMock llega false y isFromMockProvider true.
        assertTrue(MockLocation.isSimulated(sdkInt = 33, isMock = false, isFromMockProvider = true))
    }

    @Test
    fun `sin datos no se acusa a nadie`() {
        assertFalse(MockLocation.isSimulated(sdkInt = 34, isMock = null, isFromMockProvider = null))
        assertFalse(MockLocation.isSimulated(sdkInt = 24, isMock = null, isFromMockProvider = null))
    }
}
