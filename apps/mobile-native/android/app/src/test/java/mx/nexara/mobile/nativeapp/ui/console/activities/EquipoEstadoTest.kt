package mx.nexara.mobile.nativeapp.ui.console.activities

import java.time.Instant
import mx.nexara.mobile.nativeapp.data.api.TeamBoardActivityDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardLastFinishedDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardOpenActivityDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EquipoEstadoTest {

    private fun persona(
        id: Long = 1L,
        nombre: String? = "Luis Pérez",
        status: String? = "activo",
        abiertas: List<TeamBoardOpenActivityDto> = emptyList(),
        actual: TeamBoardActivityDto? = null,
        ultima: TeamBoardLastFinishedDto? = null,
        enCorreccion: Int? = null,
        enEspera: Int? = null,
        lateMinutes: Double? = null,
    ) = TeamBoardUserDto(
        id = id,
        nombre = nombre,
        status = status,
        openActivities = abiertas.takeIf { it.isNotEmpty() },
        currentActivity = actual,
        lastFinished = ultima,
        enCorreccion = enCorreccion,
        enEsperaAprobacion = enEspera,
        currentLateMinutes = lateMinutes,
    )

    // ── Los cinco estados del API en tres aros ──────────────────────────────

    @Test
    fun activoTrabaja() {
        assertEquals(EquipoAro.TRABAJANDO, EquipoEstado.aro("activo"))
    }

    @Test
    fun libreEsLibre() {
        assertEquals(EquipoAro.LIBRE, EquipoEstado.aro("libre"))
    }

    @Test
    fun atrasadoYSinActividadPidenLoMismo() {
        // Comparten ámbar a propósito: en los dos casos hay que ir a ver.
        assertEquals(EquipoAro.RETRASO, EquipoEstado.aro("atrasado"))
        assertEquals(EquipoAro.RETRASO, EquipoEstado.aro("sin_actividad"))
        assertEquals(EquipoAro.RETRASO, EquipoEstado.aro("inactivo"))
    }

    @Test
    fun loDesconocidoTambienSeMira() {
        assertEquals(EquipoAro.RETRASO, EquipoEstado.aro(null))
        assertEquals(EquipoAro.RETRASO, EquipoEstado.aro("loquesea"))
    }

    // ── Qué hace y en qué situación ─────────────────────────────────────────

    @Test
    fun queHaceTomaPrimeroLaActividadAbierta() {
        val u = persona(
            abiertas = listOf(TeamBoardOpenActivityDto(id = 9L, titulo = "Cambio de switch")),
            actual = TeamBoardActivityDto(id = 8L, titulo = "Otra cosa"),
        )
        assertEquals("Cambio de switch", EquipoEstado.queHace(u))
    }

    @Test
    fun sinNadaAbiertoDiceLaUltimaQueTermino() {
        val u = persona(
            status = "libre",
            ultima = TeamBoardLastFinishedDto(id = 3L, titulo = "Mantenimiento CCTV"),
        )
        assertEquals("Última: Mantenimiento CCTV", EquipoEstado.queHace(u))
    }

    @Test
    fun sinNadaEnAbsolutoLoDiceClaro() {
        assertEquals("Sin actividad asignada", EquipoEstado.queHace(persona(status = "sin_actividad")))
    }

    @Test
    fun contextoJuntaFolioCargaYSituacion() {
        val u = persona(
            status = "atrasado",
            lateMinutes = 80.0,
            abiertas = listOf(
                TeamBoardOpenActivityDto(id = 9L, titulo = "Cambio de switch", anNumber = "AN-1042", assignmentCharge = "despacho"),
            ),
        )
        val texto = EquipoEstado.contexto(u, Instant.parse("2026-09-21T10:00:00Z"))
        assertEquals("AN-1042 · Despacho · Atrasado 1 h 20 min", texto)
    }

    @Test
    fun laCargaDesconocidaNoSeNombra() {
        assertEquals(null, EquipoEstado.cargaTexto("apoyo"))
        assertEquals("Ejecución", EquipoEstado.cargaTexto("ejecucion"))
    }

    // ── Marcas ──────────────────────────────────────────────────────────────

    @Test
    fun soloSeMarcaLoQueDeVerdadPasa() {
        assertTrue(EquipoEstado.marcas(persona(), meId = 99L).isEmpty())
    }

    @Test
    fun marcaTuCorrigiendoYEnEspera() {
        val marcas = EquipoEstado.marcas(persona(id = 7L, enCorreccion = 1, enEspera = 2), meId = 7L)
        assertEquals(listOf("Tú", "Corrigiendo", "2 en espera"), marcas.map { it.texto })
    }

    @Test
    fun unaSolaEnEsperaNoDicePlural() {
        val marcas = EquipoEstado.marcas(persona(enEspera = 1), meId = null)
        assertEquals(listOf("1 en espera"), marcas.map { it.texto })
    }

    // ── Cifras y filtros ────────────────────────────────────────────────────

    @Test
    fun regla7ConLaPizarraVaciaNoSePintanCeros() {
        assertTrue(EquipoEstado.metricas(emptyList()).isEmpty())
        assertTrue(EquipoEstado.filtros(emptyList()).isEmpty())
    }

    @Test
    fun laTiraCuentaLosTresGrupos() {
        val equipo = listOf(
            persona(id = 1, status = "activo"),
            persona(id = 2, status = "activo"),
            persona(id = 3, status = "atrasado"),
            persona(id = 4, status = "libre"),
            persona(id = 5, status = "sin_actividad"),
        )
        val metricas = EquipoEstado.metricas(equipo)
        assertEquals(listOf("2", "2", "1"), metricas.map { it.valor })
        assertEquals("de 5 en el equipo", metricas.first().pista)
    }

    @Test
    fun soloSeTineLoQuePideAccion() {
        val sanos = listOf(persona(id = 1, status = "activo"), persona(id = 2, status = "libre"))
        assertTrue(EquipoEstado.metricas(sanos).all { it.color == null })

        val conRetraso = sanos + persona(id = 3, status = "atrasado")
        val retraso = EquipoEstado.metricas(conRetraso).first { it.clave == EquipoAro.RETRASO.clave }
        assertEquals(CoreActivityRules.NARANJA, retraso.color)
    }

    @Test
    fun filtrarPorAroDejaSoloAEsaGente() {
        val equipo = listOf(
            persona(id = 1, status = "activo"),
            persona(id = 2, status = "atrasado"),
            persona(id = 3, status = "sin_actividad"),
        )
        assertEquals(3, EquipoEstado.filtrar(equipo, null).size)
        assertEquals(listOf(2L, 3L), EquipoEstado.filtrar(equipo, EquipoAro.RETRASO).map { it.id })
        assertTrue(EquipoEstado.filtrar(equipo, EquipoAro.LIBRE).isEmpty())
    }

    @Test
    fun laBarraEmpiezaPorTodosYLosCuatroSonUnaSolaFila() {
        val equipo = listOf(persona(id = 1, status = "activo"), persona(id = 2, status = "libre"))
        val filtros = EquipoEstado.filtros(equipo)
        assertEquals(4, filtros.size)
        assertEquals("Todos", filtros.first().etiqueta)
        assertEquals(2, filtros.first().conteo)
    }
}
