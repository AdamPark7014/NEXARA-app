package mx.nexara.mobile.nativeapp.ui.console.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * El conteo de días es lo que se prueba de verdad aquí.
 *
 * `hr.service.ts::createLeave` guarda `ceil((fin - inicio)/1 día) + 1`. Si el
 * móvil enseñara otra cifra, el empleado firmaría una solicitud por unos días y
 * el saldo le descontaría otros.
 */
class HrLeaveRequestFormTest {

    private val types = listOf(
        "VACATION", "SICK", "PERSONAL", "MATERNITY", "PATERNITY", "BEREAVEMENT", "UNPAID",
    )

    // ── Conteo de días ────────────────────────────────────────────────────

    @Test
    fun `un permiso de un solo dia cuenta uno, no cero`() {
        val d = LocalDate.of(2026, 9, 15)
        assertEquals(1L, HrLeaveRequestForm.daysBetween(d, d))
    }

    @Test
    fun `de lunes a viernes son cinco dias, ambos extremos incluidos`() {
        assertEquals(
            5L,
            HrLeaveRequestForm.daysBetween(LocalDate.of(2026, 9, 14), LocalDate.of(2026, 9, 18)),
        )
    }

    @Test
    fun `el conteo cruza el fin de mes sin perder dias`() {
        assertEquals(
            3L,
            HrLeaveRequestForm.daysBetween(LocalDate.of(2026, 1, 31), LocalDate.of(2026, 2, 2)),
        )
    }

    @Test
    fun `el 29 de febrero de un anio bisiesto se cuenta`() {
        assertEquals(
            3L,
            HrLeaveRequestForm.daysBetween(LocalDate.of(2028, 2, 28), LocalDate.of(2028, 3, 1)),
        )
    }

    // ── Vista previa ──────────────────────────────────────────────────────

    @Test
    fun `la vista previa singulariza el dia unico`() {
        assertEquals("1 día", HrLeaveRequestForm.daysPreview("2026-09-15", "2026-09-15"))
    }

    @Test
    fun `la vista previa pluraliza el rango`() {
        assertEquals("5 días", HrLeaveRequestForm.daysPreview("2026-09-14", "2026-09-18"))
    }

    @Test
    fun `la vista previa calla si el rango esta invertido o incompleto`() {
        assertEquals("", HrLeaveRequestForm.daysPreview("2026-09-18", "2026-09-14"))
        assertEquals("", HrLeaveRequestForm.daysPreview("2026-09-14", ""))
        assertEquals("", HrLeaveRequestForm.daysPreview("15/09/2026", "18/09/2026"))
    }

    // ── Parseo de fechas ──────────────────────────────────────────────────

    @Test
    fun `parseDate acepta ISO y rechaza cualquier otra cosa sin lanzar`() {
        assertEquals(LocalDate.of(2026, 9, 15), HrLeaveRequestForm.parseDate("2026-09-15"))
        assertEquals(LocalDate.of(2026, 9, 15), HrLeaveRequestForm.parseDate("  2026-09-15  "))
        assertNull(HrLeaveRequestForm.parseDate("15/09/2026"))
        assertNull(HrLeaveRequestForm.parseDate("2026-13-01"))
        assertNull(HrLeaveRequestForm.parseDate(""))
        assertNull(HrLeaveRequestForm.parseDate("mañana"))
    }

    // ── Validación ────────────────────────────────────────────────────────

    @Test
    fun `una solicitud de vacaciones sin motivo es valida`() {
        val r = HrLeaveRequestForm.validate("VACATION", "2026-09-14", "2026-09-18", "", types)
        assertTrue(r is HrLeaveRequestForm.Result.Valid)
        val v = r as HrLeaveRequestForm.Result.Valid
        assertEquals("VACATION", v.type)
        assertEquals(5L, v.days)
        assertNull(v.reason)
    }

    @Test
    fun `el permiso personal exige motivo`() {
        val r = HrLeaveRequestForm.validate("PERSONAL", "2026-09-14", "2026-09-14", "   ", types)
        assertTrue(r is HrLeaveRequestForm.Result.Invalid)
    }

    @Test
    fun `el permiso sin goce de sueldo exige motivo`() {
        val r = HrLeaveRequestForm.validate("UNPAID", "2026-09-14", "2026-09-14", "", types)
        assertTrue(r is HrLeaveRequestForm.Result.Invalid)
    }

    @Test
    fun `el permiso personal con motivo pasa`() {
        val r = HrLeaveRequestForm.validate("PERSONAL", "2026-09-14", "2026-09-14", " Cita médica ", types)
        assertTrue(r is HrLeaveRequestForm.Result.Valid)
        assertEquals("Cita médica", (r as HrLeaveRequestForm.Result.Valid).reason)
    }

    @Test
    fun `el rango invertido se rechaza antes de salir a la red`() {
        val r = HrLeaveRequestForm.validate("VACATION", "2026-09-18", "2026-09-14", "", types)
        assertTrue(r is HrLeaveRequestForm.Result.Invalid)
        assertTrue((r as HrLeaveRequestForm.Result.Invalid).message.contains("anterior"))
    }

    @Test
    fun `un tipo inventado se rechaza antes de reventar en la base de datos`() {
        // El API hace `dto.type as any`: una clave desconocida llega a Prisma y
        // el error que vuelve no dice nada útil.
        val r = HrLeaveRequestForm.validate("SABATICO", "2026-09-14", "2026-09-18", "", types)
        assertTrue(r is HrLeaveRequestForm.Result.Invalid)
    }

    @Test
    fun `el tipo se normaliza a mayusculas`() {
        val r = HrLeaveRequestForm.validate("vacation", "2026-09-14", "2026-09-18", "", types)
        assertTrue(r is HrLeaveRequestForm.Result.Valid)
        assertEquals("VACATION", (r as HrLeaveRequestForm.Result.Valid).type)
    }

    @Test
    fun `el tipo vacio se rechaza`() {
        val r = HrLeaveRequestForm.validate("", "2026-09-14", "2026-09-18", "", types)
        assertTrue(r is HrLeaveRequestForm.Result.Invalid)
    }

    @Test
    fun `una fecha ilegible se rechaza con mensaje que dice el formato`() {
        val r = HrLeaveRequestForm.validate("VACATION", "14-09-2026", "2026-09-18", "", types)
        assertTrue(r is HrLeaveRequestForm.Result.Invalid)
        assertTrue((r as HrLeaveRequestForm.Result.Invalid).message.contains("AAAA-MM-DD"))
    }

    @Test
    fun `la validacion normaliza las fechas al formato que espera el API`() {
        val r = HrLeaveRequestForm.validate("SICK", " 2026-09-14 ", " 2026-09-16 ", "Gripe", types)
        val v = r as HrLeaveRequestForm.Result.Valid
        assertEquals("2026-09-14", v.startDate)
        assertEquals("2026-09-16", v.endDate)
        assertEquals(3L, v.days)
    }
}
