package mx.nexara.mobile.nativeapp.data.integra.map

/** Qué representa un pin. `entityType` sólo vale `DOOR` o `CAMERA` hoy. */
enum class PinKind { DOOR, CAMERA, OTHER }

/**
 * Un pin situado sobre el plano.
 *
 * [xPct] e [yPct] van en porcentaje del ancho y el alto del plano, tal como los
 * guarda el servidor. Se recortan a `0..100` al leerlos: un pin fuera de rango
 * (que el editor web puede producir con un arrastre pasado de largo) se dibujaría
 * fuera de la imagen y sería invisible sin que nadie supiera por qué.
 */
data class MapPin(
    val id: Int,
    val kind: PinKind,
    val entityType: String,
    val entityId: String,
    val label: String?,
    val xPct: Float,
    val yPct: Float,
) {
    /** Lo que se enseña al operador: la etiqueta del pin, o el id si no hay. */
    val displayName: String get() = label?.takeIf { it.isNotBlank() } ?: entityId

    companion object {
        internal fun fromMap(m: Map<String, Any?>): MapPin? {
            val id = m.mint("id") ?: return null
            val entityId = m.mstr("entityId") ?: return null
            // Un pin sin coordenadas no se puede situar; se descarta en vez de
            // dibujarlo en la esquina y hacer creer que la puerta está ahí.
            val x = m.mfloat("xPct") ?: return null
            val y = m.mfloat("yPct") ?: return null
            val type = m.mstr("entityType").orEmpty()
            return MapPin(
                id = id,
                kind = pinKindOf(type),
                entityType = type,
                entityId = entityId,
                label = m.mstr("label"),
                xPct = x.coerceIn(0f, 100f),
                yPct = y.coerceIn(0f, 100f),
            )
        }
    }
}

internal fun pinKindOf(raw: String?): PinKind = when (raw?.trim()?.uppercase()) {
    "DOOR" -> PinKind.DOOR
    "CAMERA" -> PinKind.CAMERA
    else -> PinKind.OTHER
}

/**
 * Plano del sitio.
 *
 * [imageData] llega como URI de datos (`data:image/png;base64,…`) porque la web
 * lo sube con `FileReader.readAsDataURL`. Puede ser enorme; se guarda tal cual y
 * la decodificación vive en la capa de UI, fuera del hilo principal.
 */
data class Floorplan(
    val id: Int,
    val name: String,
    val imageData: String?,
    val pins: List<MapPin>,
) {
    val doorPins: Int get() = pins.count { it.kind == PinKind.DOOR }
    val cameraPins: Int get() = pins.count { it.kind == PinKind.CAMERA }

    companion object {
        internal fun fromMap(m: Map<String, Any?>): Floorplan? {
            val id = m.mint("id") ?: return null
            return Floorplan(
                id = id,
                name = m.mstr("name") ?: "Plano $id",
                imageData = m.mstr("imageData"),
                pins = m.mlist("pins").mapNotNull { MapPin.fromMap(it) },
            )
        }
    }
}

/**
 * Puerta o cámara del inventario del sitio, con su estado de ahora.
 *
 * [online] es de tres estados a propósito:
 *
 *  - `true`  — el equipo reporta que está en línea.
 *  - `false` — reporta que está caído.
 *  - `null`  — **no reporta nada**. Hay sitios cuyo espejo no guarda el estado.
 *
 * El muro de vídeo (`IntegraCamera.online`) pliega el tercer caso en `true`
 * argumentando que un estado ausente no es una cámara caída, y en un muro tiene
 * sentido: esconder una cámara que sí ve es peor. Aquí no se pliega, porque este
 * módulo está contando: decir «12 de 12 en línea» cuando cinco no han dicho nada
 * es exactamente la clase de cifra inventada que este proyecto no quiere.
 */
data class MapEntity(
    val id: String,
    val kind: PinKind,
    val name: String,
    val location: String?,
    val online: Boolean?,
    /** Sólo puertas: `open`, `closed`, `remain_open`, `remain_closed`, `unknown`. */
    val doorState: String?,
    /** Sólo cámaras: el `status` crudo del espejo, para poder decir qué llegó. */
    val rawStatus: String?,
) {
    companion object {
        internal fun door(m: Map<String, Any?>): MapEntity? {
            val id = m.mstr("id", "doorIndexCode", "indexCode") ?: return null
            return MapEntity(
                id = id,
                kind = PinKind.DOOR,
                name = m.mstr("name", "doorName") ?: id,
                location = m.mstr("location", "regionName", "region"),
                online = m.mbool("online"),
                doorState = m.mstr("status"),
                rawStatus = m.mstr("status"),
            )
        }

        internal fun camera(m: Map<String, Any?>): MapEntity? {
            val id = m.mstr("id", "cameraIndexCode", "indexCode") ?: return null
            val status = m.mstr("status")
            return MapEntity(
                id = id,
                kind = PinKind.CAMERA,
                name = m.mstr("name", "cameraName") ?: id,
                location = m.mstr("region", "regionName"),
                online = cameraOnlineOrNull(status),
                doorState = null,
                rawStatus = status,
            )
        }
    }
}

/**
 * Estado de una cámara del espejo, admitiendo que puede no haberlo.
 *
 * El espejo guarda `status` tal como lo dio el equipo. Moshi entrega los enteros
 * JSON como `Double`, así que un `1` puede llegar como `"1.0"`: normalizar el
 * número es obligatorio, y olvidarlo ya dejó una vez todo el muro en gris.
 */
internal fun cameraOnlineOrNull(status: String?): Boolean? {
    val s = status?.trim()?.lowercase().orEmpty()
    if (s.isEmpty() || s == "null" || s == "undefined") return null
    when (s) {
        "1", "online", "true" -> return true
        "0", "offline", "false" -> return false
    }
    s.toDoubleOrNull()?.let { return it.toInt() == 1 }
    return null
}

/**
 * Un pin ya casado con el equipo al que apunta.
 *
 * [entity] es nulable y ese `null` **es un dato**: el pin señala una puerta o una
 * cámara que ya no está en el inventario del sitio (se dio de baja el equipo y
 * el pin se quedó). La consola web no lo dice; aquí sí.
 */
data class PinCard(
    val pin: MapPin,
    val entity: MapEntity?,
) {
    val orphan: Boolean get() = entity == null
    val title: String get() = entity?.name ?: pin.displayName
}

/**
 * Cuánto del sitio está realmente situado en un plano.
 *
 * Un plano al que le faltan la mitad de las puertas es un plano que engaña al
 * que lo mira desde el teléfono, así que la cifra se enseña.
 */
data class MapCoverage(
    val pinnedDoors: Int,
    val totalDoors: Int,
    val pinnedCameras: Int,
    val totalCameras: Int,
    val orphanPins: Int,
) {
    val missingDoors: Int get() = (totalDoors - pinnedDoors).coerceAtLeast(0)
    val missingCameras: Int get() = (totalCameras - pinnedCameras).coerceAtLeast(0)
    val complete: Boolean get() = missingDoors == 0 && missingCameras == 0 && orphanPins == 0
}

/** Lo que el plano necesita en una sola pasada: planos, inventario y cobertura. */
data class MapSnapshot(
    val floorplans: List<Floorplan>,
    val doors: List<MapEntity>,
    val cameras: List<MapEntity>,
) {
    private val byKey: Map<String, MapEntity> =
        (doors + cameras).associateBy { entityKey(it.kind, it.id) }

    fun entityFor(pin: MapPin): MapEntity? = byKey[entityKey(pin.kind, pin.entityId)]

    fun cards(plan: Floorplan): List<PinCard> =
        plan.pins.map { PinCard(pin = it, entity = entityFor(it)) }

    /**
     * Cobertura sobre **todos** los planos del sitio: una puerta situada en la
     * planta alta no está «sin situar» sólo porque no aparezca en la baja.
     */
    fun coverage(): MapCoverage {
        val pinnedDoorIds = mutableSetOf<String>()
        val pinnedCameraIds = mutableSetOf<String>()
        var orphans = 0
        for (plan in floorplans) {
            for (pin in plan.pins) {
                val entity = entityFor(pin)
                if (entity == null) {
                    orphans++
                    continue
                }
                when (pin.kind) {
                    PinKind.DOOR -> pinnedDoorIds += pin.entityId
                    PinKind.CAMERA -> pinnedCameraIds += pin.entityId
                    PinKind.OTHER -> Unit
                }
            }
        }
        return MapCoverage(
            pinnedDoors = pinnedDoorIds.size,
            totalDoors = doors.size,
            pinnedCameras = pinnedCameraIds.size,
            totalCameras = cameras.size,
            orphanPins = orphans,
        )
    }

    companion object {
        val EMPTY = MapSnapshot(emptyList(), emptyList(), emptyList())
    }
}

private fun entityKey(kind: PinKind, id: String) = "${kind.name}:$id"
