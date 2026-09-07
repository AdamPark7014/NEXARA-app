package mx.nexara.mobile.nativeapp.data.integra.schedules

/**
 * Presets de acceso: espejo de `ACCESS_PRESETS` en
 * `apps/web/app/(panels)/integra/_schedulesApi.ts`, con los mismos ids de
 * plantilla que materializa el servidor (`PRESET_TEMPLATE_SLOTS`:
 * oficina = 2, fuera de horario = 4, fin de semana = 5).
 *
 * ## La corrección de zona respecto a la web
 *
 * Los presets con ventana de fechas («Visita 1 día», «Contratista») necesitan
 * saber **qué día es hoy**. La web lo calcula con `new Date().getFullYear()` y
 * compañía, es decir con el reloj del navegador, aunque el propio texto del
 * preset prometa «hora México». En un equipo con la zona en UTC, a partir de las
 * 18:00 de México ya es el día siguiente en UTC y el pase «solo hoy» se emite
 * para mañana: la persona no entra hoy y sí entra mañana.
 *
 * Aquí el día se toma siempre de [AcsTime.mexicoPartsOf], en
 * `America/Mexico_City`, y hay prueba de ese caso concreto.
 */
data class AccessPreset(
    val id: String,
    val title: String,
    val blurb: String,
    /** Clave del PATCH cuando el preset aplica a todo el sitio. `null` = por puerta. */
    val apiPreset: String? = null,
) {
    companion object {
        const val INDEFINITE_247 = "indefinite_247"
        const val OFFICE_HOURS = "office_hours"
        const val AFTER_HOURS = "after_hours"
        const val WEEKEND = "weekend"
        const val MEETING_ONLY = "meeting_only"
        const val CONTRACTOR = "contractor"
        const val VISIT_1DAY = "visit_1day"
        const val NO_ACCESS = "no_access"
    }
}

object SchedulePresets {

    /** Días de ventana que se piden al servidor para el preset de contratista. */
    const val CONTRACTOR_DAYS = 30

    private const val TEMPLATE_247 = "1"
    private const val TEMPLATE_OFFICE = "2"
    private const val TEMPLATE_AFTER_HOURS = "4"
    private const val TEMPLATE_WEEKEND = "5"

    val all: List<AccessPreset> = listOf(
        AccessPreset(
            id = AccessPreset.INDEFINITE_247,
            title = "Indefinido 24/7",
            blurb = "Todas las puertas, todo el día, sin fecha fin",
            apiPreset = "always",
        ),
        AccessPreset(
            id = AccessPreset.OFFICE_HOURS,
            title = "Horario oficina",
            blurb = "Lun–Vie laborables · vigencia indefinida",
            apiPreset = "office_hours",
        ),
        AccessPreset(
            id = AccessPreset.AFTER_HOURS,
            title = "Fuera de horario",
            blurb = "Lun–Vie 18:00–08:00 (2 franjas / medianoche)",
            apiPreset = "after_hours",
        ),
        AccessPreset(
            id = AccessPreset.WEEKEND,
            title = "Solo fin de semana",
            blurb = "Sábado y domingo todo el día",
            apiPreset = "weekend",
        ),
        AccessPreset(
            id = AccessPreset.MEETING_ONLY,
            title = "Solo sala de juntas",
            blurb = "Acceso a Sala de Juntas; resto deshabilitado",
        ),
        AccessPreset(
            id = AccessPreset.CONTRACTOR,
            title = "Contratista temporal",
            blurb = "Ventana de $CONTRACTOR_DAYS días + horario de oficina",
            apiPreset = "contractor",
        ),
        AccessPreset(
            id = AccessPreset.VISIT_1DAY,
            title = "Visita 1 día",
            blurb = "Solo hoy, en hora de México · pase de visitante",
            apiPreset = "visitor_today",
        ),
        AccessPreset(
            id = AccessPreset.NO_ACCESS,
            title = "Sin acceso",
            blurb = "Deshabilita la vigencia en todos los terminales",
            apiPreset = "never",
        ),
    )

    fun byId(id: String?): AccessPreset? = all.firstOrNull { it.id == id }

    private val MEETING_NAME = Regex("junta|meeting|sala", RegexOption.IGNORE_CASE)

    private fun allDoorsWith(
        catalog: SchedulesCatalog,
        planTemplateNo: String,
    ): List<DoorPlanAssignment> = catalog.doors.map { door ->
        DoorPlanAssignment(
            doorId = door.id,
            deviceIp = door.deviceIp,
            doorName = door.name,
            doorNo = door.doorNo,
            planTemplateNo = planTemplateNo,
            planName = catalog.templateLabel(planTemplateNo),
        )
    }

    /** `yyyy-MM-dd` del día en curso **en hora de México**, no en la del equipo. */
    fun todayInMexico(nowMillis: Long = System.currentTimeMillis()): String {
        val wc = AcsTime.mexicoPartsOf(nowMillis)
        val month = if (wc.month < 10) "0${wc.month}" else wc.month.toString()
        val day = if (wc.day < 10) "0${wc.day}" else wc.day.toString()
        return "${wc.year}-$month-$day"
    }

    /** `yyyy-MM-dd` de dentro de [days] días naturales, contando en México. */
    fun daysAheadInMexico(days: Int, nowMillis: Long = System.currentTimeMillis()): String =
        todayInMexico(nowMillis + days * 86_400_000L)

    /**
     * Devuelve el borrador con el preset aplicado. Es una función pura: no toca
     * red ni reloj más allá de [nowMillis], que se inyecta para poder probarla.
     */
    fun apply(
        presetId: String,
        catalog: SchedulesCatalog,
        current: PersonSchedule,
        nowMillis: Long = System.currentTimeMillis(),
    ): PersonSchedule {
        val indefiniteBase = current.copy(
            validEnable = true,
            validMode = "indefinite",
            validFrom = AcsTime.ISAPI_DEFAULT_BEGIN,
            validTo = AcsTime.ISAPI_INDEFINITE_END,
            indefinite = true,
        )
        return when (presetId) {
            AccessPreset.INDEFINITE_247 ->
                indefiniteBase.copy(doorPlans = allDoorsWith(catalog, TEMPLATE_247))

            AccessPreset.OFFICE_HOURS ->
                indefiniteBase.copy(doorPlans = allDoorsWith(catalog, TEMPLATE_OFFICE))

            AccessPreset.AFTER_HOURS ->
                indefiniteBase.copy(doorPlans = allDoorsWith(catalog, TEMPLATE_AFTER_HOURS))

            AccessPreset.WEEKEND ->
                indefiniteBase.copy(doorPlans = allDoorsWith(catalog, TEMPLATE_WEEKEND))

            AccessPreset.MEETING_ONLY -> {
                val meetingIp = catalog.doors
                    .firstOrNull { it.id == catalog.meetingRoomDoorId }
                    ?.deviceIp
                indefiniteBase.copy(
                    doorPlans = catalog.doors.map { door ->
                        val on = if (meetingIp != null) {
                            door.deviceIp == meetingIp
                        } else {
                            MEETING_NAME.containsMatchIn(door.name)
                        }
                        val plan = if (on) TEMPLATE_247 else ScheduleTemplate.NO_ACCESS_ID
                        DoorPlanAssignment(
                            doorId = door.id,
                            deviceIp = door.deviceIp,
                            doorName = door.name,
                            doorNo = door.doorNo,
                            planTemplateNo = plan,
                            planName = catalog.templateLabel(plan),
                        )
                    },
                )
            }

            AccessPreset.CONTRACTOR -> current.copy(
                validEnable = true,
                validMode = "window",
                validFrom = "${todayInMexico(nowMillis)}T00:00:00",
                validTo = "${daysAheadInMexico(CONTRACTOR_DAYS, nowMillis)}T23:59:59",
                indefinite = false,
                doorPlans = allDoorsWith(catalog, TEMPLATE_OFFICE),
            )

            AccessPreset.VISIT_1DAY -> {
                val today = todayInMexico(nowMillis)
                current.copy(
                    validEnable = true,
                    validMode = "window",
                    validFrom = "${today}T00:00:00",
                    validTo = "${today}T23:59:59",
                    indefinite = false,
                    doorPlans = allDoorsWith(catalog, TEMPLATE_247),
                )
            }

            AccessPreset.NO_ACCESS -> current.copy(
                validEnable = false,
                validMode = "disabled",
                indefinite = false,
                doorPlans = allDoorsWith(catalog, ScheduleTemplate.NO_ACCESS_ID),
            )

            else -> current
        }
    }
}
