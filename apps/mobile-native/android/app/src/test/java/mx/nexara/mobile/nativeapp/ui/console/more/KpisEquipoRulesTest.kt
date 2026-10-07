package mx.nexara.mobile.nativeapp.ui.console.more

import mx.nexara.mobile.nativeapp.data.api.KpiEntregasDto
import mx.nexara.mobile.nativeapp.data.api.KpiParteCumplimientoDto
import mx.nexara.mobile.nativeapp.data.api.KpiPersonaDto
import mx.nexara.mobile.nativeapp.data.api.KpiPersonaFilaDto
import mx.nexara.mobile.nativeapp.data.api.KpiTotalesDto
import mx.nexara.mobile.nativeapp.data.api.KpiUniformeDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Lo que puede mentir en una pantalla de indicadores: un cero que parece un dato
 * y no lo es, y un orden que esconde a quien está mal.
 */
class KpisEquipoRulesTest {

    private fun fila(
        id: Long,
        nombre: String,
        semaforo: String?,
        puesto: String? = null,
        email: String? = null,
        totales: KpiTotalesDto? = null,
    ) = KpiPersonaFilaDto(
        persona = KpiPersonaDto(id = id, nombre = nombre, puesto = puesto, email = email),
        semaforo = semaforo,
        totales = totales,
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

    @Test
    fun theTrafficLightOfAPercentageFollowsTheThresholds() {
        assertEquals(KpisEquipoRules.Semaforo.VERDE, KpisEquipoRules.tonoPct(90.0))
        assertEquals(KpisEquipoRules.Semaforo.VERDE, KpisEquipoRules.tonoPct(KpisEquipoRules.PCT_BUENO))
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, KpisEquipoRules.tonoPct(70.0))
        assertEquals(KpisEquipoRules.Semaforo.ROJO, KpisEquipoRules.tonoPct(10.0))
        assertEquals(KpisEquipoRules.Semaforo.SIN_DATOS, KpisEquipoRules.tonoPct(null))
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
        val datos = KpisEquipoRules.datosPersona(KpiTotalesDto(diasConJornada = 5, retardos = 1))
        assertEquals(3, datos.size)
        assertEquals(listOf("Puntualidad", "Productividad", "Horas"), datos.map { it.etiqueta })
    }

    @Test
    fun withoutTeamDataThereIsNoStrip() {
        assertTrue(KpisEquipoRules.datosEquipo(null).isEmpty())
        assertTrue(
            KpisEquipoRules.datosEquipo(
                mx.nexara.mobile.nativeapp.data.api.KpisEquipoDto(equipo = null),
            ).isEmpty(),
        )
    }

    @Test
    fun theScopeIsSaidInPlainWords() {
        assertEquals("Toda la empresa", KpisEquipoRules.alcance("company"))
        assertEquals("Mi equipo", KpisEquipoRules.alcance("subtree"))
        assertEquals("Mi equipo", KpisEquipoRules.alcance(null))
    }

    // ── Cumplimiento en tiempo y forma (07-10) ──────────────────────────────

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

    /**
     * Lo que pidió Adam: Luis y Daniela cumplen más en tiempo y forma y tienen
     * que salir arriba, aunque David tenga el reloj prendido todo el día.
     */
    @Test
    fun withComplianceTheOneWhoDeliversMoreOnTimeGoesFirst() {
        val personas = listOf(
            fila(1, "David Morales", "rojo", totales = totales(52.0, entregas(medidas = 1, aTiempo = 0, tarde = 1))),
            fila(38, "Daniela", "verde", totales = totales(96.0, entregas(medidas = 14, aTiempo = 13))),
            fila(7, "Luis", "verde", totales = totales(96.0, entregas(medidas = 18, aTiempo = 17))),
            fila(9, "Ana", "sin_datos", totales = totales(null, entregas(medidas = 0, aTiempo = 0))),
            fila(4, "Beto", "amarillo", totales = totales(80.0, entregas(medidas = 5, aTiempo = 4))),
        )
        assertEquals(
            // Mismo cumplimiento: más entregas a tiempo primero. Sin dato (Ana), al final.
            listOf("Luis", "Daniela", "Beto", "David Morales", "Ana"),
            KpisEquipoRules.ordenar(personas).map { it.persona?.nombre },
        )
        assertEquals("Por cumplimiento, de mayor a menor", KpisEquipoRules.subtituloLista(personas))
    }

    @Test
    fun aComplianceTieWithTheSameOnTimeCountGoesByName() {
        val personas = listOf(
            fila(1, "Zoe", "verde", totales = totales(90.0, entregas(medidas = 5, aTiempo = 5))),
            fila(2, "Ángel", "verde", totales = totales(90.0, entregas(medidas = 5, aTiempo = 5))),
        )
        // «Ángel» va con la A, no después de la Z.
        assertEquals(listOf("Ángel", "Zoe"), KpisEquipoRules.ordenar(personas).map { it.persona?.nombre })
    }

    /** Una API que aún no manda el cumplimiento deja el orden de antes: rojo primero. */
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

    /** Con la API nueva, `cumplimientoPct: null` es «sin entregas», no una API vieja. */
    @Test
    fun aNullComplianceFromTheNewApiIsStillTheNewApi() {
        assertTrue(KpisEquipoRules.conCumplimiento(totales(null, entregas(medidas = 0, aTiempo = 0))))
        assertFalse(KpisEquipoRules.conCumplimiento(KpiTotalesDto()))
        assertFalse(KpisEquipoRules.conCumplimiento(null))
    }

    @Test
    fun complianceFollowsTheDeliveryCuts() {
        assertEquals(KpisEquipoRules.Semaforo.VERDE, KpisEquipoRules.tonoCumplimiento(90.0))
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, KpisEquipoRules.tonoCumplimiento(89.9))
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, KpisEquipoRules.tonoCumplimiento(75.0))
        assertEquals(KpisEquipoRules.Semaforo.ROJO, KpisEquipoRules.tonoCumplimiento(74.9))
        assertEquals(KpisEquipoRules.Semaforo.SIN_DATOS, KpisEquipoRules.tonoCumplimiento(null))
    }

    @Test
    fun withComplianceTheCardShowsComplianceDeliveriesAndPunctuality() {
        val datos = KpisEquipoRules.datosPersona(
            totales(96.0, entregas(medidas = 18, aTiempo = 17, tarde = 1, revisadas = 18, aLaPrimera = 18)),
        )
        assertEquals(listOf("Cumplimiento", "Entregas", "Puntualidad"), datos.map { it.etiqueta })
        assertEquals("96 %", datos[0].valor)
        assertEquals(KpisEquipoRules.Semaforo.VERDE, datos[0].tono)
        assertEquals("17/18", datos[1].valor)
        assertEquals("a tiempo · 18/18 a la primera", datos[1].pie)
        // 17 de 18 = 94 %: verde con los cortes del cumplimiento.
        assertEquals(KpisEquipoRules.Semaforo.VERDE, datos[1].tono)
    }

    @Test
    fun withoutDeliveriesTheCardSaysSoInsteadOfAZero() {
        val datos = KpisEquipoRules.datosPersona(totales(null, entregas(medidas = 0, aTiempo = 0)))
        assertEquals("—", datos[0].valor)
        assertEquals("Sin entregas", datos[0].pie)
        assertEquals(KpisEquipoRules.Semaforo.SIN_DATOS, datos[0].tono)
        assertEquals("—", datos[1].valor)
        assertEquals("Sin entregas", datos[1].pie)
    }

    @Test
    fun deliveriesWithoutReviewsOnlySayOnTime() {
        val dato = KpisEquipoRules.entregasDato(totales(70.0, entregas(medidas = 4, aTiempo = 2, tarde = 2)))
        assertEquals("2/4", dato.valor)
        assertEquals("a tiempo", dato.pie)
        assertEquals(KpisEquipoRules.Semaforo.ROJO, dato.tono)
    }

    @Test
    fun theTeamStripLeadsWithComplianceAndTimeInActivitiesHasNoTrafficLight() {
        val t = totales(94.0, entregas(medidas = 18, aTiempo = 17, tarde = 1, revisadas = 18, aLaPrimera = 18))
            .copy(minutosProductivos = 92 * 60 + 10, minutosLaborados = 189 * 60, productividadPct = 49.0)
        val datos = KpisEquipoRules.datosEquipo(
            mx.nexara.mobile.nativeapp.data.api.KpisEquipoDto(
                equipo = mx.nexara.mobile.nativeapp.data.api.KpiBloqueDto(totales = t),
            ),
        )
        assertEquals(
            listOf("Cumplimiento", "Puntualidad", "Tiempo en actividades", "Uniforme", "Tiempo extra"),
            datos.map { it.etiqueta },
        )
        assertEquals("17 de 18 entregas a tiempo · 0 devueltas", datos[0].pie)
        assertEquals("92 h de 189 h en jornada", datos[2].pie)
        assertEquals(KpisEquipoRules.Semaforo.SIN_DATOS, datos[2].tono)
    }

    @Test
    fun anOldApiKeepsTheUsualStrip() {
        val datos = KpisEquipoRules.datosEquipo(
            mx.nexara.mobile.nativeapp.data.api.KpisEquipoDto(
                equipo = mx.nexara.mobile.nativeapp.data.api.KpiBloqueDto(
                    totales = KpiTotalesDto(diasConJornada = 5, productividadPct = 80.0),
                ),
            ),
        )
        assertEquals(listOf("Puntualidad", "Productividad", "Uniforme", "Tiempo extra"), datos.map { it.etiqueta })
    }

    @Test
    fun theTeamDeliveriesCaptionCountsInPlural() {
        assertEquals("Sin entregas en estas fechas", KpisEquipoRules.entregasDelEquipo(null))
        assertEquals("Sin entregas en estas fechas", KpisEquipoRules.entregasDelEquipo(entregas(0, 0)))
        assertEquals(
            "1 de 1 entrega a tiempo · 1 devuelta",
            KpisEquipoRules.entregasDelEquipo(entregas(medidas = 1, aTiempo = 1, devueltas = 1)),
        )
    }

    /**
     * Las partes se pintan como lleguen: ni cuántas son, ni sus claves, ni sus
     * pesos están escritos en la app. Una parte nueva sin etiqueta usa su clave.
     */
    @Test
    fun complianceRowsAreWhateverTheApiSends() {
        val t = totales(94.0, entregas(medidas = 18, aTiempo = 17)).copy(
            cumplimientoPartes = listOf(
                KpiParteCumplimientoDto("entregas", "Entregas a tiempo", 94.0, 40.0, "17 de 18"),
                KpiParteCumplimientoDto("carga", "Carga de trabajo", 88.0, 12.5, "7 de 8 días"),
                KpiParteCumplimientoDto("tiempo_adecuado", null, 100.0, 5.0, null),
                KpiParteCumplimientoDto(null, null, 50.0, 5.0, "nada"),
            ),
        )
        val partes = KpisEquipoRules.partesCumplimiento(t)
        assertEquals(
            listOf(
                KpisEquipoRules.Linea("Entregas a tiempo", "17 de 18 · 94 % · pesa 40 %"),
                KpisEquipoRules.Linea("Carga de trabajo", "7 de 8 días · 88 % · pesa 12.5 %"),
                KpisEquipoRules.Linea("Tiempo adecuado", "100 % · pesa 5 %"),
            ),
            partes,
        )
    }

    @Test
    fun unfoldingShowsThePartsThenTimeInActivitiesAndHours() {
        val t = totales(94.0, entregas(medidas = 18, aTiempo = 17)).copy(
            cumplimientoPartes = listOf(KpiParteCumplimientoDto("forma", "Aprobadas a la primera", 100.0, 25.0, "18 de 18")),
            productividadPct = 73.0,
            minutosProductivos = 29 * 60 + 10,
            minutosLaborados = 40 * 60,
        )
        assertEquals(
            listOf("Aprobadas a la primera", "Tiempo en actividades", "Horas"),
            KpisEquipoRules.lineasDesplegadas(t).map { it.etiqueta },
        )
        assertEquals("73 % · 29 h 10 m de 40 h", KpisEquipoRules.lineasDesplegadas(t)[1].valor)
        // API vieja: productividad y horas siguen en la tarjeta, no se repiten abajo.
        assertTrue(KpisEquipoRules.lineasDesplegadas(KpiTotalesDto(diasConJornada = 5)).isEmpty())
    }
}
