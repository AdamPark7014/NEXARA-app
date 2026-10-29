package mx.nexara.mobile.nativeapp.ui.console.inicio

import java.time.Instant
import java.time.LocalDate
import mx.nexara.mobile.nativeapp.data.api.AprobacionPendienteDto
import mx.nexara.mobile.nativeapp.data.api.KpiAsistenciaPuntualDto
import mx.nexara.mobile.nativeapp.data.api.KpiBloqueDto
import mx.nexara.mobile.nativeapp.data.api.KpiEntregasDto
import mx.nexara.mobile.nativeapp.data.api.KpiTotalesDto
import mx.nexara.mobile.nativeapp.data.api.KpisEquipoDto
import mx.nexara.mobile.nativeapp.data.api.PagoEmpleadoDto
import mx.nexara.mobile.nativeapp.data.api.RevisionPendienteDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Tablero de dirección en el teléfono (`InicioCeoRules`). */
class InicioCeoRulesTest {
    private val r = InicioCeoRules
    private val ahora = Instant.parse("2026-10-29T18:00:00Z")

    @Test
    fun equipoDeHoyCuentaJornadaTrabajoYAtrasos() {
        val users = listOf(
            TeamBoardUserDto(id = 1, nombre = "A", status = "activo", entradaHoyAtJson = "2026-10-29T14:00:00Z"),
            TeamBoardUserDto(id = 2, nombre = "B", status = "atrasado", entradaHoyAtJson = "2026-10-29T14:00:00Z"),
            TeamBoardUserDto(id = 3, nombre = "C", status = "sin_actividad", entradaHoyAtJson = "2026-10-29T14:00:00Z"),
            TeamBoardUserDto(id = 4, nombre = "D", status = "sin_actividad", entradaHoyAtJson = null),
        )
        val e = r.equipoHoy(users)!!
        assertEquals(4, e.total)
        assertEquals(3, e.enJornada)
        assertEquals(1, e.trabajando)
        assertEquals(1, e.sinActividad)
        assertEquals(1, e.atrasadas)
        assertNull(r.equipoHoy(emptyList()))
    }

    @Test
    fun pendientesSoloLoQueTieneAlgo() {
        val revisiones = listOf(
            RevisionPendienteDto(activityId = 1, enviadaAt = "2026-10-27T18:00:00Z"),
            RevisionPendienteDto(activityId = 2, enviadaAt = "2026-10-29T15:00:00Z"),
        )
        val pagos = listOf(
            PagoEmpleadoDto(id = 1, status = "Borrador", amount = "9200.00"),
            PagoEmpleadoDto(id = 2, status = "Borrador", amount = "9200"),
            PagoEmpleadoDto(id = 3, status = "Pagado", amount = "5000"),
        )
        val p = r.pendientes(revisiones, emptyList<AprobacionPendienteDto>(), pagos, ahora)
        assertEquals(listOf(r.CLAVE_REVISION, r.CLAVE_PAGOS), p.map { it.clave })
        assertEquals("La más vieja, de hace 2 días", p[0].detalle)
        assertEquals(2, p[0].cuenta)
        assertEquals(2, p[1].cuenta)
        assertTrue(p[1].detalle.startsWith("2 en borrador · $18,400"))
        assertTrue(r.pendientes(null, null, null, ahora).isEmpty())
    }

    @Test
    fun desempenoConAnilloYRenglones() {
        val k = KpisEquipoDto(
            equipo = KpiBloqueDto(
                totales = KpiTotalesDto(
                    entregas = KpiEntregasDto(medidas = 47, aTiempo = 41),
                    asistenciaPuntual = KpiAsistenciaPuntualDto(pct = 91.6),
                    productividadPct = 78.2,
                    cumplimientoPct = 86.4,
                ),
            ),
        )
        val d = r.desempeno(k)!!
        assertEquals(86, d.cumplimientoPct)
        assertEquals(listOf("Entregas a tiempo 41 de 47", "Asistencia puntual 92 % · ocupación 78 %"), d.renglones)
        assertNull(r.desempeno(null))
        assertNull(r.desempeno(KpisEquipoDto(equipo = KpiBloqueDto(totales = KpiTotalesDto()))))
    }

    @Test
    fun sieteDiasHastaHoy() {
        assertEquals("2026-10-23" to "2026-10-29", r.rangoSieteDias(LocalDate.of(2026, 10, 29)))
    }
}
