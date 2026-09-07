package mx.nexara.mobile.nativeapp.data.api

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Los DTO de reuniones contra las formas que manda Prisma.
 *
 * El motivo de que estos DTO se parseen a mano es concreto: los `include` de
 * `meetings.service.ts` devuelven `facilitador`, `responsable`, `meeting` y
 * `activity` anidados, y **cualquiera de ellos puede venir en `null`**. Un
 * `data class` con un campo no nulable que recibe `null` revienta la
 * deserialización y deja la pantalla vacía sin decir por qué — ya nos pasó
 * varias veces en esta app.
 */
class MeetingsDtoTest {

    // ── Reunión ───────────────────────────────────────────────────────────

    @Test
    fun `una reunion sin facilitador no revienta`() {
        val dto = MeetingDto.fromRaw(
            mapOf(
                "id" to 12.0,
                "tipo" to "DIARIA",
                "titulo" to "Reunión diaria",
                "fecha" to "2026-09-07T00:00:00.000Z",
                "horaInicio" to "10:00",
                "estado" to "PROGRAMADA",
                "facilitador" to null,
                "asistentes" to 6.0,
                "acuerdos" to 3.0,
            ),
        )
        assertEquals(12L, dto.id)
        assertEquals("", dto.facilitadorNombre)
        assertEquals("Reunión diaria", dto.tipoLabel)
        assertEquals("Programada", dto.estadoLabel)
        assertEquals(6, dto.asistentes)
        assertEquals(3, dto.acuerdos)
        assertFalse(dto.isClosed)
        assertEquals("2026-09-07 · 10:00", dto.whenLabel)
    }

    /**
     * En el listado `asistentes` y `acuerdos` son conteos; en el detalle son
     * arreglos. La misma clase tiene que leer las dos formas.
     */
    @Test
    fun `los conteos se leen igual vengan como numero o como arreglo`() {
        val detalle = MeetingDto.fromRaw(
            mapOf(
                "id" to 1.0,
                "tipo" to "CIERRE_SEMANAL",
                "estado" to "REALIZADA",
                "asistentes" to listOf(mapOf("id" to 1.0), mapOf("id" to 2.0)),
                "acuerdos" to listOf(mapOf("id" to 9.0)),
            ),
        )
        assertEquals(2, detalle.asistentes)
        assertEquals(1, detalle.acuerdos)
        assertTrue(detalle.isClosed)
    }

    @Test
    fun `el facilitador cae al email cuando no tiene nombre`() {
        val dto = MeetingDto.fromRaw(
            mapOf("id" to 3.0, "facilitador" to mapOf("nombre" to null, "email" to "ana@nexara.com.mx")),
        )
        assertEquals("ana@nexara.com.mx", dto.facilitadorNombre)
    }

    // ── Acuerdos ──────────────────────────────────────────────────────────

    @Test
    fun `un acuerdo sin responsable ni actividad se lee vacio pero se lee`() {
        val dto = MeetingAgreementDto.fromRaw(
            mapOf(
                "id" to 5.0,
                "tipo" to "LECCION",
                "descripcion" to "Pedir el acceso al sitio con 48 h",
                "estado" to "PENDIENTE",
                "responsable" to null,
                "meeting" to null,
                "activity" to null,
                "fechaCompromiso" to null,
            ),
        )
        assertEquals(5L, dto.id)
        assertEquals("Lección aprendida", dto.tipoLabel)
        assertEquals("", dto.responsableNombre)
        assertNull(dto.responsableId)
        assertEquals("", dto.activityLabel)
        assertEquals("Sin fecha compromiso", dto.dueLabel)
        assertTrue(dto.isOpen)
    }

    /**
     * `vencido` y `diasVencido` los calcula el servidor (`decorateAgreement`).
     * No se recalculan aquí para no acabar con dos verdades sobre la misma
     * fecha.
     */
    @Test
    fun `el vencimiento se toma del servidor y se redacta en singular y plural`() {
        val base = mapOf<String, Any?>("id" to 1.0, "tipo" to "ACUERDO", "estado" to "PENDIENTE")
        assertEquals(
            "Vencido hace 1 día",
            MeetingAgreementDto.fromRaw(base + mapOf("vencido" to true, "diasVencido" to 1.0)).dueLabel,
        )
        assertEquals(
            "Vencido hace 4 días",
            MeetingAgreementDto.fromRaw(base + mapOf("vencido" to true, "diasVencido" to 4.0)).dueLabel,
        )
        assertEquals(
            "Vence el 2026-09-30",
            MeetingAgreementDto.fromRaw(
                base + mapOf("vencido" to false, "fechaCompromiso" to "2026-09-30T00:00:00.000Z"),
            ).dueLabel,
        )
    }

    @Test
    fun `el meetingId se toma del campo plano o de la relacion anidada`() {
        val plano = MeetingAgreementDto.fromRaw(mapOf("id" to 1.0, "meetingId" to 8.0))
        assertEquals(8L, plano.meetingId)

        val anidado = MeetingAgreementDto.fromRaw(
            mapOf("id" to 1.0, "meeting" to mapOf("id" to 9.0, "titulo" to "Junta de cierre")),
        )
        assertEquals(9L, anidado.meetingId)
        assertEquals("Junta de cierre", anidado.meetingTitulo)
    }

    @Test
    fun `la actividad ligada se muestra con numero y titulo`() {
        val dto = MeetingAgreementDto.fromRaw(
            mapOf(
                "id" to 1.0,
                "activity" to mapOf("id" to 42.0, "anNumber" to "AN-1042", "titulo" to "Cambio de switch"),
            ),
        )
        assertEquals(42L, dto.activityId)
        assertEquals("AN-1042 · Cambio de switch", dto.activityLabel)
    }

    @Test
    fun `un acuerdo sin tipo se trata como acuerdo`() {
        assertEquals("ACUERDO", MeetingAgreementDto.fromRaw(mapOf("id" to 1.0)).tipo)
    }

    // ── Acta completa ─────────────────────────────────────────────────────

    /**
     * La lista de asistentes tiene que traer `userId`: `PUT
     * reuniones/{id}/asistencia` reemplaza el acta entera y necesita ids, no
     * nombres.
     */
    @Test
    fun `el acta conserva los ids de los convocados`() {
        val detail = MeetingDetailDto.fromRaw(
            mapOf(
                "id" to 4.0,
                "tipo" to "PLANEACION_SEMANAL",
                "estado" to "PROGRAMADA",
                "asistentes" to listOf(
                    mapOf("userId" to 1.0, "asistio" to true, "user" to mapOf("id" to 1.0, "nombre" to "Ana")),
                    mapOf("userId" to 2.0, "asistio" to false, "user" to mapOf("id" to 2.0, "nombre" to "Beto")),
                    // Fila corrupta: sin id no se puede devolver en el acta.
                    mapOf("asistio" to true, "user" to null),
                ),
                "acuerdos" to listOf(
                    mapOf("id" to 7.0, "tipo" to "ACUERDO", "descripcion" to "Cotizar UPS", "estado" to "PENDIENTE"),
                ),
            ),
        )
        assertEquals(2, detail.asistentes.size)
        assertEquals(listOf(1L, 2L), detail.asistentes.map { it.userId })
        assertEquals("1 de 2 asistieron", detail.attendanceLabel)
        assertEquals(1, detail.acuerdos.size)
    }

    @Test
    fun `un acta sin convocados lo dice en vez de enseñar cero de cero`() {
        val detail = MeetingDetailDto.fromRaw(mapOf("id" to 1.0, "tipo" to "EXTRAORDINARIA"))
        assertEquals("Sin convocados", detail.attendanceLabel)
        assertTrue(detail.acuerdos.isEmpty())
    }

    @Test
    fun `un convocado sin nombre se muestra por su id y no en blanco`() {
        val person = MeetingAttendeeDto.fromRaw(mapOf("userId" to 33.0, "user" to null))
        assertEquals("Usuario 33", person.displayName)
    }

    // ── Catálogo ──────────────────────────────────────────────────────────

    @Test
    fun `solo el acuerdo exige responsable`() {
        assertTrue(MeetingCatalog.requiresOwner("ACUERDO"))
        assertTrue(MeetingCatalog.requiresOwner("acuerdo"))
        assertFalse(MeetingCatalog.requiresOwner("LECCION"))
        assertFalse(MeetingCatalog.requiresOwner("RIESGO"))
    }

    @Test
    fun `los estados abiertos son los dos que esperan algo de alguien`() {
        assertTrue(MeetingCatalog.isOpen("PENDIENTE"))
        assertTrue(MeetingCatalog.isOpen("en_proceso"))
        assertFalse(MeetingCatalog.isOpen("CUMPLIDO"))
        assertFalse(MeetingCatalog.isOpen("CANCELADO"))
    }

    /** La junta del viernes arranca con «lecciones aprendidas» ya escrito. */
    @Test
    fun `la agenda sugerida del cierre semanal incluye lecciones aprendidas`() {
        val agenda = MeetingCatalog.suggestedAgenda("CIERRE_SEMANAL")
        assertTrue(agenda.contains("Lecciones aprendidas"))
        assertEquals(4, agenda.lines().size)
        assertEquals("10:00", MeetingCatalog.DEFAULT_TIME["DIARIA"])
        assertEquals("", MeetingCatalog.suggestedAgenda("NO_EXISTE"))
    }

    @Test
    fun `una clave desconocida se muestra tal cual en vez de en blanco`() {
        assertEquals("RARO", MeetingCatalog.meetingStatusLabel("RARO"))
        assertEquals("—", MeetingCatalog.agreementStatusLabel("  "))
    }
}
