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
}
