package mx.nexara.mobile.nativeapp.ui.console.vehiculos

/**
 * Reglas del checklist de entrega/devolución de vehículo — Kotlin puro, sin
 * Android: es lo que se prueba en `ChecklistVehiculoRulesTest` contra
 * `apps/api/src/vehicles/checklist-entrega.spec.ts`.
 *
 * Siete fotos obligatorias, siempre con cámara en vivo. El servidor rechaza
 * cualquier foto sin `capturedAt` (así niega las subidas de galería), así que
 * aquí una foto sin hora cuenta como faltante y ni siquiera se manda.
 */
object ChecklistVehiculoRules {

    /** Dónde cae cada foto dentro del flujo por pasos. */
    enum class Grupo { EXTERIOR, INTERIOR, TABLERO }

    /** [id] es el nombre de la parte multipart; [etiqueta] lo que lee la persona. */
    data class Slot(val id: String, val etiqueta: String, val grupo: Grupo)

    const val FRONTAL = "frontal"
    const val TRASERA = "trasera"
    const val LATERAL_IZQ = "lateral-izq"
    const val LATERAL_DER = "lateral-der"
    const val INTERIOR_DELANTERA = "interior-delantera"
    const val INTERIOR_TRASERA = "interior-trasera"
    const val TABLERO = "tablero"

    /** Las 7 casillas, en el orden en que se piden. */
    val SLOTS: List<Slot> = listOf(
        Slot(FRONTAL, "Frente", Grupo.EXTERIOR),
        Slot(TRASERA, "Trasera", Grupo.EXTERIOR),
        Slot(LATERAL_IZQ, "Lateral izq.", Grupo.EXTERIOR),
        Slot(LATERAL_DER, "Lateral der.", Grupo.EXTERIOR),
        Slot(INTERIOR_DELANTERA, "Interior frente", Grupo.INTERIOR),
        Slot(INTERIOR_TRASERA, "Interior atrás", Grupo.INTERIOR),
        Slot(TABLERO, "Tablero", Grupo.TABLERO),
    )

    fun slots(grupo: Grupo): List<Slot> = SLOTS.filter { it.grupo == grupo }

    /** Paso 1 del flujo: 4 exterior + 2 interior. */
    val SLOTS_FOTOS: List<Slot> = SLOTS.filter { it.grupo != Grupo.TABLERO }

    fun etiqueta(id: String): String = SLOTS.firstOrNull { it.id == id }?.etiqueta ?: id

    // ── Combustible ─────────────────────────────────────────────────────────

    /** Selector rápido: E · ¼ · ½ · ¾ · F (el valor que viaja es el de la izquierda). */
    val NIVELES: List<String> = listOf("E", "1/4", "1/2", "3/4", "F")

    /** Cómo se dibuja cada nivel en el selector. */
    fun nivelCorto(nivel: String): String = when (nivel) {
        "1/4" -> "¼"
        "1/2" -> "½"
        "3/4" -> "¾"
        else -> nivel
    }

    /**
     * Porcentaje de un nivel. Acepta las cinco marcas del tanque o un número
     * 0–100 (el API admite ambas formas); cualquier otra cosa es `null`.
     */
    fun combustiblePct(nivel: String?): Int? {
        val v = nivel?.trim().orEmpty()
        if (v.isEmpty()) return null
        return when (v.uppercase()) {
            "E" -> 0
            "1/4" -> 25
            "1/2" -> 50
            "3/4" -> 75
            "F" -> 100
            else -> v.toIntOrNull()?.takeIf { it in 0..100 }
        }
    }

    // ── Validación ──────────────────────────────────────────────────────────

    /** Lo que el flujo guarda de cada foto; viaja al API dentro de `meta`. */
    data class SlotMeta(
        val capturedAt: String? = null,
        val lat: Double? = null,
        val lng: Double? = null,
    ) {
        /** Sin hora no sirve: el servidor la rechaza igual que una de galería. */
        val valida: Boolean get() = !capturedAt.isNullOrBlank()
    }

    data class Validacion(
        /** Etiquetas de las casillas sin foto (o con foto sin hora). */
        val faltantes: List<String> = emptyList(),
        /** Km y combustible: lo que hay que corregir, ya en español. */
        val errores: List<String> = emptyList(),
    ) {
        val ok: Boolean get() = faltantes.isEmpty() && errores.isEmpty()

        /** Una sola línea para el snackbar; `null` si todo está bien. */
        val mensaje: String?
            get() {
                if (ok) return null
                val partes = buildList {
                    if (faltantes.isNotEmpty()) add("Faltan fotos: ${faltantes.joinToString(", ")}")
                    addAll(errores)
                }
                return partes.joinToString(". ")
            }
    }

    /**
     * @param metas lo capturado hasta ahora, por id de casilla.
     * @param odometroKm kilometraje tecleado (`null` si está en blanco o no es número).
     * @param combustible nivel elegido (`E`, `1/4`, `1/2`, `3/4`, `F` o 0–100).
     * @param kmInicio en devolución, el km con el que salió: el final no puede ser menor.
     */
    fun validar(
        metas: Map<String, SlotMeta>,
        odometroKm: Int?,
        combustible: String?,
        kmInicio: Int? = null,
    ): Validacion {
        val faltantes = SLOTS.filter { metas[it.id]?.valida != true }.map { it.etiqueta }
        val errores = buildList {
            when {
                odometroKm == null -> add("Escribe el kilometraje")
                odometroKm < 0 -> add("El kilometraje no puede ser negativo")
                kmInicio != null && odometroKm < kmInicio ->
                    add("El kilometraje final ($odometroKm) no puede ser menor al de salida ($kmInicio)")
            }
            if (combustiblePct(combustible) == null) add("Elige el nivel de combustible")
        }
        return Validacion(faltantes = faltantes, errores = errores)
    }

    // ── `meta` multipart ────────────────────────────────────────────────────

    /**
     * El JSON de la parte `meta`: una entrada por casilla capturada, en el orden
     * de [SLOTS]. Las casillas sin hora no se incluyen (el servidor las rechazaría).
     */
    fun metaJson(metas: Map<String, SlotMeta>): String =
        SLOTS.mapNotNull { slot ->
            val meta = metas[slot.id]?.takeIf { it.valida } ?: return@mapNotNull null
            "${jsonString(slot.id)}:${slotJson(meta)}"
        }.joinToString(prefix = "{", separator = ",", postfix = "}")

    /** El JSON de una sola casilla (parte `meta-<slot>`, la otra forma que acepta el API). */
    fun slotJson(meta: SlotMeta): String {
        val campos = buildList {
            add("${jsonString("capturedAt")}:${jsonString(meta.capturedAt.orEmpty())}")
            meta.lat?.let { add("${jsonString("lat")}:$it") }
            meta.lng?.let { add("${jsonString("lng")}:$it") }
        }
        return campos.joinToString(prefix = "{", separator = ",", postfix = "}")
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
}
