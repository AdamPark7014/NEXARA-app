package mx.nexara.mobile.nativeapp.ui.console.more

import mx.nexara.mobile.nativeapp.data.api.ProyectoAvanceDto
import mx.nexara.mobile.nativeapp.data.api.ProyectoClienteDto
import mx.nexara.mobile.nativeapp.data.api.ProyectoHitoDto
import mx.nexara.mobile.nativeapp.data.api.ProyectoPersonaDto
import mx.nexara.mobile.nativeapp.data.api.ProyectoResumenDto
import mx.nexara.mobile.nativeapp.data.api.ProyectoResumenSaludDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * En proyectos lo que no puede fallar es el semáforo: de él depende el orden de
 * la lista y qué ve primero quien abre la pantalla con el teléfono en la mano.
 */
class ProyectosRulesTest {

    private fun proyecto(
        id: Long = 1L,
        titulo: String? = "Enlace Puebla",
        salud: String? = "EN_TIEMPO",
        etiqueta: String? = null,
        enRiesgo: Boolean? = false,
        diasDeRetraso: Int? = 0,
        diasRestantes: Int? = null,
        motivo: String? = null,
        avance: ProyectoAvanceDto? = null,
        cliente: String? = "ACME",
        responsable: String? = "Ana",
        hito: ProyectoHitoDto? = null,
        equipoCount: Int? = null,
    ) = ProyectoResumenDto(
        id = id,
        title = titulo,
        client = cliente?.let { ProyectoClienteDto(id = 9L, name = it) },
        responsable = responsable?.let { ProyectoPersonaDto(id = 8L, nombre = it) },
        proximoHito = hito,
        equipoCount = equipoCount,
        resumen = ProyectoResumenSaludDto(
            salud = salud,
            etiqueta = etiqueta,
            enRiesgo = enRiesgo,
            diasDeRetraso = diasDeRetraso,
            diasRestantes = diasRestantes,
            motivo = motivo,
            avance = avance,
        ),
    )

    // ── Salud ────────────────────────────────────────────────────────────────

    @Test
    fun theHealthIsReadFromTheServer() {
        assertEquals(ProyectosRules.Salud.EN_RIESGO, ProyectosRules.salud("EN_RIESGO"))
        assertEquals(ProyectosRules.Salud.RETRASADO, ProyectosRules.salud(" retrasado "))
        assertEquals(ProyectosRules.Salud.DESCONOCIDA, ProyectosRules.salud(null))
        assertEquals(ProyectosRules.Salud.DESCONOCIDA, ProyectosRules.salud("INVENTADA"))
    }

    /** Un estado que la app no conoce no se pinta como si fuera bueno. */
    @Test
    fun anUnknownHealthIsNotSilentlyGood() {
        assertEquals("Sin clasificar", ProyectosRules.etiquetaSalud(proyecto(salud = "NUEVO_ESTADO")))
    }

    @Test
    fun theServerLabelWinsWhenItComes() {
        assertEquals("En tiempo", ProyectosRules.etiquetaSalud(proyecto(etiqueta = "En tiempo")))
        assertEquals("En riesgo", ProyectosRules.etiquetaSalud(proyecto(salud = "EN_RIESGO", etiqueta = "  ")))
    }

    // ── Orden ────────────────────────────────────────────────────────────────

    /** Lo que arde primero: nadie baja veinte tarjetas buscando el retrasado. */
    @Test
    fun whatIsBurningComesFirst() {
        val lista = listOf(
            proyecto(1, "Terminado", salud = "TERMINADO"),
            proyecto(2, "En tiempo", salud = "EN_TIEMPO"),
            proyecto(3, "Retrasado", salud = "RETRASADO"),
            proyecto(4, "Riesgo", salud = "EN_RIESGO"),
            proyecto(5, "Planeado", salud = "PLANEADO"),
        )
        assertEquals(
            listOf("Retrasado", "Riesgo", "En tiempo", "Planeado", "Terminado"),
            ProyectosRules.ordenar(lista).map { it.title },
        )
    }

    // ── Filtros ──────────────────────────────────────────────────────────────

    @Test
    fun attentionCatchesLateAtRiskAndTheServerFlag() {
        assertTrue(ProyectosRules.cumple(proyecto(salud = "RETRASADO"), ProyectosRules.Filtro.ATENCION))
        assertTrue(ProyectosRules.cumple(proyecto(salud = "EN_RIESGO"), ProyectosRules.Filtro.ATENCION))
        // La bandera del servidor manda aunque la salud diga otra cosa.
        assertTrue(
            ProyectosRules.cumple(
                proyecto(salud = "EN_TIEMPO", enRiesgo = true),
                ProyectosRules.Filtro.ATENCION,
            ),
        )
        assertTrue(!ProyectosRules.cumple(proyecto(salud = "EN_TIEMPO"), ProyectosRules.Filtro.ATENCION))
    }

    @Test
    fun activeLeavesOutWhatIsClosed() {
        assertTrue(ProyectosRules.cumple(proyecto(salud = "EN_TIEMPO"), ProyectosRules.Filtro.ACTIVOS))
        assertTrue(!ProyectosRules.cumple(proyecto(salud = "TERMINADO"), ProyectosRules.Filtro.ACTIVOS))
        assertTrue(!ProyectosRules.cumple(proyecto(salud = "CANCELADO"), ProyectosRules.Filtro.ACTIVOS))
        assertTrue(ProyectosRules.cumple(proyecto(salud = "CANCELADO"), ProyectosRules.Filtro.CERRADOS))
    }

    @Test
    fun filterAndSearchWorkTogether() {
        val lista = listOf(
            proyecto(1, "Enlace Puebla", salud = "RETRASADO", cliente = "ACME"),
            proyecto(2, "Cámaras Angelópolis", salud = "RETRASADO", cliente = "Otro"),
            proyecto(3, "Cerrado viejo", salud = "TERMINADO", cliente = "ACME"),
        )
        assertEquals(
            listOf("Enlace Puebla"),
            ProyectosRules.aplicar(lista, ProyectosRules.Filtro.ATENCION, "acme").map { it.title },
        )
        assertEquals(2, ProyectosRules.aplicar(lista, ProyectosRules.Filtro.ATENCION, "").size)
        assertEquals(3, ProyectosRules.aplicar(lista, ProyectosRules.Filtro.TODOS, "  ").size)
    }

    @Test
    fun theChipsCarryTheirCount() {
        val lista = listOf(
            proyecto(1, salud = "RETRASADO"),
            proyecto(2, salud = "EN_TIEMPO"),
            proyecto(3, salud = "TERMINADO"),
        )
        val conteos = ProyectosRules.conteos(lista)
        assertEquals(3, conteos[ProyectosRules.Filtro.TODOS])
        assertEquals(1, conteos[ProyectosRules.Filtro.ATENCION])
        assertEquals(2, conteos[ProyectosRules.Filtro.ACTIVOS])
        assertEquals(1, conteos[ProyectosRules.Filtro.CERRADOS])
    }

    // ── Avance ───────────────────────────────────────────────────────────────

    /** El avance desconocido no es cero: una barra vacía diría «fracaso». */
    @Test
    fun anUnknownProgressIsNotZero() {
        assertNull(ProyectosRules.avancePct(proyecto(avance = null)))
        assertNull(ProyectosRules.avancePct(proyecto(avance = ProyectoAvanceDto(porcentaje = null))))
        assertEquals(40, ProyectosRules.avancePct(proyecto(avance = ProyectoAvanceDto(porcentaje = 40))))
        // Un porcentaje corrupto se acota en vez de desbordar la barra.
        assertEquals(100, ProyectosRules.avancePct(proyecto(avance = ProyectoAvanceDto(porcentaje = 180))))
    }

    @Test
    fun theProgressCaptionSaysWhereItComesFrom() {
        assertEquals("Sin avance que calcular", ProyectosRules.avanceTexto(proyecto(avance = null)))
        assertEquals(
            "Sin actividades ligadas",
            ProyectosRules.avanceTexto(proyecto(avance = ProyectoAvanceDto(total = 0, origen = "ninguno"))),
        )
        assertEquals(
            "Avance por cronograma",
            ProyectosRules.avanceTexto(proyecto(avance = ProyectoAvanceDto(total = 0, origen = "hitos"))),
        )
        assertEquals(
            "8 de 12 actividades",
            ProyectosRules.avanceTexto(proyecto(avance = ProyectoAvanceDto(total = 12, cerradas = 8))),
        )
    }

    // ── Plazo ────────────────────────────────────────────────────────────────

    @Test
    fun theDeadlineLineIsReadyToShowAClient() {
        assertEquals("Retrasado 6 días", ProyectosRules.plazoTexto(proyecto(diasDeRetraso = 6)))
        assertEquals("Retrasado 1 día", ProyectosRules.plazoTexto(proyecto(diasDeRetraso = 1)))
        assertEquals("Quedan 3 días", ProyectosRules.plazoTexto(proyecto(diasRestantes = 3)))
        assertEquals("Queda 1 día", ProyectosRules.plazoTexto(proyecto(diasRestantes = 1)))
        assertEquals("Vence hoy", ProyectosRules.plazoTexto(proyecto(diasRestantes = 0)))
        assertEquals("Sin fecha de fin", ProyectosRules.plazoTexto(proyecto()))
        assertEquals("Falta el alcance", ProyectosRules.plazoTexto(proyecto(motivo = "Falta el alcance")))
    }

    // ── Próximo hito y contexto ──────────────────────────────────────────────

    @Test
    fun theNextMilestoneOnlyAppearsIfItHasAName() {
        assertNull(ProyectosRules.proximoHitoTexto(proyecto(hito = null)))
        assertNull(ProyectosRules.proximoHitoTexto(proyecto(hito = ProyectoHitoDto(name = "  "))))
        assertEquals(
            "Próximo: Entrega",
            ProyectosRules.proximoHitoTexto(proyecto(hito = ProyectoHitoDto(name = "Entrega"))),
        )
    }

    @Test
    fun theDateIsShortOrAbsentButNeverInvented() {
        assertNull(ProyectosRules.fechaCorta(null))
        assertNull(ProyectosRules.fechaCorta("mañana"))
        assertNull(ProyectosRules.fechaCorta("2026-13-45"))
        assertTrue(ProyectosRules.fechaCorta("2026-09-25")!!.contains("25"))
        // Con hora también: el API manda ISO completo en varios sitios.
        assertTrue(ProyectosRules.fechaCorta("2026-09-25T10:00:00.000Z")!!.contains("25"))
    }

    @Test
    fun theContextLineJoinsClientAndOwner() {
        assertEquals("ACME · Ana", ProyectosRules.contextoTexto(proyecto()))
        assertEquals("ACME", ProyectosRules.contextoTexto(proyecto(responsable = null)))
        assertEquals(
            "Sin cliente ni responsable",
            ProyectosRules.contextoTexto(proyecto(cliente = null, responsable = null)),
        )
    }
}
