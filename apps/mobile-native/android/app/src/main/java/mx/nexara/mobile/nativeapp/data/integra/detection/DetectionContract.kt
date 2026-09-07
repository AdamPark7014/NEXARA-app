package mx.nexara.mobile.nativeapp.data.integra.detection

/**
 * Contrato de detección por cámara — lectura, borrador y PATCH.
 *
 * Espejo Kotlin de `apps/web/app/(panels)/integra/detection/_tuningApi.ts` y del
 * contrato del servidor (`DetectionProfileDto` / `DetectionPatchDto`). Todo lo
 * de este fichero es Kotlin puro y sin Android a propósito: es lo que se puede
 * probar sin emulador y donde viven las trampas que ya se pagaron una vez.
 *
 * Las tres reglas que este fichero existe para no romper:
 *
 * 1. **Un campo ausente no vale 0.** En el servidor, `Number(null) === 0` dejó
 *    escrita una sensibilidad de 0 —cámara sorda— en perfiles que simplemente
 *    no la tenían. Aquí un `sensitivity` ausente, nulo o no numérico cae en
 *    [DEFAULT_SENSITIVITY] (50, el valor del ejemplo del fabricante), nunca en 0.
 *    El 0 solo llega al equipo si una persona lo eligió a mano.
 * 2. **Tres estados de capacidad, no dos.** `true` / `false` = el equipo lo
 *    dijo; `null` = el equipo **no lo dijo**. «No verificado» no es «no
 *    soportado», y confundirlos ya fue un error de este proyecto.
 * 3. **Lo que el móvil no edita, el móvil no lo manda.** Los polígonos no se
 *    dibujan con el dedo en esta app, así que `regions` se omite del PATCH.
 *    El servidor solo toca la columna si el campo viene (`!== undefined`), de
 *    modo que omitirlo conserva las zonas; mandarlas de vuelta «tal cual» sería
 *    una escritura innecesaria y una ocasión de borrarlas por accidente.
 */

/* ── Catálogos y topes (los del servidor mandan; estos son de reserva) ──── */

/** Sensibilidad por defecto. **50**, no 100: es el valor del ejemplo del
 *  fabricante (Apéndice A.49). El 100 que se escribía a ciegas en las dieciséis
 *  cámaras es la causa directa de los falsos positivos. */
const DEFAULT_SENSITIVITY = 50

/** Polígonos simultáneos que admite el equipo (verificado en DS-2CD2123G2). */
const MAX_REGIONS = 4

/** Un polígono necesita tres vértices para encerrar algo (lo exige el servidor). */
const MIN_REGION_POINTS = 3

/** Tope de vértices por polígono. */
const MAX_REGION_POINTS = 10

val CONFIDENCE_ORDER: List<String> = listOf("low", "mediumLow", "mediumHigh", "high")

val TARGET_ORDER: List<String> = listOf("human", "vehicle", "human,vehicle")

/** Días: 0 domingo … 6 sábado, como los guarda la pantalla web. */
val DAY_LABELS: List<String> = listOf("D", "L", "M", "X", "J", "V", "S")

val DAY_NAMES: List<String> = listOf(
    "domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado",
)

private val HHMM = Regex("""^([01]\d|2[0-3]):([0-5]\d)$""")

/* ── Tipos ──────────────────────────────────────────────────────────────── */

/** Vértice normalizado 0..1 sobre el encuadre. */
data class DetectionPoint(val x: Float, val y: Float)

/** Polígono: lista plana de vértices, como lo guarda el servidor. */
typealias DetectionRegion = List<DetectionPoint>

/**
 * Ventana en la que la detección cuenta. El servidor guarda `schedule` como
 * JSON libre; ésta es la forma que escribe la web y la que sabemos releer.
 */
data class DetectionWindow(
    /** `HH:MM` en la hora del sitio. */
    val start: String,
    /** `HH:MM`. Menor que [start] = la ventana cruza la medianoche. */
    val end: String,
    /** 0 domingo … 6 sábado. Vacío = ningún día. Nunca «todos» por descuido. */
    val days: List<Int>,
)

/** Ventana de reserva mientras el perfil no traiga una: siempre encendida. */
val DEFAULT_WINDOW = DetectionWindow(start = "00:00", end = "23:59", days = listOf(0, 1, 2, 3, 4, 5, 6))

/** Rangos y catálogos que manda el servidor «para que la UI no invente». */
data class DetectionLimits(
    val sensitivityMin: Int = 0,
    val sensitivityMax: Int = 100,
    val sensitivityDefault: Int = DEFAULT_SENSITIVITY,
    val maxRegions: Int = MAX_REGIONS,
    val alarmConfidences: List<String> = CONFIDENCE_ORDER,
    val detectionTargets: List<String> = TARGET_ORDER,
    val baseEventTypes: List<String> = emptyList(),
    val catalogEventTypes: List<String> = emptyList(),
)

/**
 * Los tres estados reales de una capacidad. [UNVERIFIED] **no** es [UNSUPPORTED]:
 * significa que nadie se lo ha preguntado al equipo todavía.
 */
enum class CapabilityState { SUPPORTED, UNSUPPORTED, UNVERIFIED }

fun capabilityStateOf(flag: Boolean?): CapabilityState = when (flag) {
    true -> CapabilityState.SUPPORTED
    false -> CapabilityState.UNSUPPORTED
    null -> CapabilityState.UNVERIFIED
}

fun capabilityStateLabel(state: CapabilityState): String = when (state) {
    CapabilityState.SUPPORTED -> "Soportado"
    CapabilityState.UNSUPPORTED -> "No soportado"
    CapabilityState.UNVERIFIED -> "No verificado"
}

/** Lo que el equipo contestó la última vez que se le preguntó. */
data class CameraCapabilities(
    val cameraId: String? = null,
    val probeOk: Boolean = false,
    val probeNote: String? = null,
    val probedAt: String? = null,
    /** Orden de presentación estable; el valor conserva los tres estados. */
    val flags: List<Pair<String, CapabilityState>> = emptyList(),
    val supportedEventTypes: List<String> = emptyList(),
)

/** Perfil tal y como lo necesita la pantalla. */
data class DetectionProfile(
    val cameraId: String,
    val cameraName: String?,
    val deviceIp: String?,
    val channel: Int?,
    val enabled: Boolean,
    /** `false` = esta cámara nunca se editó: va con la plantilla de compatibilidad. */
    val hasStoredProfile: Boolean,
    val sensitivity: Int,
    val alarmConfidence: String,
    val detectionTarget: String,
    /** `null` = fotograma completo. Es lo que hay hoy en casi todas. */
    val regions: List<DetectionRegion>?,
    val timeThresholdSec: Int,
    val eventTypes: List<String>,
    val window: DetectionWindow?,
    val lastAppliedAt: String?,
    val lastAppliedNote: String?,
    val capabilities: CameraCapabilities?,
    val limits: DetectionLimits,
)

/** Lo que el operador edita en el teléfono. Sin regiones: no se dibujan aquí. */
data class DetectionDraft(
    val enabled: Boolean,
    val sensitivity: Int,
    val alarmConfidence: String,
    val detectionTarget: String,
    val window: DetectionWindow,
)

/* ── Lectura defensiva ──────────────────────────────────────────────────── */

private fun asMap(v: Any?): Map<String, Any?>? {
    if (v !is Map<*, *>) return null
    val out = LinkedHashMap<String, Any?>(v.size)
    for ((k, value) in v) {
        if (k is String) out[k] = value
    }
    return out
}

private fun asInt(v: Any?): Int? = when (v) {
    is Number -> if (v.toDouble().isFinite()) Math.round(v.toDouble()).toInt() else null
    is String -> v.trim().toDoubleOrNull()?.let { if (it.isFinite()) Math.round(it).toInt() else null }
    else -> null
}

private fun asFloat(v: Any?): Float? = when (v) {
    is Number -> v.toFloat().takeIf { it.isFinite() }
    is String -> v.trim().toFloatOrNull()?.takeIf { it.isFinite() }
    else -> null
}

private fun asStringList(v: Any?): List<String> {
    if (v !is List<*>) return emptyList()
    return v.mapNotNull { (it as? String)?.trim()?.takeIf(String::isNotEmpty) }
}

internal fun clamp01(n: Float): Float = when {
    !n.isFinite() -> 0f
    n < 0f -> 0f
    n > 1f -> 1f
    else -> n
}

private fun readPoint(v: Any?): DetectionPoint? {
    val m = asMap(v) ?: return null
    val x = asFloat(m["x"]) ?: return null
    val y = asFloat(m["y"]) ?: return null
    return DetectionPoint(clamp01(x), clamp01(y))
}

/**
 * Polígonos tal y como los sanea el servidor. Devuelve `null` cuando no queda
 * ninguno — que es la señal de «fotograma completo», no la de «lista vacía».
 */
fun readRegions(v: Any?, max: Int = MAX_REGIONS): List<DetectionRegion>? {
    if (v !is List<*>) return null
    val out = ArrayList<DetectionRegion>()
    for (raw in v) {
        if (raw !is List<*>) continue
        val pts = raw.mapNotNull(::readPoint)
        if (pts.size >= MIN_REGION_POINTS) out.add(pts.take(MAX_REGION_POINTS))
        if (out.size >= max) break
    }
    return out.ifEmpty { null }
}

/** La ventana horaria que la web guarda en `schedule`. */
fun readWindow(v: Any?): DetectionWindow? {
    val m = asMap(v) ?: return null
    val start = (m["start"] as? String)?.takeIf(HHMM::matches) ?: return null
    val end = (m["end"] as? String)?.takeIf(HHMM::matches) ?: return null
    val rawDays = m["days"]
    val days = if (rawDays is List<*>) {
        rawDays.mapNotNull(::asInt).filter { it in 0..6 }.distinct().sorted()
    } else {
        emptyList()
    }
    return DetectionWindow(start = start, end = end, days = days)
}

fun readLimits(v: Any?): DetectionLimits {
    val m = asMap(v) ?: return DetectionLimits()
    val fallback = DetectionLimits()
    fun strs(key: String, orElse: List<String>): List<String> =
        asStringList(m[key]).ifEmpty { orElse }
    return DetectionLimits(
        sensitivityMin = asInt(m["sensitivityMin"]) ?: fallback.sensitivityMin,
        sensitivityMax = asInt(m["sensitivityMax"]) ?: fallback.sensitivityMax,
        // Si el servidor no manda default, 50. Nunca 0: ese es el bug.
        sensitivityDefault = asInt(m["sensitivityDefault"]) ?: fallback.sensitivityDefault,
        maxRegions = asInt(m["maxRegions"]) ?: fallback.maxRegions,
        alarmConfidences = strs("alarmConfidences", fallback.alarmConfidences),
        detectionTargets = strs("detectionTargets", fallback.detectionTargets),
        baseEventTypes = asStringList(m["baseEventTypes"]),
        catalogEventTypes = asStringList(m["catalogEventTypes"]),
    )
}

/** Orden de presentación de las capacidades y su nombre en español. */
val CAPABILITY_LABELS: List<Pair<String, String>> = listOf(
    "fieldDetection" to "Intrusión en zona",
    "lineDetection" to "Cruce de línea",
    "faceDetect" to "Detección de rostro",
    "regionEntrance" to "Entrada a región",
    "regionExiting" to "Salida de región",
    "loitering" to "Merodeo",
    "unattendedBaggage" to "Objeto abandonado",
    "attendedBaggage" to "Objeto retirado",
    "peopleGathering" to "Aglomeración",
    "defocus" to "Desenfoque",
    "sceneChange" to "Cambio de escena",
    "audioException" to "Umbral de decibelios",
    "peopleCounting" to "Conteo de personas",
    "heatMap" to "Mapa de calor",
)

fun capabilityLabel(key: String): String =
    CAPABILITY_LABELS.firstOrNull { it.first == key }?.second ?: key

/**
 * `CameraCapabilityDto` → capacidades con los tres estados intactos.
 *
 * Una clave que el servidor no manda vale [CapabilityState.UNVERIFIED], igual
 * que una que manda a `null`: en los dos casos el equipo no lo ha dicho.
 */
fun parseCapabilities(raw: Any?, cameraId: String? = null): CameraCapabilities? {
    val m = asMap(raw) ?: return null
    val flagsMap = asMap(m["flags"]) ?: emptyMap()
    val known = CAPABILITY_LABELS.map { it.first }
    val extraKeys = flagsMap.keys.filter { it !in known }.sorted()
    val flags = (known + extraKeys).map { key ->
        key to capabilityStateOf(flagsMap[key] as? Boolean)
    }
    return CameraCapabilities(
        cameraId = (m["cameraId"] as? String) ?: cameraId,
        probeOk = m["probeOk"] == true,
        probeNote = (m["probeNote"] as? String)?.takeIf(String::isNotBlank),
        probedAt = (m["probedAt"] as? String)?.takeIf(String::isNotBlank),
        flags = flags,
        supportedEventTypes = asStringList(m["supportedEventTypes"]),
    )
}

/**
 * `DetectionProfileDto` → lo que la pantalla necesita.
 *
 * Se lee `effective`, no `stored`: es lo que el servidor le escribiría HOY al
 * equipo. `stored` solo sirve para saber si esta cámara se editó alguna vez y
 * para recuperar la ventana horaria.
 */
fun parseProfile(raw: Any?, cameraId: String): DetectionProfile {
    val src = asMap(raw) ?: emptyMap()
    val limits = readLimits(src["limits"])
    val eff = asMap(src["effective"]) ?: emptyMap()
    val stored = asMap(src["stored"])

    // El punto exacto donde el servidor se rompió una vez: sin valor legible NO
    // se cae a 0, se cae al default. Un 0 aquí deja la cámara sorda.
    val sensitivity = asInt(eff["sensitivity"])
        ?.coerceIn(limits.sensitivityMin, limits.sensitivityMax)
        ?: limits.sensitivityDefault

    val confidence = (eff["alarmConfidence"] as? String)
        ?.takeIf { it in limits.alarmConfidences }
        ?: "mediumHigh"

    val target = (eff["detectionTarget"] as? String)
        ?.takeIf { it in limits.detectionTargets }
        ?: "human"

    return DetectionProfile(
        cameraId = (src["cameraId"] as? String)?.takeIf(String::isNotBlank) ?: cameraId,
        cameraName = (src["cameraName"] as? String)?.takeIf(String::isNotBlank),
        deviceIp = (src["deviceIp"] as? String)?.takeIf(String::isNotBlank),
        channel = asInt(src["channel"]),
        enabled = src["enabled"] != false,
        hasStoredProfile = stored != null,
        sensitivity = sensitivity,
        alarmConfidence = confidence,
        detectionTarget = target,
        regions = readRegions(eff["regions"], limits.maxRegions),
        timeThresholdSec = asInt(eff["timeThresholdSec"]) ?: 0,
        eventTypes = asStringList(eff["eventTypes"]),
        window = readWindow(stored?.get("schedule")),
        lastAppliedAt = (src["lastAppliedAt"] as? String)?.takeIf(String::isNotBlank),
        lastAppliedNote = (src["lastAppliedNote"] as? String)?.takeIf(String::isNotBlank),
        capabilities = parseCapabilities(src["capabilities"], cameraId),
        limits = limits,
    )
}

/** Perfil → borrador editable. */
fun draftFromProfile(p: DetectionProfile): DetectionDraft = DetectionDraft(
    enabled = p.enabled,
    sensitivity = p.sensitivity,
    alarmConfidence = p.alarmConfidence,
    detectionTarget = p.detectionTarget,
    window = p.window ?: DEFAULT_WINDOW,
)

/**
 * Borrador → cuerpo del PATCH, con los nombres del contrato.
 *
 * **`regions` no aparece.** El teléfono no dibuja polígonos, así que no tiene
 * nada que decir sobre ellos; el servidor solo escribe la columna cuando el
 * campo viene, de modo que omitirlo deja las zonas exactamente como estaban.
 * Ésta es la diferencia entre la app y la consola web, y es deliberada.
 */
fun patchFromDraft(d: DetectionDraft): Map<String, Any?> = mapOf(
    "enabled" to d.enabled,
    "sensitivity" to d.sensitivity,
    "alarmConfidence" to d.alarmConfidence,
    "detectionTarget" to d.detectionTarget,
    "schedule" to mapOf(
        "start" to d.window.start,
        "end" to d.window.end,
        "days" to d.window.days,
    ),
)

/* ── Validación antes de salir por la red ───────────────────────────────── */

/**
 * Qué impide guardar, en frases que un operador pueda leer. Si el servidor
 * rechaza algo más, gana el servidor y su mensaje se enseña tal cual.
 */
fun draftProblems(d: DetectionDraft, limits: DetectionLimits = DetectionLimits()): List<String> {
    val out = ArrayList<String>()
    if (!HHMM.matches(d.window.start) || !HHMM.matches(d.window.end)) {
        out.add("La ventana horaria necesita dos horas válidas (HH:MM).")
    }
    if (d.window.days.isEmpty()) {
        out.add("Sin días marcados la detección no cuenta nunca. Marca al menos uno.")
    }
    if (d.sensitivity < limits.sensitivityMin || d.sensitivity > limits.sensitivityMax) {
        out.add("La sensibilidad va de ${limits.sensitivityMin} a ${limits.sensitivityMax}.")
    }
    if (d.alarmConfidence !in limits.alarmConfidences) {
        out.add("Nivel de confianza fuera del catálogo del servidor.")
    }
    if (d.detectionTarget !in limits.detectionTargets) {
        out.add("Objetivo de detección fuera del catálogo del servidor.")
    }
    return out
}

/* ── Traducciones para la pantalla ──────────────────────────────────────── */

fun confidenceLabel(v: String): String = when (v) {
    "low" -> "Baja"
    "mediumLow" -> "Media-baja"
    "mediumHigh" -> "Media-alta"
    "high" -> "Alta"
    else -> v
}

/**
 * Qué significa cada nivel, con la advertencia que el servidor documenta y la
 * pantalla no puede callar: `alarmConfidence` es **empírico**. El equipo
 * devuelve el tag, el fabricante no lo documenta, y la dirección del enum no
 * está confirmada. Estas frases dicen lo razonable, no lo verificado.
 */
fun confidenceHint(v: String): String = when (v) {
    "low" -> "Avisa aunque dude. No se le escapa casi nada y trae falsos positivos."
    "mediumLow" -> "Se inclina a avisar. Útil en escenas oscuras o con gente lejos."
    "mediumHigh" -> "Se inclina a callar. Es lo que el sistema escribe hoy por defecto."
    "high" -> "Solo avisa si está seguro. El mínimo de ruido y el máximo de escapes."
    else -> ""
}

fun targetLabel(v: String): String = when (v) {
    "human" -> "Solo personas"
    "vehicle" -> "Solo vehículos"
    "human,vehicle" -> "Personas y vehículos"
    else -> v
}

/**
 * Qué significa el número de sensibilidad, en consecuencias.
 *
 * Un `0–100` desnudo no le dice nada a nadie: hasta hace poco el sistema
 * escribía 100 —el techo— en las dieciséis cámaras, y nadie sabía que eso
 * quiere decir «avisa con cualquier cambio de píxeles».
 */
data class SensitivityMeaning(val label: String, val hint: String)

fun sensitivityMeaning(n: Int): SensitivityMeaning = when {
    n <= 0 -> SensitivityMeaning(
        "Apagada",
        "Con 0 la cámara deja de avisar. Solo elígelo a propósito: un 0 escrito por descuido deja la zona sin vigilar.",
    )
    n <= 20 -> SensitivityMeaning(
        "Muy sorda",
        "Solo objetivos grandes y cercanos. Se le escapan personas al fondo.",
    )
    n <= 45 -> SensitivityMeaning(
        "Baja",
        "Exige un objetivo claro. Buena para exteriores con vegetación o lluvia.",
    )
    n <= 70 -> SensitivityMeaning(
        "Equilibrada",
        "El 50 es el valor del ejemplo del fabricante y el que el servidor toma por defecto.",
    )
    n <= 90 -> SensitivityMeaning(
        "Alta",
        "Detecta movimiento sutil. Sombras, reflejos y cortinas empiezan a contar.",
    )
    else -> SensitivityMeaning(
        "Al máximo",
        "Cualquier cambio en la escena dispara. Es lo que el sistema escribía a ciegas y la causa directa del ruido.",
    )
}

/** Resumen legible de la ventana horaria. */
fun windowSummary(w: DetectionWindow): String {
    if (w.days.isEmpty()) return "Ningún día: la detección no cuenta nunca"
    val dias = if (w.days.size == 7) {
        "todos los días"
    } else {
        w.days.mapNotNull { DAY_NAMES.getOrNull(it) }.joinToString(", ")
    }
    val cruza = if (w.end < w.start) " (cruza la medianoche)" else ""
    return "${w.start}–${w.end}$cruza · $dias"
}

/** Resumen honesto de los polígonos: cuántos y con cuántos vértices. */
fun regionsSummary(regions: List<DetectionRegion>?): String {
    if (regions.isNullOrEmpty()) {
        return "Fotograma completo: la cámara vigila todo lo que ve, calle incluida."
    }
    val vertices = regions.joinToString(" · ") { "${it.size} vértices" }
    return "${regions.size} de $MAX_REGIONS zonas · $vertices"
}
