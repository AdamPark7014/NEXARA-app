package mx.nexara.mobile.nativeapp.ui.console.more

import mx.nexara.mobile.nativeapp.data.api.KpiPersonaDto
import mx.nexara.mobile.nativeapp.data.api.KpiPersonaFilaDto
import mx.nexara.mobile.nativeapp.data.api.KpiTotalesDto
import mx.nexara.mobile.nativeapp.data.api.KpiUniformeDto
import org.junit.Assert.assertEquals
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
}
