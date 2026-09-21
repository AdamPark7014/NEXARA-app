package mx.nexara.mobile.nativeapp.ui.console.screens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AttendanceUxTest {

    private fun persona(
        id: Long,
        estado: AttendanceEstado,
        entrada: String? = null,
        salida: String? = null,
    ) = AttendancePersona(
        userId = id,
        nombre = "Persona $id",
        subtitulo = "Técnico",
        estado = estado,
        entradaIso = entrada,
        salidaIso = salida,
        fotoEntrada = null,
        fotoSalida = null,
        mapaEntrada = null,
        mapaSalida = null,
    )

    // ── Regla 7: una fila de ceros no informa ───────────────────────────────

    @Test
    fun sinNadieNoSePintanCifrasNiFiltros() {
        assertTrue(AttendanceUx.metricas(emptyList()).isEmpty())
        assertTrue(AttendanceUx.filtros(emptyList()).isEmpty())
    }

    @Test
    fun unDiaEnQueFaltaronTodosSiSeEnsena() {
        // El conteo real es 3: que las demás cifras den cero no lo esconde.
        val personas = (1L..3L).map { persona(it, AttendanceEstado.AUSENTE) }
        val metricas = AttendanceUx.metricas(personas)
        assertEquals(4, metricas.size)
        assertEquals("3", metricas.first { it.clave == AttendanceUx.METRICA_TOTAL }.valor)
        assertEquals("0", metricas.first { it.clave == AttendanceUx.METRICA_EN_JORNADA }.valor)
    }

    // ── Color con significado ───────────────────────────────────────────────

    @Test
    fun sinFaltasLaTiraVaEnGris() {
        val personas = listOf(
            persona(1, AttendanceEstado.PRESENTE),
            persona(2, AttendanceEstado.COMPLETO),
        )
        assertTrue(AttendanceUx.metricas(personas).all { it.color == null })
    }

    @Test
    fun conFaltasSoloSeTineLaCeldaDeFaltas() {
        val personas = listOf(
            persona(1, AttendanceEstado.PRESENTE),
            persona(2, AttendanceEstado.AUSENTE),
        )
        val metricas = AttendanceUx.metricas(personas)
        assertEquals(
            listOf(AttendanceUx.METRICA_SIN_CHECADA),
            metricas.filter { it.color != null }.map { it.clave },
        )
        assertEquals(
            AttendanceUx.ROJO,
            metricas.first { it.clave == AttendanceUx.METRICA_SIN_CHECADA }.color,
        )
    }

    // ── La barra de filtros ─────────────────────────────────────────────────

    @Test
    fun faltaJustificadaSoloAparecCuandoHayAlguna() {
        val sinJustificadas = listOf(persona(1, AttendanceEstado.PRESENTE))
        assertTrue(
            AttendanceUx.filtros(sinJustificadas).none { it.estado == AttendanceEstado.JUSTIFICADA },
        )

        val conJustificada = sinJustificadas + persona(2, AttendanceEstado.JUSTIFICADA)
        assertTrue(
            AttendanceUx.filtros(conJustificada).any { it.estado == AttendanceEstado.JUSTIFICADA },
        )
    }

    @Test
    fun laBarraEmpiezaPorTodosConElTotal() {
        val personas = listOf(persona(1, AttendanceEstado.PRESENTE), persona(2, AttendanceEstado.COMPLETO))
        val primero = AttendanceUx.filtros(personas).first()
        assertNull(primero.estado)
        assertEquals("Todos", primero.etiqueta)
        assertEquals(2, primero.conteo)
    }

    @Test
    fun laCeldaYLaPastillaSonElMismoFiltro() {
        AttendanceEstado.entries.forEach { estado ->
            val clave = AttendanceUx.metricaDeEstado(estado)
            if (clave != null) assertEquals(estado, AttendanceUx.estadoDeMetrica(clave))
        }
        // «Equipo» no filtra nada: es el total.
        assertNull(AttendanceUx.estadoDeMetrica(AttendanceUx.METRICA_TOTAL))
        assertNull(AttendanceUx.metricaDeEstado(AttendanceEstado.JUSTIFICADA))
    }

    // ── El reloj del día ────────────────────────────────────────────────────

    @Test
    fun laJornadaAbiertaCuentaContraLaHoraActual() {
        val ahora = 1_000_000L
        val abierta = persona(1, AttendanceEstado.PRESENTE, entrada = "e")
        val total = AttendanceUx.jornadaEquipoMs(
            personas = listOf(abierta),
            ahoraMs = ahora,
            entradaMs = { ahora - 3_600_000L },
            salidaMs = { null },
        )
        assertEquals(3_600_000L, total)
    }

    @Test
    fun laJornadaCerradaCuentaSuDuracionYLaAusenteNoSuma() {
        val cerrada = persona(1, AttendanceEstado.COMPLETO, entrada = "e", salida = "s")
        val ausente = persona(2, AttendanceEstado.AUSENTE)
        val total = AttendanceUx.jornadaEquipoMs(
            personas = listOf(cerrada, ausente),
            ahoraMs = 9_999_999L,
            entradaMs = { p -> if (p.userId == 1L) 0L else null },
            salidaMs = { p -> if (p.userId == 1L) 7_200_000L else null },
        )
        assertEquals(7_200_000L, total)
    }

    @Test
    fun elRelojLateSiHayAlguienDentroOSiEsMiJornada() {
        val cerrados = listOf(persona(1, AttendanceEstado.COMPLETO))
        assertTrue(AttendanceUx.hayJornadaAbierta(cerrados, miJornadaAbierta = true))
        assertTrue(
            AttendanceUx.hayJornadaAbierta(
                cerrados + persona(2, AttendanceEstado.PRESENTE),
                miJornadaAbierta = false,
            ),
        )
        assertTrue(!AttendanceUx.hayJornadaAbierta(cerrados, miJornadaAbierta = false))
    }

    @Test
    fun elTituloDiceQueSeEstaViendo() {
        assertEquals("Equipo del día (8)", AttendanceUx.tituloLista(null, 8))
        assertEquals("Sin checada (2)", AttendanceUx.tituloLista(AttendanceEstado.AUSENTE, 2))
    }
}
