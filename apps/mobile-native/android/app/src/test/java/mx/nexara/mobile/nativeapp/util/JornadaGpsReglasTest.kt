package mx.nexara.mobile.nativeapp.util

import mx.nexara.mobile.nativeapp.util.JornadaGpsReglas.PuntoPendiente
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * GPS de jornada: un punto cada 30 min, sin ráfagas y sin perder puntos (Adam, 23-10-2026).
 * El caso real: Iván mandó 08:01:55 y 08:01:59, luego cada ~5 min, y de 08:29 a 13:12 todo se
 * perdió con 401 porque la rotación de contraseñas le cerró la sesión.
 */
class JornadaGpsReglasTest {

    private val min = 60_000L

    @Test
    fun `sin punto en la jornada se toma uno`() {
        assertTrue(JornadaGpsReglas.debeTomarPunto(null, 1_000_000L))
        assertTrue(JornadaGpsReglas.debeTomarPunto(0L, 1_000_000L))
    }

    @Test
    fun `cuatro segundos despues del anterior no sale otro (la rafaga de las 8)`() {
        val t = 1_000_000_000L
        assertFalse(JornadaGpsReglas.debeTomarPunto(t, t + 4_000L))
        assertFalse(JornadaGpsReglas.debeTomarPunto(t, t + 5 * min))
        assertFalse(JornadaGpsReglas.debeTomarPunto(t, t + 19 * min))
    }

    @Test
    fun `a los 20 min o mas si`() {
        val t = 1_000_000_000L
        assertTrue(JornadaGpsReglas.debeTomarPunto(t, t + 20 * min))
        assertTrue(JornadaGpsReglas.debeTomarPunto(t, t + 30 * min))
        assertTrue(JornadaGpsReglas.debeTomarPunto(t, t + 5 * 60 * min))
    }

    @Test
    fun `reloj movido hacia atras no deja a nadie sin punto`() {
        assertTrue(JornadaGpsReglas.debeTomarPunto(2_000_000_000L, 1_000_000_000L))
    }

    @Test
    fun `la siguiente alarma cae a los 30 min del ultimo punto`() {
        val t = 1_000_000_000L
        assertEquals(30 * min, JornadaGpsReglas.siguienteAlarmaEnMs(t, t, 0))
        assertEquals(20 * min, JornadaGpsReglas.siguienteAlarmaEnMs(t, t + 10 * min, 0))
        // Ya pasó la media hora (alarma atrasada): cuanto antes, pero no en bucle.
        assertEquals(min, JornadaGpsReglas.siguienteAlarmaEnMs(t, t + 45 * min, 0))
        assertEquals(30 * min, JornadaGpsReglas.siguienteAlarmaEnMs(null, t, 0))
    }

    @Test
    fun `sin senal reintenta a los 5 min tres veces y luego vuelve a la media hora`() {
        val t = 1_000_000_000L
        assertEquals(5 * min, JornadaGpsReglas.siguienteAlarmaEnMs(t, t + 30 * min, 1))
        assertEquals(5 * min, JornadaGpsReglas.siguienteAlarmaEnMs(t, t + 40 * min, 3))
        assertEquals(min, JornadaGpsReglas.siguienteAlarmaEnMs(t, t + 45 * min, 0))
    }

    @Test
    fun `los puntos pendientes se guardan en orden, sin repetidos y con tope`() {
        var lista = emptyList<PuntoPendiente>()
        lista = JornadaGpsReglas.agregarPendiente(lista, PuntoPendiente(19.07, -98.27, 3_000L, 274L, false))
        lista = JornadaGpsReglas.agregarPendiente(lista, PuntoPendiente(19.08, -98.28, 1_000L, null, false))
        lista = JornadaGpsReglas.agregarPendiente(lista, PuntoPendiente(19.08, -98.28, 1_000L, null, false))
        assertEquals(listOf(1_000L, 3_000L), lista.map { it.enMs })

        var muchos = emptyList<PuntoPendiente>()
        for (i in 1..70) muchos = JornadaGpsReglas.agregarPendiente(muchos, PuntoPendiente(19.0, -98.0, i.toLong(), null, false))
        assertEquals(JornadaGpsReglas.PENDIENTES_MAX, muchos.size)
        assertEquals(11L, muchos.first().enMs) // se tiran los más viejos
    }

    @Test
    fun `los pendientes sobreviven a guardarse como texto`() {
        val lista = listOf(
            PuntoPendiente(19.07402, -98.27774, 1_761_228_000_000L, 274L, false),
            PuntoPendiente(19.1, -98.3, 1_761_229_800_000L, null, true),
        )
        assertEquals(lista, JornadaGpsReglas.deserializar(JornadaGpsReglas.serializar(lista)))
        assertEquals(emptyList<PuntoPendiente>(), JornadaGpsReglas.deserializar(null))
        assertEquals(emptyList<PuntoPendiente>(), JornadaGpsReglas.deserializar("basura;1,2"))
    }

    @Test
    fun `la notificacion dice cuando fue la ultima ubicacion`() {
        assertEquals(
            "Última ubicación 10:30 · cada 30 min hasta tu salida.",
            JornadaGpsReglas.textoUltimo("10:30"),
        )
        assertTrue(JornadaGpsReglas.textoUltimo(null).contains("cada 30 min"))
    }
}
