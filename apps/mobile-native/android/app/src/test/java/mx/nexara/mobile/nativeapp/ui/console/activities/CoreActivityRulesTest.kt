package mx.nexara.mobile.nativeapp.ui.console.activities

import java.time.Instant
import java.time.ZoneId
import mx.nexara.mobile.nativeapp.data.api.TeamBoardOpenActivityDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import mx.nexara.mobile.nativeapp.data.api.TeamEvidenceDto
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.CaptureRole
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Reglas de Core que la app tiene que decidir igual que la web. */
class CoreActivityRulesTest {

    // ── Quién captura ───────────────────────────────────────────────────────

    @Test
    fun leadOfADispatchOnlyDistributes() {
        val role = CoreActivityRules.captureRole(
            viewerId = 7L,
            viewerEmail = "jose.ramirez@nexara.com.mx",
            assignmentCharge = "despacho",
            responsableId = 3L,
            myActiveRol = "LEAD",
            hasActiveRow = true,
        )
        assertEquals(CaptureRole.REPARTE, role)
    }

    @Test
    fun responsableOfADispatchWithoutTeamRowAlsoDistributes() {
        val role = CoreActivityRules.captureRole(7L, "x@nexara.com.mx", "despacho", 7L, null, false)
        assertEquals(CaptureRole.REPARTE, role)
    }

    @Test
    fun technicianOfADispatchCaptures() {
        val role = CoreActivityRules.captureRole(9L, "soporte@nexara.com.mx", "despacho", 3L, "TECNICO", true)
        assertEquals(CaptureRole.CAPTURA, role)
    }

    @Test
    fun responsableOfDirectExecutionCaptures() {
        val role = CoreActivityRules.captureRole(4L, "a@nexara.com.mx", "ejecucion", 4L, null, false)
        assertEquals(CaptureRole.CAPTURA, role)
    }

    @Test
    fun ceoNeverCaptures() {
        val role = CoreActivityRules.captureRole(1L, "Gerencia@Nexara.com.mx", "ejecucion", 1L, "TECNICO", true)
        assertEquals(CaptureRole.NINGUNO, role)
    }

    @Test
    fun outsiderDoesNotCapture() {
        assertEquals(
            CaptureRole.NINGUNO,
            CoreActivityRules.captureRole(5L, "b@nexara.com.mx", "ejecucion", 4L, null, false),
        )
        assertEquals(CaptureRole.NINGUNO, CoreActivityRules.captureRole(null, null, null, null, null, false))
    }

    // ── Pasos y formulario ──────────────────────────────────────────────────

    @Test
    fun onlyServicioHasTheServiceSheetPdf() {
        assertEquals(
            listOf("ENTRY_PHOTO", "EVIDENCE_PHOTOS", "SERVICE_SHEET_PDF", "SERVICE_SHEET_DATA", "EXIT_PHOTO"),
            CoreActivityRules.evidenceStepsForKind("Servicio"),
        )
        assertEquals(
            listOf("ENTRY_PHOTO", "EVIDENCE_PHOTOS", "SERVICE_SHEET_DATA", "EXIT_PHOTO"),
            CoreActivityRules.evidenceStepsForKind("tarea"),
        )
        assertEquals(4, CoreActivityRules.evidenceStepsForKind(null).size)
    }

    @Test
    fun digitalFormKeysMatchTheWeb() {
        assertEquals(
            listOf("sucursal", "gerenteEncargado", "queSeHizo", "observaciones"),
            CoreActivityRules.digitalFormLabels("servicio").map { it.key },
        )
        assertEquals(
            listOf("lugar", "encargadoSitio", "queSeHizo", "observaciones"),
            CoreActivityRules.digitalFormLabels("obra").map { it.key },
        )
        assertEquals(
            listOf("queHiciste", "clienteOProyecto"),
            CoreActivityRules.digitalFormLabels("comercial").map { it.key },
        )
        assertEquals(listOf("queHiciste"), CoreActivityRules.digitalFormLabels(null).map { it.key })
        assertTrue(CoreActivityRules.digitalFormLabels("servicio").first { it.key == "queSeHizo" }.multiline)
        assertFalse(CoreActivityRules.digitalFormLabels("servicio").first { it.key == "sucursal" }.multiline)
    }

    @Test
    fun initialFormKeepsWhatWasSaved() {
        val values = CoreActivityRules.initialFormValues("comercial", mapOf("queHiciste" to "Visita", "otro" to "x"))
        assertEquals(mapOf("queHiciste" to "Visita", "clienteOProyecto" to ""), values)
    }

    @Test
    fun rejectedStepsPreferTheListOverTheLegacyField() {
        assertEquals(
            listOf("EXIT_PHOTO", "ENTRY_PHOTO"),
            CoreActivityRules.rejectedStepsList(listOf("EXIT_PHOTO", "ENTRY_PHOTO"), "EVIDENCE_PHOTOS"),
        )
        assertEquals(listOf("EVIDENCE_PHOTOS"), CoreActivityRules.rejectedStepsList(null, "EVIDENCE_PHOTOS"))
        assertEquals(emptyList<String>(), CoreActivityRules.rejectedStepsList(emptyList<String>(), null))
    }

    @Test
    fun completedEvidenceIsLockedUntilItIsReturned() {
        assertTrue(CoreActivityRules.isEvidenceLocked("COMPLETED", null))
        assertTrue(CoreActivityRules.isEvidenceLocked("COMPLETED", "APPROVED"))
        assertFalse(CoreActivityRules.isEvidenceLocked("COMPLETED", "REJECTED"))
        assertFalse(CoreActivityRules.isEvidenceLocked("EXIT_PHOTO", null))
    }

    // ── Detalle ─────────────────────────────────────────────────────────────

    @Test
    fun deepLinkTabsMapToTheThreeCoreTabs() {
        assertEquals(ACTIVITY_TAB_DETALLE, activityDetailTabIndex(null))
        assertEquals(ACTIVITY_TAB_DETALLE, activityDetailTabIndex("info"))
        assertEquals(ACTIVITY_TAB_DETALLE, activityDetailTabIndex("operacion"))
        assertEquals(ACTIVITY_TAB_EVIDENCIAS, activityDetailTabIndex("evidencias"))
        assertEquals(ACTIVITY_TAB_EVIDENCIAS, activityDetailTabIndex("aprobaciones"))
        assertEquals(ACTIVITY_TAB_HISTORIAL, activityDetailTabIndex("historial"))
    }

    // ── Evidencias del equipo ───────────────────────────────────────────────

    @Test
    fun teamStateFollowsTheWebSemantics() {
        assertEquals("✅ Finalizada: todo aprobado", CoreActivityRules.teamActivityState(2, 2, 2).label)
        assertEquals("🔎 Por validar", CoreActivityRules.teamActivityState(2, 2, 1).label)
        assertEquals("⏳ En curso", CoreActivityRules.teamActivityState(2, 1, 0).label)
        assertEquals("⏳ En curso", CoreActivityRules.teamActivityState(0, 0, 0).label)
    }

    @Test
    fun memberStateLabels() {
        assertEquals("✅ Aprobada", CoreActivityRules.memberEstadoUi("COMPLETED", "APPROVED").label)
        assertEquals("↩️ Corrigiendo", CoreActivityRules.memberEstadoUi("EXIT_PHOTO", "REJECTED").label)
        assertEquals("🔎 Por revisar", CoreActivityRules.memberEstadoUi("COMPLETED", null).label)
        assertEquals("⏳ En curso", CoreActivityRules.memberEstadoUi("EVIDENCE_PHOTOS", null).label)
    }

    @Test
    fun reviewNeedsStepsRatingAndObservations() {
        assertEquals(
            listOf("marca qué pasos debe corregir", "califica su eficiencia", "escribe qué debe corregir"),
            CoreActivityRules.revisionFaltantes(aprobar = false, todo = false, pasosMarcados = 0, calificacion = 0, observaciones = "mal"),
        )
        assertEquals(
            listOf("escribe por qué la apruebas"),
            CoreActivityRules.revisionFaltantes(aprobar = true, todo = false, pasosMarcados = 0, calificacion = 5, observaciones = " ok "),
        )
        assertTrue(
            CoreActivityRules.revisionFaltantes(aprobar = false, todo = true, pasosMarcados = 0, calificacion = 3, observaciones = "Rehaz todo").isEmpty(),
        )
    }

    @Test
    fun photosKeepTheirOwnLocation() {
        val ev = TeamEvidenceDto(
            entryPhotoUrl = "/activities/e.jpg",
            entryLatitude = "19.0414",
            entryLongitude = -98.2063,
            evidencePhotos = listOf("/activities/a1.jpg", "/activities/a2.jpg"),
            evidencePhotosGeo = listOf(
                mapOf("latitude" to 19.1, "longitude" to -98.1, "capturedAt" to "2026-09-14T10:00:00Z"),
                null,
            ),
            evidencePhotosUploadedAt = "2026-09-14T10:05:00Z",
            exitPhotoUrl = "/activities/x.jpg",
        )
        val set = CoreActivityRules.fotosDe(ev, "Alejandro González Pérez")
        assertEquals(4, set.fotos.size)
        assertEquals(0, set.entrada)
        assertEquals(listOf(1, 2), set.sitio)
        assertEquals(3, set.salida)
        assertEquals(19.0414, set.fotos[0].lat!!, 0.0)
        assertEquals(19.1, set.fotos[1].lat!!, 0.0)
        assertEquals("2026-09-14T10:00:00Z", set.fotos[1].at)
        assertNull(set.fotos[2].lat)
        assertEquals("2026-09-14T10:05:00Z", set.fotos[2].at)
        assertEquals("Alejandro González · Salida", set.fotos[3].titulo)
    }

    @Test
    fun chainSkipsBlanksAndRepeats() {
        assertEquals(
            listOf("Luis Hernández", "Antonio Ramírez", "Alejandro González"),
            CoreActivityRules.cadena(
                "Luis Hernández Soto",
                listOf("Antonio Ramírez Díaz", "Alejandro González", null, "Antonio Ramírez Díaz"),
            ),
        )
    }

    // ── Despacho ────────────────────────────────────────────────────────────

    @Test
    fun luisPendingDispatchesAreTheOnesWithoutAntonio() {
        val pending = listOf(
            TeamBoardOpenActivityDto(id = 1L, assignmentCharge = "despacho", teamEmails = listOf("direccion.operaciones@nexara.com.mx")),
            TeamBoardOpenActivityDto(id = 2L, assignmentCharge = "despacho", teamEmails = listOf("direccion.operaciones@nexara.com.mx", "jose.ramirez@nexara.com.mx")),
            TeamBoardOpenActivityDto(id = 3L, assignmentCharge = "ejecucion", teamEmails = emptyList()),
        )
        assertEquals(
            listOf(1L),
            CoreActivityRules.despachosPendientes("direccion.operaciones@nexara.com.mx", pending).map { it.id },
        )
    }

    @Test
    fun dispatchCandidatesComeFromTheManagersPool() {
        val roster = listOf(
            TeamBoardUserDto(id = 7L, email = "jose.ramirez@nexara.com.mx"),
            TeamBoardUserDto(id = 8L, email = "soporte@nexara.com.mx"),
            TeamBoardUserDto(id = 9L, email = "alejandro.gonzalez@nexara.com.mx"),
            TeamBoardUserDto(id = 10L, email = "otro@nexara.com.mx"),
        )
        assertEquals(
            listOf(8L, 9L),
            CoreActivityRules.despachoCandidates("jose.ramirez@nexara.com.mx", 7L, roster).map { it.id },
        )
        assertEquals(3, CoreActivityRules.parseDispatchHeadcount("Cupo: 3 personas · llevar escalera"))
        assertNull(CoreActivityRules.parseDispatchHeadcount("sin cupo"))
    }

    // ── Mis actividades ─────────────────────────────────────────────────────

    @Test
    fun reorderMovesOneItem() {
        assertEquals(listOf(3L, 1L, 2L), CoreActivityRules.reorderIds(listOf(1L, 2L, 3L), 2, 0))
        assertNull(CoreActivityRules.reorderIds(listOf(1L, 2L), 0, 0))
        assertNull(CoreActivityRules.reorderIds(listOf(1L, 2L), 0, 5))
    }

    @Test
    fun priorityAndStatusLabels() {
        assertEquals("Urgente", CoreActivityRules.priorityUi("ALTA").label)
        assertEquals("Esta semana", CoreActivityRules.priorityUi(null).label)
        assertEquals("Puede esperar", CoreActivityRules.priorityUi("baja").label)
        assertEquals("En curso", CoreActivityRules.estatusUi("En Proceso").label)
        assertEquals("En revisión", CoreActivityRules.estatusUi("Por Validar").label)
        assertEquals("Por empezar", CoreActivityRules.estatusUi("Pendiente").label)
        assertEquals("✅ Tarea · Junta", CoreActivityRules.kindLabel("tarea", "Junta"))
        assertEquals("🛠️ Servicio", CoreActivityRules.kindLabel("servicio", "Junta"))
    }

    @Test
    fun ceoEmailIsCaseInsensitive() {
        assertTrue(CoreActivityRules.isCeoEmail(" GERENCIA@nexara.com.mx "))
        assertFalse(CoreActivityRules.isCeoEmail("developer@nexara.com.mx"))
    }

    // ── Formatos ────────────────────────────────────────────────────────────

    @Test
    fun minutesFormat() {
        assertEquals("—", CoreActivityRules.formatMinutes(null))
        assertEquals("45 min", CoreActivityRules.formatMinutes(45.0))
        assertEquals("2 h", CoreActivityRules.formatMinutes(120.0))
        assertEquals("1 h 5 min", CoreActivityRules.formatMinutes(65.0))
    }

    @Test
    fun localInputRoundTripsThroughIso() {
        val zone = ZoneId.of("America/Mexico_City")
        val iso = CoreActivityRules.localInputToIso("2026-09-15T09:30", zone)
        assertEquals("2026-09-15T15:30:00Z", iso)
        assertEquals("2026-09-15T09:30", CoreActivityRules.isoToLocalInput(iso, zone))
        assertNull(CoreActivityRules.localInputToIso("", zone))
    }

    @Test
    fun relativeTimeReadsLikeTheWeb() {
        val now = Instant.parse("2026-09-14T12:00:00Z")
        assertEquals("Justo ahora", CoreActivityRules.relativeTime("2026-09-14T11:59:30Z", now))
        assertEquals("Hace 12 min", CoreActivityRules.relativeTime("2026-09-14T11:48:00Z", now))
        assertEquals("En 3h", CoreActivityRules.relativeTime("2026-09-14T15:00:00Z", now))
        assertEquals("Hace 2d", CoreActivityRules.relativeTime("2026-09-12T12:00:00Z", now))
    }

    @Test
    fun decimalsArriveAsTextOrNumbers() {
        assertEquals(19.04, CoreActivityRules.anyToDouble("19.04")!!, 0.0)
        assertEquals(-98.2, CoreActivityRules.anyToDouble(-98.2)!!, 0.0)
        assertNull(CoreActivityRules.anyToDouble("n/a"))
        assertNull(CoreActivityRules.anyToDouble(null))
    }

    // ── Pizarra: estados con detalle (contrato 2026-09-14) ─────────────────

    @Test
    fun boardStatusCopyMatchesTheWeb() {
        val now = Instant.parse("2026-09-14T18:00:00Z")
        assertEquals("Atrasado 1 h 20 min", CoreActivityRules.boardEstadoTexto("atrasado", 80.0, null, now))
        assertEquals(
            "Sin actividad desde hace 2 h 05 min",
            CoreActivityRules.boardEstadoTexto("libre", null, "2026-09-14T15:55:00Z", now),
        )
        assertEquals(
            "Sin actividad desde hace un momento",
            CoreActivityRules.boardEstadoTexto("libre", null, "2026-09-14T17:59:40Z", now),
        )
        assertEquals("Atrasado", CoreActivityRules.boardEstadoTexto("atrasado", null, null, now))
        assertEquals("Sin actividad", CoreActivityRules.boardEstadoTexto("sin_actividad", null, null, now))
        assertEquals("Terminó", CoreActivityRules.boardStatusLabel("libre"))
        assertFalse("inactivo ya no se produce", "inactivo" in CoreActivityRules.BOARD_STATUS_ORDER)
    }

    @Test
    fun boardMinutesArePaddedLikeTheWeb() {
        assertEquals("45 min", CoreActivityRules.formatBoardMinutes(45.0))
        assertEquals("1 h 05 min", CoreActivityRules.formatBoardMinutes(65.0))
        assertEquals("2 h 00 min", CoreActivityRules.formatBoardMinutes(120.0))
        assertEquals("—", CoreActivityRules.formatBoardMinutes(null))
    }

    @Test
    fun lastFinishedLineSaysLateOrOnTime() {
        val zone = ZoneId.of("America/Mexico_City")
        assertEquals(
            "Finalizó a las 10:49 con 1 h 20 min de atraso",
            CoreActivityRules.boardTerminoTexto("2026-09-14T16:49:00Z", 80.0, zone),
        )
        assertEquals("Finalizó a las 10:49, a tiempo", CoreActivityRules.boardTerminoTexto("2026-09-14T16:49:00Z", 0.0, zone))
        assertEquals("Finalizó a las 10:49", CoreActivityRules.boardTerminoTexto("2026-09-14T16:49:00Z", null, zone))
        assertEquals("⏳ En espera de aprobación", CoreActivityRules.boardEnEsperaTexto(1))
        assertEquals("⏳ 3 en espera de aprobación", CoreActivityRules.boardEnEsperaTexto(3))
    }

    @Test
    fun vistaIsNormalized() {
        assertEquals("mias", CoreActivityRules.normalizeVista("MIAS"))
        assertEquals("equipo", CoreActivityRules.normalizeVista("equipo"))
        assertNull(CoreActivityRules.normalizeVista("otra"))
    }
}
