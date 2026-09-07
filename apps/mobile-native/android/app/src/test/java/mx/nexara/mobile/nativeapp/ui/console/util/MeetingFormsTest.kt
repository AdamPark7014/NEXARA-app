package mx.nexara.mobile.nativeapp.ui.console.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Las reglas del ritmo operativo, comprobadas sin red.
 *
 * Cada caso de aquí corresponde a un 400 que devuelve
 * `apps/api/src/meetings/meetings.service.ts`. Descubrirlos después del viaje
 * de red deja al usuario con un botón que no hace nada, que es la queja
 * original sobre la app.
 */
class MeetingFormsTest {

    private fun invalid(result: MeetingForms.Result<*>): String {
        assertTrue("Se esperaba Invalid y llegó $result", result is MeetingForms.Result.Invalid)
        return (result as MeetingForms.Result.Invalid).message
    }

    private fun <T> valid(result: MeetingForms.Result<T>): T {
        assertTrue("Se esperaba Valid y llegó $result", result is MeetingForms.Result.Valid)
        @Suppress("UNCHECKED_CAST")
        return (result as MeetingForms.Result.Valid<T>).value
    }

    // ── Convocatoria ──────────────────────────────────────────────────────

    @Test
    fun `la diaria se convoca solo con tipo y fecha`() {
        val draft = valid(
            MeetingForms.validateMeeting(
                tipo = "DIARIA",
                fecha = "2026-09-07",
                titulo = "",
                horaInicio = "",
                agenda = "",
                asistentes = emptyList(),
            ),
        )
        assertEquals("DIARIA", draft.tipo)
        assertEquals("2026-09-07", draft.fecha)
        // El servidor rellena título, hora y agenda desde MEETING_DEFAULTS.
        assertNull(draft.titulo)
        assertNull(draft.horaInicio)
        assertNull(draft.agenda)
        assertTrue(draft.asistentes.isEmpty())
    }

    @Test
    fun `un tipo inventado se rechaza antes de salir a la red`() {
        assertEquals(
            "Tipo de reunión no reconocido",
            invalid(MeetingForms.validateMeeting("JUNTA_DE_PASILLO", "2026-09-07", "", "", "", emptyList())),
        )
    }

    @Test
    fun `la fecha tiene que ser ISO`() {
        assertEquals(
            "La fecha debe ser AAAA-MM-DD",
            invalid(MeetingForms.validateMeeting("DIARIA", "07-09-2026", "", "", "", emptyList())),
        )
    }

    @Test
    fun `sin fecha no hay convocatoria`() {
        assertEquals(
            "Indica la fecha de la reunión",
            invalid(MeetingForms.validateMeeting("DIARIA", "   ", "", "", "", emptyList())),
        )
    }

    @Test
    fun `la hora se valida en formato de 24 horas`() {
        assertEquals(
            "La hora debe ser HH:MM de 24 horas",
            invalid(MeetingForms.validateMeeting("DIARIA", "2026-09-07", "", "10:00 am", "", emptyList())),
        )
        assertEquals("23:59", valid(MeetingForms.validateMeeting("DIARIA", "2026-09-07", "", "23:59", "", emptyList())).horaInicio)
        assertEquals(
            "La hora debe ser HH:MM de 24 horas",
            invalid(MeetingForms.validateMeeting("DIARIA", "2026-09-07", "", "24:00", "", emptyList())),
        )
    }

    /**
     * Un convocado repetido hace fallar `validateAttendees` con un mensaje
     * sobre empresas que no explica nada de lo que pasó.
     */
    @Test
    fun `los convocados se deduplican y se descartan los ids invalidos`() {
        val draft = valid(
            MeetingForms.validateMeeting(
                tipo = "CIERRE_SEMANAL",
                fecha = "2026-09-11",
                titulo = "",
                horaInicio = "",
                agenda = "",
                asistentes = listOf(7L, 7L, 0L, -3L, 9L),
            ),
        )
        assertEquals(listOf(7L, 9L), draft.asistentes)
    }

    // ── Acuerdos, lecciones y riesgos ─────────────────────────────────────

    /** La regla que da sentido a la junta: un acuerdo sin dueño es un deseo. */
    @Test
    fun `un acuerdo sin responsable se rechaza`() {
        assertEquals(
            "Un acuerdo necesita responsable; una lección o un riesgo, no",
            invalid(MeetingForms.validateAgreement("ACUERDO", "Cambiar el switch de la sucursal", null, "")),
        )
    }

    @Test
    fun `una leccion aprendida no necesita responsable`() {
        val draft = valid(
            MeetingForms.validateAgreement("LECCION", "Pedir el acceso al sitio con 48 h", null, ""),
        )
        assertEquals("LECCION", draft.tipo)
        assertNull(draft.responsableId)
    }

    @Test
    fun `un riesgo tampoco necesita responsable`() {
        val draft = valid(MeetingForms.validateAgreement("RIESGO", "Proveedor con entrega a 6 semanas", null, ""))
        assertNull(draft.responsableId)
    }

    /**
     * Una lección no tiene fecha de entrega. Si alguien la teclea se descarta
     * en vez de guardar un compromiso que nadie va a cumplir.
     */
    @Test
    fun `a la leccion se le quitan responsable y fecha aunque vengan llenos`() {
        val draft = valid(MeetingForms.validateAgreement("LECCION", "Documentar el rack", 42L, "2026-09-30"))
        assertNull(draft.responsableId)
        assertNull(draft.fechaCompromiso)
    }

    @Test
    fun `el acuerdo conserva responsable y fecha compromiso`() {
        val draft = valid(MeetingForms.validateAgreement("ACUERDO", "Cotizar el UPS", 42L, "2026-09-30"))
        assertEquals(42L, draft.responsableId)
        assertEquals("2026-09-30", draft.fechaCompromiso)
    }

    @Test
    fun `un responsable con id cero cuenta como sin responsable`() {
        assertEquals(
            "Un acuerdo necesita responsable; una lección o un riesgo, no",
            invalid(MeetingForms.validateAgreement("ACUERDO", "Cotizar el UPS", 0L, "")),
        )
    }

    @Test
    fun `sin descripcion no se registra nada`() {
        assertEquals(
            "Escribe de qué se trata",
            invalid(MeetingForms.validateAgreement("LECCION", "   ", null, "")),
        )
    }

    @Test
    fun `la fecha compromiso mal escrita se rechaza`() {
        assertEquals(
            "La fecha compromiso debe ser AAAA-MM-DD",
            invalid(MeetingForms.validateAgreement("ACUERDO", "Cotizar el UPS", 42L, "30/09/2026")),
        )
    }

    @Test
    fun `un tipo de apunte inventado se rechaza`() {
        assertEquals(
            "Tipo de apunte no reconocido",
            invalid(MeetingForms.validateAgreement("PENDIENTE", "Algo", 1L, "")),
        )
    }

    // ── Quién conduce ─────────────────────────────────────────────────────

    /**
     * Espejo de `MEETINGS_LEAD_URL_RULES`. Enseñar «Convocar» a quien va a
     * recibir un 403 es peor que no enseñarlo.
     */
    @Test
    fun `solo los roles que conducen ven convocar`() {
        assertTrue(MeetingForms.canLeadMeetings("coord_operaciones", isSuperAdmin = false))
        assertTrue(MeetingForms.canLeadMeetings("ceo", isSuperAdmin = false))
        assertTrue(MeetingForms.canLeadMeetings("rh", isSuperAdmin = false))
        assertTrue(MeetingForms.canLeadMeetings(null, isSuperAdmin = true))

        assertTrue(!MeetingForms.canLeadMeetings("ing_campo", isSuperAdmin = false))
        assertTrue(!MeetingForms.canLeadMeetings("vendedor", isSuperAdmin = false))
        assertTrue(!MeetingForms.canLeadMeetings("administrativo", isSuperAdmin = false))
        assertTrue(!MeetingForms.canLeadMeetings("contabilidad", isSuperAdmin = false))
        assertTrue(!MeetingForms.canLeadMeetings(null, isSuperAdmin = false))
        assertTrue(!MeetingForms.canLeadMeetings("cliente", isSuperAdmin = false))
    }
}
