package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.CelebracionDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Aviso de cumpleaños y aniversarios arriba de Actividades. La edad nunca aparece. */
class CelebracionesTest {

    private fun cumple(nombre: String, yo: Boolean = false, anios: Int? = null) =
        CelebracionDto(userId = nombre.length.toLong(), nombre = nombre, tipo = "cumpleanos", anios = anios, soyYo = yo)

    private fun aniversario(nombre: String, anios: Int?, yo: Boolean = false) =
        CelebracionDto(userId = nombre.length.toLong(), nombre = nombre, tipo = "aniversario", anios = anios, soyYo = yo)

    @Test
    fun miCumpleanosMeFelicitaPorMiPrimerNombre() {
        assertEquals(
            "¡Feliz cumpleaños, Carolina! 🎂 Todo el equipo te desea un gran día",
            Celebraciones.linea(cumple("carolina Juárez Álvarez", yo = true)),
        )
    }

    @Test
    fun cumpleanosDeOtroSinEdad() {
        // Aunque el servidor mandara años en un cumpleaños, no se muestran.
        val linea = Celebraciones.linea(cumple("Ana López Pérez", anios = 30))
        assertEquals("Hoy es cumpleaños de Ana López 🎂", linea)
        assertFalse(linea.contains("30"))
        assertFalse(Celebraciones.etiqueta(cumple("Ana López", anios = 30)).contains("30"))
    }

    @Test
    fun aniversarioDiceLosAnosEnNexara() {
        assertEquals("Pedro Ruiz cumple 3 años en NEXARA 🎉", Celebraciones.linea(aniversario("Pedro Ruiz", 3)))
        assertEquals("Pedro Ruiz cumple 1 año en NEXARA 🎉", Celebraciones.linea(aniversario("Pedro Ruiz", 1)))
        assertEquals("Hoy es aniversario de Pedro Ruiz en NEXARA 🎉", Celebraciones.linea(aniversario("Pedro Ruiz", null)))
        assertEquals("¡Felicidades, Pedro! 🎉 Hoy cumples 2 años en NEXARA", Celebraciones.linea(aniversario("Pedro", 2, yo = true)))
    }

    @Test
    fun sinCelebracionesNoHayAviso() {
        assertNull(Celebraciones.titulo(emptyList()))
        assertNull(Celebraciones.titulo(listOf(CelebracionDto(nombre = "X", tipo = "otro"))))
        assertTrue(Celebraciones.enFila(emptyList()).isEmpty())
    }

    @Test
    fun variasVanEnFilaYLaMiaEncabeza() {
        val otros = listOf(cumple("Ana López"), aniversario("Pedro Ruiz", 4))
        assertEquals("Hoy celebramos en el equipo 🎉", Celebraciones.titulo(otros))
        assertEquals(2, Celebraciones.enFila(otros).size)
        assertEquals("Pedro Ruiz · 4 años en NEXARA 🎉", Celebraciones.etiqueta(otros[1]))

        val conLaMia = otros + cumple("Luis Mora", yo = true)
        assertEquals("¡Feliz cumpleaños, Luis! 🎂 Todo el equipo te desea un gran día", Celebraciones.titulo(conLaMia))
        assertEquals(listOf("Ana López", "Pedro Ruiz"), Celebraciones.enFila(conLaMia).map { it.nombre })
    }

    @Test
    fun unaSolaNoRepiteFila() {
        val una = listOf(cumple("Ana López"))
        assertEquals("Hoy es cumpleaños de Ana López 🎂", Celebraciones.titulo(una))
        assertTrue(Celebraciones.enFila(una).isEmpty())
        assertTrue(Celebraciones.soloCumpleanos(una))
        assertFalse(Celebraciones.soloCumpleanos(una + aniversario("Pedro", 2)))
    }

    @Test
    fun cerrarDuraSoloEseDia() {
        assertTrue(Celebraciones.cerradoHoy("2026-09-17", "2026-09-17"))
        assertFalse(Celebraciones.cerradoHoy("2026-09-16", "2026-09-17"))
        assertFalse(Celebraciones.cerradoHoy(null, "2026-09-17"))
        assertFalse(Celebraciones.cerradoHoy(null, null))
    }
}
