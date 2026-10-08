package mx.nexara.mobile.nativeapp.util

import org.junit.Assert.assertEquals
import org.junit.Test

/** El motivo que viaja como `ubicacionFalla` cuando la checada no trae coordenadas. */
class UbicacionFallaTest {

    @Test
    fun `sin permiso manda el permiso aunque la ubicacion este encendida`() {
        assertEquals(UbicacionFalla.PERMISO_NEGADO, UbicacionFalla.fallaDeUbicacion(tienePermiso = false, ubicacionEncendida = true))
        assertEquals(UbicacionFalla.PERMISO_NEGADO, UbicacionFalla.fallaDeUbicacion(tienePermiso = false, ubicacionEncendida = false))
    }

    @Test
    fun `con permiso y la ubicacion apagada`() {
        assertEquals(UbicacionFalla.UBICACION_APAGADA, UbicacionFalla.fallaDeUbicacion(tienePermiso = true, ubicacionEncendida = false))
    }

    @Test
    fun `con permiso y ubicacion encendida es falta de senal`() {
        assertEquals(UbicacionFalla.SIN_SENAL, UbicacionFalla.fallaDeUbicacion(tienePermiso = true, ubicacionEncendida = true))
    }

    @Test
    fun `los valores son los que entiende el api`() {
        assertEquals("PERMISO_NEGADO", UbicacionFalla.PERMISO_NEGADO)
        assertEquals("UBICACION_APAGADA", UbicacionFalla.UBICACION_APAGADA)
        assertEquals("SIN_SENAL", UbicacionFalla.SIN_SENAL)
        assertEquals("ERROR", UbicacionFalla.ERROR)
    }
}
