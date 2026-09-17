package mx.nexara.mobile.nativeapp.ui.console.activities

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Contrato B: «Tiempo estimado» se manda como `horasPlan` en horas decimales. */
class ActivityPlanTimeTest {

    @Test
    fun `acepta coma y punto`() {
        assertEquals(1.5, ActivityPlanTime.horas("1,5")!!, 0.001)
        assertEquals(1.5, ActivityPlanTime.horas("1.5")!!, 0.001)
        assertEquals(2.0, ActivityPlanTime.horas(" 2 ")!!, 0.001)
    }

    @Test
    fun `lo que no sirve no se manda`() {
        assertNull(ActivityPlanTime.horas(""))
        assertNull(ActivityPlanTime.horas(null))
        assertNull(ActivityPlanTime.horas("0"))
        assertNull(ActivityPlanTime.horas("-3"))
        assertNull(ActivityPlanTime.horas("dos horas"))
        assertNull(ActivityPlanTime.horas("48"))
    }

    @Test
    fun `el campo solo deja numeros con un decimal`() {
        assertEquals("1.5", ActivityPlanTime.filtrarEntrada("1,5"))
        assertEquals("1.5", ActivityPlanTime.filtrarEntrada("1.5h"))
        assertEquals("1.53", ActivityPlanTime.filtrarEntrada("1.5.3"))
        assertEquals("", ActivityPlanTime.filtrarEntrada("abc"))
    }

    @Test
    fun `los minutos del alta se vuelven horas`() {
        assertEquals(1.5, ActivityPlanTime.horasDesdeMinutos(90)!!, 0.001)
        assertEquals(0.75, ActivityPlanTime.horasDesdeMinutos(45.0)!!, 0.001)
        assertNull(ActivityPlanTime.horasDesdeMinutos(0))
        assertNull(ActivityPlanTime.horasDesdeMinutos(null as Int?))
    }
}
