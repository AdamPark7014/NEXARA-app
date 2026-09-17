package mx.nexara.mobile.nativeapp.ui.console.comidas

import java.time.Instant
import mx.nexara.mobile.nativeapp.data.api.ComidaFilaDto
import mx.nexara.mobile.nativeapp.data.api.ComidaMiDiaDto
import mx.nexara.mobile.nativeapp.data.api.ComidaRegistroDto
import mx.nexara.mobile.nativeapp.data.api.ComidaResumenDto
import mx.nexara.mobile.nativeapp.data.api.ComidaVentanaDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Hora de comida: ventana 15:00–16:00 México, regreso hasta 16:05, justificación ≥5 letras. */
class ComidasRulesTest {

    private val mi = ComidaMiDiaDto(
        ventana = ComidaVentanaDto(
            inicio = "2026-09-14T21:00:00Z",
            fin = "2026-09-14T22:00:00Z",
            regresoLimite = "2026-09-14T22:05:00Z",
            texto = "3:00 a 4:00 p.m.",
        ),
    )

    private fun ms(iso: String) = Instant.parse(iso).toEpochMilli()

    @Test
    fun windowIsEvaluatedWithServerTime() {
        assertTrue(ComidasRules.salidaADestiempo(mi, ms("2026-09-14T20:59:00Z")))
        assertFalse(ComidasRules.salidaADestiempo(mi, ms("2026-09-14T21:30:00Z")))
        assertTrue(ComidasRules.salidaADestiempo(mi, ms("2026-09-14T22:01:00Z")))
        assertFalse(ComidasRules.regresoADestiempo(mi, ms("2026-09-14T22:04:00Z")))
        assertTrue(ComidasRules.regresoADestiempo(mi, ms("2026-09-14T22:06:00Z")))
    }

    @Test
    fun withoutAWindowTheApiFlagsDecide() {
        assertTrue(ComidasRules.salidaADestiempo(ComidaMiDiaDto(salidaADestiempo = true), 0L))
        assertFalse(ComidasRules.regresoADestiempo(ComidaMiDiaDto(regresoADestiempo = false), 0L))
    }

    @Test
    fun serverOffsetAndMinutesAtLunch() {
        assertEquals(120_000L, ComidasRules.offsetMs("2026-09-14T21:00:00Z", ms("2026-09-14T20:58:00Z")))
        assertEquals(0L, ComidasRules.offsetMs(null, 123L))
        assertEquals(35L, ComidasRules.minutosDesde("2026-09-14T21:00:00Z", ms("2026-09-14T21:35:00Z")))
    }

    @Test
    fun teamFilters() {
        val filas = listOf(
            ComidaFilaDto(userId = 1, registro = ComidaRegistroDto(id = 10, checkinTime = "x", revisionEstado = "PENDIENTE")),
            ComidaFilaDto(userId = 2, registro = ComidaRegistroDto(id = 11, checkinTime = "x", checkoutTime = "y", revisionEstado = "APROBADA")),
            ComidaFilaDto(userId = 3, registro = ComidaRegistroDto(id = 12, checkinTime = "x", checkoutTime = "y")),
            ComidaFilaDto(userId = 4, registro = null),
        )
        assertEquals(listOf(1L), ComidasRules.filtrar(filas, ComidasRules.Filtro.PENDIENTES).map { it.userId })
        assertEquals(listOf(1L, 2L), ComidasRules.filtrar(filas, ComidasRules.Filtro.DESTIEMPO).map { it.userId })
        assertEquals(listOf(1L), ComidasRules.filtrar(filas, ComidasRules.Filtro.COMIENDO).map { it.userId })
        assertEquals(listOf(4L), ComidasRules.filtrar(filas, ComidasRules.Filtro.SIN).map { it.userId })
        assertEquals(4, ComidasRules.filtrar(filas, ComidasRules.Filtro.TODOS).size)

        val resumen = ComidaResumenDto(total = 4, registraron = 3, enComida = 1, aDestiempo = 2, pendientes = 1)
        assertEquals(1, ComidasRules.conteo(ComidasRules.Filtro.SIN, resumen))
        assertEquals(2, ComidasRules.conteo(ComidasRules.Filtro.DESTIEMPO, resumen))
        assertNull(ComidasRules.conteo(ComidasRules.Filtro.TODOS, null))
    }

    @Test
    fun revisionAndRowLabels() {
        assertNull(ComidasRules.estadoRevision(null))
        assertEquals("Por aprobar", ComidasRules.estadoRevision("PENDIENTE")?.label)
        assertEquals("Justificación aprobada", ComidasRules.estadoRevision("APROBADA")?.label)
        assertEquals("Justificación rechazada", ComidasRules.estadoRevision("RECHAZADA")?.label)
        assertEquals("Sin registrar", ComidasRules.estadoFila(null).label)
        assertEquals("En comida", ComidasRules.estadoFila(ComidaRegistroDto(id = 1, checkinTime = "x")).label)
        assertEquals("Completa", ComidasRules.estadoFila(ComidaRegistroDto(id = 1, checkinTime = "x", checkoutTime = "y")).label)
    }

    @Test
    fun apiRejectionAsksForTheReason() {
        assertTrue(
            ComidasRules.pideMotivoPorError(
                "Estás fuera del horario de comida (3:00 a 4:00 p.m.): escribe por qué sales a comer a esta hora.",
            ),
        )
        assertTrue(ComidasRules.pideMotivoPorError("Ya pasó la hora de regreso de comida (4:00 p.m.): escribe por qué regresas a esta hora."))
        assertFalse(ComidasRules.pideMotivoPorError("Sin conexión. Revisa tu red e intenta de nuevo."))
        assertFalse(ComidasRules.justificacionValida("  ok  "))
        assertTrue(ComidasRules.justificacionValida("Junta con cliente"))
    }

    @Test
    fun decisionLines() {
        val aprobada = ComidaRegistroDto(id = 1, revisionEstado = "APROBADA", revisadoPor = "Luis Hernández Soto")
        assertEquals("Luis Hernández la aprobó.", ComidasRules.decisionPropia(aprobada))
        val rechazada = ComidaRegistroDto(id = 2, revisionEstado = "RECHAZADA", revisionNotas = "No avisaste")
        assertEquals("Tu jefe la rechazó: «No avisaste»", ComidasRules.decisionPropia(rechazada))
        assertEquals("— rechazó: «No avisaste»", ComidasRules.decisionEquipo(rechazada))
        assertNull(ComidasRules.decisionPropia(ComidaRegistroDto(id = 3, revisionEstado = "PENDIENTE")))
        assertEquals(
            "Registraste tu salida a comer. Tu justificación quedó por aprobar.",
            ComidasRules.mensajeRegistro(ComidasRules.SALIDA, conMotivo = true),
        )
        assertEquals("Registraste tu regreso de comer.", ComidasRules.mensajeRegistro(ComidasRules.REGRESO, conMotivo = false))
    }
}
