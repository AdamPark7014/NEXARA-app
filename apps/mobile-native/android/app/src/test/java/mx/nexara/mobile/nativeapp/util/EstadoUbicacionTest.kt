package mx.nexara.mobile.nativeapp.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Lo que el GPS de jornada manda a `attendance/estado-ubicacion`. */
class EstadoUbicacionTest {

    @Test
    fun `el permiso manda sobre el interruptor`() {
        assertEquals(EstadoUbicacion.SIN_PERMISO, EstadoUbicacion.estadoDeUbicacion(tienePermiso = false, ubicacionEncendida = true))
        assertEquals(EstadoUbicacion.SIN_PERMISO, EstadoUbicacion.estadoDeUbicacion(tienePermiso = false, ubicacionEncendida = false))
    }

    @Test
    fun `con permiso decide el interruptor`() {
        assertEquals(EstadoUbicacion.APAGADA, EstadoUbicacion.estadoDeUbicacion(tienePermiso = true, ubicacionEncendida = false))
        assertEquals(EstadoUbicacion.ENCENDIDA, EstadoUbicacion.estadoDeUbicacion(tienePermiso = true, ubicacionEncendida = true))
    }

    @Test
    fun `al arrancar solo se avisa si algo esta mal`() {
        assertFalse(EstadoUbicacion.debeEnviar(anterior = null, actual = EstadoUbicacion.ENCENDIDA))
        assertTrue(EstadoUbicacion.debeEnviar(anterior = null, actual = EstadoUbicacion.APAGADA))
        assertTrue(EstadoUbicacion.debeEnviar(anterior = null, actual = EstadoUbicacion.SIN_PERMISO))
    }

    @Test
    fun `despues solo los cambios`() {
        assertTrue(EstadoUbicacion.debeEnviar(anterior = EstadoUbicacion.APAGADA, actual = EstadoUbicacion.ENCENDIDA))
        assertTrue(EstadoUbicacion.debeEnviar(anterior = EstadoUbicacion.ENCENDIDA, actual = EstadoUbicacion.APAGADA))
        assertTrue(EstadoUbicacion.debeEnviar(anterior = EstadoUbicacion.APAGADA, actual = EstadoUbicacion.SIN_PERMISO))
        // Android avisa una vez por proveedor: el segundo aviso igual no sale.
        assertFalse(EstadoUbicacion.debeEnviar(anterior = EstadoUbicacion.APAGADA, actual = EstadoUbicacion.APAGADA))
        assertFalse(EstadoUbicacion.debeEnviar(anterior = EstadoUbicacion.ENCENDIDA, actual = EstadoUbicacion.ENCENDIDA))
    }

    @Test
    fun `los valores son los que entiende el api`() {
        assertEquals("APAGADA", EstadoUbicacion.APAGADA)
        assertEquals("SIN_PERMISO", EstadoUbicacion.SIN_PERMISO)
        assertEquals("ENCENDIDA", EstadoUbicacion.ENCENDIDA)
    }
}
