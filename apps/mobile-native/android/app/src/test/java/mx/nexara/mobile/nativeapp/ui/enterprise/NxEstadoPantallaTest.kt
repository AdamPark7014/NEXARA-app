package mx.nexara.mobile.nativeapp.ui.enterprise

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * La regla que impide que una pantalla enseñe dos estados a la vez: el técnico
 * tiene que saber si esperar, reintentar o que de verdad no hay nada.
 */
class NxEstadoPantallaTest {

    @Test
    fun sinNadaYPidiendoEsCargando() {
        assertEquals(
            NxEstadoPantalla.CARGANDO,
            nxEstadoPantalla(cargando = true, error = null, hayDatos = false),
        )
    }

    @Test
    fun conDatosNuncaSeBorraLaPantallaAlRecargar() {
        // Tirar para recargar no puede dejar al técnico mirando un esqueleto.
        assertEquals(
            NxEstadoPantalla.CONTENIDO,
            nxEstadoPantalla(cargando = true, error = "se cayó la red", hayDatos = true),
        )
    }

    @Test
    fun falloSinDatosEsError() {
        assertEquals(
            NxEstadoPantalla.ERROR,
            nxEstadoPantalla(cargando = false, error = "500", hayDatos = false),
        )
    }

    @Test
    fun errorEnBlancoNoEsError() {
        // Un mensaje vacío del servidor no convierte un «no hay nada» en un fallo.
        assertEquals(
            NxEstadoPantalla.VACIO,
            nxEstadoPantalla(cargando = false, error = "   ", hayDatos = false),
        )
    }

    @Test
    fun sinPeticionNiFalloEsVacio() {
        assertEquals(
            NxEstadoPantalla.VACIO,
            nxEstadoPantalla(cargando = false, error = null, hayDatos = false),
        )
    }

    @Test
    fun cargandoNuncaCoincideConVacio() {
        // Los cuatro son excluyentes: cada combinación da exactamente uno.
        val combinaciones = listOf(
            Triple(true, null, false),
            Triple(true, "x", false),
            Triple(false, "x", false),
            Triple(false, null, false),
            Triple(true, null, true),
            Triple(false, "x", true),
        )
        combinaciones.forEach { (cargando, error, hayDatos) ->
            val estado = nxEstadoPantalla(cargando, error, hayDatos)
            assertEquals(1, NxEstadoPantalla.entries.count { it == estado })
        }
    }
}
