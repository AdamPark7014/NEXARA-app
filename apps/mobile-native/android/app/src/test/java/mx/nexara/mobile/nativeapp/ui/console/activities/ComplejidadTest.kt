package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.TiemposTipicosDto
import mx.nexara.mobile.nativeapp.data.api.TipicoDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Espejo de apps/web/lib/complejidad.ts y las reglas de ComplejidadCampo / OpsActivityForm. */
class ComplejidadTest {
    private val c = Complejidad
    private val k = CoreActivityKinds

    private val tiempos = TiemposTipicosDto(
        clave = "tarea:instalacion",
        total = TipicoDto(muestras = 9, medianaMin = 150),
        porComplejidad = mapOf(
            "BASICA" to TipicoDto(muestras = 4, medianaMin = 60),
            "ESTANDAR" to TipicoDto(muestras = 3, medianaMin = 140),
            "COMPLEJA" to TipicoDto(muestras = 2, medianaMin = null),
            "CRITICA" to TipicoDto(muestras = 0, medianaMin = null),
        ),
    )

    @Test
    fun fourLevelsInOrder() {
        assertEquals(listOf("BASICA", "ESTANDAR", "COMPLEJA", "CRITICA"), c.NIVELES.map { it.id })
        assertEquals("Cliente detenido", c.nivel("CRITICA")?.ayuda)
        assertFalse(c.esComplejidad("MEDIA"))
        assertFalse(c.esComplejidad(null))
    }

    @Test
    fun minutesLikeTheWeb() {
        assertEquals("45 min", c.formatoMinutos(45))
        assertEquals("2 h", c.formatoMinutos(120))
        assertEquals("3 h 40 min", c.formatoMinutos(220))
    }

    @Test
    fun visibleInTareaOnlyAfterPickingItsType() {
        val tarea = k.initialForm("tarea", 1L, null)
        assertFalse(c.visible("tarea", tarea))
        val instalacion = k.pickTareaTipo(tarea, "instalacion")
        assertTrue(c.visible("tarea", instalacion))
        assertEquals("Instalación", c.tipoParaComplejidad("tarea", instalacion))
        // El texto libre viejo no se manda como tipo.
        assertNull(c.tipoParaComplejidad("tarea", tarea.copy(ticketType = "OTRO", ticketTypeCustom = "Visita")))

        val servicio = k.initialForm("servicio", 1L, null).copy(ticketType = "CORRECTIVO")
        assertTrue(c.visible("servicio", servicio))
        assertEquals("CORRECTIVO", c.tipoParaComplejidad("servicio", servicio))
        assertEquals("Servicio correctivo", c.etiquetaTipoTrabajo("servicio", "CORRECTIVO"))
        assertTrue(c.visible("obra", k.initialForm("obra", 1L, null)))
        assertNull(c.tipoParaComplejidad("obra", k.initialForm("obra", 1L, null)))
        assertEquals("Obra", c.etiquetaTipoTrabajo("obra", null))
    }

    @Test
    fun typicalUsesTheLevelOrFallsBackToTheWholeType() {
        val del = c.tipicoPara(tiempos, "ESTANDAR")
        assertEquals(Complejidad.Tipico(140, 3, delNivel = true), del)
        assertEquals("Lo típico en Instalación · Estándar: 2 h 20 min (3 anteriores).", c.textoTipico("Instalación", "ESTANDAR", del))

        val sinNivel = c.tipicoPara(tiempos, "COMPLEJA")
        assertEquals(Complejidad.Tipico(150, 9, delNivel = false), sinNivel)
        assertEquals("Lo típico en Instalación: 2 h 30 min (9 anteriores).", c.textoTipico("Instalación", "COMPLEJA", sinNivel))

        assertEquals(Complejidad.Tipico(150, 9, delNivel = false), c.tipicoPara(tiempos, null))
        assertNull(c.tipicoPara(null, "BASICA"))
        assertNull(c.tipicoPara(TiemposTipicosDto(total = TipicoDto(1, null)), null))
        assertEquals(60, c.minutosDelNivel(tiempos, "BASICA"))
        assertNull(c.minutosDelNivel(tiempos, "CRITICA"))
        assertEquals(
            "Lo típico en Junta: 45 min (1 anterior).",
            c.textoTipico("Junta", null, Complejidad.Tipico(45, 1, delNivel = false)),
        )
    }

    @Test
    fun suggestionTakesTheLevelOnlyIfNobodyChose() {
        val form = k.initialForm("obra", 1L, null)
        val solo = c.aplicarSugerencia(form, "COMPLEJA", elegidaAMano = false)
        assertEquals("COMPLEJA", solo.complejidad)
        assertEquals("COMPLEJA", solo.complejidadSugerida)

        val elegida = c.aplicarSugerencia(form.copy(complejidad = "BASICA"), "COMPLEJA", elegidaAMano = true)
        assertEquals("BASICA", elegida.complejidad)
        assertEquals("COMPLEJA", elegida.complejidadSugerida)
    }

    @Test
    fun suggestionAndDetailTexts() {
        assertEquals(
            "Sugerencia: Compleja. Son 12 nodos en dos pisos. Tú decides; si la cambias, queda registrado.",
            c.textoSugerencia("COMPLEJA", "Son 12 nodos en dos pisos.", "COMPLEJA"),
        )
        assertEquals(
            "Sugerencia: Compleja. Elegiste otra: quedan las dos registradas.",
            c.textoSugerencia("COMPLEJA", "  ", "BASICA"),
        )
        assertEquals("Compleja" to "La IA sugirió crítica", c.detalle("COMPLEJA", "CRITICA"))
        assertEquals("Básica" to null, c.detalle("BASICA", "BASICA"))
        assertNull(c.detalle(null, "CRITICA"))
    }
}
