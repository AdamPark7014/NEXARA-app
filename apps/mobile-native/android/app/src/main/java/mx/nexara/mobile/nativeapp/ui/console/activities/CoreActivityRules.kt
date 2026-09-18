package mx.nexara.mobile.nativeapp.ui.console.activities

import java.text.Normalizer
import java.time.Instant
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.roundToLong
import mx.nexara.mobile.nativeapp.access.PlatformAccounts
import mx.nexara.mobile.nativeapp.data.api.EvidenceCampoDto
import mx.nexara.mobile.nativeapp.data.api.EvidenceCampoFotoDto
import mx.nexara.mobile.nativeapp.data.api.EvidenceCampoFotosDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardOpenActivityDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import mx.nexara.mobile.nativeapp.data.api.TeamEvidenceDto
import mx.nexara.mobile.nativeapp.data.api.TeamEvidenceReviewDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxGlyph

/**
 * Reglas de Core (/erp) sin nada de Android, para poder probarlas en JVM.
 *
 * Espejo de apps/web/lib/evidence-flow-helpers.ts, lib/activity-kinds.ts,
 * components/pizarra/MisActividadesView.tsx y components/ops/EquipoEvidencias.tsx.
 * Si la web cambia una etiqueta o una regla, cámbiala aquí (CoreActivityRulesTest).
 */
object CoreActivityRules {
    const val CEO_EMAIL = "gerencia@nexara.com.mx"
    const val LUIS_EMAIL = "direccion.operaciones@nexara.com.mx"

    const val STEP_ENTRY = "ENTRY_PHOTO"
    const val STEP_PHOTOS = "EVIDENCE_PHOTOS"
    const val STEP_PDF = "SERVICE_SHEET_PDF"
    const val STEP_DATA = "SERVICE_SHEET_DATA"
    const val STEP_EXIT = "EXIT_PHOTO"
    const val STEP_COMPLETED = "COMPLETED"

    // Colores de la web (ARGB).
    const val VERDE = 0xFF16A34AL
    const val NARANJA = 0xFFD97706L
    const val ROJO = 0xFFDC2626L
    const val AZUL = 0xFF2563EBL
    const val MORADO = 0xFF7C3AEDL
    const val GRIS = 0xFF94A3B8L

    private val ES_MX: Locale = Locale("es", "MX")

    /** Etiqueta sin emoji + color de la web + ícono opcional ([NxGlyph], se pinta en la UI). */
    data class Tone(val label: String, val color: Long? = null, val glyph: NxGlyph? = null)

    fun norm(email: String?): String = email?.trim()?.lowercase().orEmpty()

    /**
     * Christian solo asigna y revisa: ve la pizarra y nunca captura. Claudia
     * (tester) tiene el mismo trato — ver PlatformAccounts.isCeoEquivalentEmail.
     */
    fun isCeoEmail(email: String?): Boolean = PlatformAccounts.isCeoEquivalentEmail(email)

    // ── Pasos de evidencia ──────────────────────────────────────────────────

    fun requiresServiceSheetPdf(coreKind: String?): Boolean =
        coreKind?.trim()?.lowercase() == "servicio"

    /** Pasos del tipo (sin COMPLETED). Solo servicio lleva hoja PDF. */
    fun evidenceStepsForKind(coreKind: String?): List<String> =
        if (requiresServiceSheetPdf(coreKind)) {
            listOf(STEP_ENTRY, STEP_PHOTOS, STEP_PDF, STEP_DATA, STEP_EXIT)
        } else {
            listOf(STEP_ENTRY, STEP_PHOTOS, STEP_DATA, STEP_EXIT)
        }

    private val STEP_LABEL = mapOf(
        STEP_ENTRY to "Foto de entrada",
        STEP_PHOTOS to "Fotos en sitio",
        STEP_PDF to "Hoja de servicio (PDF)",
        STEP_DATA to "Formulario",
        STEP_EXIT to "Foto de salida",
    )

    fun stepLabel(step: String?): String = STEP_LABEL[step] ?: step.orEmpty()

    data class FormField(val key: String, val label: String) {
        /** Igual que DigitalEvidenceForm: los campos narrativos van en varias líneas. */
        val multiline: Boolean
            get() = MULTILINE_KEY.containsMatchIn(key) || label.contains("observ", ignoreCase = true)
    }

    private val MULTILINE_KEY = Regex("que|observ|hiciste|hizo", RegexOption.IGNORE_CASE)

    /** Claves y etiquetas del formulario digital por tipo (digitalFormLabels). */
    fun digitalFormLabels(coreKind: String?): List<FormField> = when (coreKind?.trim()?.lowercase() ?: "tarea") {
        "servicio" -> listOf(
            FormField("sucursal", "Sucursal"),
            FormField("gerenteEncargado", "Gerente / encargado"),
            FormField("queSeHizo", "Qué se hizo"),
            FormField("observaciones", "Observaciones"),
        )
        "proyecto", "obra" -> listOf(
            FormField("lugar", "Lugar"),
            FormField("encargadoSitio", "Encargado en sitio"),
            FormField("queSeHizo", "Qué se hizo"),
            FormField("observaciones", "Observaciones"),
        )
        "comercial" -> listOf(
            FormField("queHiciste", "Qué hiciste"),
            FormField("clienteOProyecto", "Cliente o proyecto"),
        )
        else -> listOf(FormField("queHiciste", "Qué hiciste"))
    }

    /** Formulario vacío mezclado con lo que ya se había guardado. */
    fun initialFormValues(coreKind: String?, saved: Any?): Map<String, String> {
        val map = saved as? Map<*, *>
        return digitalFormLabels(coreKind).associate { field ->
            val value = map?.get(field.key)
            field.key to when (value) {
                null -> ""
                is Double -> if (value % 1.0 == 0.0) value.toLong().toString() else value.toString()
                else -> value.toString()
            }
        }
    }

    /** Campos capturados con su etiqueta; los viejos (otras claves) también se muestran. */
    fun formEntries(data: Any?, coreKind: String?): List<Pair<String, String>> {
        val map = data as? Map<*, *> ?: return emptyList()
        val labels = digitalFormLabels(coreKind)
        val known = labels.map { it.key }.toSet()
        val main = labels.mapNotNull { f ->
            val v = map[f.key]?.toString()?.trim().orEmpty()
            if (v.isEmpty()) null else f.label to v
        }
        val extras = map.entries.mapNotNull { (k, v) ->
            val key = k?.toString() ?: return@mapNotNull null
            if (key in known || v == null || v is Map<*, *> || v is List<*>) return@mapNotNull null
            val text = v.toString().trim()
            when {
                text.isEmpty() -> null
                text.startsWith("data:image", ignoreCase = true) -> humanizeKey(key) to "Firma capturada"
                else -> humanizeKey(key) to text
            }
        }
        return main + extras
    }

    fun humanizeKey(key: String): String {
        val spaced = key
            .replace(Regex("([a-z0-9])([A-Z])"), "$1 $2")
            .replace(Regex("[_-]+"), " ")
            .trim()
            .lowercase(ES_MX)
        return spaced.replaceFirstChar { it.titlecase(ES_MX) }
    }

    /** `rejectedSteps` (JSON) o, en registros viejos, `rejectedStep`. */
    fun rejectedStepsList(rejectedSteps: Any?, rejectedStep: String?): List<String> {
        val list = (rejectedSteps as? List<*>)
            ?.filterIsInstance<String>()
            ?.filter { it.isNotBlank() }
            .orEmpty()
        if (list.isNotEmpty()) return list
        return rejectedStep?.takeIf { it.isNotBlank() }?.let { listOf(it) }.orEmpty()
    }

    /** Enviada y sin devolución: ya no se toca hasta que la revisen. */
    fun isEvidenceLocked(status: String?, reviewStatus: String?): Boolean =
        reviewStatus != "REJECTED" && status == STEP_COMPLETED

    // ── Evidencia por campos ────────────────────────────────────────────────
    //
    // Un «campo» es una cosa concreta que hay que fotografiar («Cámara 1»,
    // «Rack»). Cada campo pide foto en los momentos que diga el API: antes, en
    // progreso, después — cualquier combinación. La actividad que no trae
    // campos se captura como siempre (fotos libres): todo esto queda inerte.
    //
    // Los momentos son los del API (`MOMENTOS` de evidence-fields.helpers.ts):
    // ANTES | EN_PROGRESO | DESPUES. Así llegan en `momentos`, así se llaman las
    // claves de `fotos` y así se mandan en el POST de la foto.

    const val MOMENTO_ANTES = "ANTES"
    const val MOMENTO_EN_PROGRESO = "EN_PROGRESO"
    const val MOMENTO_DESPUES = "DESPUES"

    /** Orden en que se piden y se pintan. */
    val MOMENTOS = listOf(MOMENTO_ANTES, MOMENTO_EN_PROGRESO, MOMENTO_DESPUES)

    private val MOMENTO_SEPARADOR = Regex("[\\s-]+")
    private val MARCAS_DIACRITICAS = Regex("\\p{Mn}+")

    /**
     * Espejo de `normalizarMomento` del API: acepta «ANTES», «antes»,
     * «EN_PROGRESO», «en progreso», «progreso», «durante», «después»…
     * Devuelve el momento del API o `null` si no es un momento.
     */
    fun normMomento(momento: String?): String? {
        val limpio = Normalizer.normalize(momento?.trim()?.lowercase(ES_MX).orEmpty(), Normalizer.Form.NFD)
            .replace(MARCAS_DIACRITICAS, "")
            .replace(MOMENTO_SEPARADOR, "_")
        return when (limpio) {
            "antes", "before" -> MOMENTO_ANTES
            "en_progreso", "progreso", "durante", "during" -> MOMENTO_EN_PROGRESO
            "despues", "after" -> MOMENTO_DESPUES
            else -> null
        }
    }

    fun momentoLabel(momento: String?): String = when (normMomento(momento)) {
        MOMENTO_ANTES -> "Antes"
        MOMENTO_EN_PROGRESO -> "En progreso"
        MOMENTO_DESPUES -> "Después"
        else -> momento?.trim().orEmpty()
    }

    /** Momentos que pide el campo, sin repetidos, en el orden de [MOMENTOS]. */
    fun momentosDeCampo(campo: EvidenceCampoDto): List<String> {
        val pedidos = campo.momentos.orEmpty().mapNotNull { normMomento(it) }.toSet()
        return MOMENTOS.filter { it in pedidos }
    }

    /** Por `orden`, y a igualdad por id: el API puede mandarlos en cualquier orden. */
    fun camposOrdenados(campos: List<EvidenceCampoDto>?): List<EvidenceCampoDto> =
        campos.orEmpty().sortedWith(
            compareBy({ it.orden ?: Int.MAX_VALUE }, { it.id ?: Long.MAX_VALUE }),
        )

    fun campoNombre(campo: EvidenceCampoDto): String =
        campo.nombre?.trim()?.takeIf { it.isNotEmpty() }
            ?: campo.id?.let { "Campo $it" }
            ?: "Campo"

    /** La foto que el API trae en ese momento (puede venir sin URL). */
    private fun fotoEn(fotos: EvidenceCampoFotosDto?, momento: String?): EvidenceCampoFotoDto? =
        when (normMomento(momento)) {
            MOMENTO_ANTES -> fotos?.antes
            MOMENTO_EN_PROGRESO -> fotos?.enProgreso
            MOMENTO_DESPUES -> fotos?.despues
            else -> null
        }

    private fun urlDe(foto: EvidenceCampoFotoDto?): String? =
        foto?.photoUrl?.trim()?.takeIf { it.isNotEmpty() }

    /** URL ya guardada en ese momento; `null` si el hueco sigue vacío. */
    fun fotoDeCampo(campo: EvidenceCampoDto, momento: String): String? =
        urlDe(fotoEn(campo.fotos, momento))

    fun momentosPendientes(campo: EvidenceCampoDto): List<String> =
        momentosDeCampo(campo).filter { fotoDeCampo(campo, it) == null }

    fun campoListo(campo: EvidenceCampoDto): Boolean = momentosPendientes(campo).isEmpty()

    /** Huecos obligatorios que faltan en toda la actividad. */
    fun camposFaltantes(campos: List<EvidenceCampoDto>?): Int =
        campos.orEmpty().sumOf { momentosPendientes(it).size }

    fun camposRequeridos(campos: List<EvidenceCampoDto>?): Int =
        campos.orEmpty().sumOf { momentosDeCampo(it).size }

    /** Sin campos (API de hoy) nada bloquea; con campos, la salida espera. */
    fun camposListos(campos: List<EvidenceCampoDto>?): Boolean = camposFaltantes(campos) == 0

    /** «4 de 6 fotos por campo». */
    fun camposResumen(campos: List<EvidenceCampoDto>?): String {
        val total = camposRequeridos(campos)
        val hechas = total - camposFaltantes(campos)
        return "$hechas de $total fotos por campo"
    }

    /** Por qué la foto de salida está bloqueada; `null` si ya se puede cerrar. */
    fun camposBloqueoSalida(campos: List<EvidenceCampoDto>?): String? =
        when (val faltan = camposFaltantes(campos)) {
            0 -> null
            1 -> "Falta 1 foto por campo antes de cerrar la actividad."
            else -> "Faltan $faltan fotos por campo antes de cerrar la actividad."
        }

    /** Fotos ya tomadas por campo, en orden (campo y momento). */
    fun camposFotoUrls(campos: List<EvidenceCampoDto>?): List<String> =
        camposOrdenados(campos).flatMap { campo ->
            momentosDeCampo(campo).mapNotNull { fotoDeCampo(campo, it) }
        }

    /**
     * Campos después de mandar la foto de uno. El POST responde con la lista
     * COMPLETA de campos de la actividad: esa manda y reemplaza la local. Sin
     * conexión (`respuesta == null`, quedó en la cola) el hueco se marca con la
     * copia local para que la persona no vuelva a tomar la misma foto.
     */
    fun camposTrasFoto(
        previos: List<EvidenceCampoDto>?,
        respuesta: List<EvidenceCampoDto>?,
        campoId: Long,
        momento: String,
        urlLocal: String,
    ): List<EvidenceCampoDto> =
        respuesta ?: previos.orEmpty().map { campo ->
            if (campo.id == campoId) conFoto(campo, momento, urlLocal) else campo
        }

    /** Marca el hueco como tomado aunque el API no devuelva la URL (o no haya red). */
    fun conFoto(campo: EvidenceCampoDto, momento: String, url: String): EvidenceCampoDto {
        val m = normMomento(momento) ?: return campo
        val fotos = campo.fotos ?: EvidenceCampoFotosDto()
        // Lo que ya venía del servidor manda sobre la copia local.
        val foto = fotoEn(fotos, m)?.takeIf { urlDe(it) != null }
            ?: EvidenceCampoFotoDto(momento = m, photoUrl = url)
        return campo.copy(
            fotos = when (m) {
                MOMENTO_ANTES -> fotos.copy(antes = foto)
                MOMENTO_EN_PROGRESO -> fotos.copy(enProgreso = foto)
                else -> fotos.copy(despues = foto)
            },
        )
    }

    // ── Quién captura ───────────────────────────────────────────────────────

    enum class CaptureRole { CAPTURA, REPARTE, NINGUNO }

    /**
     * Espejo de apps/web/app/(panels)/ops/activities/[id]/evidences/page.tsx:
     * en despacho el LEAD solo reparte; captura quien es del equipo o el
     * responsable de una actividad que no es despacho. El CEO nunca captura.
     */
    fun captureRole(
        viewerId: Long?,
        viewerEmail: String?,
        assignmentCharge: String?,
        responsableId: Long?,
        myActiveRol: String?,
        hasActiveRow: Boolean,
    ): CaptureRole {
        if (viewerId == null) return CaptureRole.NINGUNO
        val despacho = assignmentCharge.equals("despacho", ignoreCase = true)
        val soyResponsable = responsableId != null && responsableId == viewerId
        val reparte = despacho && (myActiveRol.equals("LEAD", ignoreCase = true) || (soyResponsable && !hasActiveRow))
        if (reparte) return CaptureRole.REPARTE
        if (isCeoEmail(viewerEmail)) return CaptureRole.NINGUNO
        return if (hasActiveRow || soyResponsable) CaptureRole.CAPTURA else CaptureRole.NINGUNO
    }

    // ── Mis actividades ─────────────────────────────────────────────────────

    const val MIN_REORDER_REASON = 10

    fun estatusUi(estatus: String?): Tone {
        val s = estatus.orEmpty()
        return when {
            Regex("proceso", RegexOption.IGNORE_CASE).containsMatchIn(s) -> Tone("En curso", AZUL)
            Regex("validar", RegexOption.IGNORE_CASE).containsMatchIn(s) -> Tone("En revisión", MORADO)
            Regex("rechazada", RegexOption.IGNORE_CASE).containsMatchIn(s) -> Tone("Te la regresaron", ROJO)
            Regex("finalizada|completada|aprobada", RegexOption.IGNORE_CASE).containsMatchIn(s) -> Tone("Terminada", VERDE)
            Regex("cancelada", RegexOption.IGNORE_CASE).containsMatchIn(s) -> Tone("Cancelada")
            else -> Tone("Por empezar")
        }
    }

    /** Avance de quien ejecuta, según su evidencia. */
    fun avanceUi(status: String?): Tone = when (status) {
        STEP_COMPLETED -> Tone("Evidencia lista", VERDE)
        STEP_EXIT -> Tone("Por cerrar", AZUL)
        STEP_PDF, STEP_DATA -> Tone("Llenando hoja", AZUL)
        STEP_PHOTOS -> Tone("Trabajando en sitio", AZUL)
        else -> Tone("Sin empezar")
    }

    fun priorityUi(prioridad: String?): Tone = when (prioridad?.trim()?.lowercase() ?: "media") {
        "alta", "urgente" -> Tone("Urgente", ROJO)
        "baja" -> Tone("Puede esperar", VERDE)
        else -> Tone("Esta semana", NARANJA)
    }

    fun isUrgent(prioridad: String?): Boolean = priorityUi(prioridad).label == "Urgente"

    fun kindLabel(coreKind: String?, ticketTypeCustom: String?): String {
        val base = when (coreKind?.trim()?.lowercase()) {
            "tarea" -> "Tarea"
            "proyecto" -> "Proyecto"
            "obra" -> "Obra"
            "servicio" -> "Servicio"
            "comercial" -> "Comercial"
            else -> "Actividad"
        }
        return if (coreKind.equals("tarea", ignoreCase = true) && !ticketTypeCustom.isNullOrBlank()) {
            "$base · $ticketTypeCustom"
        } else {
            base
        }
    }

    /** Ícono del tipo de actividad (acompaña a [kindLabel]). */
    fun kindGlyph(coreKind: String?): NxGlyph = when (coreKind?.trim()?.lowercase()) {
        "tarea" -> NxGlyph.TASK
        "proyecto" -> NxGlyph.PROJECT
        "obra" -> NxGlyph.WORKSITE
        "servicio" -> NxGlyph.SERVICE
        "comercial" -> NxGlyph.COMMERCIAL
        else -> NxGlyph.ACTIVITY
    }

    /** Chip del tipo: «Tarea · Junta» con su ícono. */
    fun kindTone(coreKind: String?, ticketTypeCustom: String?): Tone =
        Tone(kindLabel(coreKind, ticketTypeCustom), glyph = kindGlyph(coreKind))

    /** Mueve un elemento de la cola; null si el movimiento no aplica. */
    fun reorderIds(ids: List<Long>, from: Int, to: Int): List<Long>? {
        if (from !in ids.indices || to !in ids.indices || from == to) return null
        val list = ids.toMutableList()
        val moved = list.removeAt(from)
        list.add(to, moved)
        return list
    }

    // ── Pizarra y despacho ──────────────────────────────────────────────────

    const val CIAN = 0xFF0284C7L

    /** `inactivo` ya no lo produce el API; solo se pinta si una API vieja lo manda. */
    val BOARD_STATUS_ORDER = listOf("activo", "atrasado", "libre", "sin_actividad")

    fun boardStatusLabel(status: String?): String = when (status) {
        "activo" -> "Activo"
        "atrasado" -> "Atrasado"
        "libre" -> "Terminó"
        "inactivo" -> "Inactivo"
        else -> "Sin actividad"
    }

    fun boardStatusColor(status: String?): Long = when (status) {
        "activo" -> VERDE
        "atrasado" -> ROJO
        "libre" -> CIAN
        else -> GRIS
    }

    /** Minutos de la pizarra, como `formatMinutes` de team-board-api.ts: «2 h 05 min». */
    fun formatBoardMinutes(minutes: Double?): String {
        val total = minutes?.takeIf { !it.isNaN() && !it.isInfinite() }?.toLong() ?: return "—"
        val h = total / 60
        val m = total % 60
        return if (h <= 0) "$m min" else "$h h ${m.toString().padStart(2, '0')} min"
    }

    /** «Atrasado 1 h 20 min» · «Sin actividad desde hace 2 h 05 min» · o la etiqueta del estado. */
    fun boardEstadoTexto(
        status: String?,
        currentLateMinutes: Double?,
        idleSinceAt: String?,
        now: Instant = Instant.now(),
    ): String {
        if (status == "atrasado" && currentLateMinutes != null && currentLateMinutes > 0) {
            return "Atrasado ${formatBoardMinutes(currentLateMinutes)}"
        }
        val idle = parseInstant(idleSinceAt)
        if (status == "libre" && idle != null) {
            val min = ((now.toEpochMilli() - idle.toEpochMilli()) / 60_000).coerceAtLeast(0)
            return if (min < 1) {
                "Sin actividad desde hace un momento"
            } else {
                "Sin actividad desde hace ${formatBoardMinutes(min.toDouble())}"
            }
        }
        return boardStatusLabel(status)
    }

    /** «Finalizó a las 10:49 con 1 h 20 min de atraso» / «…, a tiempo» / sin fecha máxima. */
    fun boardTerminoTexto(finishedAt: String?, lateMinutes: Double?, zone: ZoneId = ZoneId.systemDefault()): String {
        val hora = formatClock(finishedAt, zone)
        return when {
            lateMinutes == null -> "Finalizó a las $hora"
            lateMinutes <= 0 -> "Finalizó a las $hora, a tiempo"
            else -> "Finalizó a las $hora con ${formatBoardMinutes(lateMinutes)} de atraso"
        }
    }

    fun boardEnEsperaTexto(count: Int): String =
        if (count > 1) "$count en espera de aprobación" else "En espera de aprobación"

    private val INSTALADORES = listOf(
        "joan.sanchez@nexara.com.mx",
        "israel.ramos@nexara.com.mx",
        "juan.gonzalez@nexara.com.mx",
    )

    /** A quién puede pasar cada encargado un despacho (DISPATCH_POOLS del API). */
    private val DISPATCH_POOLS = mapOf(
        LUIS_EMAIL to listOf("jose.ramirez@nexara.com.mx"),
        "jose.ramirez@nexara.com.mx" to listOf(
            "soporte@nexara.com.mx",
            "alejandro.gonzalez@nexara.com.mx",
            "roberto.vivanco@nexara.com.mx",
        ),
        "operaciones@nexara.com.mx" to INSTALADORES,
        "infraestructura@nexara.com.mx" to INSTALADORES,
    )

    fun dispatchPoolEmails(managerEmail: String?): List<String> = DISPATCH_POOLS[norm(managerEmail)].orEmpty()

    /** Despachos que aún no tienen a nadie del grupo de este encargado. */
    fun despachosPendientes(
        managerEmail: String?,
        pending: List<TeamBoardOpenActivityDto>,
    ): List<TeamBoardOpenActivityDto> {
        val pool = dispatchPoolEmails(managerEmail).map { it.lowercase() }.toSet()
        val self = norm(managerEmail)
        return pending.filter { p ->
            if (!p.assignmentCharge.equals("despacho", ignoreCase = true)) return@filter false
            val team = p.teamEmails?.map { it.lowercase() } ?: return@filter true
            if (pool.isNotEmpty()) team.none { it in pool } else team.none { it != self }
        }
    }

    fun despachoCandidates(
        managerEmail: String?,
        managerUserId: Long,
        roster: List<TeamBoardUserDto>,
    ): List<TeamBoardUserDto> {
        val others = roster.filter { it.id != managerUserId }
        val pool = dispatchPoolEmails(managerEmail).map { it.lowercase() }.toSet()
        if (pool.isEmpty()) return others
        return others.filter { norm(it.email) in pool }
    }

    fun parseDispatchHeadcount(text: String?): Int? {
        val m = Regex("Cupo:\\s*(\\d+)\\s*persona", RegexOption.IGNORE_CASE).find(text ?: return null) ?: return null
        return m.groupValues[1].toIntOrNull()?.takeIf { it > 0 }
    }

    // ── Evidencias del equipo ───────────────────────────────────────────────

    /** Estado de la actividad según quienes la ejecutan. */
    fun teamActivityState(ejecutores: Int, terminaron: Int, aprobadas: Int): Tone = when {
        ejecutores > 0 && aprobadas >= ejecutores -> Tone("Finalizada: todo aprobado", VERDE, NxGlyph.APPROVED)
        ejecutores > 0 && terminaron >= ejecutores -> Tone("Por validar", NARANJA, NxGlyph.TO_REVIEW)
        else -> Tone("En curso", AZUL, NxGlyph.IN_PROGRESS)
    }

    fun isTeamFinalizada(ejecutores: Int, aprobadas: Int): Boolean = ejecutores > 0 && aprobadas >= ejecutores

    fun memberEstadoUi(status: String?, reviewStatus: String?, correctionSubmittedAt: String? = null): Tone = when {
        reviewStatus == "APPROVED" -> Tone("Aprobada", VERDE, NxGlyph.APPROVED)
        reviewStatus == "REJECTED" -> Tone("Corrigiendo", NARANJA, NxGlyph.RETURNED)
        status == STEP_COMPLETED && !correctionSubmittedAt.isNullOrBlank() -> Tone("Corrección por revisar", NARANJA, NxGlyph.CORRECTION)
        status == STEP_COMPLETED -> Tone("Por revisar", NARANJA, NxGlyph.TO_REVIEW)
        else -> Tone("En curso", AZUL, NxGlyph.IN_PROGRESS)
    }

    /** La devolución más reciente (revisiones vienen de la más nueva a la más vieja). */
    fun ultimaDevolucion(revisiones: List<TeamEvidenceReviewDto>): TeamEvidenceReviewDto? =
        revisiones.firstOrNull { it.decision != "APROBADA" }

    /** Ya envió la corrección de lo devuelto y nadie la ha aprobado. */
    fun esCorreccion(ev: TeamEvidenceDto?, revisiones: List<TeamEvidenceReviewDto>): Boolean =
        ev != null && !ev.correctionSubmittedAt.isNullOrBlank() && ev.status == STEP_COMPLETED &&
            ev.reviewStatus != "APPROVED" && ultimaDevolucion(revisiones) != null

    /** Pasos que rehizo tras la última devolución (se resaltan para revisarlos primero). */
    fun pasosCorregidos(ev: TeamEvidenceDto?, revisiones: List<TeamEvidenceReviewDto>): List<String> =
        if (esCorreccion(ev, revisiones)) ultimaDevolucion(revisiones)?.pasos.orEmpty() else emptyList()

    /** Barra de quien revisa cuando lo que llega es una corrección. */
    fun correccionTexto(
        correctionSubmittedAt: String?,
        revisiones: List<TeamEvidenceReviewDto>,
        zone: ZoneId = ZoneId.systemDefault(),
    ): String {
        val ultima = ultimaDevolucion(revisiones)
        val pasos = ultima?.pasos.orEmpty()
        val que = if (pasos.isNotEmpty() && ultima?.decision != "DEVUELTA_TODO") {
            " (${pasos.joinToString(", ") { stepLabel(it) }})"
        } else {
            " (rehízo toda la actividad)"
        }
        val cuando = formatWhen(correctionSubmittedAt, zone)?.let { " · $it" }.orEmpty()
        return "Corrigió lo que se le devolvió$que$cuando. Revisa la corrección y apruébala o devuélvela de nuevo."
    }

    fun corrigiendoTexto(pasos: List<String>, reviewNotes: String?, avisarReenvio: Boolean): String {
        val notas = reviewNotes?.takeIf { it.isNotBlank() }?.let { " · «$it»" }.orEmpty()
        val aviso = if (avisarReenvio) ". Cuando envíe la corrección podrás aprobarla o devolverla otra vez." else ""
        return "Está corrigiendo: ${pasos.joinToString(", ") { stepLabel(it) }}$notas$aviso"
    }

    fun memberRolUi(reparte: Boolean, rol: String?): Tone = when {
        reparte -> Tone("La reparte", MORADO, NxGlyph.DISPATCH)
        rol.equals("APOYO", ignoreCase = true) -> Tone("Apoyo", AZUL, NxGlyph.SUPPORT)
        else -> Tone("La ejecuta", AZUL, NxGlyph.EXECUTES)
    }

    fun reviewDecisionUi(decision: String?): Tone = when (decision) {
        "APROBADA" -> Tone("Aprobada", VERDE, NxGlyph.APPROVED)
        "DEVUELTA_TODO" -> Tone("Devuelta completa", ROJO, NxGlyph.RETURNED)
        else -> Tone("Devuelta para corregir", NARANJA, NxGlyph.RETURNED)
    }

    /** «Luis → Antonio → Alejandro»: quien asignó a la primera persona y luego el equipo. */
    fun cadena(firstAsignadoPor: String?, nombres: List<String?>): List<String> =
        (listOf(firstAsignadoPor) + nombres)
            .filterNotNull()
            .filter { it.isNotBlank() }
            .distinct()
            .map { shortName(it) }

    const val FOTO_ENTRADA = "Entrada"
    const val FOTO_SALIDA = "Salida"

    fun fotoEvidenciaLabel(n: Int): String = "Evidencia $n"

    /** Ícono de una foto según su etiqueta ([FOTO_ENTRADA], [FOTO_SALIDA] o en sitio). */
    fun fotoGlyph(etiqueta: String): NxGlyph = when (etiqueta) {
        FOTO_ENTRADA -> NxGlyph.ENTRY
        FOTO_SALIDA -> NxGlyph.EXIT
        else -> NxGlyph.PHOTO
    }

    data class EvidencePhoto(
        val url: String,
        val titulo: String,
        val at: String?,
        val lat: Double?,
        val lng: Double?,
        /** Nombre corto de la foto: «Entrada», «Evidencia 2», «Salida». */
        val etiqueta: String = titulo,
    )

    /** Fotos etiquetadas a partir de las URLs sueltas del historial de una persona. */
    fun fotosEtiquetadas(
        entryPhotoUrl: String?,
        evidencePhotos: List<String>?,
        exitPhotoUrl: String?,
        nombre: String?,
    ): List<EvidencePhoto> = fotosDe(
        TeamEvidenceDto(
            entryPhotoUrl = entryPhotoUrl,
            evidencePhotos = evidencePhotos.orEmpty().filter { it.isNotBlank() },
            exitPhotoUrl = exitPhotoUrl,
        ),
        nombre,
    ).fotos

    data class EvidencePhotoSet(
        val fotos: List<EvidencePhoto>,
        val entrada: Int?,
        val sitio: List<Int>,
        val salida: Int?,
    )

    /** Fotos de una evidencia en el orden del visor: entrada, en sitio, salida. */
    fun fotosDe(ev: TeamEvidenceDto, nombre: String?, etiqueta: String = ""): EvidencePhotoSet {
        val quien = "${shortName(nombre)}$etiqueta"
        val fotos = mutableListOf<EvidencePhoto>()
        var entrada: Int? = null
        var salida: Int? = null
        val sitio = mutableListOf<Int>()
        ev.entryPhotoUrl?.takeIf { it.isNotBlank() }?.let { url ->
            entrada = fotos.size
            fotos += EvidencePhoto(
                url, "$quien · $FOTO_ENTRADA", ev.entryPhotoUploadedAt,
                anyToDouble(ev.entryLatitude), anyToDouble(ev.entryLongitude),
                etiqueta = FOTO_ENTRADA,
            )
        }
        ev.evidencePhotos.orEmpty().forEachIndexed { i, url ->
            val geo = geoAt(ev.evidencePhotosGeo, i)
            val label = fotoEvidenciaLabel(i + 1)
            sitio += fotos.size
            fotos += EvidencePhoto(
                url, "$quien · $label",
                geo?.capturedAt ?: ev.evidencePhotosUploadedAt, geo?.lat, geo?.lng,
                etiqueta = label,
            )
        }
        ev.exitPhotoUrl?.takeIf { it.isNotBlank() }?.let { url ->
            salida = fotos.size
            fotos += EvidencePhoto(
                url, "$quien · $FOTO_SALIDA", ev.exitPhotoUploadedAt,
                anyToDouble(ev.exitLatitude), anyToDouble(ev.exitLongitude),
                etiqueta = FOTO_SALIDA,
            )
        }
        return EvidencePhotoSet(fotos, entrada, sitio, salida)
    }

    data class Geo(val lat: Double?, val lng: Double?, val capturedAt: String?)

    fun geoAt(photosGeo: Any?, index: Int): Geo? {
        val item = (photosGeo as? List<*>)?.getOrNull(index) as? Map<*, *> ?: return null
        return Geo(
            lat = anyToDouble(item["latitude"]),
            lng = anyToDouble(item["longitude"]),
            capturedAt = item["capturedAt"]?.toString(),
        )
    }

    /** Hora en que se completó cada paso; null si falta, "" si se hizo sin hora. */
    fun horaPaso(ev: TeamEvidenceDto, step: String): String? = when (step) {
        STEP_ENTRY -> if (!ev.entryPhotoUrl.isNullOrBlank()) ev.entryPhotoUploadedAt ?: "" else null
        STEP_PHOTOS -> if (!ev.evidencePhotos.isNullOrEmpty()) ev.evidencePhotosUploadedAt ?: "" else null
        STEP_PDF -> if (!ev.serviceSheetPdfUrl.isNullOrBlank()) ev.serviceSheetUploadedAt ?: "" else null
        STEP_DATA -> ev.serviceSheetCompletedAt
        STEP_EXIT -> if (!ev.exitPhotoUrl.isNullOrBlank()) ev.exitPhotoUploadedAt ?: "" else null
        else -> null
    }

    fun califLabel(n: Int): String = when (n) {
        1 -> "Deficiente"
        2 -> "Regular"
        3 -> "Buena"
        4 -> "Muy buena"
        5 -> "Excelente"
        else -> ""
    }

    /** Qué falta en la revisión, en el mismo orden y palabras que la web. */
    fun revisionFaltantes(
        aprobar: Boolean,
        todo: Boolean,
        pasosMarcados: Int,
        calificacion: Int,
        observaciones: String,
    ): List<String> = buildList {
        if (!aprobar && !todo && pasosMarcados == 0) add("marca qué pasos debe corregir")
        if (calificacion !in 1..5) add("califica su eficiencia")
        if (observaciones.trim().length < 5) {
            add(if (aprobar) "escribe por qué la apruebas" else "escribe qué debe corregir")
        }
    }

    // ── Texto y formatos ────────────────────────────────────────────────────

    fun shortName(name: String?): String =
        name.orEmpty().trim().split(Regex("\\s+")).filter { it.isNotBlank() }.take(2).joinToString(" ")

    fun initials(name: String?): String =
        name.orEmpty().trim().split(Regex("\\s+")).filter { it.isNotBlank() }.take(2)
            .joinToString("") { it.take(1) }
            .uppercase(ES_MX)

    fun firstName(name: String?): String =
        name.orEmpty().trim().split(Regex("\\s+")).firstOrNull { it.isNotBlank() }.orEmpty()

    fun mapsUrl(lat: Double?, lng: Double?): String? {
        if (lat == null || lng == null || lat.isNaN() || lng.isNaN()) return null
        return "https://www.google.com/maps?q=$lat,$lng"
    }

    /** Prisma manda `Decimal` como texto y los snapshots traen números o texto. */
    fun anyToDouble(value: Any?): Double? = when (value) {
        null -> null
        is Number -> value.toDouble().takeIf { !it.isNaN() }
        is String -> value.trim().toDoubleOrNull()
        else -> value.toString().trim().toDoubleOrNull()
    }

    fun normalizeVista(raw: String?): String? = when (raw?.trim()?.lowercase()) {
        "mias", "mías" -> "mias"
        "equipo" -> "equipo"
        else -> null
    }

    fun timelineKindLabel(kind: String?): String = when (kind?.trim()?.lowercase()) {
        "enviada" -> "Enviada"
        "reprogramada" -> "Reprogramada"
        "cumplida" -> "Cumplida"
        "revision", "revisión" -> "Revisión"
        "evidencia" -> "Evidencia"
        "estado" -> "Estado"
        "agenda" -> "Agenda"
        "despacho" -> "Despacho"
        "acs" -> "ACS"
        "incidencia" -> "Incidencia"
        "recomendación", "recomendacion" -> "Recomendación"
        "material" -> "Material"
        "reasignación", "reasignacion" -> "Reasignación"
        null, "" -> "Evento"
        else -> kind.trim().replaceFirstChar { it.titlecase(ES_MX) }
    }

    fun parseInstant(iso: String?, zone: ZoneId = ZoneId.systemDefault()): Instant? {
        val value = iso?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return runCatching { Instant.parse(value) }.getOrNull()
            ?: runCatching { OffsetDateTime.parse(value).toInstant() }.getOrNull()
            ?: runCatching { LocalDateTime.parse(value).atZone(zone).toInstant() }.getOrNull()
    }

    private val WHEN_FORMAT = DateTimeFormatter.ofPattern("EEE d MMM · HH:mm", ES_MX)
    private val CLOCK_FORMAT = DateTimeFormatter.ofPattern("HH:mm", ES_MX)
    private val FULL_FORMAT = DateTimeFormatter.ofPattern("d MMM yyyy · HH:mm", ES_MX)
    private val LOCAL_INPUT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")

    /** «lun 14 sep · 09:30» */
    fun formatWhen(iso: String?, zone: ZoneId = ZoneId.systemDefault()): String? {
        val instant = parseInstant(iso, zone) ?: return null
        return WHEN_FORMAT.format(instant.atZone(zone)).replace(".", "")
    }

    fun formatFull(iso: String?, zone: ZoneId = ZoneId.systemDefault()): String? {
        val instant = parseInstant(iso, zone) ?: return null
        return FULL_FORMAT.format(instant.atZone(zone)).replace(".", "")
    }

    fun formatClock(iso: String?, zone: ZoneId = ZoneId.systemDefault()): String {
        val instant = parseInstant(iso, zone) ?: return "—"
        return CLOCK_FORMAT.format(instant.atZone(zone))
    }

    fun formatMinutes(minutes: Double?): String {
        val total = minutes?.takeIf { !it.isNaN() && it > 0 }?.roundToLong() ?: return "—"
        val h = total / 60
        val m = total % 60
        return when {
            h <= 0 -> "$m min"
            m == 0L -> "$h h"
            else -> "$h h $m min"
        }
    }

    /** «Justo ahora», «Hace 12 min», «En 3h», «Hace 2d». */
    fun relativeTime(iso: String?, now: Instant = Instant.now()): String {
        val instant = parseInstant(iso) ?: return ""
        val diffMs = now.toEpochMilli() - instant.toEpochMilli()
        val mins = (abs(diffMs) / 60_000.0).roundToInt()
        if (mins < 2) return "Justo ahora"
        fun fmt(v: String) = if (diffMs < 0) "En $v" else "Hace $v"
        if (mins < 60) return fmt("$mins min")
        val hrs = (mins / 60.0).roundToInt()
        if (hrs < 24) return fmt("${hrs}h")
        return fmt("${(hrs / 24.0).roundToInt()}d")
    }

    /** ISO → «yyyy-MM-ddTHH:mm» local, el formato de DateTimePickerField. */
    fun isoToLocalInput(iso: String?, zone: ZoneId = ZoneId.systemDefault()): String {
        val instant = parseInstant(iso, zone) ?: return ""
        return LOCAL_INPUT.format(instant.atZone(zone))
    }

    /** «yyyy-MM-ddTHH:mm» local → ISO-8601 UTC; null si no se entiende. */
    fun localInputToIso(value: String?, zone: ZoneId = ZoneId.systemDefault()): String? {
        val v = value?.trim()?.takeIf { it.length >= 16 } ?: return null
        return runCatching { LocalDateTime.parse(v.take(16), LOCAL_INPUT).atZone(zone).toInstant().toString() }
            .getOrNull()
    }
}
