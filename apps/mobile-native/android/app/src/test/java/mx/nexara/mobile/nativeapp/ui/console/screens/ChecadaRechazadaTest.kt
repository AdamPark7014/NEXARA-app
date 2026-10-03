package mx.nexara.mobile.nativeapp.ui.console.screens

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Qué se le dice a la persona cuando el servidor no acepta su checada.
 *
 * Ahora son cuatro motivos, no uno: GPS falso, posición guardada, distancia imposible
 * desde la checada anterior, e intento desde fuera de la app. Todos significan lo mismo
 * para quien está parado en la puerta —«no quedó registrada»— pero lo que tiene que
 * hacer para poder checar es distinto en cada caso.
 */
class ChecadaRechazadaTest {

    private val vieja = "Tu teléfono mandó una ubicación vieja. Sal al aire libre unos segundos y vuelve a intentarlo."
    private val viaje = "Tu ubicación no coincide con tu checada anterior: es una distancia imposible en ese tiempo. Avisa a tu jefe."
    private val soloApp = "Las checadas se registran solo desde la app NEXARA en tu teléfono. Abre la app para checar."

    @Test
    fun `los cuatro rechazos del servidor van al dialogo`() {
        assertTrue(AttendanceCheckIn.esRechazoDelServidor(422, AttendanceCheckIn.MOCK_MENSAJE))
        assertTrue(AttendanceCheckIn.esRechazoDelServidor(422, vieja))
        assertTrue(AttendanceCheckIn.esRechazoDelServidor(422, viaje))
        assertTrue(AttendanceCheckIn.esRechazoDelServidor(422, soloApp))
    }

    @Test
    fun `un fallo de red no es un rechazo`() {
        assertFalse(AttendanceCheckIn.esRechazoDelServidor(null, "No se pudo conectar"))
        assertFalse(AttendanceCheckIn.esRechazoDelServidor(500, "Error interno"))
        // Un 400 de «ya existe una entrada hoy» es otra cosa: se dice en la línea, no en un diálogo.
        assertFalse(AttendanceCheckIn.esRechazoDelServidor(400, "Ya existe una entrada registrada para hoy"))
    }

    @Test
    fun `la ayuda cambia segun el motivo`() {
        assertTrue(AttendanceCheckIn.ayudaDelRechazo(vieja).contains("aire libre"))
        assertTrue(AttendanceCheckIn.ayudaDelRechazo(viaje).contains("avisa a tu jefe", ignoreCase = true))
        assertTrue(AttendanceCheckIn.ayudaDelRechazo(soloApp).contains("desde esta app"))
    }

    @Test
    fun `a quien le dicen que su GPS es falso se le explica como apagarlo`() {
        val ayuda = AttendanceCheckIn.ayudaDelRechazo(AttendanceCheckIn.MOCK_MENSAJE)
        assertTrue(ayuda.contains("Opciones de desarrollador"))
        assertTrue(ayuda.contains("tus jefes"))
    }

    @Test
    fun `en fin de semana sin guardia se explica la guardia, no el GPS falso`() {
        val finDeSemana =
            "Hoy es fin de semana: solo quien tiene guardia puede checar. Pide a tu encargado que te programe."
        // La app no bloquea el día: manda la checada y el servidor contesta 422 con su motivo.
        assertTrue(AttendanceCheckIn.esRechazoDelServidor(422, finDeSemana))
        val ayuda = AttendanceCheckIn.ayudaDelRechazo(finDeSemana)
        assertTrue(ayuda.contains("guardia"))
        assertFalse(ayuda.contains("simulada"))
    }

    @Test
    fun `un motivo que la app no conoce no se confunde con GPS falso`() {
        val ayuda = AttendanceCheckIn.ayudaDelRechazo("Tu horario de hoy ya terminó.")
        assertTrue(ayuda == AttendanceCheckIn.AYUDA_GENERICA)
        assertFalse(ayuda.contains("simulada"))
    }

    @Test
    fun `sin mensaje del servidor se dice lo de siempre en vez de quedarse mudo`() {
        assertTrue(AttendanceCheckIn.ayudaDelRechazo(null).isNotBlank())
        assertTrue(AttendanceCheckIn.ayudaDelRechazo("").isNotBlank())
    }
}
