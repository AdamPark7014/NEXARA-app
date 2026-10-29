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
        assertEquals(listOf("tarea"), k.kindsForAssignment(OrgEmails.ROBERTO, OrgEmails.ROBERTO, null, false))
        assertEquals(listOf("tarea", "proyecto", "obra", "comercial"), k.kindsForAssignment(OrgEmails.JOSUE, OrgEmails.JOSUE, null, false))
    }

    @Test
    fun paulinaCreatesAndReceivesTareaAndComercial() {
        assertEquals("finanzas@nexara.com.mx", OrgEmails.PAULINA)
        // Auto-asignarme: antes solo veía Tarea (caía en el respaldo de quien no está en los mapas).
        assertEquals(listOf("tarea", "comercial"), k.kindsForAssignment(OrgEmails.PAULINA, OrgEmails.PAULINA, null, false))
        assertEquals(listOf("tarea", "comercial"), k.kindsForCreator(null, " Finanzas@Nexara.com.mx ", false))
        assertEquals(listOf("tarea", "comercial"), k.kindsForTarget(OrgEmails.PAULINA))
        assertEquals(listOf("tarea", "comercial"), k.kindsForAssignment(OrgEmails.CEO, OrgEmails.PAULINA, RoleKeys.CEO, false))
        assertEquals(listOf("tarea", "comercial"), k.kindsForAssignment(OrgEmails.DAVID, OrgEmails.PAULINA, null, false))
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
        assertTrue(k.forcesDespachoOnly(OrgEmails.ANTONIO, "servicio"))
        assertFalse(k.forcesDespachoOnly(OrgEmails.DAVID, "servicio"))
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

    @Test
    fun comercialFallsBackToTheCommercialPadron() {
        // Paulina no está en la matriz de Clientes: sin esto el cliente obligatorio salía vacío.
        assertEquals(listOf(ClientSector.COMERCIAL), k.clientSectorsForActivityKind("comercial", OrgEmails.PAULINA))
        assertEquals(listOf(ClientSector.COMERCIAL), k.clientSectorsForActivityKind("comercial", OrgEmails.DANIELA))
        assertEquals(emptyList<ClientSector>(), k.clientSectorsForActivityKind("servicio", OrgEmails.PAULINA))
        assertEquals(emptyList<ClientSector>(), k.clientSectorsForActivityKind("obra", OrgEmails.PAULINA))
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
        assertEquals("", k.tareaTipo(base))
        assertEquals("Elige el tipo de tarea", k.validationError(base, false))

        val junta = k.pickTareaTipo(base, "junta")
        assertEquals("Junta", junta.ticketTypeCustom)
        assertEquals("junta", k.tareaTipo(junta))
        assertNull(k.validationError(junta, false))
        assertEquals("Junta", k.buildRequest(junta, null, 1L).ticketTypeCustom)
    }

    @Test
    fun catalogIsClosedInFourFamiliesLikeTheWeb() {
        assertEquals(17, k.TAREA_TIPOS.size)
        assertEquals(listOf("En campo", "Oficina técnica", "Administración", "Para todos"), k.FAMILIAS_TAREA.map { it.label })
        assertEquals(17, k.FAMILIAS_TAREA.sumOf { k.tiposDeFamilia(it.id).size })
        assertFalse(k.TAREA_TIPOS.any { it.id == k.TAREA_OTRO })
        assertEquals(
            listOf("Diseño, CAD y memoria técnica", "Configuración y soporte remoto"),
            k.tiposDeFamilia("oficina").map { it.label },
        )
        // Un id que no está en el catálogo no cambia el formulario.
        val base = k.initialForm("tarea", 3L, null)
        assertEquals(base, k.pickTareaTipo(base, "otro"))
    }

    @Test
    fun oldFreeTextReadsAsOtroButCannotBeSaved() {
        val vieja = k.initialForm("tarea", 3L, null).copy(titulo = "Algo", ticketType = "OTRO", ticketTypeCustom = "Visita a proveedor")
        assertEquals(k.TAREA_OTRO, k.tareaTipo(vieja))
        assertEquals("Elige el tipo de tarea", k.validationError(vieja, false))
        assertNull(k.validationError(k.pickTareaTipo(vieja, "compra"), false))
    }

    @Test
    fun compromisoMustBeAfterStartAndMovesTheDeadline() {
        assertTrue(k.compromisoValido("09:00", ""))
        assertTrue(k.compromisoValido("09:00", "17:00"))
        assertFalse(k.compromisoValido("09:00", "09:00"))
        assertFalse(k.compromisoValido("10:30", "08:00"))
        assertFalse(k.compromisoValido("09:00", "5pm"))

        val base = k.initialForm("tarea", 7L, null).copy(titulo = "Ir por cable", fecha = "2026-10-29", hora = "09:00")
            .let { k.pickTareaTipo(it, "recoleccion") }
        val sin = k.buildRequest(base, null, 2L)
        assertEquals("2026-10-29T15:00:00.000Z", sin.fechaInicio)
        assertEquals(sin.fechaInicio, sin.fechaMaxima)

        val con = k.buildRequest(base.copy(horaCompromiso = "17:00"), null, 2L)
        assertEquals("2026-10-29T15:00:00.000Z", con.fechaInicio)
        assertEquals("2026-10-29T23:00:00.000Z", con.fechaMaxima)
        assertEquals(con.fechaMaxima, con.fechaEntregaEsperada)

        val antes = base.copy(horaCompromiso = "08:00")
        assertEquals("La hora de entrega tiene que ser después de la hora de inicio", k.validationError(antes, false))
        // Uno inválido nunca llega al cuerpo: queda como fin del día.
        assertEquals("2026-10-29T15:00:00.000Z", k.buildRequest(antes, null, 2L).fechaMaxima)
    }

    @Test
    fun horaCompromisoIsReadBackOnlySameDayAndAfterStart() {
        assertEquals("17:00", k.horaCompromisoDe("2026-10-29T15:00:00.000Z", "2026-10-29T23:00:00.000Z", false))
        assertNull(k.horaCompromisoDe("2026-10-29T15:00:00.000Z", "2026-10-29T15:00:00.000Z", false))
        assertNull(k.horaCompromisoDe("2026-10-29T15:00:00.000Z", "2026-10-30T23:00:00.000Z", false))
        assertNull(k.horaCompromisoDe("2026-10-29T15:00:00.000Z", "2026-10-29T23:00:00.000Z", true))
        assertNull(k.horaCompromisoDe(null, "2026-10-29T23:00:00.000Z", false))
        // 23:59 de México = fin del día escrito a mano.
        assertNull(k.horaCompromisoDe("2026-10-29T15:00:00.000Z", "2026-10-30T05:59:00.000Z", false))
    }

    @Test
    fun autoasignacionNoMandaTiempoNiEntrega() {
        val base = k.pickTareaTipo(k.initialForm("tarea", 7L, null).copy(titulo = "Reporte semanal", fecha = "2026-10-29", hora = "09:00", tiempoEstimadoMin = "90", horaCompromiso = "17:00", complejidad = "BASICA"), "documentacion")
        val propia = k.buildRequest(base, null, 7L, autoasignacion = true)
        assertNull(propia.tiempoEstimadoMin)
        assertNull(propia.tiempoMaximoMin)
        assertNull(propia.fechaEntregaEsperada)
        assertNull(propia.fechaMaxima)
        assertNull(propia.complejidad)
        assertEquals("2026-10-29T15:00:00.000Z", propia.fechaInicio)
        val ajena = k.buildRequest(base, null, 2L)
        assertEquals(90, ajena.tiempoEstimadoMin)
        assertEquals("2026-10-29T23:00:00.000Z", ajena.fechaMaxima)
    }

    @Test
    fun entregaEditadaSoloSiCambiaElDiaYConservaLaHora() {
        assertNull(k.entregaEditada("2026-10-29T23:00:00.000Z", "2026-10-29"))
        assertEquals("2026-10-30T23:00:00.000Z", k.entregaEditada("2026-10-29T23:00:00.000Z", "2026-10-30"))
        assertEquals("2026-10-30T00:00:00.000Z", k.entregaEditada(null, "2026-10-29"))
        assertNull(k.entregaEditada("2026-10-29T23:00:00.000Z", ""))
        // 20:00 de México del 29 es el 30 en UTC: el campo dice 30 y no se tocó.
        assertNull(k.entregaEditada("2026-10-30T02:00:00.000Z", "2026-10-30"))
    }

    @Test
    fun complejidadTravelsInTheBodyOnlyWhenChosen() {
        val base = k.pickTareaTipo(k.initialForm("tarea", 7L, null).copy(titulo = "Instalar 4 cámaras"), "instalacion")
        val sin = k.buildRequest(base, null, 2L)
        assertNull(sin.complejidad)
        assertNull(sin.complejidadSugerida)
        val con = k.buildRequest(base.copy(complejidad = "COMPLEJA", complejidadSugerida = "ESTANDAR"), null, 2L)
        assertEquals("COMPLEJA", con.complejidad)
        assertEquals("ESTANDAR", con.complejidadSugerida)
    }

    @Test
    fun validationOrderMatchesWeb() {
        assertEquals("Título y responsable son obligatorios", k.validationError(FormState(responsableId = 1L), false))
        assertEquals("Título y responsable son obligatorios", k.validationError(FormState(titulo = "x"), false))
        val proyecto = k.initialForm("proyecto", 1L, null).copy(titulo = "Instalar")
        assertEquals("Selecciona un proyecto", k.validationError(proyecto, false))
        val obra = k.initialForm("obra", 1L, null).copy(titulo = "Instalar", projectId = 8L)
        assertEquals("Indica día y hora de la agenda", k.validationError(obra, requireSchedule = true))
        assertNull(k.validationError(obra.copy(fecha = "2026-09-20"), true))
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
