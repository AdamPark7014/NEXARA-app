package mx.nexara.mobile.nativeapp.data.integra.map

/**
 * Estado del enlace con el sitio. Sin esto, todos los conteos de abajo son
 * fotos viejas del espejo y nadie lo sabría.
 */
data class PanoramaLink(
    val connected: Boolean,
    val configured: Boolean,
    val host: String?,
    val provider: String?,
    val siteId: Int?,
    val source: String?,
) {
    companion object {
        internal fun fromMap(m: Map<String, Any?>) = PanoramaLink(
            connected = m.mbool("connected") ?: false,
            configured = m.mbool("configured") ?: false,
            host = m.mstr("host"),
            provider = m.mstr("provider"),
            siteId = m.mint("siteId"),
            source = m.mstr("source"),
        )
    }
}

/**
 * Conteos del espejo. Todos nulables: `GET integra/dashboard` sin empresa
 * resuelta devuelve el bloque de salud y nada más, y pintar «0 puertas» donde en
 * realidad es «no me lo han dicho» es mentir con un número.
 */
data class PanoramaCounts(
    val doors: Int?,
    val doorsOnline: Int?,
    val doorsOffline: Int?,
    val cameras: Int?,
    val people: Int?,
    val devices: Int?,
    val vehicles: Int?,
    val regions: Int?,
) {
    companion object {
        internal fun fromMap(m: Map<String, Any?>) = PanoramaCounts(
            doors = m.mint("doors"),
            doorsOnline = m.mint("doorsOnline"),
            doorsOffline = m.mint("doorsOffline"),
            cameras = m.mint("cameras"),
            people = m.mint("people"),
            devices = m.mint("devices"),
            vehicles = m.mint("vehicles"),
            regions = m.mint("regions"),
        )
    }
}

/**
 * Puertas en línea, caídas y **sin reportar**.
 *
 * El servidor cuenta `online: true` y `online: false` por separado; las filas
 * con `online` nulo no caen en ninguno de los dos conteos. Enseñar «8 de 12 en
 * línea» y callar las otras cuatro deja al operador creyendo que están caídas, o
 * que están bien, según cómo se levante. Aquí el tercer grupo se nombra.
 */
data class DoorHealth(
    val online: Int,
    val offline: Int,
    val unknown: Int,
    val total: Int,
) {
    companion object {
        fun of(total: Int?, online: Int?, offline: Int?): DoorHealth? {
            if (total == null && online == null && offline == null) return null
            val on = (online ?: 0).coerceAtLeast(0)
            val off = (offline ?: 0).coerceAtLeast(0)
            val tot = (total ?: (on + off)).coerceAtLeast(0)
            return DoorHealth(
                online = on,
                offline = off,
                unknown = (tot - on - off).coerceAtLeast(0),
                total = maxOf(tot, on + off),
            )
        }
    }
}

/**
 * Cámaras vivas, contadas sobre `GET integra/cameras`.
 *
 * `GET integra/dashboard` da el **total** de cámaras y nada más: no existe
 * `camerasOnline`. Antes que inventarlo o dejar el hueco, se cuenta aquí a
 * partir del `status` de cada fila, con el mismo tercer estado que las puertas.
 */
data class CameraHealth(
    val online: Int,
    val offline: Int,
    val unreported: Int,
    val total: Int,
) {
    companion object {
        internal fun of(rows: List<Map<String, Any?>>): CameraHealth {
            var on = 0
            var off = 0
            var none = 0
            for (row in rows) {
                when (cameraOnlineOrNull(row.mstr("status"))) {
                    true -> on++
                    false -> off++
                    null -> none++
                }
            }
            return CameraHealth(online = on, offline = off, unreported = none, total = rows.size)
        }
    }
}

/** KPI del día que devuelve `GET integra/push/events/stats`. */
data class PanoramaToday(
    val day: String?,
    val granted: Int?,
    val denied: Int?,
    val uniquePeople: Int?,
    val onSite: Int?,
) {
    val hasAny: Boolean
        get() = granted != null || denied != null || uniquePeople != null || onSite != null

    companion object {
        internal fun fromMap(m: Map<String, Any?>) = PanoramaToday(
            day = m.mstr("day"),
            granted = m.mint("entradas", "granted"),
            denied = m.mint("denegados", "denied"),
            uniquePeople = m.mint("unicos", "uniquePersons"),
            onSite = m.mint("enSitio", "onSite"),
        )
    }
}

/** Trozos del panorama que se piden por separado, para poder fallar por separado. */
enum class PanoramaPart(val label: String) {
    LINK("Estado del enlace"),
    ALARMS("Cola de alarmas"),
    OCCUPANCY("Ocupación"),
    TODAY("Actividad de hoy"),
    CAMERAS("Estado de cámaras"),
}

/**
 * Foto del sistema ahora mismo.
 *
 * [missing] es el mecanismo de honestidad de esta pantalla: cuando un endpoint
 * no responde, su sección **no pinta un cero** —dice que no respondió—. Un cero
 * falso en «alarmas abiertas» es exactamente el error que hace que nadie mire.
 */
data class PanoramaSnapshot(
    val link: PanoramaLink,
    val counts: PanoramaCounts,
    val doorHealth: DoorHealth?,
    val cameraHealth: CameraHealth?,
    val openAlarms: Int?,
    val alarmSource: String?,
    val topAlarms: List<Map<String, Any?>>,
    val onSite: Int?,
    val occupancyDay: String?,
    val occupancyNote: String?,
    val today: PanoramaToday?,
    val lastSync: String?,
    val canSettings: Boolean,
    val canControlDoors: Boolean,
    val missing: List<PanoramaPart>,
) {
    fun failed(part: PanoramaPart): Boolean = part in missing

    /**
     * Lo que hay que mirar antes que nada, en orden de gravedad. Vacío quiere
     * decir que no hay nada urgente — y entonces la pantalla lo dice, en vez de
     * dejar el hueco y que parezca que falta información.
     */
    fun attention(): List<String> {
        val out = mutableListOf<String>()
        if (!link.configured) {
            out += "El sitio no tiene enlace configurado: los conteos son del espejo, no de ahora."
        } else if (!link.connected) {
            out += "Sin conexión con el equipo del sitio. Lo de abajo es la última foto guardada."
        }
        val alarms = openAlarms
        if (alarms != null && alarms > 0) {
            out += if (alarms == 1) "1 alarma abierta sin atender." else "$alarms alarmas abiertas sin atender."
        }
        doorHealth?.let {
            if (it.offline > 0) {
                out += if (it.offline == 1) "1 puerta con el equipo caído." else "${it.offline} puertas con el equipo caído."
            }
        }
        cameraHealth?.let {
            if (it.offline > 0) {
                out += if (it.offline == 1) "1 cámara fuera de línea." else "${it.offline} cámaras fuera de línea."
            }
        }
        return out
    }

    companion object {
        val EMPTY = PanoramaSnapshot(
            link = PanoramaLink(
                connected = false,
                configured = false,
                host = null,
                provider = null,
                siteId = null,
                source = null,
            ),
            counts = PanoramaCounts(null, null, null, null, null, null, null, null),
            doorHealth = null,
            cameraHealth = null,
            openAlarms = null,
            alarmSource = null,
            topAlarms = emptyList(),
            onSite = null,
            occupancyDay = null,
            occupancyNote = null,
            today = null,
            lastSync = null,
            canSettings = false,
            canControlDoors = false,
            missing = emptyList(),
        )
    }
}
