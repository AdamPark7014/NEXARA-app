package mx.nexara.mobile.nativeapp.data.integra.schedules

/**
 * Modelos de dominio de HORARIOS y ESPACIOS, y el mapeo desde el JSON crudo.
 *
 * ## Por qué se mapea a mano desde `Map<String, Any?>`
 *
 * El mandato del módulo es explícito: un campo no-nulable de Kotlin que recibe
 * `null` revienta la deserialización y deja la pantalla en blanco sin explicar
 * por qué. En este API concreto el riesgo va más allá de los nulos: el mismo
 * concepto llega con **tipos distintos según la rama**. `templates[].id` es
 * `string` en el alias de UI (`GET integra/schedules`) y `number` dentro de
 * `devices[].templates[].id`; `doorNo` llega como número o como el sufijo de un
 * `"10.0.0.5|1"`. Un adaptador estricto de Moshi falla con cualquiera de esas
 * variaciones y el fallo se ve como «no hay datos».
 *
 * Por eso el JSON entra como mapa y se coacciona con [JsonPick], que es puro y
 * está cubierto por pruebas. Todo campo que el API pueda no mandar es nulable
 * aquí; los que sí son obligatorios llevan un valor por defecto explícito.
 */

// ── Coerción tolerante ────────────────────────────────────────────────────────

internal object JsonPick {

    fun map(value: Any?): Map<String, Any?>? {
        if (value !is Map<*, *>) return null
        val out = LinkedHashMap<String, Any?>(value.size)
        for ((k, v) in value) {
            if (k is String) out[k] = v
        }
        return out
    }

    fun list(value: Any?): List<Any?> = (value as? List<*>)?.toList() ?: emptyList()

    fun maps(value: Any?): List<Map<String, Any?>> = list(value).mapNotNull { map(it) }

    /** Primer valor no vacío entre las claves dadas, ya convertido a texto. */
    fun str(row: Map<String, Any?>?, vararg keys: String): String? {
        if (row == null) return null
        for (key in keys) {
            val raw = row[key] ?: continue
            val text = when (raw) {
                is String -> raw
                is Boolean -> raw.toString()
                is Number -> numberToText(raw)
                else -> continue
            }
            val clean = text.trim()
            if (clean.isNotEmpty() && clean != "null") return clean
        }
        return null
    }

    /** Los enteros JSON llegan como `Double`; `1.0` debe leerse `"1"`, no `"1.0"`. */
    private fun numberToText(n: Number): String {
        val d = n.toDouble()
        return if (d % 1.0 == 0.0 && d.isFinite() && kotlin.math.abs(d) < 1e15) {
            d.toLong().toString()
        } else {
            n.toString()
        }
    }

    fun int(row: Map<String, Any?>?, vararg keys: String): Int? {
        if (row == null) return null
        for (key in keys) {
            when (val raw = row[key]) {
                is Number -> return raw.toInt()
                is String -> raw.trim().toDoubleOrNull()?.let { return it.toInt() }
                else -> Unit
            }
        }
        return null
    }

    fun long(row: Map<String, Any?>?, vararg keys: String): Long? {
        if (row == null) return null
        for (key in keys) {
            when (val raw = row[key]) {
                is Number -> return raw.toLong()
                is String -> raw.trim().toDoubleOrNull()?.let { return it.toLong() }
                else -> Unit
            }
        }
        return null
    }

    fun bool(row: Map<String, Any?>?, vararg keys: String): Boolean? {
        if (row == null) return null
        for (key in keys) {
            when (val raw = row[key]) {
                is Boolean -> return raw
                is Number -> return raw.toInt() != 0
                is String -> {
                    val v = raw.trim().lowercase()
                    if (v == "true" || v == "1") return true
                    if (v == "false" || v == "0") return false
                }
                else -> Unit
            }
        }
        return null
    }
}

// ── Días de la semana ────────────────────────────────────────────────────────

/** Claves tal y como las escribe el `WeekPlanCfg` de Hikvision. */
enum class WeekDay(val key: String, val short: String, val label: String) {
    MONDAY("Monday", "Lun", "Lunes"),
    TUESDAY("Tuesday", "Mar", "Martes"),
    WEDNESDAY("Wednesday", "Mié", "Miércoles"),
    THURSDAY("Thursday", "Jue", "Jueves"),
    FRIDAY("Friday", "Vie", "Viernes"),
    SATURDAY("Saturday", "Sáb", "Sábado"),
    SUNDAY("Sunday", "Dom", "Domingo"),
    ;

    companion object {
        fun fromKey(raw: String?): WeekDay? {
            val v = raw?.trim().orEmpty()
            if (v.isEmpty()) return null
            return entries.firstOrNull { it.key.equals(v, ignoreCase = true) }
        }
    }
}

// ── Horarios ─────────────────────────────────────────────────────────────────

/**
 * Una franja del ACS. [beginTime] / [endTime] son **reloj de pared del
 * terminal** (`"08:00:00"`): no se convierten de zona. Ver [AcsTime].
 */
data class ScheduleSegment(
    val beginTime: String,
    val endTime: String,
)

data class ScheduleDayPlan(
    val week: WeekDay,
    val segments: List<ScheduleSegment>,
)

data class ScheduleTemplate(
    val id: String,
    val name: String,
    val weekPlanNo: Int? = null,
    val enable: Boolean? = null,
    /** Franjas reales publicadas por el terminal. Vacío = el ACS no las trajo. */
    val days: List<ScheduleDayPlan> = emptyList(),
) {
    /** Resumen corto derivado de las franjas reales, no de una convención. */
    val summary: String?
        get() {
            if (id == NO_ACCESS_ID) return "No abre esta puerta"
            if (days.isEmpty()) return null
            return days.take(3).joinToString(" · ") { day ->
                val franjas = day.segments.joinToString(", ") {
                    "${AcsTime.acsHhMm(it.beginTime)}–${AcsTime.acsHhMm(it.endTime)}"
                }
                "${day.week.short} $franjas"
            }
        }

    companion object {
        const val NO_ACCESS_ID = "0"

        /** Fila sintética: «0» no es un horario vacío, es «no abre». */
        val NO_ACCESS = ScheduleTemplate(id = NO_ACCESS_ID, name = "Sin acceso")
    }
}

data class ScheduleDoor(
    val id: String,
    val name: String,
    val deviceIp: String,
    val doorNo: Int = 1,
    val online: Boolean = true,
    /** `regionName` en Artemis, `deviceName` en ISAPI. Null si repite el nombre. */
    val location: String? = null,
)

data class SchedulePreset(
    val key: String,
    val label: String,
)

data class SchedulesCatalog(
    val doors: List<ScheduleDoor> = emptyList(),
    val templates: List<ScheduleTemplate> = listOf(ScheduleTemplate.NO_ACCESS),
    val meetingRoomDoorId: String? = null,
    val presets: List<SchedulePreset> = emptyList(),
    val provider: String? = null,
    val note: String? = null,
) {
    fun templateOf(planTemplateNo: String?): ScheduleTemplate? =
        templates.firstOrNull { it.id == planTemplateNo }

    fun templateLabel(planTemplateNo: String?): String {
        val id = planTemplateNo?.trim().orEmpty()
        if (id.isEmpty() || id == ScheduleTemplate.NO_ACCESS_ID) return "Sin acceso"
        return templateOf(id)?.name ?: "Plantilla $id"
    }
}

data class DoorPlanAssignment(
    val doorId: String,
    val deviceIp: String,
    val doorName: String? = null,
    val doorNo: Int = 1,
    /** `"0"` = sin acceso (deshabilitada en ese terminal). */
    val planTemplateNo: String = ScheduleTemplate.NO_ACCESS_ID,
    val planName: String? = null,
    val present: Boolean? = null,
    val error: String? = null,
) {
    val hasAccess: Boolean get() = planTemplateNo != ScheduleTemplate.NO_ACCESS_ID
}

data class PersonSchedule(
    val personId: String,
    val name: String,
    val code: String? = null,
    val validEnable: Boolean = true,
    /** Reloj de pared ISAPI, sin zona. */
    val validFrom: String = AcsTime.ISAPI_DEFAULT_BEGIN,
    val validTo: String = AcsTime.ISAPI_INDEFINITE_END,
    val indefinite: Boolean = true,
    val validMode: String = "indefinite",
    val doorPlans: List<DoorPlanAssignment> = emptyList(),
    val note: String? = null,
) {
    val validityLabel: String
        get() = AcsTime.validityLabel(validEnable, validFrom, validTo, indefinite, validMode)

    val doorsWithAccess: Int get() = doorPlans.count { it.hasAccess }
}

data class DoorAccessRow(
    val personId: String,
    val name: String,
    val code: String? = null,
    val planTemplateNo: String = "1",
    val planName: String? = null,
    val validEnable: Boolean? = null,
    val validFrom: String? = null,
    val validTo: String? = null,
    val indefinite: Boolean = false,
    val validMode: String? = null,
) {
    val validityLabel: String
        get() = AcsTime.validityLabel(validEnable, validFrom, validTo, indefinite, validMode)

    val hasAccess: Boolean get() = planTemplateNo != ScheduleTemplate.NO_ACCESS_ID
}

data class DoorAccess(
    val door: ScheduleDoor,
    val people: List<DoorAccessRow> = emptyList(),
    val note: String? = null,
)

data class TerminalOpResult(
    val deviceIp: String,
    val ok: Boolean,
    val error: String? = null,
)

data class SaveScheduleResult(
    val success: Boolean,
    val note: String? = null,
    val results: List<TerminalOpResult> = emptyList(),
)

data class PersonBrief(
    val id: String,
    val name: String,
    val code: String? = null,
)

// ── Espacios ─────────────────────────────────────────────────────────────────

data class SpaceTemplate(
    val key: String,
    val label: String,
    val description: String? = null,
)

data class SpaceAccessCounts(
    val indefinite: Int = 0,
    val timed: Int = 0,
    val expired: Int = 0,
    val off: Int = 0,
    val unknown: Int = 0,
    val total: Int = 0,
)

/** `startsAt` / `endsAt` son instantes UTC del servidor: se pintan vía [AcsTime]. */
data class SpaceWindow(
    val id: Long,
    val title: String,
    val hostName: String? = null,
    val hostPersonId: String? = null,
    val startsAt: String? = null,
    val endsAt: String? = null,
    val status: String? = null,
    val notes: String? = null,
    val phase: String = "upcoming",
) {
    val isPast: Boolean get() = phase == "past"
    val rangeLabel: String get() = AcsTime.rangeMexico(startsAt, endsAt)
    val phaseLabel: String
        get() = when (phase) {
            "now" -> "En curso"
            "past" -> "Pasada"
            else -> "Próxima"
        }
}

/** `occurredAt` es un instante UTC del servidor. */
data class SpaceAccessEvent(
    val id: Long,
    val occurredAt: String? = null,
    val personId: String? = null,
    val personName: String? = null,
    val verifyMode: String? = null,
    val photoPath: String? = null,
    val granted: Boolean = false,
    val label: String? = null,
)

data class SpacePolicy(
    val templateKey: String = "INDEFINITE",
    val label: String = "Acceso indefinido",
    val description: String? = null,
)

data class SpaceCard(
    val id: String,
    val name: String,
    val regionName: String? = null,
    val online: Boolean = true,
    val doorState: String? = null,
    val policy: SpacePolicy = SpacePolicy(),
    val accessCounts: SpaceAccessCounts = SpaceAccessCounts(),
    val nextWindow: SpaceWindow? = null,
    val windowsOpen: Int = 0,
    val lastAccess: SpaceAccessEvent? = null,
)

data class SpacePerson(
    val personId: String,
    val personName: String,
    val kind: String = "unknown",
    val kindLabel: String = "Sin vigencia",
    /** Reloj de pared ISAPI. */
    val validFrom: String? = null,
    val validTo: String? = null,
    val validEnable: Boolean? = null,
    val hasFace: Boolean = false,
    val planTemplateNo: String? = null,
) {
    val validityRange: String
        get() {
            val from = AcsTime.acsWallClockLabel(validFrom)
            val to = AcsTime.acsWallClockLabel(validTo)
            return "$from → $to"
        }
}

data class SpacesOverview(
    val siteId: Int? = null,
    val siteName: String? = null,
    val generatedAt: String? = null,
    val templates: List<SpaceTemplate> = emptyList(),
    val siteAccess: SpaceAccessCounts = SpaceAccessCounts(),
    val spaces: List<SpaceCard> = emptyList(),
    val note: String? = null,
)

data class SpaceDetail(
    val card: SpaceCard,
    val siteName: String? = null,
    val people: List<SpacePerson> = emptyList(),
    val windows: List<SpaceWindow> = emptyList(),
    val recentAccess: List<SpaceAccessEvent> = emptyList(),
)

data class IntegraCaps(
    /** `settings` en el JSON: gobierna el PATCH de horarios. */
    val canSettings: Boolean = true,
    /** Gobierna la política de espacio y las reservas. */
    val canControlDoors: Boolean = true,
)

// ── Mapeo ────────────────────────────────────────────────────────────────────

object SchedulesMapper {

    /**
     * La ubicación sólo aporta si dice algo distinto del nombre de la puerta:
     * en ISAPI `location` es el `deviceName` y `name` cae al `deviceName` cuando
     * el terminal no publica `doorName`, y la ficha repetiría la misma palabra
     * como título y como metadato.
     */
    fun cleanLocation(location: String?, name: String?): String? {
        val clean = location?.trim().orEmpty()
        if (clean.isEmpty()) return null
        return if (clean.equals(name?.trim().orEmpty(), ignoreCase = true)) null else clean
    }

    fun doorNoFromId(doorId: String, fallback: Int = 1): Int {
        val parts = doorId.split("|")
        if (parts.size < 2) return fallback
        return parts[1].trim().toIntOrNull() ?: fallback
    }

    fun deviceIpFromId(doorId: String): String = doorId.substringBefore("|").trim()

    /**
     * Agrupa por día las franjas habilitadas de un week plan. `enabledSegments`
     * llega ya filtrado a `enable: true` desde el API, así que aquí no se vuelve
     * a filtrar. Los días sin franja no aparecen: es «cerrado», no «sin dato».
     */
    fun daysFromSegments(segments: List<Map<String, Any?>>): List<ScheduleDayPlan> {
        if (segments.isEmpty()) return emptyList()
        val byDay = LinkedHashMap<WeekDay, MutableList<ScheduleSegment>>()
        for (row in segments) {
            val day = WeekDay.fromKey(JsonPick.str(row, "week")) ?: continue
            val begin = JsonPick.str(row, "beginTime") ?: continue
            val end = JsonPick.str(row, "endTime") ?: continue
            byDay.getOrPut(day) { mutableListOf() }.add(ScheduleSegment(begin, end))
        }
        if (byDay.isEmpty()) return emptyList()
        return WeekDay.entries
            .filter { byDay.containsKey(it) }
            .map { day ->
                ScheduleDayPlan(
                    week = day,
                    segments = (byDay[day] ?: emptyList()).sortedBy { it.beginTime },
                )
            }
    }

    /**
     * Catálogo desde `GET integra/schedules`.
     *
     * Las franjas semanales se leen de `devices[].weekPlans[].enabledSegments`,
     * que el alias sí publica (spread de `listSiteSchedules`). El cliente web
     * sólo lee el array aplanado `templates[]`, que no lleva franjas ni resumen,
     * y por eso su vista semanal siempre acaba en «el terminal no publica el
     * detalle». Aquí se hace la unión completa.
     *
     * **La unión es `template.weekPlanNo → weekPlan.id`**, no `template.id →
     * weekPlan.id`. Coinciden en la configuración de fábrica de Hikvision, pero
     * en cuanto alguien apunta la plantilla 3 al week plan 5 la unión por id
     * enseña el horario de otra plantilla con toda naturalidad.
     */
    fun catalog(root: Map<String, Any?>): SchedulesCatalog {
        val devices = JsonPick.maps(root["devices"])

        // Franjas por id de week plan, unificadas entre terminales del sitio.
        val daysByWeekPlan = LinkedHashMap<Int, List<ScheduleDayPlan>>()
        for (device in devices) {
            for (plan in JsonPick.maps(device["weekPlans"])) {
                val planId = JsonPick.int(plan, "id") ?: continue
                if (daysByWeekPlan.containsKey(planId)) continue
                val days = daysFromSegments(JsonPick.maps(plan["enabledSegments"]))
                if (days.isNotEmpty()) daysByWeekPlan[planId] = days
            }
        }

        // weekPlanNo / enable por id de plantilla, desde el detalle por terminal.
        val weekPlanNoByTemplate = LinkedHashMap<String, Int>()
        val enableByTemplate = LinkedHashMap<String, Boolean>()
        val nameByTemplate = LinkedHashMap<String, String>()
        for (device in devices) {
            for (tpl in JsonPick.maps(device["templates"])) {
                val id = JsonPick.str(tpl, "id", "planTemplateNo") ?: continue
                JsonPick.int(tpl, "weekPlanNo")?.let {
                    if (!weekPlanNoByTemplate.containsKey(id)) weekPlanNoByTemplate[id] = it
                }
                JsonPick.bool(tpl, "enable")?.let {
                    if (!enableByTemplate.containsKey(id)) enableByTemplate[id] = it
                }
                JsonPick.str(tpl, "templateName", "name")?.let {
                    if (!nameByTemplate.containsKey(id)) nameByTemplate[id] = it
                }
            }
        }

        val doors = JsonPick.maps(root["doors"]).mapNotNull { row ->
            val id = JsonPick.str(row, "id", "doorIndexCode") ?: return@mapNotNull null
            val name = JsonPick.str(row, "name", "doorName") ?: id
            ScheduleDoor(
                id = id,
                name = name,
                deviceIp = JsonPick.str(row, "deviceIp") ?: deviceIpFromId(id),
                doorNo = JsonPick.int(row, "doorNo") ?: doorNoFromId(id),
                online = JsonPick.bool(row, "online") ?: true,
                location = cleanLocation(JsonPick.str(row, "location", "regionName"), name),
            )
        }

        val templates = LinkedHashMap<String, ScheduleTemplate>()
        for (row in JsonPick.maps(root["templates"])) {
            val id = JsonPick.str(row, "id") ?: continue
            val weekPlanNo = JsonPick.int(row, "weekPlanNo") ?: weekPlanNoByTemplate[id]
            templates[id] = ScheduleTemplate(
                id = id,
                name = JsonPick.str(row, "name", "templateName")
                    ?: nameByTemplate[id]
                    ?: "Plantilla $id",
                weekPlanNo = weekPlanNo,
                enable = JsonPick.bool(row, "enable") ?: enableByTemplate[id],
                days = weekPlanNo?.let { daysByWeekPlan[it] }
                    ?: daysByWeekPlan[id.toIntOrNull() ?: -1]
                    ?: emptyList(),
            )
        }
        // Plantillas que sólo aparecen en el detalle por terminal.
        for ((id, weekPlanNo) in weekPlanNoByTemplate) {
            if (templates.containsKey(id)) continue
            templates[id] = ScheduleTemplate(
                id = id,
                name = nameByTemplate[id] ?: "Plantilla $id",
                weekPlanNo = weekPlanNo,
                enable = enableByTemplate[id],
                days = daysByWeekPlan[weekPlanNo].orEmpty(),
            )
        }
        templates[ScheduleTemplate.NO_ACCESS_ID] = ScheduleTemplate.NO_ACCESS

        val ordered = templates.values.sortedBy { it.id.toIntOrNull() ?: Int.MAX_VALUE }

        val offline = doors.count { !it.online }
        return SchedulesCatalog(
            doors = doors,
            templates = ordered,
            meetingRoomDoorId = JsonPick.str(root, "meetingRoomDoorId")
                ?: doors.firstOrNull { Regex("junta|meeting|sala", RegexOption.IGNORE_CASE).containsMatchIn(it.name) }?.id,
            presets = JsonPick.maps(root["presets"]).mapNotNull { row ->
                val key = JsonPick.str(row, "key") ?: return@mapNotNull null
                SchedulePreset(key = key, label = JsonPick.str(row, "label") ?: key)
            },
            provider = JsonPick.str(root, "provider"),
            note = when {
                doors.isEmpty() -> "El sitio no publica puertas ACS. Sincroniza el sitio en Equipos."
                offline > 0 -> "$offline terminal(es) no respondieron; se muestran igual para poder editar."
                else -> JsonPick.str(root, "note")
            },
        )
    }

    /** `GET integra/schedules/people/:id` → vigencia + plantilla por puerta. */
    fun personSchedule(
        personId: String,
        root: Map<String, Any?>,
        catalog: SchedulesCatalog,
    ): PersonSchedule {
        val valid = JsonPick.map(root["valid"])
        val validEnable = JsonPick.bool(valid, "enable")
        val validTo = JsonPick.str(valid, "endTime") ?: AcsTime.ISAPI_INDEFINITE_END
        val mode = JsonPick.str(root, "validMode") ?: when {
            validEnable == false -> "disabled"
            AcsTime.isIndefiniteEnd(validTo) -> "indefinite"
            else -> "window"
        }

        val rows = JsonPick.maps(root["doors"])
        val plans = LinkedHashMap<String, DoorPlanAssignment>()
        for (row in rows) {
            val deviceIp = JsonPick.str(row, "deviceIp").orEmpty()
            val doorId = JsonPick.str(row, "doorIndexCode", "doorId")
                ?: if (deviceIp.isNotEmpty()) "$deviceIp|1" else continue
            val rowValid = JsonPick.map(row["Valid"] ?: row["valid"])
            val planNo = JsonPick.str(row, "planTemplateNo")
            val present = JsonPick.bool(row, "present")
            val disabled = present == false ||
                planNo == null ||
                JsonPick.bool(rowValid, "enable") == false
            val plan = if (disabled) ScheduleTemplate.NO_ACCESS_ID else planNo
            plans[doorId] = DoorPlanAssignment(
                doorId = doorId,
                deviceIp = deviceIp.ifEmpty { deviceIpFromId(doorId) },
                doorName = JsonPick.str(row, "doorName", "name")
                    ?: catalog.doors.firstOrNull { it.id == doorId }?.name,
                doorNo = JsonPick.int(row, "doorNo") ?: doorNoFromId(doorId),
                planTemplateNo = plan,
                planName = JsonPick.str(row, "templateName") ?: catalog.templateLabel(plan),
                present = present,
                error = JsonPick.str(row, "error"),
            )
        }
        // Puertas del catálogo que el API no devolvió: se enseñan como sin acceso
        // en vez de desaparecer, para que se puedan conceder desde aquí.
        for (door in catalog.doors) {
            if (plans.containsKey(door.id)) continue
            plans[door.id] = DoorPlanAssignment(
                doorId = door.id,
                deviceIp = door.deviceIp,
                doorName = door.name,
                doorNo = door.doorNo,
                planTemplateNo = ScheduleTemplate.NO_ACCESS_ID,
                planName = "Sin acceso",
                present = false,
            )
        }

        return PersonSchedule(
            personId = JsonPick.str(root, "personId") ?: personId,
            name = JsonPick.str(root, "name") ?: personId,
            validEnable = mode != "disabled",
            validFrom = JsonPick.str(valid, "beginTime") ?: AcsTime.ISAPI_DEFAULT_BEGIN,
            validTo = validTo,
            indefinite = mode == "indefinite",
            validMode = mode,
            doorPlans = plans.values.toList(),
            note = if (rows.isEmpty()) {
                "Ningún terminal devolvió la ficha de esta persona; puede no estar enrolada."
            } else {
                null
            },
        )
    }

    /** `GET integra/schedules/doors/:doorId` → quién abre esa puerta. */
    fun doorAccess(
        doorId: String,
        root: Map<String, Any?>,
        catalog: SchedulesCatalog,
    ): DoorAccess {
        val doorRow = JsonPick.map(root["door"])
        val known = catalog.doors.firstOrNull { it.id == doorId }
        val name = JsonPick.str(doorRow, "name") ?: known?.name ?: doorId
        val door = ScheduleDoor(
            id = JsonPick.str(doorRow, "id") ?: doorId,
            name = name,
            deviceIp = known?.deviceIp ?: deviceIpFromId(doorId),
            doorNo = known?.doorNo ?: doorNoFromId(doorId),
            online = JsonPick.bool(doorRow, "online") ?: known?.online ?: true,
            location = cleanLocation(JsonPick.str(doorRow, "location", "regionName"), name),
        )
        val people = JsonPick.maps(root["people"]).mapNotNull { row ->
            val id = JsonPick.str(row, "personId", "id") ?: return@mapNotNull null
            val plan = JsonPick.str(row, "planTemplateNo") ?: "1"
            val validTo = JsonPick.str(row, "validTo")
            DoorAccessRow(
                personId = id,
                name = JsonPick.str(row, "name", "personName") ?: id,
                code = JsonPick.str(row, "code"),
                planTemplateNo = plan,
                planName = JsonPick.str(row, "planName", "kindLabel") ?: catalog.templateLabel(plan),
                validEnable = JsonPick.bool(row, "validEnable"),
                validFrom = JsonPick.str(row, "validFrom"),
                validTo = validTo,
                indefinite = JsonPick.bool(row, "indefinite") == true ||
                    JsonPick.str(row, "validMode") == "indefinite" ||
                    AcsTime.isIndefiniteEnd(validTo),
                validMode = JsonPick.str(row, "validMode"),
            )
        }
        return DoorAccess(door = door, people = people, note = JsonPick.str(root, "note"))
    }

    fun saveResult(root: Map<String, Any?>): SaveScheduleResult {
        val results = JsonPick.maps(root["results"]).mapNotNull { row ->
            val ip = JsonPick.str(row, "deviceIp", "ip") ?: return@mapNotNull null
            TerminalOpResult(
                deviceIp = ip,
                ok = JsonPick.bool(row, "ok") ?: false,
                error = JsonPick.str(row, "error"),
            )
        }
        val partial = JsonPick.bool(root, "partial") == true
        val declared = JsonPick.bool(root, "success")
        // Sin `success` explícito manda el reparto por terminal: si alguno falló
        // no se puede cantar «guardado» — es el caso que deja media plantilla
        // escrita y nadie se entera.
        val ok = when {
            declared == false -> false
            partial -> false
            results.isNotEmpty() -> results.all { it.ok }
            else -> declared ?: true
        }
        return SaveScheduleResult(
            success = ok,
            note = JsonPick.str(root, "note"),
            results = results,
        )
    }

    fun peopleBrief(rows: List<Map<String, Any?>>): List<PersonBrief> = rows.mapNotNull { row ->
        val id = JsonPick.str(row, "id", "personId") ?: return@mapNotNull null
        PersonBrief(
            id = id,
            name = JsonPick.str(row, "name", "personName") ?: id,
            code = JsonPick.str(row, "code"),
        )
    }

    // ── Espacios ─────────────────────────────────────────────────────────────

    private fun counts(row: Map<String, Any?>?): SpaceAccessCounts = SpaceAccessCounts(
        indefinite = JsonPick.int(row, "indefinite") ?: 0,
        timed = JsonPick.int(row, "timed") ?: 0,
        expired = JsonPick.int(row, "expired") ?: 0,
        off = JsonPick.int(row, "off") ?: 0,
        unknown = JsonPick.int(row, "unknown") ?: 0,
        total = JsonPick.int(row, "total") ?: 0,
    )

    fun window(row: Map<String, Any?>): SpaceWindow? {
        val id = JsonPick.long(row, "id") ?: return null
        return SpaceWindow(
            id = id,
            title = JsonPick.str(row, "title") ?: "Ventana de uso",
            hostName = JsonPick.str(row, "hostName"),
            hostPersonId = JsonPick.str(row, "hostPersonId"),
            startsAt = JsonPick.str(row, "startsAt"),
            endsAt = JsonPick.str(row, "endsAt"),
            status = JsonPick.str(row, "status"),
            notes = JsonPick.str(row, "notes"),
            phase = JsonPick.str(row, "phase") ?: "upcoming",
        )
    }

    fun accessEvent(row: Map<String, Any?>): SpaceAccessEvent? {
        val id = JsonPick.long(row, "id") ?: return null
        return SpaceAccessEvent(
            id = id,
            occurredAt = JsonPick.str(row, "occurredAt"),
            personId = JsonPick.str(row, "personId"),
            personName = JsonPick.str(row, "personName"),
            verifyMode = JsonPick.str(row, "verifyMode"),
            photoPath = JsonPick.str(row, "photoPath"),
            granted = JsonPick.bool(row, "granted") ?: false,
            label = JsonPick.str(row, "label"),
        )
    }

    fun spaceCard(row: Map<String, Any?>): SpaceCard? {
        val id = JsonPick.str(row, "id", "doorIndexCode") ?: return null
        val policy = JsonPick.map(row["policy"])
        return SpaceCard(
            id = id,
            name = JsonPick.str(row, "name") ?: id,
            regionName = JsonPick.str(row, "regionName"),
            online = JsonPick.bool(row, "online") ?: true,
            doorState = JsonPick.str(row, "doorState"),
            policy = SpacePolicy(
                templateKey = JsonPick.str(policy, "templateKey") ?: "INDEFINITE",
                label = JsonPick.str(policy, "label") ?: "Acceso indefinido",
                description = JsonPick.str(policy, "description"),
            ),
            accessCounts = counts(JsonPick.map(row["accessCounts"])),
            nextWindow = JsonPick.map(row["nextWindow"])?.let { window(it) },
            windowsOpen = JsonPick.int(row, "windowsOpen") ?: 0,
            lastAccess = JsonPick.map(row["lastAccess"])?.let { accessEvent(it) },
        )
    }

    fun spacesOverview(root: Map<String, Any?>): SpacesOverview = SpacesOverview(
        siteId = JsonPick.int(root, "siteId"),
        siteName = JsonPick.str(root, "siteName"),
        generatedAt = JsonPick.str(root, "generatedAt"),
        templates = JsonPick.maps(root["templates"]).mapNotNull { row ->
            val key = JsonPick.str(row, "key") ?: return@mapNotNull null
            SpaceTemplate(
                key = key,
                label = JsonPick.str(row, "label") ?: key,
                description = JsonPick.str(row, "description"),
            )
        },
        siteAccess = counts(JsonPick.map(root["siteAccess"])),
        spaces = JsonPick.maps(root["spaces"]).mapNotNull { spaceCard(it) },
        note = JsonPick.str(root, "note"),
    )

    fun spaceDetail(root: Map<String, Any?>, fallbackId: String): SpaceDetail {
        val card = spaceCard(root) ?: SpaceCard(id = fallbackId, name = fallbackId)
        return SpaceDetail(
            card = card,
            siteName = JsonPick.str(root, "siteName"),
            people = JsonPick.maps(root["people"]).mapNotNull { row ->
                val id = JsonPick.str(row, "personId", "id") ?: return@mapNotNull null
                SpacePerson(
                    personId = id,
                    personName = JsonPick.str(row, "personName", "name") ?: id,
                    kind = JsonPick.str(row, "kind") ?: "unknown",
                    kindLabel = JsonPick.str(row, "kindLabel") ?: "Sin vigencia",
                    validFrom = JsonPick.str(row, "validFrom"),
                    validTo = JsonPick.str(row, "validTo"),
                    validEnable = JsonPick.bool(row, "validEnable"),
                    hasFace = JsonPick.bool(row, "hasFace") ?: false,
                    planTemplateNo = JsonPick.str(row, "planTemplateNo"),
                )
            },
            windows = JsonPick.maps(root["windows"]).mapNotNull { window(it) },
            recentAccess = JsonPick.maps(root["recentAccess"]).mapNotNull { accessEvent(it) },
        )
    }

    fun caps(root: Map<String, Any?>): IntegraCaps = IntegraCaps(
        // El API expone el permiso de ajustes como `settings`, no `canSettings`.
        canSettings = JsonPick.bool(root, "settings", "canSettings") ?: true,
        canControlDoors = JsonPick.bool(root, "canControlDoors") ?: true,
    )
}
