package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.MyActivityItemDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import mx.nexara.mobile.nativeapp.ui.console.activities.ActividadesUx.PrimaryKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ActividadesUxTest {

    private fun act(
        estatus: String? = "Pendiente",
        evidenceStatus: String? = null,
        porRepartir: Boolean? = null,
        despachador: Boolean? = null,
        aceptacion: String? = null,
        inicioRealAt: String? = null,
    ) = MyActivityItemDto(
        id = 1L,
        estatus = estatus,
        evidenceStatus = evidenceStatus,
        porRepartir = porRepartir,
        despachador = despachador,
        aceptacion = aceptacion,
        inicioRealAt = inicioRealAt,
    )

    @Test
    fun sinEvidenciaEsIniciarYAbreEvidencias() {
        val a = ActividadesUx.primaryAction(act())
        assertEquals(PrimaryKind.INICIAR, a.kind)
        assertEquals("Iniciar actividad", a.label)
        assertEquals("evidencias", a.tab)
        // API anterior al contrato: no hay a dónde mandar la hora; la foto de entrada la marca.
        assertFalse(a.marcaInicio)
    }

    @Test
    fun sinInicioRealLaUnicaAccionEsIniciarActividad() {
        val a = ActividadesUx.primaryAction(act(aceptacion = "PENDIENTE"))
        assertEquals(PrimaryKind.INICIAR, a.kind)
        assertEquals("Iniciar actividad", a.label)
        assertTrue(a.marcaInicio)
        // Aunque un compañero ya la tenga en proceso, a mí me falta iniciarla.
        val enProceso = ActividadesUx.primaryAction(act(estatus = "En Proceso", aceptacion = "ACEPTADA"))
        assertEquals(PrimaryKind.INICIAR, enProceso.kind)
        assertTrue(enProceso.marcaInicio)
    }

    @Test
    fun yaIniciadaSigueConLasEvidencias() {
        val a = ActividadesUx.primaryAction(
            act(estatus = "En Proceso", aceptacion = "ACEPTADA", inicioRealAt = "2026-09-18T15:00:00.000Z"),
        )
        assertEquals(PrimaryKind.CONTINUAR, a.kind)
        assertFalse(a.marcaInicio)
    }

    @Test
    fun fotoDeEntradaPendienteSigueSiendoIniciar() {
        val a = ActividadesUx.primaryAction(act(evidenceStatus = CoreActivityRules.STEP_ENTRY))
        assertEquals(PrimaryKind.INICIAR, a.kind)
    }

    @Test
    fun conPasosAvanzadosOEnProcesoEsContinuar() {
        listOf(CoreActivityRules.STEP_PHOTOS, CoreActivityRules.STEP_DATA, CoreActivityRules.STEP_EXIT).forEach { step ->
            val a = ActividadesUx.primaryAction(act(evidenceStatus = step))
            assertEquals(step, PrimaryKind.CONTINUAR, a.kind)
            assertEquals("Continuar evidencias", a.label)
        }
        assertEquals(PrimaryKind.CONTINUAR, ActividadesUx.primaryAction(act(estatus = "En Proceso")).kind)
    }

    @Test
    fun evidenciaCompletaOPorValidarSoloSeConsulta() {
        assertEquals(PrimaryKind.VER, ActividadesUx.primaryAction(act(evidenceStatus = CoreActivityRules.STEP_COMPLETED)).kind)
        assertEquals(PrimaryKind.VER, ActividadesUx.primaryAction(act(estatus = "Por Validar")).kind)
    }

    @Test
    fun rechazadaEsCorregir() {
        val a = ActividadesUx.primaryAction(act(estatus = "Rechazada", evidenceStatus = CoreActivityRules.STEP_COMPLETED))
        assertEquals(PrimaryKind.CORREGIR, a.kind)
        assertEquals("evidencias", a.tab)
    }

    @Test
    fun despachoNoAbreEvidencias() {
        val repartir = ActividadesUx.primaryAction(act(porRepartir = true, despachador = true))
        assertEquals(PrimaryKind.REPARTIR, repartir.kind)
        assertNull(repartir.tab)
        val soloReparte = ActividadesUx.primaryAction(act(despachador = true))
        assertEquals(PrimaryKind.ABRIR, soloReparte.kind)
        assertNull(soloReparte.tab)
    }

    private val equipo = listOf(
        TeamBoardUserDto(id = 1, status = "activo"),
        TeamBoardUserDto(id = 2, status = "atrasado"),
        TeamBoardUserDto(id = 3, status = null),
        TeamBoardUserDto(id = 4, status = "activo"),
        TeamBoardUserDto(id = 5, status = "libre"),
    )

    @Test
    fun filtroDePizarraRespetaElEstado() {
        assertEquals(5, ActividadesUx.filterBoard(equipo, null).size)
        assertEquals(listOf(1L, 4L), ActividadesUx.filterBoard(equipo, "activo").map { it.id })
        // Sin estado cuenta como «sin actividad», igual que la leyenda.
        assertEquals(listOf(3L), ActividadesUx.filterBoard(equipo, "sin_actividad").map { it.id })
        assertTrue(ActividadesUx.filterBoard(equipo, "inactivo").isEmpty())
    }

    @Test
    fun conteosYOpcionesDeFiltro() {
        val counts = ActividadesUx.boardCounts(equipo)
        assertEquals(2, counts["activo"])
        assertEquals(1, counts["sin_actividad"])
        val opciones = ActividadesUx.boardFilterOptions(counts)
        assertEquals(CoreActivityRules.BOARD_STATUS_ORDER, opciones)
        assertFalse("inactivo" in opciones)
        assertTrue("inactivo" in ActividadesUx.boardFilterOptions(mapOf("inactivo" to 1)))
        // Un filtro ya elegido no desaparece aunque se quede sin gente.
        assertTrue("inactivo" in ActividadesUx.boardFilterOptions(emptyMap(), selected = "inactivo"))
    }

    @Test
    fun resumenDelDiaEnUnaLinea() {
        assertEquals("Nada por hacer", ActividadesUx.resumenDia(0, 0, 0, 0))
        assertEquals("3 por hacer · 1 urgente · 2 hechas hoy", ActividadesUx.resumenDia(3, 1, 2, 0))
        assertEquals("1 por hacer · 2 urgentes · 1 hecha hoy · 4 en seguimiento", ActividadesUx.resumenDia(1, 2, 1, 4))
    }

    // ── La tira de cifras del encabezado ────────────────────────────────────

    @Test
    fun regla7SinNadaQueContarNoSePintanCeros() {
        assertTrue(ActividadesUx.metricas(porHacer = 0, urgentes = 0, hechasHoy = 0, seguimiento = 0).isEmpty())
    }

    @Test
    fun unDiaQueYaCerroSiEnsenaSusCifras() {
        // Cero por hacer pero dos hechas es información, no una fila de ceros.
        val metricas = ActividadesUx.metricas(porHacer = 0, urgentes = 0, hechasHoy = 2, seguimiento = 0)
        assertEquals(listOf(ActividadesUx.METRICA_POR_HACER, ActividadesUx.METRICA_HECHAS), metricas.map { it.clave })
        assertEquals("2", metricas.last().valor)
    }

    @Test
    fun seguimientoSoloApareceSiRepartioAlgo() {
        val sin = ActividadesUx.metricas(porHacer = 3, urgentes = 0, hechasHoy = 0, seguimiento = 0)
        assertFalse(sin.any { it.clave == ActividadesUx.METRICA_SEGUIMIENTO })
        val con = ActividadesUx.metricas(porHacer = 3, urgentes = 0, hechasHoy = 0, seguimiento = 2)
        assertEquals("2", con.first { it.clave == ActividadesUx.METRICA_SEGUIMIENTO }.valor)
    }

    @Test
    fun loUrgenteEsLoUnicoQueSeTine() {
        val tranquilo = ActividadesUx.metricas(porHacer = 4, urgentes = 0, hechasHoy = 1, seguimiento = 0)
        assertTrue(tranquilo.all { it.color == null })
        assertEquals("en tu cola", tranquilo.first().pista)

        val urgente = ActividadesUx.metricas(porHacer = 4, urgentes = 2, hechasHoy = 0, seguimiento = 0)
        assertEquals(CoreActivityRules.ROJO, urgente.first().color)
        assertEquals("2 urgentes", urgente.first().pista)
    }

    @Test
    fun elEncabezadoDiceQueHacer() {
        assertEquals("Cargando tus actividades…", ActividadesUx.instruccionDia(0, cargando = true))
        assertEquals("Nada pendiente por ahora.", ActividadesUx.instruccionDia(0, cargando = false))
        assertEquals("Tienes 1 actividad. Empieza por ella.", ActividadesUx.instruccionDia(1, cargando = false))
        assertEquals("Tienes 5 por hacer. Empieza por la #1.", ActividadesUx.instruccionDia(5, cargando = false))
    }

    // ── Color con significado (reglas 3 y 6) ────────────────────────────────

    @Test
    fun elFlujoNormalVaEnGris() {
        assertNull(ActividadesUx.colorEstatus("En Proceso"))
        assertNull(ActividadesUx.colorEstatus("Por Validar"))
        assertNull(ActividadesUx.colorEstatus("Pendiente"))
        assertNull(ActividadesUx.colorEstatus(null))
    }

    @Test
    fun loQuePideAccionOCierraSiLlevaColor() {
        assertEquals(CoreActivityRules.ROJO, ActividadesUx.colorEstatus("RECHAZADA"))
        assertEquals(CoreActivityRules.VERDE, ActividadesUx.colorEstatus("Finalizada"))
    }

    @Test
    fun elSemaforoEnVerdeNoSePinta() {
        assertEquals(CoreActivityRules.ROJO, ActividadesUx.colorSemaforo("rojo"))
        assertEquals(CoreActivityRules.NARANJA, ActividadesUx.colorSemaforo("amarillo"))
        assertNull(ActividadesUx.colorSemaforo("verde"))
        assertNull(ActividadesUx.colorSemaforo(null))
    }

    @Test
    fun soloLaPrioridadUrgenteSeTine() {
        assertEquals(CoreActivityRules.ROJO, ActividadesUx.colorPrioridad("alta"))
        assertNull(ActividadesUx.colorPrioridad("media"))
        assertNull(ActividadesUx.colorPrioridad("baja"))
        assertNull(ActividadesUx.colorPrioridad(null))
    }
}
