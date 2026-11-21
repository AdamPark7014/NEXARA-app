package mx.nexara.mobile.nativeapp.ui.console.vehiculos

import kotlin.math.roundToInt

/**
 * Captura guiada de vehículo en 5 pasos (salida y devolución) — Kotlin puro, sin Android, para
 * probarlo en `CapturaGuiadaRulesTest` contra `apps/api/src/vehicles/captura-guiada.ts` y
 * `apps/web/lib/vehiculos-captura.ts`. La regla vive en la API; aquí solo se arma lo que ella pide
 * y se avisa antes de mandar lo que ella rechazaría.
 *
 * 1. Vuelta completa en video (10 a 20 s). De ahí salen 8 cuadros, uno al centro de cada octavo.
 * 2. Asientos traseros. 3. Asientos delanteros. 4. Tablero completo.
 * 5. Kilometraje y gasolina de cerca: la IA los lee y la persona confirma.
 *
 * Todo con cámara en vivo: una foto o un video sin `capturedAt` lo rechaza el servidor.
 */
object CapturaGuiadaRules {

    data class Vista(val slot: String, val etiqueta: String)

    data class Paso(val paso: Int, val id: String, val etiqueta: String, val instruccion: String)

    /** Los 8 cuadros de la vuelta, en el orden en que se camina (frente y hacia la derecha). */
    val VISTAS_VUELTA: List<Vista> = listOf(
        Vista("vuelta-1", "Frente"),
        Vista("vuelta-2", "Frente derecho"),
        Vista("vuelta-3", "Lado derecho"),
        Vista("vuelta-4", "Trasera derecha"),
        Vista("vuelta-5", "Trasera"),
        Vista("vuelta-6", "Trasera izquierda"),
        Vista("vuelta-7", "Lado izquierdo"),
        Vista("vuelta-8", "Frente izquierdo"),
    )

    const val SLOT_KM_GASOLINA = "km-gasolina"

    /** Pasos 2 a 5: una foto cada uno. */
    val FOTOS_GUIADAS: List<Vista> = listOf(
        Vista("asientos-traseros", "Asientos traseros"),
        Vista("asientos-delanteros", "Asientos delanteros"),
        Vista("tablero", "Tablero completo"),
        Vista(SLOT_KM_GASOLINA, "Kilometraje y gasolina"),
    )

    val SLOTS_VUELTA: List<String> = VISTAS_VUELTA.map { it.slot }

    /** Las 12 partes de imagen que espera la API: 8 cuadros + 4 fotos. */
    val SLOTS: List<String> = SLOTS_VUELTA + FOTOS_GUIADAS.map { it.slot }

    /** Parte multipart con el video de la vuelta. */
    const val CAMPO_VIDEO = "video-vuelta"

    const val DURACION_MIN_SEG = 10
    const val DURACION_MAX_SEG = 20

    /** Un segundo de gracia por el redondeo del teléfono (igual que la API). */
    private const val GRACIA_SEG = 1.0

    /**
     * Tope del video en el teléfono. La API acepta hasta 80 MB por archivo; con 60 queda margen para
     * las 12 fotos y para la cola sin señal, que guarda el multipart completo en el teléfono.
     */
    const val VIDEO_MAX_BYTES: Long = 60L * 1024 * 1024

    /** Los 5 pasos tal como los da la API cuando no contesta (`GET vehicles/captura-guiada`). */
    val PASOS: List<Paso> = listOf(
        Paso(
            1,
            "vuelta",
            "Vuelta completa",
            "Camina una vuelta completa alrededor de la unidad, empezando por el frente y hacia tu derecha, sin detenerte. Entre 10 y 20 segundos.",
        ),
        Paso(2, "asientos-traseros", "Asientos traseros", "Abre una puerta trasera y toma todo el asiento de atrás."),
        Paso(3, "asientos-delanteros", "Asientos delanteros", "Toma los dos asientos de adelante desde la puerta del conductor."),
        Paso(4, "tablero", "Tablero completo", "Con el motor encendido, toma el tablero completo: volante, pantalla y testigos."),
        Paso(5, SLOT_KM_GASOLINA, "Kilometraje y gasolina", "Acércate al odómetro y a la aguja de gasolina. La IA los lee y tú confirmas."),
    )

    private val ETIQUETAS: Map<String, String> = (VISTAS_VUELTA + FOTOS_GUIADAS).associate { it.slot to it.etiqueta }

    fun etiqueta(slot: String): String = ETIQUETAS[slot] ?: slot

    // ── Vuelta en video ─────────────────────────────────────────────────────

    /**
     * En qué segundo del video va cada cuadro: el centro de cada octavo, `dur × (i + 0.5) / 8`.
     * Nunca el primer ni el último instante (suelen salir movidos). Mismo cálculo en web e iOS.
     */
    fun tiemposCuadros(duracionSeg: Double, cuadros: Int = SLOTS_VUELTA.size): List<Double> {
        if (!duracionSeg.isFinite() || duracionSeg <= 0.0 || cuadros <= 0) return emptyList()
        return List(cuadros) { i -> Math.round(duracionSeg * (i + 0.5) / cuadros * 1000.0) / 1000.0 }
    }

    /** Lo mismo en microsegundos, que es lo que pide `MediaMetadataRetriever.getFrameAtTime`. */
    fun tiemposCuadrosUs(duracionMs: Long, cuadros: Int = SLOTS_VUELTA.size): List<Long> =
        tiemposCuadros(duracionMs / 1000.0, cuadros).map { (it * 1_000_000).toLong() }

    /**
     * La hora de cada cuadro: la hora en que empezó la grabación más su segundo dentro del video, en
     * ISO UTC (`2026-11-21T16:00:01.000Z`). Así Liz ve cuándo se tomó cada vista.
     */
    fun horasCuadros(inicioEpochMs: Long, duracionMs: Long, cuadros: Int = SLOTS_VUELTA.size): List<String> =
        tiemposCuadros(duracionMs / 1000.0, cuadros).map { t -> horaIso(inicioEpochMs + (t * 1000).toLong()) }

    fun horaIso(epochMs: Long): String {
        val formato = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
        formato.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return formato.format(java.util.Date(epochMs))
    }

    fun duracionValida(duracionSeg: Double): Boolean =
        duracionSeg.isFinite() &&
            duracionSeg >= DURACION_MIN_SEG - GRACIA_SEG &&
            duracionSeg <= DURACION_MAX_SEG + GRACIA_SEG

    /** Un decimal, como lo manda la web: 14.26 → 14.3. */
    fun duracionRedondeada(duracionSeg: Double): Double = Math.round(duracionSeg * 10.0) / 10.0

    // ── Validación antes de mandar ──────────────────────────────────────────

    data class Toma(val capturedAt: String? = null, val lat: Double? = null, val lng: Double? = null) {
        val valida: Boolean get() = !capturedAt.isNullOrBlank()
    }

    data class Video(val capturedAt: String? = null, val duracionSeg: Double = 0.0, val bytes: Long = 0L)

    /** Lo que la IA leyó en el paso 5 antes de que la persona confirmara. */
    data class LecturaIa(val odometroKm: Int? = null, val combustiblePct: Int? = null) {
        val vacia: Boolean get() = odometroKm == null && combustiblePct == null
    }

    data class Validacion(val errores: List<String> = emptyList()) {
        val ok: Boolean get() = errores.isEmpty()

        /** El primero basta para el aviso: la pantalla lleva a ese paso. */
        val mensaje: String? get() = errores.firstOrNull()
    }

    /**
     * Mismos textos que la web (`construirCapturaGuiadaForm`) y que la API. [kmAnterior] es el último
     * registro de la unidad (`ultimoRegistro.km`); pásalo solo cuando la API dice `exigida`, porque
     * con el interruptor apagado un km menor solo deja una alerta. Solo Liz lo fuerza ([forzarKm]).
     */
    fun validar(
        tomas: Map<String, Toma>,
        video: Video?,
        odometroKm: Int?,
        combustible: String?,
        kmAnterior: Int? = null,
        forzarKm: Boolean = false,
    ): Validacion {
        val errores = buildList {
            when {
                video == null || video.bytes <= 0L -> add("Falta el video de la vuelta completa")
                video.capturedAt.isNullOrBlank() -> add("Graba la vuelta con la cámara en vivo, no de la galería")
                !duracionValida(video.duracionSeg) ->
                    add("La vuelta debe durar entre $DURACION_MIN_SEG y $DURACION_MAX_SEG segundos")
                video.bytes > VIDEO_MAX_BYTES -> add("El video pesa demasiado; vuelve a grabar la vuelta")
            }
            for (slot in SLOTS) {
                val toma = tomas[slot]
                when {
                    toma == null -> add("Falta la foto: ${etiqueta(slot)}")
                    !toma.valida -> add("Falta la hora de la foto: ${etiqueta(slot)}")
                }
            }
            when {
                odometroKm == null || odometroKm < 0 -> add("Confirma el kilometraje del tablero")
                kmAnterior != null && odometroKm < kmAnterior && !forzarKm ->
                    add("El kilometraje ($odometroKm) es menor al último registro de la unidad ($kmAnterior)")
            }
            if (ChecklistVehiculoRules.combustiblePct(combustible) == null) add("Confirma el nivel de gasolina")
        }
        return Validacion(errores)
    }

    /** ¿La persona cambió lo que leyó la IA? Liz ve las dos lecturas. */
    fun corrigioLectura(ia: LecturaIa?, odometroKm: Int?, combustible: String?): Boolean {
        if (ia == null || ia.vacia) return false
        val km = ia.odometroKm?.let { it != odometroKm } ?: false
        val gas = ia.combustiblePct?.let { it != ChecklistVehiculoRules.combustiblePct(combustible) } ?: false
        return km || gas
    }

    /** Porcentaje leído (0–100) → la marca más cercana del selector: 38 → «1/4», 63 → «3/4». */
    fun nivelMasCercano(pct: Int?): String? {
        val p = pct?.takeIf { it in 0..100 } ?: return null
        return ChecklistVehiculoRules.NIVELES.minByOrNull { nivel ->
            kotlin.math.abs((ChecklistVehiculoRules.combustiblePct(nivel) ?: 0) - p)
        }
    }

    // ── Campos de texto del multipart ───────────────────────────────────────

    /**
     * La parte `meta`: una entrada por foto en el orden de [SLOTS] y la del video con su duración.
     * `0,0` no es una ubicación: viaja como `null` (igual que la web).
     */
    fun metaJson(tomas: Map<String, Toma>, video: Video): String {
        val campos = buildList {
            for (slot in SLOTS) {
                val toma = tomas[slot]?.takeIf { it.valida } ?: continue
                add("${jsonString(slot)}:${tomaJson(toma)}")
            }
            if (!video.capturedAt.isNullOrBlank()) {
                add(
                    "${jsonString(CAMPO_VIDEO)}:{${jsonString("capturedAt")}:${jsonString(video.capturedAt)}," +
                        "${jsonString("duracionSeg")}:${duracionRedondeada(video.duracionSeg)}}",
                )
            }
        }
        return campos.joinToString(prefix = "{", separator = ",", postfix = "}")
    }

    /** `{"odometroKm":48215,"combustiblePct":50}`; `null` si la IA no leyó nada (no se manda). */
    fun lecturaIaJson(lectura: LecturaIa?): String? {
        if (lectura == null || lectura.vacia) return null
        return "{${jsonString("odometroKm")}:${lectura.odometroKm ?: "null"}," +
            "${jsonString("combustiblePct")}:${lectura.combustiblePct ?: "null"}}"
    }

    /** Los campos de texto, en orden, tal como los manda la web. Los opcionales solo si traen valor. */
    fun camposTexto(
        tomas: Map<String, Toma>,
        video: Video,
        odometroKm: Int,
        combustible: String,
        lecturaIa: LecturaIa? = null,
        forzarKm: Boolean = false,
        actividadId: Long? = null,
        encargadoId: Long? = null,
    ): List<Pair<String, String>> = buildList {
        add("capturaVersion" to "2")
        add("meta" to metaJson(tomas, video))
        add("odometroKm" to odometroKm.toString())
        add("combustible" to combustible.trim())
        lecturaIaJson(lecturaIa)?.let { add("lecturaIa" to it) }
        if (forzarKm) add("forzarKm" to "true")
        actividadId?.takeIf { it > 0 }?.let { add("actividadId" to it.toString()) }
        encargadoId?.takeIf { it > 0 }?.let { add("encargadoId" to it.toString()) }
    }

    private fun coordenada(v: Double?): Double? = v?.takeIf { it.isFinite() && it != 0.0 }

    private fun tomaJson(toma: Toma): String =
        "{${jsonString("capturedAt")}:${jsonString(toma.capturedAt.orEmpty())}," +
            "${jsonString("lat")}:${coordenada(toma.lat) ?: "null"}," +
            "${jsonString("lng")}:${coordenada(toma.lng) ?: "null"}}"

    // ── Unidad fuera y firmas ───────────────────────────────────────────────

    /** ¿La unidad sigue fuera? Para el aviso «devuelve la unidad» al cerrar la actividad. */
    fun unidadSigueFuera(estatus: String?, conSalida: Boolean, conDevolucion: Boolean): Boolean =
        estatus == "En uso" || (conSalida && !conDevolucion)

    const val MOMENTO_SALIDA = "salida"
    const val MOMENTO_DEVOLUCION = "devolucion"
    const val ROL_ENTREGA = "entrega"
    const val ROL_RECIBE = "recibe"

    /** Una firma de menos de un trazo corto no es firma. */
    fun firmaSuficiente(puntos: Int): Boolean = puntos >= 12

    /** Porcentaje → texto corto del bloque: 50 → «½ tanque». */
    fun gasolinaCorta(pct: Int?): String? {
        val nivel = nivelMasCercano(pct) ?: return null
        return when (nivel) {
            "E" -> "Reserva"
            "F" -> "Lleno"
            else -> "${ChecklistVehiculoRules.nivelCorto(nivel)} tanque"
        }
    }

    /** Km con separador de miles, sin depender del idioma del teléfono: 48215 → «48,215 km». */
    fun kmTexto(km: Int?): String? {
        if (km == null) return null
        val s = km.toString()
        val conComas = s.reversed().chunked(3).joinToString(",").reversed()
        return "$conComas km"
    }

    private fun jsonString(value: String): String {
        val sb = StringBuilder(value.length + 2)
        sb.append('"')
        for (c in value) {
            when (c) {
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                else -> if (c < ' ') sb.append("\\u%04x".format(c.code)) else sb.append(c)
            }
        }
        sb.append('"')
        return sb.toString()
    }

    /** Segundos grabados → «0:14» para el contador de la vuelta. */
    fun reloj(segundos: Double): String {
        val s = segundos.coerceAtLeast(0.0).roundToInt()
        return "${s / 60}:${(s % 60).toString().padStart(2, '0')}"
    }
}
