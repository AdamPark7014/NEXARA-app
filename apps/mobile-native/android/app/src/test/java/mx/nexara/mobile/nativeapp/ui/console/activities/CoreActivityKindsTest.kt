package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.access.ClientSector
import mx.nexara.mobile.nativeapp.access.OrgEmails
import mx.nexara.mobile.nativeapp.access.RoleKeys
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityKinds.FormState
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityKinds.TeamAdd
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Alta de actividad Core: mismas reglas que apps/web/lib/activity-kinds.ts y OpsActivityForm. */
class CoreActivityKindsTest {

    private val k = CoreActivityKinds

    // ── Tipos: creador × destinatario ───────────────────────────────────────

    @Test
    fun luisAssigningToSupportSeesTareaProyectoServicio() {
        val kinds = k.kindsForAssignment(OrgEmails.LUIS, OrgEmails.CAROLINA, roleKey = null, isSuperAdmin = false)
        assertEquals(listOf("tarea", "proyecto", "servicio"), kinds)
    }

    @Test
    fun davidAssigningToSupportCannotSendServicio() {
        val kinds = k.kindsForAssignment(OrgEmails.DAVID, OrgEmails.CAROLINA, roleKey = null, isSuperAdmin = false)
        assertEquals(listOf("tarea", "proyecto"), kinds)
    }

    @Test
    fun ceoRoleGetsWhatTheTargetCanReceive() {
        val kinds = k.kindsForAssignment("otro@nexara.com.mx", OrgEmails.JOAN, RoleKeys.CEO, isSuperAdmin = false)
        assertEquals(listOf("tarea", "proyecto", "obra"), kinds)
    }

    @Test
    fun unknownPeopleOnlyGetTarea() {
        assertEquals(listOf("tarea"), k.kindsForAssignment("x@y.com", OrgEmails.DAVID, null, false))
        assertEquals(listOf("tarea"), k.kindsForAssignment(OrgEmails.CEO, "nuevo@nexara.com.mx", null, false))
    }

    @Test
    fun selfAssignUsesOwnEmailBothSides() {
        assertEquals(listOf("tarea", "comercial"), k.kindsForAssignment(OrgEmails.DANIELA, OrgEmails.DANIELA, null, false))
        assertEquals(listOf("tarea", "proyecto", "obra", "comercial"), k.kindsForAssignment(OrgEmails.JOSUE, OrgEmails.JOSUE, null, false))
    }

    @Test
    fun superAdminWithoutTargetSeesEverything() {
        assertEquals(k.ALL, k.kindsForAssignment("root@x.com", null, null, isSuperAdmin = true))
    }

    @Test
    fun onlyAreaManagersSelfAssign() {
        assertTrue(k.isAreaManagerEmail(" Operaciones@Nexara.com.mx "))
        assertTrue(k.isAreaManagerEmail(OrgEmails.DANIELA))
        assertFalse(k.isAreaManagerEmail(OrgEmails.CEO))
        assertFalse(k.isAreaManagerEmail(OrgEmails.JOAN))
    }

    // ── Encargo ─────────────────────────────────────────────────────────────

    @Test
    fun luisServicioIsDespachoOnlyAndTheRestEjecucion() {
        assertTrue(k.forcesDespachoOnly(OrgEmails.LUIS, "servicio"))
        assertFalse(k.forcesDespachoOnly(OrgEmails.ANTONIO, "servicio"))
        assertTrue(k.forcesEjecucionOnly(OrgEmails.LUIS, "tarea"))
        assertTrue(k.forcesEjecucionOnly(OrgEmails.LUIS, "comercial"))
        assertFalse(k.forcesEjecucionOnly(OrgEmails.LUIS, "servicio"))
        assertTrue(k.canOfferAssignmentCharge(OrgEmails.JOSUE))
        assertFalse(k.canOfferAssignmentCharge(OrgEmails.DANIELA))
    }

    @Test
    fun headcountNoteIsClampedAndKeepsNotes() {
        assertEquals("Cupo: 1 persona.", k.formatDispatchHeadcountNote(1, null))
        assertEquals("Cupo: 3 personas. Llegar temprano", k.formatDispatchHeadcountNote(3, "  Llegar temprano "))
        assertEquals("Cupo: 50 personas.", k.formatDispatchHeadcountNote(99, ""))
        assertEquals("Cupo: 1 persona.", k.formatDispatchHeadcountNote(0, null))
    }

    @Test
    fun luisServicioGoesThroughAntonio() {
        assertTrue(k.servicioShouldGoToBridge(OrgEmails.LUIS, OrgEmails.CAROLINA, false, false))
        assertFalse(k.servicioShouldGoToBridge(OrgEmails.LUIS, OrgEmails.ANTONIO, false, false))
        assertFalse(k.servicioShouldGoToBridge(OrgEmails.LUIS, OrgEmails.CAROLINA, false, isCeo = true))
        assertFalse(k.servicioShouldGoToBridge(OrgEmails.ANTONIO, OrgEmails.CAROLINA, false, false))
    }

    // ── Equipo ──────────────────────────────────────────────────────────────

    @Test
    fun proyectoDespachoPoolJoinsInstallersAndSupport() {
        val pool = k.teamPoolEmailsForAssignment(OrgEmails.DAVID, "proyecto", "despacho")
        assertEquals(
            listOf(OrgEmails.JOAN, OrgEmails.ISRAEL, OrgEmails.JUAN, OrgEmails.ANTONIO, OrgEmails.CAROLINA, OrgEmails.ALEJANDRO),
            pool,
        )
        assertEquals(emptyList<String>(), k.teamPoolEmailsForAssignment(OrgEmails.DAVID, "tarea", "ejecucion"))
        assertFalse(OrgEmails.ANTONIO in k.teamPoolEmailsForAssignment(OrgEmails.ANTONIO, "servicio", null))
    }

    @Test
    fun crossTeamAddsTheOtherCoordinator() {
        assertEquals(listOf(OrgEmails.ANTONIO), k.peerCoordinatorEmails(OrgEmails.DAVID, listOf(OrgEmails.JOAN, OrgEmails.CAROLINA)))
        assertEquals(emptyList<String>(), k.peerCoordinatorEmails(OrgEmails.DAVID, listOf(OrgEmails.JOAN, OrgEmails.ISRAEL)))
    }

    @Test
    fun despachoOnlyPlanIsOneLeadWithCupo() {
        val plan = k.teamPlan(5L, despachoOnly = true, ejecucionOnly = false, effectiveCharge = "despacho", headcount = 2,
            leadNotes = "Ver con Antonio", extraIds = listOf(9L), extraNotes = emptyMap(), peerCoordinatorIds = emptyList())
        assertEquals(listOf(TeamAdd(5L, "LEAD", "Cupo: 2 personas. Ver con Antonio")), plan)
    }

    @Test
    fun ejecucionOnlyWithoutNotesAddsNobody() {
        val plan = k.teamPlan(5L, false, true, "ejecucion", 1, "  ", listOf(9L), emptyMap(), emptyList())
        assertEquals(emptyList<TeamAdd>(), plan)
    }

    @Test
    fun crossTeamPlanLeadsFirstThenPeersThenExtras() {
        val plan = k.teamPlan(
            targetUserId = 1L, despachoOnly = false, ejecucionOnly = false, effectiveCharge = "despacho", headcount = 1,
            leadNotes = "", extraIds = listOf(10L, 20L), extraNotes = mapOf(20L to " revisar DVR "),
            peerCoordinatorIds = listOf(30L),
        )
        assertEquals(
            listOf(
                TeamAdd(1L, "LEAD", "Coordinación de su equipo en esta actividad."),
                TeamAdd(30L, "LEAD", "Coordinación de su equipo en esta actividad cruzada (instalación / soporte)."),
                TeamAdd(10L, "TECNICO", null),
                TeamAdd(20L, "TECNICO", "revisar DVR"),
            ),
            plan,
        )
    }

    @Test
    fun plainEjecucionWithoutNotesOnlyAddsExtras() {
        val plan = k.teamPlan(1L, false, false, "ejecucion", 1, "", listOf(10L), emptyMap(), emptyList())
        assertEquals(listOf(TeamAdd(10L, "TECNICO", null)), plan)
    }

    // ── Clientes por sector ─────────────────────────────────────────────────

    @Test
    fun clientSectorsDependOnKindAndCreator() {
        assertEquals(listOf(ClientSector.CORPORATIVO), k.clientSectorsForActivityKind("servicio", OrgEmails.LUIS))
        assertEquals(listOf(ClientSector.PROYECTO), k.clientSectorsForActivityKind("obra", OrgEmails.DAVID))
        assertEquals(listOf(ClientSector.PROYECTO, ClientSector.COMERCIAL), k.clientSectorsForActivityKind("comercial", OrgEmails.DAVID))
        assertEquals(emptyList<ClientSector>(), k.clientSectorsForActivityKind("obra", OrgEmails.DANIELA))
        assertEquals(emptyList<ClientSector>(), k.clientSectorsForActivityKind("tarea", OrgEmails.CEO))
    }

    // ── Formulario: tipo fijo y subtipos de tarea ───────────────────────────

    @Test
    fun initialFormForcesTicketTypePerKind() {
        val tarea = k.initialForm("tarea", 3L, "ejecucion")
        assertEquals("OTRO", tarea.ticketType)
        assertEquals("", tarea.ticketTypeCustom)
        assertEquals("without_project", tarea.projectMode)
        assertEquals("ejecucion", tarea.assignmentCharge)
        assertEquals("COMERCIAL", k.initialForm("comercial", 3L, null).ticketTypeCustom)
        assertEquals("INSTALACION", k.initialForm("obra", 3L, null).ticketType)
        val proyecto = k.initialForm("proyecto", 3L, null)
        assertEquals("PREVENTIVO", proyecto.ticketType)
        assertEquals("with_project", proyecto.projectMode)
    }

    @Test
    fun tareaSubtypeTravelsAsOtroPlusLabel() {
        val base = k.initialForm("tarea", 3L, null).copy(titulo = "Ver cámaras")
        assertEquals("", k.tareaTipo(base, otroOpen = false))
        assertEquals("Elige el tipo de tarea", k.validationError(base, false, false))

        val junta = k.pickTareaTipo(base, "", "junta")
        assertEquals("Junta", junta.ticketTypeCustom)
        assertEquals("junta", k.tareaTipo(junta, false))
        assertNull(k.validationError(junta, false, false))
        assertEquals("Junta", k.buildRequest(junta, null, 1L).ticketTypeCustom)
    }

    @Test
    fun tareaOtroRequiresFreeText() {
        val base = k.initialForm("tarea", 3L, null).copy(titulo = "Algo")
        val otro = k.pickTareaTipo(k.pickTareaTipo(base, "", "junta"), "junta", "otro")
        assertEquals("", otro.ticketTypeCustom)
        assertEquals("Especifica el tipo de tarea", k.validationError(otro, tareaOtroOpen = true, requireSchedule = false))

        val typed = otro.copy(ticketTypeCustom = "Visita a proveedor")
        assertEquals("otro", k.tareaTipo(typed, otroOpen = false))
        assertNull(k.validationError(typed, true, false))
        // Volver a tocar «Otro» conserva el texto.
        assertEquals("Visita a proveedor", k.pickTareaTipo(typed, "otro", "otro").ticketTypeCustom)
    }

    @Test
    fun validationOrderMatchesWeb() {
        assertEquals("Título y responsable son obligatorios", k.validationError(FormState(responsableId = 1L), false, false))
        assertEquals("Título y responsable son obligatorios", k.validationError(FormState(titulo = "x"), false, false))
        val proyecto = k.initialForm("proyecto", 1L, null).copy(titulo = "Instalar")
        assertEquals("Selecciona un proyecto", k.validationError(proyecto, false, false))
        val obra = k.initialForm("obra", 1L, null).copy(titulo = "Instalar", projectId = 8L)
        assertEquals("Indica día y hora de la agenda", k.validationError(obra, false, requireSchedule = true))
        assertNull(k.validationError(obra.copy(fecha = "2026-09-20"), false, true))
    }

    @Test
    fun ticketTypeSelectClearsCustomUnlessOtro() {
        val f = FormState(ticketType = "OTRO", ticketTypeCustom = "Auditoría")
        val inv = k.pickTicketType(f, "INVENTARIO")
        assertEquals("", inv.ticketTypeCustom)
        assertEquals("PREVENTIVE_INVENTORY", inv.workType)
        assertEquals("Auditoría", k.pickTicketType(f, "OTRO").ticketTypeCustom)
    }

    // ── Fechas: hora de México, nunca 08:00Z fijo ───────────────────────────

    @Test
    fun scheduleIsMexicoLocalTimeInUtc() {
        assertEquals("2026-09-15T15:00:00.000Z", k.scheduleIso("2026-09-15", "09:00"))
        assertEquals("2026-09-16T00:30:00.000Z", k.scheduleIso("2026-09-15", "18:30"))
        assertEquals("2026-09-15T15:00:00.000Z", k.scheduleIso("2026-09-15", ""))
        assertNull(k.scheduleIso("", "10:00"))
        assertNull(k.scheduleIso(null, null))
    }

    @Test
    fun pickerDayDoesNotShiftInMexico() {
        val millis = k.dateToPickerMillis("2026-09-15")!!
        assertEquals(1_789_430_400_000L, millis)
        assertEquals("2026-09-15", k.pickerMillisToDate(millis))
        assertNull(k.dateToPickerMillis(""))
        // 23:30 del 15 en México ya es 16 en UTC: el «hoy» sale en hora de México.
        assertEquals("2026-09-15", k.todayInMexico(java.time.Instant.parse("2026-09-16T05:30:00Z")))
    }

    @Test
    fun hourParsesAndFormats() {
        assertEquals(9 to 0, k.parseHora(""))
        assertEquals(18 to 5, k.parseHora("18:05"))
        assertEquals(9 to 0, k.parseHora("25:99"))
        assertEquals("07:05", k.formatHora(7, 5))
    }

    @Test
    fun payloadMirrorsBuildActivityPayload() {
        val obra = k.initialForm("obra", 7L, "despacho").copy(
            titulo = "  Instalación CCTV ",
            projectId = 8L,
            fecha = "2026-09-20",
            hora = "11:15",
            tiempoEstimadoMin = "90",
            tiempoMaximoMin = "abc",
            evidencePhotoRequired = 12,
            prioridad = "Alta",
        )
        val body = k.buildRequest(obra, projectClientId = 44L, creadoPorId = 2L)
        assertEquals("Instalación CCTV", body.titulo)
        assertEquals("CLIENT", body.activityType)
        assertEquals("INSTALACION", body.ticketType)
        assertNull(body.ticketTypeCustom)
        assertEquals(44L, body.clientId)
        assertEquals(8L, body.projectId)
        assertEquals(90, body.tiempoEstimadoMin)
        assertNull(body.tiempoMaximoMin)
        assertEquals("2026-09-20T17:15:00.000Z", body.fechaInicio)
        assertEquals(body.fechaInicio, body.fechaMaxima)
        assertEquals(body.fechaInicio, body.fechaEntregaEsperada)
        assertEquals(8, body.evidencePhotoRequired)
        assertEquals("obra", body.coreKind)
        assertEquals("despacho", body.assignmentCharge)
        assertEquals("Pendiente", body.estatus)
        assertEquals(2L, body.creadoPorId)
        assertEquals(7L, body.responsableId)
        assertEquals("Alta", body.prioridad)
    }

    @Test
    fun payloadWithoutProjectKeepsPickedClientAndNoDates() {
        val servicio = k.pickTicketType(k.initialForm("servicio", 7L, null), "INVENTARIO")
            .copy(titulo = "Mantenimiento", clientId = 12L, projectId = 99L, evidencePhotoRequired = 1)
        val body = k.buildRequest(servicio, projectClientId = 55L, creadoPorId = 2L)
        assertEquals("INTERNAL", body.activityType)
        assertEquals("PREVENTIVO", body.ticketType)
        assertEquals("PREVENTIVE_INVENTORY", body.workType)
        assertEquals(12L, body.clientId)
        assertNull(body.projectId)
        assertNull(body.fechaInicio)
        assertEquals(2, body.evidencePhotoRequired)
        assertNull(body.assignmentCharge)
        assertEquals("COMERCIAL", k.buildRequest(k.initialForm("comercial", 7L, null).copy(titulo = "x"), null, 2L).ticketTypeCustom)
    }
}
