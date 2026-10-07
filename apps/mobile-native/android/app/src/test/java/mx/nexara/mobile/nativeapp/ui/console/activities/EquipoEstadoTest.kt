package mx.nexara.mobile.nativeapp.ui.console.activities

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import java.time.Instant
import mx.nexara.mobile.nativeapp.data.api.TeamBoardActivityDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardLastFinishedDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardOpenActivityDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
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

    // ── Mi equipo con detalle (07-10) ───────────────────────────────────────
    // Miércoles 07-10-2026, 12:20 en México (UTC-6, sin horario de verano).

    private val ahora = Instant.parse("2026-10-07T18:20:00Z")

    /** Como la API nueva: `entradaHoyAt` siempre viene (null = no checó hoy). */
    private fun hoy(
        id: Long,
        nombre: String,
        status: String = "sin_actividad",
        entrada: String? = null,
        salida: String? = null,
        idle: String? = null,
        ultima: TeamBoardLastFinishedDto? = null,
        actual: TeamBoardActivityDto? = null,
        lateMinutes: Double? = null,
        motivo: String? = null,
    ) = TeamBoardUserDto(
        id = id,
        nombre = nombre,
        status = status,
        entradaHoyAtJson = entrada,
        salidaHoyAt = salida,
        idleSinceAt = idle,
        lastFinished = ultima,
        currentActivity = actual,
        currentLateMinutes = lateMinutes,
        currentLateReason = motivo,
    )

    /** La API vieja no manda `entradaHoyAt`: Moshi deja la marca de «no vino». */
    @Test
    fun moshiDistingueUnaEntradaNulaDeUnaQueNoVino() {
        val adapter = Moshi.Builder().add(KotlinJsonAdapterFactory()).build().adapter(TeamBoardUserDto::class.java)
        val vieja = adapter.fromJson("""{"id":1,"status":"sin_actividad"}""")!!
        assertFalse(vieja.jornadaHoyConocida)
        assertNull(vieja.entradaHoyAt)

        val sinChecar = adapter.fromJson("""{"id":1,"status":"sin_actividad","entradaHoyAt":null}""")!!
        assertTrue(sinChecar.jornadaHoyConocida)
        assertNull(sinChecar.entradaHoyAt)

        val entro = adapter.fromJson(
            """{"id":1,"status":"sin_actividad","entradaHoyAt":"2026-10-07T16:05:00.000Z","currentLateReason":"tope"}""",
        )!!
        assertEquals("2026-10-07T16:05:00.000Z", entro.entradaHoyAt)
        assertEquals("tope", entro.currentLateReason)
    }

    @Test
    fun elAmbarSeDesgloseSinCeros() {
        val equipo = listOf(
            hoy(1, "A", status = "atrasado"),
            hoy(2, "B", status = "atrasado"),
            hoy(3, "C", entrada = "2026-10-07T16:00:00Z"),
            hoy(4, "D", entrada = "2026-10-07T16:00:00Z"),
            hoy(5, "E", entrada = null),
            hoy(6, "F", entrada = "2026-10-07T14:00:00Z", salida = "2026-10-07T17:00:00Z"),
            hoy(7, "G", status = "activo"),
        )
        val r = EquipoEstado.resumen(equipo)
        assertEquals(2, r.atrasados)
        assertEquals(2, r.sinNada)
        assertEquals(1, r.sinEntrada)
        assertEquals(1, r.yaSalieron)
        assertEquals("2 atrasados · 2 sin nada asignado · 1 sin entrada · 1 ya salió", EquipoEstado.desgloseRetraso(r))
        val celda = EquipoEstado.metricas(equipo).first { it.clave == EquipoAro.RETRASO.clave }
        assertEquals("2 atrasados · 2 sin nada asignado · 1 sin entrada · 1 ya salió", celda.pista)
        assertTrue(celda.pistaLineas > 1)
    }

    @Test
    fun sinNadieEnAmbarLoDiceEnPositivo() {
        val equipo = listOf(persona(id = 1, status = "activo"), persona(id = 2, status = "libre"))
        assertEquals("nadie pendiente", EquipoEstado.desgloseRetraso(EquipoEstado.resumen(equipo)))
    }

    /** API vieja: sin `entradaHoyAt` no se separa nada; todo «sin nada asignado», como antes. */
    @Test
    fun conLaApiViejaTodoEsSinNadaAsignado() {
        val equipo = listOf(
            persona(id = 1, status = "atrasado"),
            persona(id = 2, status = "atrasado"),
        ) + (3L..14L).map { persona(id = it, status = "sin_actividad") }
        assertEquals("2 atrasados · 12 sin nada asignado", EquipoEstado.desgloseRetraso(EquipoEstado.resumen(equipo)))
        assertEquals(EquipoEstado.MotivoSinActividad.SIN_NADA, EquipoEstado.motivoSinActividad(persona(status = "inactivo")))
    }

    @Test
    fun cuandoSeDiceComoLoDiceLaGente() {
        assertEquals("hoy 07:39", EquipoEstado.cuandoMx("2026-10-07T13:39:00Z", ahora))
        assertEquals("ayer 18:11", EquipoEstado.cuandoMx("2026-10-07T00:11:00Z", ahora))
        assertEquals("lun 5 oct 18:38", EquipoEstado.cuandoMx("2026-10-06T00:38:00Z", ahora))
        assertEquals("lun 6 oct 2025 14:00", EquipoEstado.cuandoMx("2025-10-06T20:00:00Z", ahora))
        assertEquals("", EquipoEstado.cuandoMx(null, ahora))
    }

    @Test
    fun laUltimaActividadDiceCuandoYComoLaEntrego() {
        val aTiempo = hoy(1, "Luis", ultima = TeamBoardLastFinishedDto(85, "AN-0085", "Depurar base", "2026-10-06T23:15:00Z", 0.0))
        assertEquals("Última: AN-0085 · ayer 17:15, a tiempo", EquipoEstado.ultimaActividad(aTiempo, ahora))
        assertEquals("Última: AN-0085 · ayer 17:15", EquipoEstado.ultimaActividadCorta(aTiempo, ahora))

        val tarde = hoy(2, "Ana", ultima = TeamBoardLastFinishedDto(85, "AN-0085", "Depurar base", "2026-10-06T23:15:00Z", 40.0))
        assertEquals("Última: AN-0085 · ayer 17:15, con 40 min de atraso", EquipoEstado.ultimaActividad(tarde, ahora))

        // Sin límite cuenta a tiempo; sin folio, el título recortado.
        val sinFolio = hoy(3, "Beto", ultima = TeamBoardLastFinishedDto(9, null, "Mantenimiento preventivo de cámaras", "2026-10-07T15:00:00Z", null))
        assertEquals("Última: Mantenimiento preventiv… · hoy 09:00, a tiempo", EquipoEstado.ultimaActividad(sinFolio, ahora))

        assertEquals("Sin actividades terminadas", EquipoEstado.ultimaActividad(hoy(4, "Eva"), ahora))
    }

    @Test
    fun atencionSeparaAtrasadosSinNadaYSinEntrada() {
        val equipo = listOf(
            hoy(
                1, "Pedro", status = "atrasado", lateMinutes = 34 * 60.0, motivo = "tope",
                actual = TeamBoardActivityDto(id = 91, anNumber = "AN-0091", titulo = "Depurar base de datos"),
            ),
            hoy(
                2, "Raúl", status = "atrasado", lateMinutes = 20.0, motivo = "inicio",
                actual = TeamBoardActivityDto(id = 92, anNumber = "AN-0092", titulo = "Cambio de switch"),
            ),
            // Entró 10:00, terminó algo 11:55: sin nada desde hace 25 min.
            hoy(3, "Carla", entrada = "2026-10-07T16:00:00Z", idle = "2026-10-07T17:55:00Z"),
            // Entró 08:57 y nadie le ha dado nada.
            hoy(
                4, "Daniela", entrada = "2026-10-07T14:57:00Z", idle = "2026-10-07T14:57:00Z",
                ultima = TeamBoardLastFinishedDto(85, "AN-0085", "Depurar", "2026-10-06T23:15:00Z", 0.0),
            ),
            hoy(5, "Eva", ultima = TeamBoardLastFinishedDto(80, "AN-0080", "Cableado", "2026-10-06T00:38:00Z", 0.0)),
            hoy(6, "Fer"),
            hoy(7, "Gil", entrada = "2026-10-07T14:00:00Z", salida = "2026-10-07T17:00:00Z"),
            hoy(8, "Hugo", status = "libre"),
            hoy(9, "Iris", status = "activo"),
        )
        val a = EquipoEstado.atencionEquipo(equipo, ahora)

        assertEquals(listOf("Pedro", "Raúl"), a.atrasados.map { it.persona.nombre })
        assertEquals("AN-0091 · Depurar base de datos", a.atrasados[0].actividad)
        assertEquals("Atrasada · 34 h 00 min · pasó su hora límite", a.atrasados[0].detalle)
        assertEquals("Atrasada · 20 min · no la ha iniciado", a.atrasados[1].detalle)

        // Más tiempo sin nada primero.
        assertEquals(listOf("Daniela", "Carla"), a.sinNada.map { it.persona.nombre })
        assertEquals("Entró 08:57 · sin nada desde que entró (hace 3 h 23 min)", a.sinNada[0].jornada)
        assertEquals("Última: AN-0085 · ayer 17:15, a tiempo", a.sinNada[0].ultima)
        assertEquals("Entró 10:00 · sin nada desde hace 25 min", a.sinNada[1].jornada)
        assertEquals("Sin actividades terminadas", a.sinNada[1].ultima)

        // Quien ya salió, los libres y los que trabajan no piden nada; sin nada terminado, al final.
        assertEquals(listOf("Eva", "Fer"), a.sinEntrada.map { it.persona.nombre })
        assertEquals("Última: AN-0080 · lun 5 oct 18:38", a.sinEntrada[0].ultima)
        assertEquals("hace 2 días", a.sinEntrada[0].haceCuanto)
        assertEquals("Sin actividades terminadas", a.sinEntrada[1].ultima)
        assertNull(a.sinEntrada[1].haceCuanto)
    }

    /** Sin motivo no se inventa uno; sin minutos, solo «Atrasada». */
    @Test
    fun elAtrasoSinMotivoNoSeInventa() {
        val u = hoy(1, "Pedro", status = "atrasado", actual = TeamBoardActivityDto(id = 1, anNumber = "AN-1", titulo = "X"))
        assertEquals("Atrasada", EquipoEstado.atencionEquipo(listOf(u), ahora).atrasados.single().detalle)
    }

    @Test
    fun losGruposVaciosNoSePintan() {
        assertTrue(EquipoEstado.gruposAtencion(listOf(hoy(1, "Iris", status = "activo")), ahora).isEmpty())
        val grupos = EquipoEstado.gruposAtencion(
            listOf(hoy(1, "Carla", entrada = "2026-10-07T16:00:00Z", idle = "2026-10-07T17:55:00Z"), hoy(2, "Fer")),
            ahora,
        )
        assertEquals(listOf("Sin nada asignado", "Sin entrada hoy"), grupos.map { it.titulo })
        val renglon = grupos.first().renglones.single()
        assertEquals("Entró 10:00 · sin nada desde hace 25 min", renglon.principal)
        assertEquals(CoreActivityRules.NARANJA, renglon.colorPrincipal)
        assertEquals("Sin actividades terminadas", renglon.secundaria)
    }

    @Test
    fun laTarjetaSinNadaAbiertoDiceSuJornadaDeHoy() {
        val entro = hoy(1, "Carla", entrada = "2026-10-07T16:05:00Z", idle = "2026-10-07T16:05:00Z")
        assertEquals("Entró 10:05 · sin nada hace 2 h 15 min", EquipoEstado.contexto(entro, ahora))
        val salio = hoy(2, "Gil", entrada = "2026-10-07T14:00:00Z", salida = "2026-10-08T00:02:00Z")
        assertEquals("Salió 18:02", EquipoEstado.contexto(salio, ahora))
        assertEquals("Sin entrada hoy", EquipoEstado.contexto(hoy(3, "Fer"), ahora))
        // API vieja: el rótulo de siempre.
        assertEquals("Sin actividad", EquipoEstado.contexto(persona(status = "sin_actividad"), ahora))
    }

    @Test
    fun laTarjetaSinNadaAbiertoAgregaLaUltima() {
        val u = hoy(1, "Carla", ultima = TeamBoardLastFinishedDto(91, "AN-0091", "Depurar", "2026-10-07T00:11:00Z", 0.0))
        assertEquals("Última: AN-0091 · ayer 18:11", EquipoEstado.ultimaDeTarjeta(u, ahora))
        // En «libre» el contexto ya dice cuándo terminó; con algo abierto, no aplica.
        assertNull(EquipoEstado.ultimaDeTarjeta(u.copy(status = "libre"), ahora))
        assertNull(EquipoEstado.ultimaDeTarjeta(u.copy(currentActivity = TeamBoardActivityDto(id = 2)), ahora))
    }
}
