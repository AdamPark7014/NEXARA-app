package mx.nexara.mobile.nativeapp.data.api

import com.squareup.moshi.Json
import com.squareup.moshi.JsonAdapter
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

/*
 * Core (/erp): Mis actividades, pizarra del equipo, evidencias del equipo y el
 * flujo de captura de quien ejecuta.
 *
 * Espejo de apps/web/lib/my-activities-api.ts y team-board-api.ts, contra
 * apps/api/src/me/me.controller.ts y activity-evidence.controller.ts.
 *
 * Todo campo es opcional a propósito: un campo nuevo o nulo del lado del API no
 * debe tumbar la pantalla. Latitudes y `evidencePhotosGeo` van como `Any?`
 * porque Prisma serializa `Decimal` como texto y los `snapshot` de revisiones
 * son JSON libre; se leen con `CoreActivityRules.anyToDouble`.
 */

// ── Mis actividades (GET me/activities) ─────────────────────────────────────

data class MyActivityRefDto(
    val id: Long? = null,
    val nombre: String? = null,
)

/** Registro de despacho: a quién se pasó después de este usuario. */
data class MyActivityPasadaDto(
    val nombre: String? = null,
    val rol: String? = null,
    val at: String? = null,
    val por: String? = null,
    val evidenceStatus: String? = null,
)

/**
 * Periodo de una actividad de varios días (regla del 18-09): sigue en la lista cada día
 * hasta su fin. La frase ya viene hecha por la API con el «hoy» de México
 * («Día 3 de 10 · termina vie 25 sep»); la app solo la pinta. Ausente en APIs viejas.
 */
data class ActivityPeriodoDto(
    /** Primer y último día, `AAAA-MM-DD`. */
    val inicio: String? = null,
    val fin: String? = null,
    val dias: Int? = null,
    /** N en «Día N de M»; null si todavía no empieza o ya terminó. */
    val dia: Int? = null,
    /** programada | en_curso | vencida | cerrada */
    val estado: String? = null,
    val etiqueta: String? = null,
    val multiDia: Boolean? = null,
)

/** Última reprogramación de día y hora (quién, cuándo, de → a). */
data class MyActivityReprogramacionDto(
    val at: String? = null,
    val por: String? = null,
    val de: String? = null,
    val a: String? = null,
    val motivo: String? = null,
)

data class MyActivityItemDto(
    val id: Long,
    val anNumber: String? = null,
    val titulo: String? = null,
    val descripcion: String? = null,
    val estatus: String? = null,
    val prioridad: String? = null,
    val coreKind: String? = null,
    val ticketTypeCustom: String? = null,
    val assignmentCharge: String? = null,
    val fechaInicio: String? = null,
    val fechaMaxima: String? = null,
    val fechaAsignacion: String? = null,
    val fechaFinalizacion: String? = null,
    val tiempoEstimadoMin: Double? = null,
    val tiempoMaximoMin: Double? = null,
    val rol: String? = null,
    /** Indicaciones personales de esta persona en la actividad. */
    val indicaciones: String? = null,
    val asignadaPor: MyActivityRefDto? = null,
    val autoAsignada: Boolean? = null,
    val proyecto: String? = null,
    val cliente: String? = null,
    val evidenceStatus: String? = null,
    val orden: Double? = null,
    val ordenJustificacion: String? = null,
    val ordenActualizadoAt: String? = null,
    /** En despacho, este usuario solo reparte (no sube evidencia). */
    val despachador: Boolean? = null,
    /** Despachador que todavía no la pasa a nadie. */
    val porRepartir: Boolean? = null,
    val pasadaA: List<MyActivityPasadaDto>? = null,
    val ultimaReprogramacion: MyActivityReprogramacionDto? = null,
    // ── Contrato B (aceptación y tiempos); todo opcional: la API vieja no lo manda.
    /** PENDIENTE | ACEPTADA | RECHAZADA. */
    val aceptacion: String? = null,
    val motivoRechazo: String? = null,
    /** rojo | amarillo | verde (lo calcula el servidor). */
    val semaforo: String? = null,
    /** Tiempo planeado en minutos (`horasPlan` × 60). */
    val minutosPlan: Double? = null,
    /** Tiempo real: inicio → fin, o inicio → ahora si sigue en curso. */
    val minutosReales: Double? = null,
    val excedida: Boolean? = null,
    val inicioRealAt: String? = null,
    val finRealAt: String? = null,
    /** Quién se la asignó (nombre del contrato; `asignadaPor` es el campo viejo). */
    val asignadoPor: MyActivityRefDto? = null,
    /** La empezó habiendo otra de más prioridad sin terminar. */
    val saltoPrioridad: Boolean? = null,
    val justificacionOrden: String? = null,
    /** Actividad de varios días: «Día 3 de 10 · termina vie 25 sep». */
    val periodo: ActivityPeriodoDto? = null,
) {
    /** El contrato dice `asignadoPor`; las respuestas de hoy traen `asignadaPor`. */
    val quienAsigno: MyActivityRefDto? get() = asignadoPor ?: asignadaPor
}

data class MyActivitiesResponseDto(
    /** Encargados de área: pueden reordenar su cola (con justificación). */
    val canReorder: Boolean? = null,
    /** Encargados de área: pueden auto-asignarse actividades. */
    val canSelfAssign: Boolean? = null,
    val open: List<MyActivityItemDto>? = null,
    /** Ya repartidas por este usuario: da seguimiento. */
    val seguimiento: List<MyActivityItemDto>? = null,
    val doneToday: List<MyActivityItemDto>? = null,
)

data class ReorderMyActivitiesRequest(
    /** Cola completa en el nuevo orden. */
    val activityIds: List<Long>,
    val movedActivityId: Long,
    val justificacion: String,
)

data class DispatchMyActivityRequest(
    val userIds: List<Long>,
    val indicaciones: String? = null,
    /** Tiempo estimado en horas (contrato B); el API viejo lo ignora. */
    val horasPlan: Double? = null,
)

data class ReprogramarDespachoRequest(
    /** Día y hora nuevos en ISO-8601 (UTC). */
    val fecha: String,
    val motivo: String? = null,
)

// ── Pizarra del equipo (GET me/board) ───────────────────────────────────────

data class TeamBoardActivityDto(
    val id: Long,
    val anNumber: String? = null,
    val titulo: String? = null,
    val estatus: String? = null,
    val fechaMaxima: String? = null,
    val bucket: String? = null,
    val periodo: ActivityPeriodoDto? = null,
)

data class TeamBoardOpenActivityDto(
    val id: Long,
    val anNumber: String? = null,
    val titulo: String? = null,
    val estatus: String? = null,
    val evidenceStatus: String? = null,
    val progressPct: Double? = null,
    val coreKind: String? = null,
    val assignmentCharge: String? = null,
    val fechaFinalizacion: String? = null,
    val indicaciones: String? = null,
    // ── Contrato C (pizarra con semáforo); opcionales.
    val prioridad: String? = null,
    /** rojo | amarillo | verde */
    val semaforo: String? = null,
    val asignadoPor: MyActivityRefDto? = null,
    val minutosPlan: Double? = null,
    val minutosReales: Double? = null,
    val excedida: Boolean? = null,
    /** Emails del equipo activo: dice si un despacho ya se repartió. */
    val teamEmails: List<String>? = null,
    /** En despacho esta persona (LEAD) solo reparte. */
    val reparte: Boolean? = null,
    /** Día y hora programados (reprogramable por quien reparte). */
    val fechaInicio: String? = null,
    /** Actividad de varios días: sigue en la pizarra cada día hasta su fin. */
    val periodo: ActivityPeriodoDto? = null,
)

/** Última actividad que la persona terminó hoy (estado `libre`). */
data class TeamBoardLastFinishedDto(
    val id: Long? = null,
    val anNumber: String? = null,
    val titulo: String? = null,
    val finishedAt: String? = null,
    /** Minutos contra la fecha máxima; null = no tenía fecha máxima. */
    val lateMinutes: Double? = null,
)

data class TeamBoardUserDto(
    val id: Long,
    val nombre: String? = null,
    val email: String? = null,
    val avatarUrl: String? = null,
    val puesto: String? = null,
    /** activo | atrasado | libre | sin_actividad (inactivo solo en APIs viejas). */
    val status: String? = null,
    val currentActivity: TeamBoardActivityDto? = null,
    val openActivities: List<TeamBoardOpenActivityDto>? = null,
    val clockInAt: String? = null,
    val workedMinutes: Double? = null,
    val activityStartedAt: String? = null,
    val activityElapsedMinutes: Double? = null,
    /** Atrasado: minutos pasados de la fecha máxima de lo que está haciendo. */
    val currentLateMinutes: Double? = null,
    /** Libre: desde cuándo no tiene nada abierto. */
    val idleSinceAt: String? = null,
    val lastFinished: TeamBoardLastFinishedDto? = null,
    /** Actividades suyas entregadas que nadie ha aprobado. */
    val enEsperaAprobacion: Int? = null,
    /** Actividades con evidencia devuelta que está corrigiendo. */
    val enCorreccion: Int? = null,
    /** Contrato C: números del rango que se está viendo; ausente en APIs viejas. */
    val kpis: TeamBoardKpisDto? = null,
)

/**
 * KPI de una persona en el rango (`me/board?desde&hasta`).
 *
 * `eficienciaPct` = plan/real × 100 (solo lo terminado con plan);
 * `productividadPct` = minutos en actividad / minutos asistidos × 100.
 */
data class TeamBoardKpisDto(
    val asignadas: Int? = null,
    val cerradas: Int? = null,
    val aTiempo: Int? = null,
    val aTiempoPct: Double? = null,
    val minutosPlan: Double? = null,
    val minutosReales: Double? = null,
    val eficienciaPct: Double? = null,
    val minutosAsistidos: Double? = null,
    val minutosEnActividad: Double? = null,
    val productividadPct: Double? = null,
    val rechazadas: Int? = null,
)

/** `GET me/board/asignadas-por-mi`: lo que asignó quien consulta, con persona y semáforo. */
data class BoardAsignadaPorMiDto(
    val id: Long,
    val anNumber: String? = null,
    val titulo: String? = null,
    val estatus: String? = null,
    val prioridad: String? = null,
    /** rojo | amarillo | verde */
    val semaforo: String? = null,
    /** PENDIENTE | ACEPTADA | RECHAZADA */
    val aceptacion: String? = null,
    /** Solo histórico: rechazos de antes del 18-09 (ya no se puede rechazar). */
    val motivoRechazo: String? = null,
    /** Hora real en que la inició; null = sin iniciar. */
    val inicioRealAt: String? = null,
    val fechaMaxima: String? = null,
    val minutosPlan: Double? = null,
    val minutosReales: Double? = null,
    val excedida: Boolean? = null,
    /** A quién se la asignó. */
    val persona: MyActivityRefDto? = null,
    val usuario: MyActivityRefDto? = null,
) {
    /** El contrato dice «con persona»; se acepta `usuario` por si el API lo nombra así. */
    val quien: MyActivityRefDto? get() = persona ?: usuario
}

data class TeamBoardResponseDto(
    /** company (CEO) | subtree (encargados). */
    val scope: String? = null,
    val users: List<TeamBoardUserDto>? = null,
)

data class TeamBoardHistoryEvidenceDto(
    val status: String? = null,
    val progressPct: Double? = null,
    val entryPhotoUrl: String? = null,
    val evidencePhotos: List<String>? = null,
    val exitPhotoUrl: String? = null,
    val serviceSheetPdfUrl: String? = null,
    val serviceSheetData: Any? = null,
)

data class TeamBoardHistoryItemDto(
    val id: Long,
    val anNumber: String? = null,
    val titulo: String? = null,
    val estatus: String? = null,
    val coreKind: String? = null,
    val ticketTypeCustom: String? = null,
    val assignmentCharge: String? = null,
    val fechaAsignacion: String? = null,
    val fechaFinalizacion: String? = null,
    val evidence: TeamBoardHistoryEvidenceDto? = null,
    /** Contrato C: la persona fue retirada de esta actividad (sigue en su historial). */
    val retirado: Boolean? = null,
    /** rojo | amarillo | verde */
    val semaforo: String? = null,
    val minutosPlan: Double? = null,
    val minutosReales: Double? = null,
    val excedida: Boolean? = null,
)

// ── Evidencias del equipo (GET me/activities/:id/evidencias) ────────────────

/**
 * Lo que subió una persona. La misma forma sirve para la copia (`snapshot`)
 * que se guarda al devolverla; ahí los campos de revisión llegan nulos.
 */
data class TeamEvidenceDto(
    val status: String? = null,
    val completedAt: String? = null,
    val entryPhotoUrl: String? = null,
    val entryLatitude: Any? = null,
    val entryLongitude: Any? = null,
    val entryPhotoUploadedAt: String? = null,
    val evidencePhotos: List<String>? = null,
    /** `[{latitude, longitude, capturedAt} | null]`, alineado con evidencePhotos. */
    val evidencePhotosGeo: Any? = null,
    val evidencePhotosUploadedAt: String? = null,
    val serviceSheetPdfUrl: String? = null,
    val serviceSheetUploadedAt: String? = null,
    val serviceSheetData: Any? = null,
    val serviceSheetCompletedAt: String? = null,
    val exitPhotoUrl: String? = null,
    val exitLatitude: Any? = null,
    val exitLongitude: Any? = null,
    val exitPhotoUploadedAt: String? = null,
    val reviewStatus: String? = null,
    val reviewNotes: String? = null,
    val reviewedAt: String? = null,
    val reviewedBy: String? = null,
    /** Cuándo envió la corrección de lo que se le devolvió. */
    val correctionSubmittedAt: String? = null,
)

data class TeamEvidenceReviewDto(
    val id: Long,
    /** APROBADA | DEVUELTA_PASOS | DEVUELTA_TODO */
    val decision: String? = null,
    val pasos: List<String>? = null,
    val observaciones: String? = null,
    val calificacion: Double? = null,
    val at: String? = null,
    val revisor: String? = null,
    /** Copia de lo devuelto (null en aprobaciones). */
    val snapshot: TeamEvidenceDto? = null,
)

data class TeamEvidencePasoDto(
    val nombre: String? = null,
    val at: String? = null,
)

data class TeamEvidenceMemberDto(
    val userId: Long,
    val nombre: String? = null,
    val puesto: String? = null,
    val avatarUrl: String? = null,
    val rol: String? = null,
    /** En despacho solo reparte (no sube evidencias). */
    val reparte: Boolean? = null,
    val asignadoAt: String? = null,
    val asignadoPor: String? = null,
    val retiradoAt: String? = null,
    val indicaciones: String? = null,
    val pasoA: List<TeamEvidencePasoDto>? = null,
    val progressPct: Double? = null,
    /** Puedo aprobarla o devolverla (ya la envió y soy su superior en la cadena). */
    val puedoRevisar: Boolean? = null,
    /** Pasos que le devolvieron y está corrigiendo. */
    val rejectedSteps: List<String>? = null,
    /** Eficiencia (1–5) de su última revisión. */
    val eficienciaScore: Double? = null,
    /** Más reciente primero. */
    val revisiones: List<TeamEvidenceReviewDto>? = null,
    val evidence: TeamEvidenceDto? = null,
    /** Salidas de la zona de 100 m alrededor de su punto de inicio (la más reciente primero). */
    val alertasZona: List<GeocercaAlertaDto>? = null,
)

// ── Geocerca de la actividad (GET activity-evidence/:id/geocerca) ───────────

data class GeocercaPuntoDto(
    val latitude: Double? = null,
    val longitude: Double? = null,
    val at: String? = null,
    val distanciaM: Int? = null,
)

data class GeocercaOrigenDto(
    val latitude: Double? = null,
    val longitude: Double? = null,
    val at: String? = null,
)

data class GeocercaAlertaDto(
    val id: Long,
    val detectedAt: String? = null,
    val returnedAt: String? = null,
    val distanciaM: Int? = null,
    val maxDistanciaM: Int? = null,
    val radioM: Int? = null,
    /** ABIERTA | JUSTIFICADA */
    val status: String? = null,
    /** Sigue fuera (no ha vuelto al radio). */
    val abierta: Boolean? = null,
    val justificacion: String? = null,
    val fotoUrl: String? = null,
    val justificadaAt: String? = null,
)

data class GeocercaDto(
    val activityId: Long? = null,
    val radioM: Int? = null,
    val origen: GeocercaOrigenDto? = null,
    val seguimientoActivo: Boolean? = null,
    val dentro: Boolean? = null,
    val ultimo: GeocercaPuntoDto? = null,
    val puntos: List<GeocercaPuntoDto>? = null,
    val alertas: List<GeocercaAlertaDto>? = null,
)

data class JustificarZonaRequest(
    val motivo: String,
    val fotoBase64: String? = null,
)

data class TeamEvidenceActivityDto(
    val id: Long? = null,
    val anNumber: String? = null,
    val titulo: String? = null,
    val estatus: String? = null,
    val coreKind: String? = null,
    val assignmentCharge: String? = null,
    val evidencePhotoRequired: Int? = null,
    val fechaFinalizacion: String? = null,
)

data class TeamEvidenceResumenDto(
    val ejecutores: Int? = null,
    val terminaron: Int? = null,
    val aprobadas: Int? = null,
    val porRevisarMias: Int? = null,
)

data class TeamEvidenceResponseDto(
    val activity: TeamEvidenceActivityDto? = null,
    /** todo: toda la cadena · equipo: de ti hacia abajo · propio: solo lo tuyo. */
    val alcance: String? = null,
    val creador: String? = null,
    val responsable: String? = null,
    /** No puedes revisar a nadie de lo que ves (p. ej. quien la creó). */
    val soloLectura: Boolean? = null,
    val resumen: TeamEvidenceResumenDto? = null,
    val members: List<TeamEvidenceMemberDto>? = null,
)

data class RevisarEvidenciaRequest(
    /** aprobar | devolver */
    val decision: String,
    val pasos: List<String>? = null,
    /** Devolver todo: rehace sus evidencias desde cero. */
    val todo: Boolean? = null,
    val observaciones: String,
    /** Eficiencia de 1 a 5. */
    val calificacion: Int,
)

// ── Flujo de captura de quien ejecuta (activity-evidence/:id) ───────────────

data class EvidenceFlowActivityDto(
    val id: Long? = null,
    val indicaciones: String? = null,
    val coreKind: String? = null,
    val evidencePhotoRequired: Int? = null,
    val responsableId: Long? = null,
    val estatus: String? = null,
)

/**
 * `GET activity-evidence/:id` y la fila que devuelven los POST de cada paso.
 * Los POST no traen `activity`: se conserva la del GET.
 */
data class EvidenceFlowDto(
    val id: Long? = null,
    val activityId: Long? = null,
    val userId: Long? = null,
    /** Paso actual: ENTRY_PHOTO … EXIT_PHOTO | COMPLETED. */
    val status: String? = null,
    /** APPROVED | REJECTED | null */
    val reviewStatus: String? = null,
    val rejectedStep: String? = null,
    val rejectedSteps: Any? = null,
    val reviewNotes: String? = null,
    val entryPhotoUrl: String? = null,
    val entryLatitude: Any? = null,
    val entryLongitude: Any? = null,
    val evidencePhotos: List<String>? = null,
    val evidencePhotosGeo: Any? = null,
    val serviceSheetPdfUrl: String? = null,
    val serviceSheetData: Any? = null,
    val exitPhotoUrl: String? = null,
    val exitLatitude: Any? = null,
    val exitLongitude: Any? = null,
    val completedAt: String? = null,
    val activity: EvidenceFlowActivityDto? = null,
    val assigneeIndicaciones: String? = null,
    val progressPct: Double? = null,
    val stepsForKind: List<String>? = null,
    /** Lo que dejó quien la tenía antes de que te la pasaran (solo lectura). Solo en el GET. */
    val avancesAnteriores: List<AvanceAnteriorDto>? = null,
    /**
     * Evidencia por campos. Vacío cuando la actividad no pide campos: entonces
     * la captura sigue siendo la de siempre (fotos libres). Solo en el GET.
     *
     * El GET también trae `camposProgreso`; no se lee a propósito: la app lo
     * recalcula de `campos` (CoreActivityRules), que se actualiza tras cada foto.
     */
    val campos: List<EvidenceCampoDto>? = null,
)

/**
 * Un «campo» es una cosa concreta que hay que fotografiar («Cámara 1»,
 * «Rack»). `momentos` dice en qué momentos pide foto — antes, en progreso,
 * después — en cualquier combinación.
 *
 * Espejo de `CampoDto` en apps/api/src/activities/evidence/activity-evidence-fields.service.ts.
 */
data class EvidenceCampoDto(
    val id: Long? = null,
    val nombre: String? = null,
    val orden: Int? = null,
    /** ANTES | EN_PROGRESO | DESPUES (se lee con `CoreActivityRules.normMomento`). */
    val momentos: List<String>? = null,
    val notas: String? = null,
    val fotos: EvidenceCampoFotosDto? = null,
    /** Momentos que le faltan según el API (la app los recalcula con `fotos`). */
    val pendientes: List<String>? = null,
    val completo: Boolean? = null,
)

/**
 * Lo ya guardado en cada momento; el hueco que falta viene `null`. El API usa
 * las claves en mayúsculas del enum de momentos.
 */
data class EvidenceCampoFotosDto(
    @Json(name = "ANTES") val antes: EvidenceCampoFotoDto? = null,
    @Json(name = "EN_PROGRESO") val enProgreso: EvidenceCampoFotoDto? = null,
    @Json(name = "DESPUES") val despues: EvidenceCampoFotoDto? = null,
)

/** Una foto de campo (`FotoDeCampoDto` del API). */
data class EvidenceCampoFotoDto(
    val id: Long? = null,
    val momento: String? = null,
    val photoUrl: String? = null,
    val latitude: Any? = null,
    val longitude: Any? = null,
    val capturedAt: String? = null,
    /** Quién la tomó. */
    val por: MyActivityRefDto? = null,
)

/**
 * `POST activity-evidence/:id/campos/:fieldId/foto` — mismo cuerpo que las
 * fotos de entrada y salida: la imagen va como data URL en `photoUrl` y el API
 * la guarda en disco. Responde con la lista COMPLETA de campos de la actividad.
 */
data class EvidenceCampoFotoRequest(
    /** ANTES | EN_PROGRESO | DESPUES */
    val momento: String,
    /** `data:image/jpeg;base64,…` */
    val photoUrl: String,
    val latitude: Double? = null,
    val longitude: Double? = null,
    /** ISO-8601 de cuando se tomó. */
    val capturedAt: String? = null,
)

/**
 * Respuesta de `POST activity-evidence/:id/campos/:fieldId/foto` (y de `…/foto/quitar`).
 *
 * El API contesta con la lista completa de campos (`CampoDto[]`). Sin red, el
 * interceptor offline contesta `{"queued":true}` y la foto se manda sola después.
 */
object EvidenceCamposJson {
    private val listAdapter: JsonAdapter<List<EvidenceCampoDto>> by lazy {
        Moshi.Builder()
            .add(KotlinJsonAdapterFactory())
            .build()
            .adapter<List<EvidenceCampoDto>>(
                Types.newParameterizedType(List::class.java, EvidenceCampoDto::class.java),
            )
    }

    /** Los campos que devolvió el API; `null` si la petición quedó en la cola sin red. */
    fun lista(raw: String?): List<EvidenceCampoDto>? {
        val texto = raw?.trim().orEmpty()
        if (!texto.startsWith("[")) return null
        return listAdapter.fromJson(texto).orEmpty()
    }
}

/**
 * «Avance anterior de X»: evidencia parcial de quien dejó la actividad. Quien
 * continúa la ve pero toma su propia foto de entrada y de salida.
 */
data class AvanceAnteriorDto(
    val userId: Long? = null,
    val nombre: String? = null,
    val titulo: String? = null,
    val motivo: String? = null,
    val reasignadaAt: String? = null,
    /** Quién la movió (el superior). */
    val movidaPor: String? = null,
    val progressPct: Double? = null,
    val evidence: TeamEvidenceDto? = null,
)

data class EvidencePhotoGeoRequest(
    val latitude: Double,
    val longitude: Double,
    val capturedAt: String,
)

/** Cada foto viaja con la ubicación donde se tomó (null si no hubo GPS). */
data class EvidencePhotosWithGeoRequest(
    val photoUrls: List<String>,
    val photoGeo: List<EvidencePhotoGeoRequest?>,
)

/** Corrección de un paso devuelto: mismo payload que el paso original. */
data class EvidenceResubmitRequest(
    val step: String,
    val data: Any,
)

/** `SERVICE_SHEET_DATA` en corrección va envuelto: `{ formData }`. */
data class EvidenceFormDataWrapper(
    val formData: Map<String, String>,
)

// ── Alta de actividad (Core) ────────────────────────────────────────────────

/** `POST activities/:id/team` — sumar a alguien al equipo de la actividad. */
data class AddTeamMemberRequest(
    val userId: Long,
    /** LEAD | TECNICO | APOYO */
    val rol: String,
    val indicaciones: String? = null,
    /** Tiempo estimado en horas (contrato B); el API viejo lo ignora. */
    val horasPlan: Double? = null,
)

/** Cliente del padrón (`GET ventas/clientes?sector=`). */
data class SalesClientOwnerDto(
    val id: Long? = null,
    val nombre: String? = null,
    val email: String? = null,
)

data class SalesClientDto(
    val id: Long,
    val name: String? = null,
    val legalName: String? = null,
    val taxId: String? = null,
    val fiscalAddress: String? = null,
    val fiscalZipCode: String? = null,
    val fiscalRegime: String? = null,
    val billingEmail: String? = null,
    val billingPhone: String? = null,
    val notes: String? = null,
    val status: String? = null,
    /** Puente al cliente de servicio: es el id que usan actividades y proyectos. */
    val serviceClientId: Long? = null,
    /** `[{sector}]` o `["PROYECTO"]`: se lee con [sectorNames]. */
    val sectors: List<Any?>? = null,
    val owner: SalesClientOwnerDto? = null,
) {
    val sectorNames: List<String>
        get() = sectors.orEmpty().mapNotNull { s ->
            when (s) {
                is String -> s
                is Map<*, *> -> s["sector"]?.toString()
                else -> null
            }
        }
}

// ── Celebraciones del día (GET me/celebraciones/hoy) ────────────────────────

/** Cumpleaños o aniversario de ingreso. La edad nunca viaja: `anios` solo en aniversarios. */
data class CelebracionDto(
    val userId: Long? = null,
    val nombre: String? = null,
    val avatarUrl: String? = null,
    /** cumpleanos | aniversario */
    val tipo: String? = null,
    val anios: Int? = null,
    /** Es quien pregunta: el aviso lo felicita a él. */
    val soyYo: Boolean? = null,
)

data class CelebracionesHoyDto(
    /** AAAA-MM-DD en la zona de la empresa. */
    val fecha: String? = null,
    val celebraciones: List<CelebracionDto>? = null,
)

interface CoreActivitiesApi {
    @GET("me/activities")
    suspend fun myActivities(): MyActivitiesResponseDto

    @GET("me/celebraciones/hoy")
    suspend fun celebracionesHoy(): CelebracionesHoyDto

    /** Asignar a otra persona (mismo cuerpo que `me/activities`). */
    @POST("activities")
    suspend fun createActivity(@Body body: CreateActivityRequest): ResponseBody

    @POST("activities/{id}/team")
    suspend fun addTeamMember(
        @Path("id") activityId: Long,
        @Body body: AddTeamMemberRequest,
    ): ResponseBody

    @GET("ventas/clientes")
    suspend fun salesClients(@retrofit2.http.Query("sector") sector: String): List<SalesClientDto>

    @GET("operational-projects")
    suspend fun operationalProjects(): List<OperationalProjectDto>

    /** AN sugerido del alta (`{ next }`). */
    @GET("activities/next-an")
    suspend fun nextAnNumber(): ResponseBody

    @PATCH("me/activities/order")
    suspend fun reorderMyActivities(@Body body: ReorderMyActivitiesRequest): MyActivitiesResponseDto

    /** Encargados de área: actividad a su propio nombre (mismo cuerpo que POST activities). */
    @POST("me/activities")
    suspend fun selfAssign(@Body body: CreateActivityRequest): ResponseBody

    /**
     * Quien la recibe no la acepta ni la rechaza: la inicia (regla del 18-09).
     * Guarda la hora real de inicio; tocarlo otra vez no la mueve.
     */
    @POST("me/activities/{id}/iniciar")
    suspend fun iniciarActividad(@Path("id") activityId: Long): ResponseBody

    @POST("me/activities/{id}/despacho")
    suspend fun dispatch(
        @Path("id") activityId: Long,
        @Body body: DispatchMyActivityRequest,
    ): ResponseBody

    @PATCH("me/activities/{id}/reprogramar")
    suspend fun reprogramar(
        @Path("id") activityId: Long,
        @Body body: ReprogramarDespachoRequest,
    ): ResponseBody

    /** @param desde/@param hasta `AAAA-MM-DD` (contrato C); sin ellos, hoy. */
    @GET("me/board")
    suspend fun board(
        @retrofit2.http.Query("desde") desde: String? = null,
        @retrofit2.http.Query("hasta") hasta: String? = null,
    ): TeamBoardResponseDto

    /** Lo que asignó quien consulta en el rango. Se lee crudo: el API está en obra. */
    @GET("me/board/asignadas-por-mi")
    suspend fun boardAsignadasPorMi(
        @retrofit2.http.Query("desde") desde: String? = null,
        @retrofit2.http.Query("hasta") hasta: String? = null,
    ): ResponseBody

    @GET("me/board/{userId}")
    suspend fun boardUser(
        @Path("userId") userId: Long,
        @retrofit2.http.Query("desde") desde: String? = null,
        @retrofit2.http.Query("hasta") hasta: String? = null,
    ): TeamBoardUserDto

    @GET("me/board/{userId}/history")
    suspend fun boardUserHistory(
        @Path("userId") userId: Long,
        @retrofit2.http.Query("desde") desde: String? = null,
        @retrofit2.http.Query("hasta") hasta: String? = null,
    ): List<TeamBoardHistoryItemDto>

    @GET("me/activities/{id}/evidencias")
    suspend fun teamEvidence(@Path("id") activityId: Long): TeamEvidenceResponseDto

    @POST("me/activities/{id}/evidencias/{userId}/revision")
    suspend fun reviewTeamEvidence(
        @Path("id") activityId: Long,
        @Path("userId") userId: Long,
        @Body body: RevisarEvidenciaRequest,
    ): TeamEvidenceResponseDto

    @GET("activity-evidence/{id}")
    suspend fun evidenceFlow(@Path("id") activityId: Long): EvidenceFlowDto

    @POST("activity-evidence/{id}/entry-photo")
    suspend fun entryPhoto(
        @Path("id") activityId: Long,
        @Body body: ActivityEvidencePhotoStepRequest,
    ): EvidenceFlowDto

    @POST("activity-evidence/{id}/evidence-photos")
    suspend fun evidencePhotos(
        @Path("id") activityId: Long,
        @Body body: EvidencePhotosWithGeoRequest,
    ): EvidenceFlowDto

    /**
     * Evidencia por campos: una foto de un campo en un momento. El API devuelve
     * todos los campos (`CampoDto[]`), pero sin red el interceptor contesta
     * `{"queued":true}`: se lee crudo con [EvidenceCamposJson.lista].
     */
    @POST("activity-evidence/{id}/campos/{campoId}/foto")
    suspend fun evidenceCampoFoto(
        @Path("id") activityId: Long,
        @Path("campoId") campoId: Long,
        @Body body: EvidenceCampoFotoRequest,
    ): ResponseBody

    @POST("activity-evidence/{id}/service-sheet-pdf")
    suspend fun serviceSheetPdf(
        @Path("id") activityId: Long,
        @Body body: ActivityEvidencePdfStepRequest,
    ): EvidenceFlowDto

    /** El cuerpo ES el formulario (claves según coreKind). */
    @POST("activity-evidence/{id}/service-sheet-data")
    suspend fun serviceSheetData(
        @Path("id") activityId: Long,
        @Body body: Any,
    ): EvidenceFlowDto

    @GET("activity-evidence/{id}/geocerca")
    suspend fun geocerca(@Path("id") activityId: Long): GeocercaDto

    @POST("activity-evidence/{id}/geocerca/alertas/{alertId}/justificacion")
    suspend fun justificarZona(
        @Path("id") activityId: Long,
        @Path("alertId") alertId: Long,
        @Body body: JustificarZonaRequest,
    ): GeocercaAlertaDto

    @POST("activity-evidence/{id}/exit-photo")
    suspend fun exitPhoto(
        @Path("id") activityId: Long,
        @Body body: ActivityEvidencePhotoStepRequest,
    ): EvidenceFlowDto

    @POST("activity-evidence/{id}/resubmit")
    suspend fun resubmit(
        @Path("id") activityId: Long,
        @Body body: EvidenceResubmitRequest,
    ): EvidenceFlowDto
}
