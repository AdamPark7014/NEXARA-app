package mx.nexara.mobile.nativeapp.ui.console.activities

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import mx.nexara.mobile.nativeapp.access.ClientSector
import mx.nexara.mobile.nativeapp.access.ClientSectors
import mx.nexara.mobile.nativeapp.access.OrgEmails
import mx.nexara.mobile.nativeapp.access.RoleKeys
import mx.nexara.mobile.nativeapp.data.api.CreateActivityRequest
import mx.nexara.mobile.nativeapp.ui.enterprise.NxGlyph

/**
 * Alta de actividad Core sin nada de Android, para probarla en JVM.
 *
 * Espejo de apps/web/lib/activity-kinds.ts (tipos creador × destinatario, encargo, equipo),
 * lib/ops-activity-form.ts (buildActivityPayload), lib/client-sectors.ts
 * (clientSectorsForActivityKind), components/ops/OpsActivityForm.tsx (validación, subtipos
 * de tarea) y app/(panels)/erp/pizarra/[userId]/asignar/page.tsx (equipo al crear).
 * Si la web cambia una regla, cámbiala aquí (CoreActivityKindsTest).
 */
object CoreActivityKinds {
    const val TAREA = "tarea"
    const val PROYECTO = "proyecto"
    const val OBRA = "obra"
    const val SERVICIO = "servicio"
    const val COMERCIAL = "comercial"

    const val EJECUCION = "ejecucion"
    const val DESPACHO = "despacho"

    const val WITH_PROJECT = "with_project"
    const val WITHOUT_PROJECT = "without_project"

    const val ROL_LEAD = "LEAD"
    const val ROL_TECNICO = "TECNICO"

    const val TAREA_OTRO = "otro"
    const val DEFAULT_HORA = "09:00"
    const val DEFAULT_PRIORIDAD = "Media"
    const val DEFAULT_EVIDENCE_PHOTOS = 4

    /** La agenda se captura en hora de México (la web usa la hora local del navegador). */
    val MEXICO: ZoneId = ZoneId.of("America/Mexico_City")

    data class KindMeta(
        val id: String,
        val title: String,
        val help: String,
        val glyph: NxGlyph,
        val projectMode: String,
        val ticketType: String? = null,
        val ticketTypeCustom: String? = null,
        val needsServiceClient: Boolean = false,
        val requiresSchedule: Boolean = false,
    )

    val ALL: List<String> = listOf(TAREA, PROYECTO, OBRA, SERVICIO, COMERCIAL)

    private val KINDS: Map<String, KindMeta> = mapOf(
        TAREA to KindMeta(
            TAREA, "Tarea", "Del día, sin proyecto ni cliente.", NxGlyph.TASK, WITHOUT_PROJECT,
            ticketType = "OTRO",
        ),
        PROYECTO to KindMeta(
            PROYECTO, "Proyecto", "Liga a un proyecto operativo y su cliente.", NxGlyph.PROJECT, WITH_PROJECT,
        ),
        OBRA to KindMeta(
            OBRA, "Obra", "Instalación / obra en sitio, ligada a proyecto.", NxGlyph.WORKSITE, WITH_PROJECT,
            ticketType = "INSTALACION", requiresSchedule = true,
        ),
        SERVICIO to KindMeta(
            SERVICIO, "Servicio", "Cliente de servicio. Luis → Antonio → soporte.", NxGlyph.SERVICE, WITHOUT_PROJECT,
            needsServiceClient = true, requiresSchedule = true,
        ),
        COMERCIAL to KindMeta(
            COMERCIAL, "Comercial", "Solo encargados de área.", NxGlyph.COMMERCIAL, WITHOUT_PROJECT,
            ticketType = "OTRO", ticketTypeCustom = "COMERCIAL",
        ),
    )

    fun meta(kind: String?): KindMeta? = KINDS[kind]

    data class Familia(val id: String, val label: String)

    /** FAMILIAS_TAREA de la web, en el orden en que se muestran. */
    val FAMILIAS_TAREA: List<Familia> = listOf(
        Familia("campo", "En campo"),
        Familia("oficina", "Oficina técnica"),
        Familia("administracion", "Administración"),
        Familia("transversal", "Para todos"),
    )

    data class TareaTipo(val id: String, val label: String, val glyph: NxGlyph, val familia: String)

    /**
     * Subtipos de Tarea: viajan como ticketType OTRO + ticketTypeCustom = label.
     * Catálogo cerrado de 17 tipos en 4 familias (web, 28-10): sin «Otro», cada tipo se puede
     * medir. [TAREA_OTRO] queda solo para leer actividades viejas con texto libre.
     */
    val TAREA_TIPOS: List<TareaTipo> = listOf(
        TareaTipo("instalacion", "Instalación", NxGlyph.INSTALLATION, "campo"),
        TareaTipo("cableado", "Cableado y canalización", NxGlyph.CABLING, "campo"),
        TareaTipo("mantenimiento", "Mantenimiento preventivo", NxGlyph.MAINTENANCE, "campo"),
        TareaTipo("correctivo", "Correctivo y diagnóstico", NxGlyph.CORRECTIVE, "campo"),
        TareaTipo("levantamiento", "Levantamiento", NxGlyph.SURVEY, "campo"),
        TareaTipo("recoleccion", "Recolección", NxGlyph.PICKUP, "campo"),
        TareaTipo("entrega", "Entrega", NxGlyph.DELIVERY, "campo"),
        TareaTipo("preparacion", "Preparación de equipo", NxGlyph.EQUIPMENT_PREP, "campo"),
        TareaTipo("diseno", "Diseño, CAD y memoria técnica", NxGlyph.DESIGN, "oficina"),
        TareaTipo("configuracion", "Configuración y soporte remoto", NxGlyph.REMOTE_CONFIG, "oficina"),
        TareaTipo("tramite", "Trámite", NxGlyph.PROCEDURE, "administracion"),
        TareaTipo("compra", "Compra de material", NxGlyph.PURCHASE, "administracion"),
        TareaTipo("facturacion", "Facturación y contabilidad", NxGlyph.BILLING, "administracion"),
        TareaTipo("documentacion", "Reporte / documentación", NxGlyph.DOCUMENTATION, "transversal"),
        TareaTipo("capacitacion", "Capacitación", NxGlyph.TRAINING, "transversal"),
        TareaTipo("junta", "Junta", NxGlyph.MEETING, "transversal"),
        TareaTipo("evento", "Evento o guardia", NxGlyph.EVENT, "transversal"),
    )

    fun tiposDeFamilia(familia: String): List<TareaTipo> = TAREA_TIPOS.filter { it.familia == familia }

    data class ChargeMeta(val id: String, val title: String, val help: String, val badge: String)

    val CHARGES: List<ChargeMeta> = listOf(
        ChargeMeta(EJECUCION, "Ejecución directa", "Queda a su cargo personal: la realiza él mismo.", "Ejecución"),
        ChargeMeta(
            DESPACHO, "Despacho a equipo",
            "Queda a su cargo coordinar: la asigna a alguien de su subordinación.", "Despacho",
        ),
    )

    fun chargeMeta(id: String?): ChargeMeta? = CHARGES.firstOrNull { it.id == id }

    /** Select «Tipo» de OpsActivityForm (proyecto y servicio, que no traen tipo fijo). */
    val TICKET_TYPES: List<Pair<String, String>> = listOf(
        "PREVENTIVO" to "Tipo: Preventivo",
        "CORRECTIVO" to "Tipo: Correctivo",
        "EMERGENCIA" to "Tipo: Emergencia",
        "INSTALACION" to "Tipo: Instalación",
        "INVENTARIO" to "Tipo: Inventario",
        "OTRO" to "Tipo: Otro",
    )

    data class Prioridad(val value: String, val label: String, val color: Long, val hint: String)

    /** Semáforo de components/ops/PrioritySemaforo.tsx. */
    val PRIORIDADES: List<Prioridad> = listOf(
        Prioridad("Baja", "Baja", 0xFF22C55EL, "Puede esperar"),
        Prioridad("Media", "Media", 0xFFEAB308L, "Esta semana"),
        Prioridad("Alta", "Alta", 0xFFEF4444L, "Urgente"),
    )

    // ── Quién crea qué y a quién ────────────────────────────────────────────

    private fun norm(email: String?): String = OrgEmails.norm(email)

    private val CREATE_BY_EMAIL: Map<String, List<String>> = mapOf(
        OrgEmails.CEO to ALL,
        OrgEmails.DEVELOPER to ALL,
        OrgEmails.DAVID to listOf(TAREA, PROYECTO, OBRA, COMERCIAL),
        OrgEmails.LUIS to listOf(TAREA, PROYECTO, SERVICIO, COMERCIAL),
        OrgEmails.ANTONIO to listOf(TAREA, PROYECTO, SERVICIO, COMERCIAL),
        OrgEmails.DANIELA to listOf(TAREA, COMERCIAL),
        OrgEmails.MONICA to listOf(TAREA, COMERCIAL),
        // Paulina (contadora): lo comercial es parte de su trabajo; sin estar aquí solo veía Tarea.
        OrgEmails.PAULINA to listOf(TAREA, COMERCIAL),
        OrgEmails.JOAN to listOf(TAREA),
        OrgEmails.ISRAEL to listOf(TAREA),
        OrgEmails.JUAN to listOf(TAREA),
        OrgEmails.CAROLINA to listOf(TAREA),
        OrgEmails.ALEJANDRO to listOf(TAREA),
        OrgEmails.ROBERTO to emptyList(),
        OrgEmails.JOSUE to listOf(TAREA, PROYECTO, OBRA, COMERCIAL),
    )

    private val RECEIVE_BY_EMAIL: Map<String, List<String>> = mapOf(
        OrgEmails.CEO to ALL,
        OrgEmails.DEVELOPER to ALL,
        OrgEmails.DAVID to listOf(TAREA, PROYECTO, OBRA, COMERCIAL),
        OrgEmails.LUIS to listOf(TAREA, PROYECTO, SERVICIO, COMERCIAL),
        OrgEmails.ANTONIO to listOf(TAREA, PROYECTO, SERVICIO, COMERCIAL),
        // Campo de David
        OrgEmails.JOAN to listOf(TAREA, PROYECTO, OBRA),
        OrgEmails.ISRAEL to listOf(TAREA, PROYECTO, OBRA),
        OrgEmails.JUAN to listOf(TAREA, PROYECTO, OBRA),
        // Soporte de Antonio
        OrgEmails.CAROLINA to listOf(TAREA, PROYECTO, SERVICIO),
        OrgEmails.ALEJANDRO to listOf(TAREA, PROYECTO, SERVICIO),
        OrgEmails.ROBERTO to listOf(TAREA, PROYECTO, SERVICIO),
        // Comercial / admin
        OrgEmails.DANIELA to listOf(TAREA, COMERCIAL),
        OrgEmails.MONICA to listOf(TAREA, COMERCIAL),
        OrgEmails.PAULINA to listOf(TAREA, COMERCIAL),
        // Josué, encargado de obra: todo menos servicio
        OrgEmails.JOSUE to listOf(TAREA, PROYECTO, OBRA, COMERCIAL),
    )

    /** Encargados a quienes se les elige ejecución o despacho. */
    private val CHARGE_MANAGER_EMAILS = setOf(OrgEmails.DAVID, OrgEmails.LUIS, OrgEmails.ANTONIO, OrgEmails.JOSUE)

    /** Encargados de área: se auto-asignan (AREA_MANAGER_EMAILS de la web y del API). */
    private val AREA_MANAGER_EMAILS = setOf(
        OrgEmails.DEVELOPER, OrgEmails.DAVID, OrgEmails.LUIS, OrgEmails.ANTONIO,
        OrgEmails.JOSUE, OrgEmails.DANIELA, OrgEmails.MONICA,
    )

    fun isAreaManagerEmail(email: String?): Boolean = norm(email) in AREA_MANAGER_EMAILS

    fun canOfferAssignmentCharge(email: String?): Boolean = norm(email) in CHARGE_MANAGER_EMAILS

    /**
     * Siempre «Despacho a equipo», sin elegir ejecutor:
     * Luis + servicio (cupo, se lo pasa a Antonio) y Antonio + servicio
     * (él elige al ingeniero).
     */
    fun forcesDespachoOnly(email: String?, kind: String?): Boolean {
        if (kind != SERVICIO) return false
        val e = norm(email)
        return e == OrgEmails.LUIS || e == OrgEmails.ANTONIO
    }

    /** Solo Luis + Tarea / Proyecto / Comercial: ejecución directa, sin equipo. */
    fun forcesEjecucionOnly(email: String?, kind: String?): Boolean =
        norm(email) == OrgEmails.LUIS && (kind == TAREA || kind == PROYECTO || kind == COMERCIAL)

    fun clampHeadcount(n: Int): Int = n.coerceIn(1, 50)

    /** Prefijo en las indicaciones LEAD con el cupo del despacho. */
    fun formatDispatchHeadcountNote(n: Int, extra: String?): String {
        val cupo = clampHeadcount(n)
        val base = "Cupo: $cupo persona${if (cupo == 1) "" else "s"}."
        val more = extra?.trim().orEmpty()
        return if (more.isNotEmpty()) "$base $more" else base
    }

    fun kindsForCreator(roleKey: String?, email: String?, isSuperAdmin: Boolean): List<String> {
        if (isSuperAdmin || roleKey == RoleKeys.CEO || roleKey == RoleKeys.SUPER_ADMIN) return ALL
        return CREATE_BY_EMAIL[norm(email)] ?: listOf(TAREA)
    }

    fun kindsForTarget(email: String?): List<String> {
        val e = norm(email)
        if (e.isEmpty()) return listOf(TAREA)
        return RECEIVE_BY_EMAIL[e] ?: listOf(TAREA)
    }

    /** Tipos visibles = lo que el creador puede crear × lo que el destinatario puede recibir. */
    fun kindsForAssignment(
        creatorEmail: String?,
        targetEmail: String?,
        roleKey: String?,
        isSuperAdmin: Boolean,
    ): List<String> {
        val create = kindsForCreator(roleKey, creatorEmail, isSuperAdmin)
        if (targetEmail.isNullOrEmpty()) return if (create.isEmpty()) listOf(TAREA) else create
        val receive = kindsForTarget(targetEmail).toSet()
        val visibles = ALL.filter { it in create && it in receive }
        if (visibles.isEmpty() && norm(creatorEmail).isNotEmpty() && norm(creatorEmail) == norm(targetEmail)) {
            return listOf(TAREA)
        }
        return visibles
    }

    fun isServicioBridgeEmail(email: String?): Boolean = norm(email) == OrgEmails.ANTONIO

    fun servicioDelegateEmails(): List<String> = listOf(OrgEmails.CAROLINA, OrgEmails.ALEJANDRO, OrgEmails.ROBERTO)

    fun soporteTeamEmails(): List<String> = listOf(OrgEmails.ANTONIO, OrgEmails.CAROLINA, OrgEmails.ALEJANDRO)

    fun fieldInstallerEmails(): List<String> = listOf(OrgEmails.JOAN, OrgEmails.ISRAEL, OrgEmails.JUAN)

    /** Luis no asigna servicio directo: pasa primero por Antonio (puente de sistemas). */
    fun servicioShouldGoToBridge(
        creatorEmail: String?,
        targetEmail: String?,
        isSuperAdmin: Boolean,
        isCeo: Boolean,
    ): Boolean {
        if (isSuperAdmin || isCeo) return false
        val creator = norm(creatorEmail)
        val target = norm(targetEmail)
        if (creator.isEmpty() || target.isEmpty()) return false
        if (creator == OrgEmails.CEO || creator == OrgEmails.DEVELOPER) return false
        if (creator == OrgEmails.ANTONIO) return false
        if (target == OrgEmails.ANTONIO) return false
        return creator == OrgEmails.LUIS
    }

    /** Encargado de área del miembro (instaladores → David, soporte → Antonio). */
    fun coordinatorEmailForMember(email: String?): String? {
        val e = norm(email)
        if (e.isEmpty()) return null
        if (e == OrgEmails.DAVID || e == OrgEmails.ANTONIO || e == OrgEmails.JOSUE || e == OrgEmails.LUIS) return e
        if (e in fieldInstallerEmails()) return OrgEmails.DAVID
        if (e in servicioDelegateEmails()) return OrgEmails.ANTONIO
        return null
    }

    fun extrasEmailsForKind(kind: String?): List<String>? = when (kind) {
        // Roberto solo atiende servicios: entra aquí y no en proyectos.
        SERVICIO -> soporteTeamEmails() + OrgEmails.ROBERTO
        OBRA -> fieldInstallerEmails()
        PROYECTO -> fieldInstallerEmails() + soporteTeamEmails()
        else -> null
    }

    /** Pool de equipo al asignar; vacío = sin filtro (todo el tablero). */
    fun teamPoolEmailsForAssignment(managerEmail: String?, kind: String?, charge: String?): List<String> {
        val manager = norm(managerEmail)
        val fromCharge = if (charge == DESPACHO) CoreActivityRules.dispatchPoolEmails(managerEmail) else emptyList()
        val fromKind = extrasEmailsForKind(kind).orEmpty()
        if (fromCharge.isEmpty() && fromKind.isEmpty()) return emptyList()
        val out = LinkedHashSet<String>()
        for (raw in fromCharge + fromKind) {
            val e = norm(raw)
            if (e.isEmpty() || e == manager) continue
            out += e
        }
        return out.toList()
    }

    /** Coordinadores ajenos al responsable que hay que sumar como LEAD (equipo cruzado). */
    fun peerCoordinatorEmails(primaryEmail: String?, memberEmails: List<String>): List<String> {
        val primary = norm(primaryEmail)
        val out = LinkedHashSet<String>()
        for (raw in memberEmails) {
            val coord = coordinatorEmailForMember(raw) ?: continue
            if (coord == primary) continue
            out += coord
        }
        return out.toList()
    }

    /** Sectores de clientes al asignar un tipo: proyecto/obra → PROYECTO, servicio → CORPORATIVO. */
    fun clientSectorsForActivityKind(kind: String?, email: String?): List<ClientSector> {
        val allowed = ClientSectors.forEmail(email)
        return when (kind) {
            PROYECTO, OBRA -> allowed.filter { it == ClientSector.PROYECTO }
            SERVICIO -> allowed.filter { it == ClientSector.CORPORATIVO }
            // Quien crea comercial sin estar en la matriz de Clientes (Paulina) usa el padrón
            // comercial: sin él, el cliente obligatorio salía vacío y no podía guardar.
            COMERCIAL -> allowed.ifEmpty { listOf(ClientSector.COMERCIAL) }
            else -> emptyList()
        }
    }

    fun firstTwoWords(name: String?): String =
        name.orEmpty().trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2).joinToString(" ")

    /** Texto de ayuda del paso «Equipo» en /asignar. */
    fun extrasHelp(kind: String?, charge: String?, personEmail: String?, personName: String): String {
        val short = firstTwoWords(personName)
        return when {
            charge == DESPACHO && kind == PROYECTO ->
                "Despacho: puedes sumar instaladores y soporte. Si mezclas ambos, se asigna también al otro " +
                    "coordinador (p. ej. Antonio) además de $short y a los subordinados elegidos."
            charge == DESPACHO ->
                "Como despacho, suma a quien debe ejecutarla bajo $short. Si no eliges a nadie, queda pendiente de que él la asigne."
            kind == SERVICIO && isServicioBridgeEmail(personEmail) ->
                "Como puente, suma a Carolina o Alejandro (día/hora ya van en el formulario)."
            kind == SERVICIO -> "Solo soporte (Antonio, Carolina, Alejandro, Roberto)."
            kind == OBRA -> "Solo instaladores de campo (Joan, Israel, Juan José)."
            kind == PROYECTO ->
                "Soporte e instaladores pueden colaborar en el proyecto. Si hay ambos lados, se suman ambos coordinadores."
            charge == EJECUCION -> "Ejecución directa de $short. Puedes sumar apoyo opcional."
            else -> "El responsable es $personName. Puedes sumar apoyo."
        }
    }

    // ── Formulario ──────────────────────────────────────────────────────────

    /** ActivityFormState de la web (solo lo que usa el alta Core). */
    data class FormState(
        val titulo: String = "",
        val indicaciones: String = "",
        val prioridad: String = DEFAULT_PRIORIDAD,
        val responsableId: Long? = null,
        val tiempoEstimadoMin: String = "",
        val tiempoMaximoMin: String = "",
        /** yyyy-MM-dd */
        val fecha: String = "",
        /** HH:mm, hora de México */
        val hora: String = DEFAULT_HORA,
        /**
         * «Entregar a más tardar» (HH:mm, mismo día). Vacío = el límite es el fin del día; con valor,
         * la fecha máxima y la entrega esperada quedan a esa hora (semáforo, KPI y cierre).
         */
        val horaCompromiso: String = "",
        /** BASICA | ESTANDAR | COMPLEJA | CRITICA, o vacío; y la que sugirió la IA. */
        val complejidad: String = "",
        val complejidadSugerida: String = "",
        val clientId: Long? = null,
        val projectId: Long? = null,
        val ticketType: String = "PREVENTIVO",
        val ticketTypeCustom: String = "",
        val workType: String = "ISSUE",
        val projectMode: String = WITH_PROJECT,
        val evidencePhotoRequired: Int = DEFAULT_EVIDENCE_PHOTOS,
        val coreKind: String = "",
        val assignmentCharge: String = "",
    )

    /** Formulario recién montado para un tipo (forcedProjectMode + forcedTicketType de la web). */
    fun initialForm(kind: String, responsableId: Long?, assignmentCharge: String?): FormState {
        val m = meta(kind)
        val base = FormState(
            responsableId = responsableId,
            coreKind = kind,
            assignmentCharge = assignmentCharge.orEmpty(),
            projectMode = m?.projectMode ?: WITH_PROJECT,
        )
        val forced = m?.ticketType ?: return base
        return base.copy(
            ticketType = forced,
            ticketTypeCustom = m.ticketTypeCustom.orEmpty(),
            workType = if (forced == "INVENTARIO") "PREVENTIVE_INVENTORY" else "ISSUE",
        )
    }

    /** Subtipo de tarea seleccionado ("" = ninguno; [TAREA_OTRO] = texto libre de antes del catálogo). */
    fun tareaTipo(form: FormState): String {
        val preset = TAREA_TIPOS.firstOrNull { it.label == form.ticketTypeCustom }
        if (preset != null) return preset.id
        return if (form.ticketType == "OTRO" && form.ticketTypeCustom.isNotBlank()) TAREA_OTRO else ""
    }

    /** Tocar un chip de tipo de tarea (solo los del catálogo). */
    fun pickTareaTipo(form: FormState, id: String): FormState {
        val label = TAREA_TIPOS.firstOrNull { it.id == id }?.label ?: return form
        return form.copy(ticketType = "OTRO", ticketTypeCustom = label, workType = "ISSUE")
    }

    /** El compromiso vale solo si es después de la hora de inicio (`compromisoValido` de la web). */
    fun compromisoValido(hora: String, compromiso: String): Boolean =
        compromiso.isEmpty() || (Regex("^\\d{2}:\\d{2}$").matches(compromiso) && compromiso > hora.ifEmpty { DEFAULT_HORA })

    /**
     * La hora compromiso de una actividad guardada (`horaCompromisoDe` de la web): su fecha máxima,
     * si cae el mismo día (en México) y después del inicio. Una fecha máxima igual al inicio
     * significa «fin del día». Con periodo de varios días no aplica.
     */
    fun horaCompromisoDe(fechaInicio: String?, fechaMaxima: String?, conPeriodo: Boolean, zone: ZoneId = MEXICO): String? {
        if (conPeriodo) return null
        val inicio = fechaInicio?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return null
        val maxima = fechaMaxima?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return null
        if (!maxima.isAfter(inicio)) return null
        val i = inicio.atZone(zone)
        val m = maxima.atZone(zone)
        if (i.toLocalDate() != m.toLocalDate()) return null
        // 23:59 es el fin del día escrito a mano, no un compromiso (`limiteEsFinDeDia` de la API).
        if (m.hour == 23 && m.minute == 59) return null
        return formatHora(m.hour, m.minute)
    }

    /** Hora de la fecha máxima y la entrega esperada: el compromiso si vale; si no, la de inicio (= fin del día). */
    fun horaLimite(form: FormState): String {
        val hora = form.hora.ifEmpty { DEFAULT_HORA }
        return if (form.horaCompromiso.isNotEmpty() && compromisoValido(hora, form.horaCompromiso)) form.horaCompromiso else hora
    }

    /** Select «Tipo» (proyecto / servicio). OTRO pide el texto aparte. */
    fun pickTicketType(form: FormState, type: String): FormState =
        if (type == "OTRO") {
            form.copy(ticketType = "OTRO", workType = "ISSUE")
        } else {
            form.copy(
                ticketType = type,
                ticketTypeCustom = "",
                workType = if (type == "INVENTARIO") "PREVENTIVE_INVENTORY" else "ISSUE",
            )
        }

    fun clampEvidencePhotos(n: Int): Int = n.coerceIn(2, 8)

    /** Mismo orden y textos que handleSubmit de OpsActivityForm; null = se puede guardar. */
    fun validationError(form: FormState, requireSchedule: Boolean): String? {
        if (form.titulo.isBlank() || form.responsableId == null) return "Título y responsable son obligatorios"
        // El alta solo ofrece el catálogo cerrado: un texto libre viejo no basta.
        if (form.coreKind == TAREA && tareaTipo(form).let { it.isEmpty() || it == TAREA_OTRO }) {
            return "Elige el tipo de tarea"
        }
        if (!compromisoValido(form.hora, form.horaCompromiso)) {
            return "La hora de entrega tiene que ser después de la hora de inicio"
        }
        if (form.projectMode == WITH_PROJECT && form.projectId == null) return "Selecciona un proyecto"
        if (requireSchedule && (form.fecha.isBlank() || form.hora.isBlank())) return "Indica día y hora de la agenda"
        return null
    }

    /**
     * La entrega al editar el detalle: null si el día no cambió (no se manda; la API cuenta como
     * cambio cualquier valor distinto), y si cambió, el día nuevo a la misma hora de México que
     * tenía (18:00 si no tenía hora).
     */
    fun entregaEditada(original: String?, nuevoDia: String, zone: ZoneId = MEXICO): String? {
        val dia = nuevoDia.trim().take(10).takeIf { it.isNotEmpty() } ?: return null
        // El campo se llena con los 10 primeros caracteres (día UTC): sin tocarlo, tampoco cambió.
        if (original?.take(10) == dia) return null
        val antes = original?.let { runCatching { Instant.parse(it) }.getOrNull() }?.atZone(zone)
        if (antes != null && antes.toLocalDate().toString() == dia) return null
        val hora = antes?.let { formatHora(it.hour, it.minute) } ?: "18:00"
        return scheduleIso(dia, hora, zone)
    }

    /** El DatePicker de Material entrega medianoche UTC: se lee en UTC para no perder un día en México. */
    fun pickerMillisToDate(millis: Long): String =
        Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString()

    fun dateToPickerMillis(fecha: String?): Long? =
        fecha?.trim()?.takeIf { it.isNotEmpty() }
            ?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
            ?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli()

    fun todayInMexico(now: Instant = Instant.now()): String = now.atZone(MEXICO).toLocalDate().toString()

    /** "HH:mm" → (hora, minuto); 09:00 si viene vacío o mal. */
    fun parseHora(hora: String?): Pair<Int, Int> {
        val t = hora?.trim()?.takeIf { it.isNotEmpty() }?.let { runCatching { LocalTime.parse(it) }.getOrNull() }
            ?: LocalTime.of(9, 0)
        return t.hour to t.minute
    }

    fun formatHora(hour: Int, minute: Int): String =
        "${hour.coerceIn(0, 23).toString().padStart(2, '0')}:${minute.coerceIn(0, 59).toString().padStart(2, '0')}"

    private val ISO_UTC_MILLIS: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

    /**
     * Día + hora capturados en México → ISO UTC (`new Date("${fecha}T${hora}:00").toISOString()`).
     * Nunca una hora fija en UTC.
     */
    fun scheduleIso(fecha: String?, hora: String?, zone: ZoneId = MEXICO): String? {
        val day = fecha?.trim()?.takeIf { it.isNotEmpty() }
            ?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
            ?: return null
        val time = hora?.trim()?.takeIf { it.isNotEmpty() }
            ?.let { runCatching { LocalTime.parse(it) }.getOrNull() }
            ?: LocalTime.of(9, 0)
        return ISO_UTC_MILLIS.format(day.atTime(time).atZone(zone).toInstant())
    }

    /**
     * buildActivityPayload de la web para un alta (estatus Pendiente, creadoPorId).
     * [autoasignacion]: no se mandan tiempo, tope, complejidad ni entrega; la API los calcula del
     * título y el tipo (y los ignoraría de todos modos).
     */
    fun buildRequest(
        form: FormState,
        projectClientId: Long?,
        creadoPorId: Long,
        zone: ZoneId = MEXICO,
        autoasignacion: Boolean = false,
    ): CreateActivityRequest {
        val withProject = form.projectMode == WITH_PROJECT
        val iso = scheduleIso(form.fecha, form.hora, zone)
        // Sin compromiso, la fecha máxima es la de inicio y la API la lee como «fin del día».
        val limite = scheduleIso(form.fecha, horaLimite(form), zone)
        val inventario = form.ticketType == "INVENTARIO"
        val propia = autoasignacion
        return CreateActivityRequest(
            titulo = form.titulo.trim(),
            indicaciones = form.indicaciones.trim().takeIf { it.isNotEmpty() },
            prioridad = form.prioridad,
            activityType = if (withProject) "CLIENT" else "INTERNAL",
            ticketType = if (inventario) "PREVENTIVO" else form.ticketType,
            ticketTypeCustom = if (form.ticketType == "OTRO") form.ticketTypeCustom.trim().takeIf { it.isNotEmpty() } else null,
            workType = if (inventario) "PREVENTIVE_INVENTORY" else form.workType.ifEmpty { "ISSUE" },
            clientId = if (withProject) projectClientId ?: form.clientId else form.clientId,
            projectId = if (withProject) form.projectId else null,
            tiempoEstimadoMin = if (propia) null else form.tiempoEstimadoMin.trim().toIntOrNull(),
            tiempoMaximoMin = if (propia) null else form.tiempoMaximoMin.trim().toIntOrNull(),
            creadoPorId = creadoPorId,
            responsableId = requireNotNull(form.responsableId) { "responsableId" },
            estatus = "Pendiente",
            fechaInicio = iso,
            fechaEntregaEsperada = if (propia) null else limite,
            fechaMaxima = if (propia) null else limite,
            evidencePhotoRequired = clampEvidencePhotos(form.evidencePhotoRequired),
            coreKind = form.coreKind.ifEmpty { null },
            assignmentCharge = form.assignmentCharge.ifEmpty { null },
            complejidad = if (propia) null else form.complejidad.ifEmpty { null },
            complejidadSugerida = if (propia) null else form.complejidadSugerida.ifEmpty { null },
        )
    }

    // ── Equipo al crear (/erp/pizarra/:userId/asignar → handleSuccess) ──────

    data class TeamAdd(val userId: Long, val rol: String, val indicaciones: String?)

    fun teamPlan(
        targetUserId: Long,
        despachoOnly: Boolean,
        ejecucionOnly: Boolean,
        effectiveCharge: String?,
        headcount: Int,
        leadNotes: String,
        extraIds: List<Long>,
        extraNotes: Map<Long, String>,
        peerCoordinatorIds: List<Long>,
    ): List<TeamAdd> {
        val notes = leadNotes.trim()
        if (despachoOnly) {
            return listOf(TeamAdd(targetUserId, ROL_LEAD, formatDispatchHeadcountNote(headcount, notes)))
        }
        if (ejecucionOnly) {
            return if (notes.isNotEmpty()) listOf(TeamAdd(targetUserId, ROL_LEAD, notes)) else emptyList()
        }
        val out = mutableListOf<TeamAdd>()
        val needPrimaryLead = notes.isNotEmpty() ||
            peerCoordinatorIds.isNotEmpty() ||
            (effectiveCharge == DESPACHO && extraIds.isNotEmpty())
        if (needPrimaryLead) {
            val lead = notes.ifEmpty {
                if (peerCoordinatorIds.isNotEmpty()) "Coordinación de su equipo en esta actividad." else ""
            }
            out += TeamAdd(targetUserId, ROL_LEAD, lead.takeIf { it.isNotEmpty() })
        }
        val peers = peerCoordinatorIds.toSet()
        for (peer in peerCoordinatorIds) {
            if (peer == targetUserId || peer in extraIds) continue
            out += TeamAdd(
                peer, ROL_LEAD,
                "Coordinación de su equipo en esta actividad cruzada (instalación / soporte).",
            )
        }
        for (id in extraIds) {
            val rol = if (id in peers || id == targetUserId) ROL_LEAD else ROL_TECNICO
            out += TeamAdd(id, rol, extraNotes[id]?.trim()?.takeIf { it.isNotEmpty() })
        }
        return out
    }
}
