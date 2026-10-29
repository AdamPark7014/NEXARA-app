package mx.nexara.mobile.nativeapp.ui.console.more

import mx.nexara.mobile.nativeapp.data.api.KpiAsistenciaPuntualDto
import mx.nexara.mobile.nativeapp.data.api.KpiBloqueDto
import mx.nexara.mobile.nativeapp.data.api.KpiCalificacionDto
import mx.nexara.mobile.nativeapp.data.api.KpiDisciplinaDto
import mx.nexara.mobile.nativeapp.data.api.KpiEntregasDto
import mx.nexara.mobile.nativeapp.data.api.KpiEquipoCoordinadoDto
import mx.nexara.mobile.nativeapp.data.api.KpiParteCumplimientoDto
import mx.nexara.mobile.nativeapp.data.api.KpiPersonaDto
import mx.nexara.mobile.nativeapp.data.api.KpiPersonaFilaDto
import mx.nexara.mobile.nativeapp.data.api.KpiPilarDto
import mx.nexara.mobile.nativeapp.data.api.KpiRevisionesDto
import mx.nexara.mobile.nativeapp.data.api.KpiTotalesDto
import mx.nexara.mobile.nativeapp.data.api.KpiUniformeDto
import mx.nexara.mobile.nativeapp.data.api.KpisEquipoDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Lo que puede mentir en una pantalla de indicadores: un cero que parece un dato
 * y no lo es, un orden que esconde a quien está mal y, con el índice v2, un número
 * con la etiqueta vieja o un diagnóstico que parece que pesa.
 */
class KpisEquipoRulesTest {

    private fun fila(
        id: Long,
        nombre: String,
        semaforo: String?,
        puesto: String? = null,
        email: String? = null,
        totales: KpiTotalesDto? = null,
        confianza: Any? = null,
    ) = KpiPersonaFilaDto(
        persona = KpiPersonaDto(id = id, nombre = nombre, puesto = puesto, email = email),
        semaforo = semaforo,
        totales = totales,
        confianza = confianza,
    )

    // ── Semáforo ─────────────────────────────────────────────────────────────

    @Test
    fun theTrafficLightIsReadFromTheServer() {
        assertEquals(KpisEquipoRules.Semaforo.VERDE, KpisEquipoRules.semaforo("verde"))
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, KpisEquipoRules.semaforo("AMARILLO"))
        assertEquals(KpisEquipoRules.Semaforo.ROJO, KpisEquipoRules.semaforo(" rojo "))
        assertEquals(KpisEquipoRules.Semaforo.SIN_DATOS, KpisEquipoRules.semaforo("sin_datos"))
        assertEquals(KpisEquipoRules.Semaforo.SIN_DATOS, KpisEquipoRules.semaforo(null))
        assertEquals(KpisEquipoRules.Semaforo.SIN_DATOS, KpisEquipoRules.semaforo("morado"))
    }

    /** El semáforo de una parte puede llegar como texto o como objeto; lo que no se entiende es null. */
    @Test
    fun theApiTrafficLightIsReadInBothShapes() {
        assertEquals(KpisEquipoRules.Semaforo.ROJO, KpisEquipoRules.semaforoDelApi("rojo"))
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, KpisEquipoRules.semaforoDelApi("atencion"))
        assertEquals(KpisEquipoRules.Semaforo.VERDE, KpisEquipoRules.semaforoDelApi(mapOf("semaforo" to "verde")))
        assertEquals(KpisEquipoRules.Semaforo.ROJO, KpisEquipoRules.semaforoDelApi(mapOf("nivel" to "critico")))
        assertNull(KpisEquipoRules.semaforoDelApi(null))
        assertNull(KpisEquipoRules.semaforoDelApi("morado"))
        assertNull(KpisEquipoRules.semaforoDelApi(42.0))
    }

    /**
     * En una columna de tarjetas nadie baja hasta la catorce: quien está en rojo
     * va primero. La web se puede permitir el alfabético porque tiene tabla.
     */
    @Test
    fun theWorstComesFirst() {
        val personas = listOf(
            fila(1, "Ana", "verde"),
            fila(2, "Beto", "rojo"),
            fila(3, "Carla", "sin_datos"),
            fila(4, "Dora", "amarillo"),
        )
        assertEquals(
            listOf("Beto", "Dora", "Ana", "Carla"),
            KpisEquipoRules.ordenar(personas).map { it.persona?.nombre },
        )
    }

    @Test
    fun withinTheSameLevelItIsAlphabetical() {
        val personas = listOf(fila(1, "Zoe", "rojo"), fila(2, "Abel", "rojo"))
        assertEquals(listOf("Abel", "Zoe"), KpisEquipoRules.ordenar(personas).map { it.persona?.nombre })
    }

    @Test
    fun searchLooksAtNamePostAndEmail() {
        val personas = listOf(
            fila(1, "Ana", "verde", puesto = "Ingeniería", email = "ana@nexara.com.mx"),
            fila(2, "Beto", "rojo", puesto = "Almacén", email = "beto@nexara.com.mx"),
        )
        assertEquals(1, KpisEquipoRules.filtrar(personas, "ana").size)
        assertEquals(1, KpisEquipoRules.filtrar(personas, "almac").size)
        assertEquals(1, KpisEquipoRules.filtrar(personas, "beto@").size)
        assertEquals(2, KpisEquipoRules.filtrar(personas, "   ").size)
    }

    // ── Números que no se inventan ───────────────────────────────────────────

    @Test
    fun aMissingPercentageIsADashNotAZero() {
        assertEquals("—", KpisEquipoRules.pct(null))
        assertEquals("—", KpisEquipoRules.pct(Double.NaN))
        assertEquals("83 %", KpisEquipoRules.pct(82.6))
        assertEquals("0 %", KpisEquipoRules.pct(0.0))
    }

    /** El índice y los pilares van de 0 a 100, sin «%», como la web. */
    @Test
    fun theIndexIsAPlainNumber() {
        assertEquals("86", KpisEquipoRules.indice(86.4))
        assertEquals("0", KpisEquipoRules.indice(0.0))
        assertEquals("—", KpisEquipoRules.indice(null))
        assertEquals("—", KpisEquipoRules.indice(Double.NaN))
    }

    @Test
    fun hoursAreWrittenTheWayPeopleSayThem() {
        assertEquals("—", KpisEquipoRules.horas(null))
        assertEquals("45 m", KpisEquipoRules.horas(45))
        assertEquals("1 h", KpisEquipoRules.horas(60))
        assertEquals("7 h 30 m", KpisEquipoRules.horas(450))
        assertEquals("0 m", KpisEquipoRules.horas(0))
        assertEquals("-30 m", KpisEquipoRules.horas(-30))
    }

    /** Sin un solo día que contar, la puntualidad no es del 100 %: no se sabe. */
    @Test
    fun punctualityWithoutDaysIsUnknownNotPerfect() {
        assertNull(KpisEquipoRules.puntualidadPct(null))
        assertNull(KpisEquipoRules.puntualidadPct(KpiTotalesDto(diasConJornada = 0)))
        assertEquals(
            80.0,
            KpisEquipoRules.puntualidadPct(KpiTotalesDto(diasConJornada = 5, retardos = 1))!!,
            0.0001,
        )
        assertEquals(
            100.0,
            KpisEquipoRules.puntualidadPct(KpiTotalesDto(diasConJornada = 5, retardos = 0))!!,
            0.0001,
        )
    }

    /** Más retardos que días es un dato corrupto: se acota, no se deja negativo. */
    @Test
    fun moreDelaysThanDaysNeverGoesNegative() {
        assertEquals(
            0.0,
            KpisEquipoRules.puntualidadPct(KpiTotalesDto(diasConJornada = 2, retardos = 9))!!,
            0.0001,
        )
    }

    /**
     * Con la Disciplina del API, la puntualidad es la graduada del índice (un retardo de
     * 20 min vale 0.6, no cero) y se pinta con los cortes del índice, no con el sí/no.
     */
    @Test
    fun punctualityIsGradedWhenTheApiSendsDiscipline() {
        val t = KpiTotalesDto(
            diasConJornada = 5,
            retardos = 2,
            disciplina = KpiDisciplinaDto(esperados = 5, puntos = 4.6, retardos = 1, faltasPorRetardos = 0, jornadasRevisables = 5, registroCompleto = 5, pct = 92.0),
        )
        assertEquals(92.0, KpisEquipoRules.puntualidadPct(t)!!, 0.0001)
        assertEquals(KpisEquipoRules.Semaforo.VERDE, KpisEquipoRules.tonoPuntualidad(t))
        assertEquals("1 retardo", KpisEquipoRules.puntualidadPie(t))
        // Sin el dato graduado: binaria, pintada por retardos como el semáforo del API.
        val binaria = KpiTotalesDto(diasConJornada = 5, retardos = 2)
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, KpisEquipoRules.tonoPuntualidad(binaria))
    }

    @Test
    fun thePunctualityCaptionReadsInSpanish() {
        assertEquals("Sin días con jornada", KpisEquipoRules.puntualidadPie(KpiTotalesDto(diasConJornada = 0)))
        assertEquals(
            "Sin retardos en 5 días",
            KpisEquipoRules.puntualidadPie(KpiTotalesDto(diasConJornada = 5, retardos = 0)),
        )
        assertEquals(
            "1 retardo · 12 m tarde",
            KpisEquipoRules.puntualidadPie(KpiTotalesDto(diasConJornada = 5, retardos = 1, minutosTarde = 12)),
        )
        assertEquals(
            "3 retardos",
            KpisEquipoRules.puntualidadPie(KpiTotalesDto(diasConJornada = 5, retardos = 3)),
        )
    }

    /** Los cortes son los de `UMBRALES_KPI` del API, no 85/60. */
    @Test
    fun theThresholdsAreTheApiOnes() {
        // Productividad (tiempo en actividades): 70 / 50.
        assertEquals(KpisEquipoRules.Semaforo.VERDE, KpisEquipoRules.tonoProductividad(70.0))
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, KpisEquipoRules.tonoProductividad(69.9))
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, KpisEquipoRules.tonoProductividad(50.0))
        assertEquals(KpisEquipoRules.Semaforo.ROJO, KpisEquipoRules.tonoProductividad(49.9))
        // Uniforme: 95 / 80.
        assertEquals(KpisEquipoRules.Semaforo.VERDE, KpisEquipoRules.tonoUniforme(95.0))
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, KpisEquipoRules.tonoUniforme(90.0))
        assertEquals(KpisEquipoRules.Semaforo.ROJO, KpisEquipoRules.tonoUniforme(79.0))
        assertEquals(KpisEquipoRules.Semaforo.SIN_DATOS, KpisEquipoRules.tonoUniforme(null))
        // Retardos: 0 verde, 1–2 ámbar, 3 o más rojo; sin días, gris.
        assertEquals(KpisEquipoRules.Semaforo.VERDE, KpisEquipoRules.tonoRetardos(KpiTotalesDto(diasConJornada = 5, retardos = 0)))
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, KpisEquipoRules.tonoRetardos(KpiTotalesDto(diasConJornada = 5, retardos = 2)))
        assertEquals(KpisEquipoRules.Semaforo.ROJO, KpisEquipoRules.tonoRetardos(KpiTotalesDto(diasConJornada = 5, retardos = 3)))
        assertEquals(KpisEquipoRules.Semaforo.SIN_DATOS, KpisEquipoRules.tonoRetardos(KpiTotalesDto(diasConJornada = 0)))
    }

    // ── Uniforme y tiempo extra ──────────────────────────────────────────────

    @Test
    fun uniformSaysWhenNobodyHasChecked() {
        assertEquals("Nadie ha revisado", KpisEquipoRules.uniformePie(KpiTotalesDto()))
        assertEquals(
            "12 de 15 revisadas",
            KpisEquipoRules.uniformePie(KpiTotalesDto(uniforme = KpiUniformeDto(revisadas = 15, ok = 12))),
        )
    }

    /** Sin horario no hay tiempo extra del que hablar; no es cero. */
    @Test
    fun overtimeWithoutAScheduleIsNotZero() {
        assertEquals("Sin horario fijo", KpisEquipoRules.extraPie(KpiTotalesDto(minutosExtra = null)))
        assertEquals(KpisEquipoRules.Semaforo.SIN_DATOS, KpisEquipoRules.extraTono(KpiTotalesDto()))
    }

    /** Lo que importa de las horas extra es lo que nadie ha decidido todavía. */
    @Test
    fun pendingOvertimeIsWhatGetsHighlighted() {
        val pendiente = KpiTotalesDto(
            minutosExtra = 180,
            minutosExtraPendientes = 120,
            diasExtraPendientes = 2,
            minutosExtraAprobados = 60,
        )
        assertEquals("2 h por aprobar en 2 días", KpisEquipoRules.extraPie(pendiente))
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, KpisEquipoRules.extraTono(pendiente))

        val resuelto = KpiTotalesDto(minutosExtra = 60, minutosExtraPendientes = 0, minutosExtraAprobados = 60)
        assertEquals("1 h aprobadas", KpisEquipoRules.extraPie(resuelto))
        assertEquals(KpisEquipoRules.Semaforo.VERDE, KpisEquipoRules.extraTono(resuelto))

        val nada = KpiTotalesDto(minutosExtra = 0, minutosExtraPendientes = 0, minutosExtraAprobados = 0)
        assertEquals("Nada pendiente", KpisEquipoRules.extraPie(nada))
    }

    @Test
    fun theDaysCaptionAddsWhatIsWorthSaying() {
        assertEquals("5 días", KpisEquipoRules.jornadasPie(KpiTotalesDto(diasConJornada = 5)))
        assertEquals("1 día", KpisEquipoRules.jornadasPie(KpiTotalesDto(diasConJornada = 1)))
        assertEquals(
            "5 días · 2 sin checar · 1 justificada",
            KpisEquipoRules.jornadasPie(
                KpiTotalesDto(diasConJornada = 5, diasSinChecada = 2, faltasJustificadas = 1),
            ),
        )
    }

    // ── Tarjetas ─────────────────────────────────────────────────────────────

    /** Tres números por tarjeta: los que caben sin apretar en 360 dp. */
    @Test
    fun aPersonCardCarriesExactlyThreeNumbers() {
        val datos = KpisEquipoRules.datosPersona(KpiTotalesDto(diasConJornada = 5, retardos = 1, productividadPct = 60.0))
        assertEquals(3, datos.size)
        assertEquals(listOf("Puntualidad", "Productividad", "Horas"), datos.map { it.etiqueta })
        // API vieja, con los cortes del API: 1 retardo es ámbar y 60 % de productividad también.
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, datos[0].tono)
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, datos[1].tono)
    }

    @Test
    fun withoutTeamDataThereIsNoStrip() {
        assertTrue(KpisEquipoRules.datosEquipo(null).isEmpty())
        assertTrue(KpisEquipoRules.datosEquipo(KpisEquipoDto(equipo = null)).isEmpty())
    }

    @Test
    fun theScopeIsSaidInPlainWords() {
        assertEquals("Toda la empresa", KpisEquipoRules.alcance("company"))
        assertEquals("Mi equipo", KpisEquipoRules.alcance("subtree"))
        assertEquals("Mi equipo", KpisEquipoRules.alcance(null))
    }

    // ── Índice v2 (29-10) ────────────────────────────────────────────────────

    private fun entregas(
        medidas: Int,
        aTiempo: Int,
        tarde: Int = 0,
        sinEntregar: Int = 0,
        revisadas: Int = 0,
        aLaPrimera: Int = 0,
        devueltas: Int = 0,
    ) = KpiEntregasDto(
        medidas = medidas,
        aTiempo = aTiempo,
        tarde = tarde,
        sinEntregar = sinEntregar,
        revisadas = revisadas,
        aprobadasALaPrimera = aLaPrimera,
        devueltas = devueltas,
        pctATiempo = if (medidas > 0) (aTiempo * 100.0 / medidas).let { Math.round(it).toDouble() } else null,
    )

    /** Totales como los manda la API nueva: `entregas` siempre viene, aunque sea en ceros. */
    private fun totales(cumplimiento: Double?, e: KpiEntregasDto, diasConJornada: Int = 8, retardos: Int = 0) =
        KpiTotalesDto(
            diasConJornada = diasConJornada,
            retardos = retardos,
            entregas = e,
            cumplimientoPct = cumplimiento,
            cumplimientoPartes = emptyList(),
        )

    /** Las partes como las arma `cumplimientoDe` del API v2: con peso, los pilares; con peso 0, diagnóstico. */
    private val partesV2 = listOf(
        KpiParteCumplimientoDto("entregas", "Entregas a tiempo", 94.0, 30.0, "17 de 18"),
        KpiParteCumplimientoDto("forma", "Calidad", 88.0, 25.0, "16 de 18 aprobadas a la primera · calificación 80 (6)"),
        KpiParteCumplimientoDto("estandar", "Horas estándar ganadas", 62.0, 30.0, "17 h estándar de 40 h en jornada (43 %; meta 70 % en oficina)"),
        KpiParteCumplimientoDto("asistencia", "Puntualidad y registro", 90.0, 12.0, "4.6 de 5 días en puntos · registro completo 5 de 5"),
        KpiParteCumplimientoDto("uniforme", "Uniforme", 100.0, 3.0, "5 de 5"),
        KpiParteCumplimientoDto("tiempo", "Tiempo adecuado", 100.0, 0.0, "6 de 6 sin pasar su tiempo máximo · diagnóstico"),
        KpiParteCumplimientoDto("ritmo", "Ritmo de entregas", 60.0, 0.0, "1.2 por día · el equipo va a 2 · diagnóstico"),
        KpiParteCumplimientoDto("dias", "Días trabajados", 80.0, 0.0, "4 de 5 · diagnóstico"),
    )

    /**
     * Lo que pidió Adam: Luis y Daniela van más alto y tienen que salir arriba,
     * aunque David tenga el reloj prendido todo el día.
     */
    @Test
    fun withTheIndexTheHighestGoesFirst() {
        val personas = listOf(
            fila(1, "David Morales", "rojo", totales = totales(52.0, entregas(medidas = 1, aTiempo = 0, tarde = 1))),
            fila(38, "Daniela", "verde", totales = totales(96.0, entregas(medidas = 14, aTiempo = 13))),
            fila(7, "Luis", "verde", totales = totales(96.0, entregas(medidas = 18, aTiempo = 17))),
            fila(9, "Ana", "sin_datos", totales = totales(null, entregas(medidas = 0, aTiempo = 0))),
            fila(4, "Beto", "amarillo", totales = totales(80.0, entregas(medidas = 5, aTiempo = 4))),
        )
        assertEquals(
            // Mismo índice: más entregas a tiempo primero. Sin dato (Ana), al final.
            listOf("Luis", "Daniela", "Beto", "David Morales", "Ana"),
            KpisEquipoRules.ordenar(personas).map { it.persona?.nombre },
        )
        assertEquals("Por índice, de mayor a menor", KpisEquipoRules.subtituloLista(personas))
    }

    @Test
    fun anIndexTieWithTheSameOnTimeCountGoesByName() {
        val personas = listOf(
            fila(1, "Zoe", "verde", totales = totales(90.0, entregas(medidas = 5, aTiempo = 5))),
            fila(2, "Ángel", "verde", totales = totales(90.0, entregas(medidas = 5, aTiempo = 5))),
        )
        // «Ángel» va con la A, no después de la Z.
        assertEquals(listOf("Ángel", "Zoe"), KpisEquipoRules.ordenar(personas).map { it.persona?.nombre })
    }

    /** Una API que aún no manda el índice deja el orden de antes: rojo primero. */
    @Test
    fun anOldApiKeepsTheWorstFirstOrder() {
        val personas = listOf(
            fila(1, "Ana", "verde", totales = KpiTotalesDto(diasConJornada = 5, productividadPct = 99.0)),
            fila(2, "Beto", "rojo", totales = KpiTotalesDto(diasConJornada = 5, productividadPct = 10.0)),
        )
        assertFalse(KpisEquipoRules.conCumplimiento(personas.first().totales))
        assertEquals(listOf("Beto", "Ana"), KpisEquipoRules.ordenar(personas).map { it.persona?.nombre })
        assertEquals("De peor a mejor, para no tener que buscarlo", KpisEquipoRules.subtituloLista(personas))
    }

    /** Con la API nueva, `cumplimientoPct: null` es «nada que medir», no una API vieja. */
    @Test
    fun aNullIndexFromTheNewApiIsStillTheNewApi() {
        assertTrue(KpisEquipoRules.conCumplimiento(totales(null, entregas(medidas = 0, aTiempo = 0))))
        assertFalse(KpisEquipoRules.conCumplimiento(KpiTotalesDto()))
        assertFalse(KpisEquipoRules.conCumplimiento(null))
    }

    @Test
    fun theIndexFollowsTheDeliveryCuts() {
        assertEquals(KpisEquipoRules.Semaforo.VERDE, KpisEquipoRules.tonoCumplimiento(90.0))
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, KpisEquipoRules.tonoCumplimiento(89.9))
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, KpisEquipoRules.tonoCumplimiento(75.0))
        assertEquals(KpisEquipoRules.Semaforo.ROJO, KpisEquipoRules.tonoCumplimiento(74.9))
        assertEquals(KpisEquipoRules.Semaforo.SIN_DATOS, KpisEquipoRules.tonoCumplimiento(null))
    }

    @Test
    fun withTheIndexTheCardShowsIndexDeliveriesAndDiscipline() {
        val t = totales(96.0, entregas(medidas = 18, aTiempo = 17, tarde = 1, revisadas = 18, aLaPrimera = 18))
            .copy(cumplimientoPartes = partesV2)
        val datos = KpisEquipoRules.datosPersona(t)
        assertEquals(listOf("Índice", "Entregas", "Disciplina"), datos.map { it.etiqueta })
        assertEquals("96", datos[0].valor)
        // 18 entregas medidas: de 10 a 19, confianza media.
        assertEquals("Confianza media", datos[0].pie)
        assertEquals(KpisEquipoRules.Semaforo.VERDE, datos[0].tono)
        assertEquals("17/18", datos[1].valor)
        assertEquals("a tiempo · 18/18 a la primera", datos[1].pie)
        // 17 de 18 = 94 %: verde con los cortes del índice.
        assertEquals(KpisEquipoRules.Semaforo.VERDE, datos[1].tono)
        // Disciplina = (90·12 + 100·3) ÷ 15 = 92.
        assertEquals("92", datos[2].valor)
        assertEquals(KpisEquipoRules.Semaforo.VERDE, datos[2].tono)
    }

    /** Con menos de 10 entregas medidas, el índice es provisional y la tarjeta lo dice. */
    @Test
    fun fewerThanTenDeliveriesMakeTheIndexProvisional() {
        val t = totales(81.0, entregas(medidas = 7, aTiempo = 6))
        assertEquals(KpisEquipoRules.Confianza.BAJA, KpisEquipoRules.confianza(t))
        assertEquals("Provisional · 7 entregas", KpisEquipoRules.indicePie(t))
        assertEquals("Provisional · 1 entrega", KpisEquipoRules.indicePie(totales(81.0, entregas(medidas = 1, aTiempo = 1))))
        assertEquals("Provisional · sin entregas", KpisEquipoRules.indicePie(totales(40.0, entregas(medidas = 0, aTiempo = 0))))
        assertEquals(KpisEquipoRules.Confianza.MEDIA, KpisEquipoRules.confianza(totales(81.0, entregas(medidas = 10, aTiempo = 9))))
        assertEquals(KpisEquipoRules.Confianza.ALTA, KpisEquipoRules.confianza(totales(81.0, entregas(medidas = 20, aTiempo = 19))))
        assertEquals("Confianza alta", KpisEquipoRules.indicePie(totales(81.0, entregas(medidas = 20, aTiempo = 19))))
    }

    /** Si el API manda la confianza (texto u objeto, en la fila o en los totales), manda ella. */
    @Test
    fun theApiConfidenceWinsInEitherShape() {
        val pocas = totales(81.0, entregas(medidas = 3, aTiempo = 3))
        assertEquals(KpisEquipoRules.Confianza.ALTA, KpisEquipoRules.confianza(fila(1, "Ana", "verde", totales = pocas, confianza = "alta")))
        assertEquals(
            KpisEquipoRules.Confianza.MEDIA,
            KpisEquipoRules.confianza(fila(1, "Ana", "verde", totales = pocas, confianza = mapOf("nivel" to "media", "medidas" to 3.0))),
        )
        assertEquals(KpisEquipoRules.Confianza.ALTA, KpisEquipoRules.confianza(pocas.copy(confianza = "ALTA")))
        // Un valor que no se entiende no cuenta: se calcula como la web.
        assertEquals(KpisEquipoRules.Confianza.BAJA, KpisEquipoRules.confianza(fila(1, "Ana", "verde", totales = pocas, confianza = 7.0)))
        assertEquals("Confianza alta", KpisEquipoRules.datosPersona(fila(1, "Ana", "verde", totales = pocas, confianza = "alta"))[0].pie)
    }

    @Test
    fun theSubtitleCarriesTheConfidenceLikeTheWeb() {
        val t = totales(90.0, entregas(medidas = 22, aTiempo = 21))
        assertEquals("Técnico · confianza alta", KpisEquipoRules.subtituloPersona(fila(1, "Ana", "verde", puesto = "Técnico", totales = t)))
        assertEquals("Confianza alta", KpisEquipoRules.subtituloPersona(fila(1, "Ana", "verde", totales = t)))
        // API vieja: el puesto, como antes.
        assertEquals("Técnico", KpisEquipoRules.subtituloPersona(fila(1, "Ana", "verde", puesto = "Técnico", totales = KpiTotalesDto())))
    }

    @Test
    fun withNothingToMeasureTheCardSaysSoInsteadOfAZero() {
        val datos = KpisEquipoRules.datosPersona(totales(null, entregas(medidas = 0, aTiempo = 0)))
        assertEquals("—", datos[0].valor)
        assertEquals("Sin datos que medir", datos[0].pie)
        assertEquals(KpisEquipoRules.Semaforo.SIN_DATOS, datos[0].tono)
        assertEquals("—", datos[1].valor)
        assertEquals("Sin entregas", datos[1].pie)
        assertEquals("—", datos[2].valor)
    }

    @Test
    fun deliveriesWithoutReviewsOnlySayOnTime() {
        val dato = KpisEquipoRules.entregasDato(totales(70.0, entregas(medidas = 4, aTiempo = 2, tarde = 2)))
        assertEquals("2/4", dato.valor)
        assertEquals("a tiempo", dato.pie)
        assertEquals(KpisEquipoRules.Semaforo.ROJO, dato.tono)
    }

    /** La tira del equipo es la banda de la web: índice, entregas a tiempo, tiempo en actividades y extra por decidir. */
    @Test
    fun theTeamStripIsTheWebBand() {
        val t = totales(86.0, entregas(medidas = 18, aTiempo = 17, tarde = 0, sinEntregar = 1, revisadas = 18, aLaPrimera = 18))
            .copy(
                minutosProductivos = 92 * 60 + 10,
                minutosLaborados = 189 * 60,
                productividadPct = 49.0,
                diasExtraPendientes = 2,
                minutosExtraPendientes = 200,
            )
        val personas = listOf(
            fila(1, "Ana", "verde", totales = totales(90.0, entregas(medidas = 25, aTiempo = 24))),
            fila(2, "Beto", "verde", totales = totales(80.0, entregas(medidas = 4, aTiempo = 4))),
        )
        val datos = KpisEquipoRules.datosEquipo(KpisEquipoDto(equipo = KpiBloqueDto(totales = t), personas = personas))
        assertEquals(
            listOf("Índice del equipo", "Entregas a tiempo", "Tiempo en actividades", "Extra por decidir"),
            datos.map { it.etiqueta },
        )
        assertEquals("86", datos[0].valor)
        assertEquals("2 personas · 1 con confianza alta", datos[0].pie)
        assertEquals("17 de 18", datos[1].valor)
        assertEquals("94 % · 1 sin entregar", datos[1].pie)
        assertEquals("92 h 10 m", datos[2].valor)
        assertEquals("de 189 h en jornada · 49 %", datos[2].pie)
        assertEquals(KpisEquipoRules.Semaforo.SIN_DATOS, datos[2].tono)
        assertEquals("2", datos[3].valor)
        assertEquals("3 h 20 m sin aprobar", datos[3].pie)
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, datos[3].tono)
    }

    @Test
    fun anOldApiKeepsTheUsualStripWithTheApiCuts() {
        val datos = KpisEquipoRules.datosEquipo(
            KpisEquipoDto(
                equipo = KpiBloqueDto(
                    totales = KpiTotalesDto(diasConJornada = 5, productividadPct = 80.0, uniforme = KpiUniformeDto(revisadas = 10, ok = 9, pct = 90.0)),
                ),
            ),
        )
        assertEquals(listOf("Puntualidad", "Productividad", "Uniforme", "Tiempo extra"), datos.map { it.etiqueta })
        assertEquals(KpisEquipoRules.Semaforo.VERDE, datos[1].tono)
        // 90 % de uniforme es ámbar con el 95/80 del API (con 85/60 salía verde).
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, datos[2].tono)
    }

    @Test
    fun theTeamCaptionsCountInPlural() {
        assertEquals("Sin entregas que medir", KpisEquipoRules.entregasEquipoPie(null))
        assertEquals("Sin entregas que medir", KpisEquipoRules.entregasEquipoPie(entregas(0, 0)))
        assertEquals("100 % · 0 sin entregar", KpisEquipoRules.entregasEquipoPie(entregas(medidas = 1, aTiempo = 1)))
        assertEquals("0 personas · 0 con confianza alta", KpisEquipoRules.indiceEquipoPie(emptyList()))
        assertEquals("Todo decidido", KpisEquipoRules.extraPorDecidirPie(KpiTotalesDto(diasExtraPendientes = 0)))
        assertEquals(KpisEquipoRules.Semaforo.VERDE, KpisEquipoRules.extraPorDecidirTono(KpiTotalesDto()))
    }

    // ── Pilares ──────────────────────────────────────────────────────────────

    /** Las partes con peso se agrupan en los cuatro pilares de la web, siempre en el mismo orden. */
    @Test
    fun weightedPartsAreGroupedInTheFourPillars() {
        val pilares = KpisEquipoRules.pilares(totales(84.0, entregas(medidas = 18, aTiempo = 17)).copy(cumplimientoPartes = partesV2))
        assertEquals(listOf("Confiabilidad", "Calidad", "Rendimiento", "Disciplina"), pilares.map { it.etiqueta })
        assertEquals(listOf(94, 88, 62, 92), pilares.map { it.pct })
        assertEquals(listOf("entregas"), pilares[0].partes.map { it.clave })
        assertEquals(listOf("estandar"), pilares[2].partes.map { it.clave })
        // Disciplina: puntualidad y registro + uniforme, ponderados por su peso.
        assertEquals(listOf("asistencia", "uniforme"), pilares[3].partes.map { it.clave })
        // Ninguna parte de peso 0 entra en un pilar.
        assertTrue(pilares.flatMap { it.partes }.none { it.peso == 0.0 })
        // Tonos con los cortes del índice: 62 es rojo, 88 ámbar.
        assertEquals(KpisEquipoRules.Semaforo.ROJO, pilares[2].tono)
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, pilares[1].tono)
    }

    @Test
    fun aPillarWithoutDataDoesNotWeighAndSaysSo() {
        val t = totales(90.0, entregas(medidas = 5, aTiempo = 5)).copy(
            cumplimientoPartes = listOf(KpiParteCumplimientoDto("entregas", "Entregas a tiempo", 100.0, 30.0, "5 de 5")),
        )
        val pilares = KpisEquipoRules.pilares(t)
        assertEquals(100, pilares[0].pct)
        assertNull(pilares[1].pct)
        assertEquals(KpisEquipoRules.Semaforo.SIN_DATOS, pilares[1].tono)
        assertEquals("Sin dato en estas fechas: no pesa.", KpisEquipoRules.partesDelPilar(pilares[1]))
        assertEquals("Entregas a tiempo: 5 de 5 · pesa 30", KpisEquipoRules.partesDelPilar(pilares[0]))
        assertEquals("De qué sale el 90", KpisEquipoRules.tituloPilares(t))
        assertEquals("De qué sale el índice", KpisEquipoRules.tituloPilares(totales(null, entregas(0, 0))))
        // Sin partes (o API vieja), los cuatro pilares sin dato.
        assertTrue(KpisEquipoRules.pilares(null).all { it.pct == null })
    }

    /** Si el API manda el semáforo de una parte, el pilar usa el peor de sus partes en vez del corte local. */
    @Test
    fun theApiTrafficLightOfAPartPaintsItsPillar() {
        val t = totales(84.0, entregas(medidas = 18, aTiempo = 17)).copy(
            cumplimientoPartes = listOf(
                KpiParteCumplimientoDto("entregas", "Entregas a tiempo", 94.0, 30.0, "17 de 18", semaforo = "amarillo"),
                KpiParteCumplimientoDto("asistencia", "Puntualidad y registro", 70.0, 12.0, "", semaforo = mapOf("nivel" to "verde")),
                KpiParteCumplimientoDto("uniforme", "Uniforme", 60.0, 3.0, "3 de 5", semaforo = mapOf("semaforo" to "rojo")),
            ),
        )
        val pilares = KpisEquipoRules.pilares(t)
        // 94 sería verde con el corte local; el API dice ámbar.
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, pilares[0].tono)
        // Disciplina: verde + rojo del API → rojo.
        assertEquals(KpisEquipoRules.Semaforo.ROJO, pilares[3].tono)
    }

    /**
     * Con `pilares[]` del API (f2dc7130) los cuatro pilares salen de ahí tal cual —etiqueta, pct y
     * semáforo—, aunque el agrupado local diera otra cosa; las partes siguen debajo.
     */
    @Test
    fun theApiPillarsWinOverTheLocalGrouping() {
        val t = totales(84.0, entregas(medidas = 18, aTiempo = 17)).copy(
            cumplimientoPartes = partesV2,
            pilares = listOf(
                KpiPilarDto("confiabilidad", "Confiabilidad", 91.0, "verde"),
                KpiPilarDto("calidad", "Calidad", 77.0, "amarillo"),
                KpiPilarDto("rendimiento", "Rendimiento", null, "sin_datos"),
                KpiPilarDto("disciplina", "Disciplina", 60.0, "rojo"),
            ),
        )
        val pilares = KpisEquipoRules.pilares(t)
        assertEquals(listOf(91, 77, null, 60), pilares.map { it.pct })
        assertEquals(
            listOf(
                KpisEquipoRules.Semaforo.VERDE,
                KpisEquipoRules.Semaforo.AMARILLO,
                KpisEquipoRules.Semaforo.SIN_DATOS,
                KpisEquipoRules.Semaforo.ROJO,
            ),
            pilares.map { it.tono },
        )
        // Las partes se siguen pintando debajo de su pilar.
        assertEquals(listOf("asistencia", "uniforme"), pilares[3].partes.map { it.clave })
        assertEquals(listOf("estandar"), pilares[2].partes.map { it.clave })
        // La Disciplina de la tarjeta es la del API.
        val disciplina = KpisEquipoRules.disciplinaDato(t)
        assertEquals("60", disciplina.valor)
        assertEquals(KpisEquipoRules.Semaforo.ROJO, disciplina.tono)
    }

    /** Si al `pilares[]` del API le falta uno, ese se agrupa aquí; el orden es siempre el de la web. */
    @Test
    fun aPillarMissingFromTheApiFallsBackToTheLocalGrouping() {
        val t = totales(84.0, entregas(medidas = 18, aTiempo = 17)).copy(
            cumplimientoPartes = partesV2,
            pilares = listOf(
                KpiPilarDto("disciplina", "Disciplina", 70.0, "rojo"),
                KpiPilarDto("CONFIABILIDAD", "", 95.0, null),
            ),
        )
        val pilares = KpisEquipoRules.pilares(t)
        assertEquals(listOf("Confiabilidad", "Calidad", "Rendimiento", "Disciplina"), pilares.map { it.etiqueta })
        // Confiabilidad del API (sin semáforo: corte 90/75), Calidad y Rendimiento agrupados aquí.
        assertEquals(listOf(95, 88, 62, 70), pilares.map { it.pct })
        assertEquals(KpisEquipoRules.Semaforo.VERDE, pilares[0].tono)
        assertEquals(KpisEquipoRules.Semaforo.ROJO, pilares[3].tono)
    }

    /** El color del índice es el `semaforoIndice` del API; el corte 90/75 solo si no viene. */
    @Test
    fun theIndexColorComesFromTheApi() {
        val conApi = totales(96.0, entregas(medidas = 25, aTiempo = 24)).copy(semaforoIndice = "amarillo")
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, KpisEquipoRules.tonoIndice(conApi))
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, KpisEquipoRules.datosPersona(conApi)[0].tono)
        val datos = KpisEquipoRules.datosEquipo(KpisEquipoDto(equipo = KpiBloqueDto(totales = conApi)))
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, datos[0].tono)
        // Sin `semaforoIndice` (o uno que no se entiende): el corte 90/75 sobre el índice.
        assertEquals(KpisEquipoRules.Semaforo.VERDE, KpisEquipoRules.tonoIndice(conApi.copy(semaforoIndice = null)))
        assertEquals(KpisEquipoRules.Semaforo.ROJO, KpisEquipoRules.tonoIndice(totales(60.0, entregas(5, 3)).copy(semaforoIndice = "morado")))
        assertEquals(KpisEquipoRules.Semaforo.SIN_DATOS, KpisEquipoRules.tonoIndice(null))
    }

    /** El diagnóstico va aparte: solo peso 0 bajo su referencia, sin «· diagnóstico» y sin decir que multiplica. */
    @Test
    fun theDiagnosisIsSeparateAndDoesNotWeigh() {
        val diagnostico = KpisEquipoRules.diagnostico(totales(84.0, entregas(medidas = 18, aTiempo = 17)).copy(cumplimientoPartes = partesV2))
        assertEquals(
            listOf(
                KpisEquipoRules.Linea("Ritmo de entregas", "1.2 por día · el equipo va a 2"),
                KpisEquipoRules.Linea("Días trabajados", "4 de 5"),
            ),
            diagnostico,
        )
        assertTrue(KpisEquipoRules.diagnostico(null).isEmpty())
    }

    // ── La lectura de la persona ─────────────────────────────────────────────

    @Test
    fun earnedStandardHoursReadLikeTheWeb() {
        val t = KpiTotalesDto(
            minutosLaborados = 40 * 60,
            entregas = KpiEntregasDto(medidas = 9, conEstandar = 9, minutosEstandarGanados = 23 * 60 + 12, pctEficienciaEstandar = 87.0),
        )
        val e = KpisEquipoRules.estandarGanado(t)!!
        assertEquals("23 h 12 m · 58 % de su jornada", e.valor)
        assertEquals("9 entregas con estándar · eficiencia 87 %", e.detalle)
        assertNull(KpisEquipoRules.estandarGanado(KpiTotalesDto(entregas = KpiEntregasDto(medidas = 3, conEstandar = 0))))
        assertNull(KpisEquipoRules.estandarGanado(null))
    }

    @Test
    fun gradedDisciplineInOneLine() {
        val t = KpiTotalesDto(
            disciplina = KpiDisciplinaDto(esperados = 5, puntos = 3.6, retardos = 3, faltasPorRetardos = 1, jornadasRevisables = 5, registroCompleto = 4, pct = 58.0),
        )
        assertEquals(
            "3.6 de 5 días en puntos · 3 retardos = 1 falta (no se descuenta sola) · registro completo 4 de 5",
            KpisEquipoRules.disciplinaTexto(t),
        )
        assertEquals("3 retardos = 1 falta · registro 4/5", KpisEquipoRules.disciplinaPie(t))
        assertNull(KpisEquipoRules.disciplinaTexto(KpiTotalesDto(disciplina = KpiDisciplinaDto(esperados = 0))))
        assertEquals(
            "Sin retardos",
            KpisEquipoRules.disciplinaPie(KpiTotalesDto(disciplina = KpiDisciplinaDto(esperados = 5, puntos = 5.0, retardos = 0, jornadasRevisables = 5, registroCompleto = 5, pct = 100.0))),
        )
    }

    @Test
    fun theSummaryOfAPersonReadsLikeTheWeb() {
        val t = KpiTotalesDto(
            entregas = KpiEntregasDto(medidas = 33, aTiempo = 31, sinEntregar = 1),
            minutosProductivos = 128 * 60,
            minutosLaborados = 212 * 60,
        )
        assertEquals("Entregó 31 de 33 a tiempo y 1 quedó sin entregar. Tuvo una actividad corriendo 128 h de 212 h en jornada.", KpisEquipoRules.resumen(t))
        assertEquals("No tuvo entregas que medir en estas fechas.", KpisEquipoRules.resumen(KpiTotalesDto()))
    }

    /** La lectura de la web: «Su equipo» primero si coordina, y luego horas estándar, calidad y disciplina. */
    @Test
    fun theReadingOfACoordinatorStartsWithTheirTeam() {
        val t = totales(88.0, entregas(medidas = 12, aTiempo = 11, revisadas = 10, aLaPrimera = 9)).copy(
            cumplimientoPartes = partesV2,
            retardos = 2,
            minutosTarde = 35,
            calificacion = KpiCalificacionDto(n = 6, pct = 80.4),
            asistenciaPuntual = KpiAsistenciaPuntualDto(esperados = 5, puntuales = 3),
            uniforme = KpiUniformeDto(revisadas = 5, ok = 5),
            equipo = KpiEquipoCoordinadoDto(personas = 4, aTiempo = 40, medidas = 44, revisiones = KpiRevisionesDto(total = 20, enPlazo = 18)),
        )
        val lectura = KpisEquipoRules.lectura(t)
        assertEquals(
            listOf("Su equipo", "Horas estándar ganadas", "Aprobadas a la primera", "Calificación calibrada", "Retardos", "Puntualidad y registro", "Uniforme"),
            lectura.map { it.etiqueta },
        )
        assertEquals("4 personas · 40 de 44 a tiempo · revisó 18 de 20 en 24 h hábiles", lectura[0].valor)
        assertEquals("Sin entregas con tiempo estándar", lectura[1].valor)
        assertEquals("9 de 10", lectura[2].valor)
        assertEquals("80 de 100 (6)", lectura[3].valor)
        assertEquals("2 · 35 m", lectura[4].valor)
        // Sin la disciplina graduada, la asistencia puntual de siempre.
        assertEquals("3 de 5 días", lectura[5].valor)
        assertEquals("5 de 5", lectura[6].valor)
        // Quien no coordina no tiene «Su equipo».
        assertFalse(KpisEquipoRules.lectura(t.copy(equipo = null)).any { it.etiqueta == "Su equipo" })
    }

    @Test
    fun unfoldingShowsTheReadingThenTimeInActivitiesAndHours() {
        val t = totales(94.0, entregas(medidas = 18, aTiempo = 17)).copy(
            productividadPct = 73.0,
            minutosProductivos = 29 * 60 + 10,
            minutosLaborados = 40 * 60,
        )
        val lineas = KpisEquipoRules.lineasDesplegadas(t)
        assertEquals("Horas estándar ganadas", lineas.first().etiqueta)
        assertEquals(listOf("Tiempo en actividades", "Horas"), lineas.takeLast(2).map { it.etiqueta })
        assertEquals("73 % · 29 h 10 m de 40 h", lineas[lineas.size - 2].valor)
        // API vieja: productividad y horas siguen en la tarjeta, no se repiten abajo.
        assertTrue(KpisEquipoRules.lineasDesplegadas(KpiTotalesDto(diasConJornada = 5)).isEmpty())
    }
}
