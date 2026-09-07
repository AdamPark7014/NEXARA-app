package mx.nexara.mobile.nativeapp.data.integra.video

/**
 * Modelos del bloque de video de INTEGRA.
 *
 * Regla que gobierna todo este fichero: **si la API lo puede devolver nulo, aquí
 * es nulable**. La API rellena estos objetos desde el espejo de Prisma o desde
 * Artemis/ISAPI en vivo, y en el camino casi cualquier campo puede llegar vacío
 * (`region`, `status`, `hls`, `note`, `error`, `model`, `channelNumber`…). Los
 * dos únicos campos no nulables —`id` y `name`— no vienen del JSON tal cual: se
 * derivan con respaldo en los parsers, y una fila sin `id` utilizable se
 * descarta en vez de construirse a medias.
 *
 * Por eso nada de esto se deserializa con Moshi por reflexión: un `data class`
 * con un campo no nulable que recibe `null` lanza en el adaptador y tumba la
 * respuesta ENTERA, no solo esa fila. La pantalla sale vacía y sin motivo. Aquí
 * se parsea a mano desde `Map<String, Any?>`, donde un nulo es solo un nulo.
 */

// ── Lectura defensiva de mapas ────────────────────────────────────────────────

internal fun asMap(v: Any?): Map<String, Any?>? {
    if (v !is Map<*, *>) return null
    val out = LinkedHashMap<String, Any?>(v.size)
    for ((k, value) in v) {
        if (k is String) out[k] = value
    }
    return out
}

internal fun asMapList(v: Any?): List<Map<String, Any?>> {
    if (v !is List<*>) return emptyList()
    return v.mapNotNull { asMap(it) }
}

/** Primer valor no vacío entre [keys], como texto. `null` si ninguno sirve. */
internal fun Map<String, Any?>.str(vararg keys: String): String? {
    for (k in keys) {
        val s = when (val v = this[k]) {
            null -> null
            is String -> v.trim()
            is Number -> v.toString()
            is Boolean -> v.toString()
            else -> null
        }
        if (!s.isNullOrEmpty() && s != "null" && s != "undefined") return s
    }
    return null
}

internal fun Map<String, Any?>.bool(vararg keys: String): Boolean? {
    for (k in keys) {
        when (val v = this[k]) {
            is Boolean -> return v
            is Number -> return v.toInt() != 0
            is String -> {
                val s = v.trim().lowercase()
                if (s == "true" || s == "1") return true
                if (s == "false" || s == "0") return false
            }
        }
    }
    return null
}

internal fun Map<String, Any?>.int(vararg keys: String): Int? {
    for (k in keys) {
        when (val v = this[k]) {
            // Moshi entrega todo número JSON como Double.
            is Number -> return v.toInt()
            is String -> v.trim().toIntOrNull()?.let { return it }
        }
    }
    return null
}

// ── Cámara ────────────────────────────────────────────────────────────────────

/** Una cámara del inventario (`GET integra/cameras`). */
data class IntegraCamera(
    val id: String,
    val name: String,
    val region: String? = null,
    val status: String? = null,
    val isPtz: Boolean = false,
    val hasAudio: Boolean = false,
    val isDoorCamera: Boolean = false,
    val sourceIp: String? = null,
    val model: String? = null,
    val channelNumber: Int? = null,
) {
    /**
     * Misma regla que el muro web (`onlineish`): el espejo guarda el estado tal
     * como lo dio el equipo y hay sitios que no lo reportan. Un estado ausente
     * NO es una cámara caída — tratarlo como caída escondería cámaras que sí ven.
     */
    val online: Boolean
        get() = when (status?.trim()?.lowercase()) {
            null, "", "1", "online" -> true
            else -> false
        }

    companion object {
        /** `null` si la fila no trae identificador: sin id no hay nada que pedir. */
        fun fromMap(m: Map<String, Any?>): IntegraCamera? {
            val id = m.str("id", "cameraIndexCode", "indexCode") ?: return null
            return IntegraCamera(
                id = id,
                name = m.str("name", "cameraName") ?: id,
                region = m.str("region", "regionName"),
                status = m.str("status"),
                isPtz = m.bool("isPtz") ?: false,
                hasAudio = m.bool("hasAudio") ?: false,
                isDoorCamera = m.bool("isDoorCamera") ?: false,
                sourceIp = m.str("sourceIp"),
                model = m.str("model"),
                channelNumber = m.int("channelNumber"),
            )
        }
    }
}

// ── Stream abierto ────────────────────────────────────────────────────────────

/**
 * Lo que el servidor consiguió abrir para una cámara.
 *
 * `ok = true` no garantiza imagen: un sitio HCT responde `ok` con `hls = null`
 * porque su video va por la nube y no por go2rtc. Por eso [motivoSinImagen]
 * existe y la celda nunca se queda muda.
 */
data class IntegraStreamSlot(
    val cameraId: String,
    val ok: Boolean,
    val hls: String? = null,
    val rtsp: String? = null,
    val provider: String? = null,
    val note: String? = null,
    val error: String? = null,
    val hasAudio: Boolean? = null,
) {
    companion object {
        /** Un elemento de `items[]` de `POST integra/cameras/streams/batch`. */
        fun fromBatchItem(m: Map<String, Any?>): IntegraStreamSlot? {
            val id = m.str("cameraIndexCode", "id") ?: return null
            val stream = asMap(m["stream"])
            return IntegraStreamSlot(
                cameraId = id,
                ok = m.bool("ok") ?: (stream != null),
                hls = stream?.str("hls"),
                rtsp = stream?.str("rtsp"),
                provider = stream?.str("provider"),
                note = stream?.str("note"),
                error = m.str("error"),
                hasAudio = stream?.bool("hasAudio"),
            )
        }

        /** La respuesta plana de `POST integra/cameras/:id/stream` (sin envoltorio). */
        fun fromSingle(cameraId: String, m: Map<String, Any?>): IntegraStreamSlot =
            IntegraStreamSlot(
                cameraId = m.str("cameraIndexCode") ?: cameraId,
                ok = true,
                hls = m.str("hls"),
                rtsp = m.str("rtsp"),
                provider = m.str("provider"),
                note = m.str("note"),
                error = null,
                hasAudio = m.bool("hasAudio"),
            )
    }
}

/**
 * Por qué una celda no puede pintar imagen. Cadena vacía = sí puede.
 *
 * Requisito explícito del encargo: si una cámara no da imagen hay que decir el
 * motivo. Un hueco negro y mudo es indistinguible de una app rota, y es
 * exactamente la queja que este módulo viene a no repetir.
 */
fun motivoSinImagen(slot: IntegraStreamSlot?): String {
    if (slot == null) {
        return "El servidor no devolvió estado para esta cámara."
    }
    if (!slot.ok) {
        return slot.error?.takeIf { it.isNotBlank() }
            ?: "El sitio rechazó abrir esta cámara."
    }
    if (slot.provider.equals("HCT", ignoreCase = true)) {
        return "Sitio en la nube (HCT): su video no pasa por go2rtc y no entrega " +
            "fotogramas sueltos. Se ve solo desde la web."
    }
    if (slot.hls.isNullOrBlank()) {
        return slot.note?.takeIf { it.isNotBlank() }
            ?: "El sitio no publicó un stream para esta cámara."
    }
    if (Go2rtcFrame.parseHls(slot.hls) == null) {
        return "La URL de video que devolvió el servidor no tiene el formato " +
            "esperado; no se puede derivar el fotograma."
    }
    return ""
}

// ── PTZ ───────────────────────────────────────────────────────────────────────

/** Posición memorizada de una domo (`GET integra/cameras/:id/ptz/presets`). */
data class IntegraPtzPreset(
    val id: Int,
    val name: String,
) {
    companion object {
        fun fromMap(m: Map<String, Any?>): IntegraPtzPreset? {
            val id = m.int("id", "presetId") ?: return null
            val name = m.str("name", "presetName") ?: return null
            return IntegraPtzPreset(id = id, name = name)
        }
    }
}

// ── Captura ───────────────────────────────────────────────────────────────────

/**
 * Resultado de `POST integra/cameras/:id/capture`.
 *
 * El servidor devuelve tal cual lo que dijo Artemis, sin normalizar, así que
 * aquí no se promete forma: se busca una URL entre las claves habituales y se
 * conserva el crudo para poder enseñarlo. **La captura la guarda el equipo**; la
 * URL que devuelve suele apuntar a la LAN del cliente y un teléfono fuera de esa
 * red normalmente no la puede abrir. La pantalla lo dice así.
 */
data class IntegraCaptureResult(
    val picUrl: String? = null,
    val raw: Map<String, Any?> = emptyMap(),
) {
    companion object {
        fun fromMap(m: Map<String, Any?>): IntegraCaptureResult {
            val data = asMap(m["data"]) ?: m
            return IntegraCaptureResult(
                picUrl = data.str("picUrl", "url", "picurl", "imageUrl"),
                raw = m,
            )
        }
    }
}
