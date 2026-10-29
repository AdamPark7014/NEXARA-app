package mx.nexara.mobile.nativeapp.ui.console.inicio

import java.time.Instant
import java.time.LocalDate
import mx.nexara.mobile.nativeapp.data.api.AprobacionPendienteDto
import mx.nexara.mobile.nativeapp.data.api.KpiAsistenciaPuntualDto
import mx.nexara.mobile.nativeapp.data.api.KpiBloqueDto
import mx.nexara.mobile.nativeapp.data.api.KpiEntregasDto
import mx.nexara.mobile.nativeapp.data.api.KpiParteCumplimientoDto
import mx.nexara.mobile.nativeapp.data.api.KpiPilarDto
import mx.nexara.mobile.nativeapp.data.api.KpiTotalesDto
import mx.nexara.mobile.nativeapp.data.api.KpisEquipoDto
import mx.nexara.mobile.nativeapp.data.api.PagoEmpleadoDto
import mx.nexara.mobile.nativeapp.data.api.RevisionPendienteDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import mx.nexara.mobile.nativeapp.ui.console.more.KpisEquipoRules
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

    /** El anillo es el índice v2 del equipo y los renglones, sus cuatro pilares; nada de «ocupación». */
    @Test
    fun desempenoConIndiceYPilares() {
        val k = KpisEquipoDto(
            equipo = KpiBloqueDto(
                totales = KpiTotalesDto(
                    entregas = KpiEntregasDto(medidas = 47, aTiempo = 41),
                    asistenciaPuntual = KpiAsistenciaPuntualDto(pct = 91.6),
                    productividadPct = 78.2,
                    cumplimientoPct = 86.4,
                    cumplimientoPartes = listOf(
                        KpiParteCumplimientoDto("entregas", "Entregas a tiempo", 87.0, 30.0, "41 de 47"),
                        KpiParteCumplimientoDto("forma", "Calidad", 92.0, 25.0, "30 de 33 aprobadas a la primera"),
                        KpiParteCumplimientoDto("estandar", "Horas estándar ganadas", 74.0, 30.0, "…"),
                        KpiParteCumplimientoDto("asistencia", "Asistencia puntual", 92.0, 15.0, "…"),
                        KpiParteCumplimientoDto("ocupacion", "Siempre con algo", 70.0, 0.0, "… · diagnóstico"),
                    ),
                ),
            ),
        )
        val d = r.desempeno(k)!!
        assertEquals(86, d.indicePct)
        assertFalse(d.provisional)
        assertEquals(listOf("Confiabilidad 87 · Calidad 92", "Rendimiento 74 · Disciplina 92"), d.renglones)
        assertTrue(d.renglones.none { it.contains("ocupación", ignoreCase = true) })
        assertEquals("Índice 86 de 100", r.descripcionAnillo(d))
        assertNull(r.desempeno(null))
        assertNull(r.desempeno(KpisEquipoDto(equipo = KpiBloqueDto(totales = KpiTotalesDto()))))
    }

    /** Con `pilares[]` y `semaforoIndice` del API, los renglones y el color del anillo salen de ahí. */
    @Test
    fun desempenoConPilaresYSemaforoDelApi() {
        val d = r.desempeno(
            KpisEquipoDto(
                equipo = KpiBloqueDto(
                    totales = KpiTotalesDto(
                        entregas = KpiEntregasDto(medidas = 47, aTiempo = 41),
                        cumplimientoPct = 86.0,
                        semaforoIndice = "amarillo",
                        confianza = "alta",
                        pilares = listOf(
                            KpiPilarDto("confiabilidad", "Confiabilidad", 87.0, "amarillo"),
                            KpiPilarDto("calidad", "Calidad", 92.0, "verde"),
                            KpiPilarDto("rendimiento", "Rendimiento", 74.0, "rojo"),
                            KpiPilarDto("disciplina", "Disciplina", null, "sin_datos"),
                        ),
                    ),
                ),
            ),
        )!!
        assertEquals(listOf("Confiabilidad 87 · Calidad 92", "Rendimiento 74 · Disciplina —"), d.renglones)
        assertEquals(KpisEquipoRules.Semaforo.AMARILLO, d.tono)
        // Sin `semaforoIndice`, el corte 90/75: 86 es ámbar; 93 sería verde.
        val sinApi = r.desempeno(
            KpisEquipoDto(equipo = KpiBloqueDto(totales = KpiTotalesDto(entregas = KpiEntregasDto(medidas = 30, aTiempo = 29), cumplimientoPct = 93.0))),
        )!!
        assertEquals(KpisEquipoRules.Semaforo.VERDE, sinApi.tono)
    }

    /** Sin partes (API anterior) quedan las entregas a tiempo; con menos de 10 entregas, provisional. */
    @Test
    fun desempenoSinPartesYProvisional() {
        val viejo = r.desempeno(
            KpisEquipoDto(equipo = KpiBloqueDto(totales = KpiTotalesDto(entregas = KpiEntregasDto(medidas = 47, aTiempo = 41), cumplimientoPct = 86.0))),
        )!!
        assertEquals(listOf("Entregas a tiempo 41 de 47"), viejo.renglones)

        val pocas = r.desempeno(
            KpisEquipoDto(
                equipo = KpiBloqueDto(
                    totales = KpiTotalesDto(
                        entregas = KpiEntregasDto(medidas = 6, aTiempo = 6),
                        cumplimientoPct = 95.0,
                        cumplimientoPartes = listOf(KpiParteCumplimientoDto("entregas", "Entregas a tiempo", 100.0, 30.0, "6 de 6")),
                    ),
                ),
            ),
        )!!
        assertTrue(pocas.provisional)
        assertEquals(
            listOf("Confiabilidad 100 · Calidad —", "Rendimiento — · Disciplina —", "Índice provisional: 6 entregas medidas"),
            pocas.renglones,
        )
        assertEquals("Índice 95 de 100, provisional", r.descripcionAnillo(pocas))
    }

    @Test
    fun sieteDiasHastaHoy() {
        assertEquals("2026-10-23" to "2026-10-29", r.rangoSieteDias(LocalDate.of(2026, 10, 29)))
    }
}
