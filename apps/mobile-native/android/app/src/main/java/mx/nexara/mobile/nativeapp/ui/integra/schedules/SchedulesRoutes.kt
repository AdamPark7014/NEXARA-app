package mx.nexara.mobile.nativeapp.ui.integra.schedules

/**
 * Contrato de cableado de HORARIOS y ESPACIOS.
 *
 * Este archivo no navega ni registra nada: `IntegraNavHost.kt`, `ModuleCatalog.kt`
 * y `ModulePanelMap.kt` son propiedad de otro turno. Aquí sólo se declaran las
 * constantes y los metadatos que ese cableado necesita, para que enchufarlo sea
 * copiar valores y no inventarlos.
 *
 * Registro previsto en `IntegraNavHost`:
 * ```
 * composable(SchedulesRoutes.SCHEDULES) { IntegraSchedulesScreen() }
 * composable(SchedulesRoutes.ESPACIOS) {
 *     IntegraEspaciosScreen(
 *         onOpenSchedules = { doorId ->
 *             nav.navigate(SchedulesRoutes.schedulesForDoor(doorId)) { launchSingleTop = true }
 *         },
 *     )
 * }
 * composable(
 *     route = SchedulesRoutes.SCHEDULES_FOR_DOOR,
 *     arguments = listOf(navArgument(SchedulesRoutes.ARG_DOOR_ID) { type = NavType.StringType }),
 * ) { entry ->
 *     IntegraSchedulesScreen(
 *         initialDoorId = entry.arguments?.getString(SchedulesRoutes.ARG_DOOR_ID),
 *     )
 * }
 * ```
 * Y en `integraRouteForKey`:
 * `"integra-schedules", "schedules", "horarios" -> SchedulesRoutes.SCHEDULES`
 * `"integra-espacios", "espacios", "spaces" -> SchedulesRoutes.ESPACIOS`
 */
object SchedulesRoutes {

    const val SCHEDULES = "integra/schedules"
    const val ESPACIOS = "integra/espacios"

    const val ARG_DOOR_ID = "doorId"

    /** Horarios abiertos ya sobre una puerta concreta (salto desde Espacios). */
    const val SCHEDULES_FOR_DOOR = "integra/schedules/door/{$ARG_DOOR_ID}"

    /**
     * El id de puerta es `"10.0.0.5|1"`. El `|` no es válido sin escapar en una
     * ruta de Navigation Compose, así que se codifica al construirla y la
     * pantalla lo decodifica.
     */
    fun schedulesForDoor(doorId: String): String =
        "integra/schedules/door/${encodeRouteArg(doorId)}"

    fun encodeRouteArg(raw: String): String =
        java.net.URLEncoder.encode(raw, Charsets.UTF_8.name())

    fun decodeRouteArg(raw: String?): String? = raw
        ?.takeIf { it.isNotBlank() }
        ?.let { runCatching { java.net.URLDecoder.decode(it, Charsets.UTF_8.name()) }.getOrDefault(it) }

    // ── Títulos para la top bar de IntegraNavHost ────────────────────────────

    const val TITLE_SCHEDULES = "Horarios de acceso"
    const val TITLE_ESPACIOS = "Espacios y puertas"

    fun titleForRoute(route: String?): String? = when {
        route == SCHEDULES -> TITLE_SCHEDULES
        route == ESPACIOS -> TITLE_ESPACIOS
        route?.startsWith("integra/schedules/door/") == true -> TITLE_SCHEDULES
        else -> null
    }

    // ── Entradas propuestas para ModuleCatalog.integra ───────────────────────

    /**
     * Metadatos de catálogo. Se dejan como datos y no como `ModuleEntry` para no
     * depender de un archivo que este turno no puede tocar.
     *
     * `parityStatus` honesto:
     * - **schedules → NATIVO**: lectura y escritura completas (vigencia, plantilla
     *   por puerta, presets y el reparto por terminal del guardado).
     * - **espacios → NATIVO**: política por espacio, reservas y cancelación, más
     *   personas y accesos recientes.
     */
    data class ProposedModule(
        val key: String,
        val label: String,
        val icon: String,
        val webPath: String,
        val parityStatus: String,
        val route: String,
    )

    val PROPOSED_MODULES: List<ProposedModule> = listOf(
        ProposedModule(
            key = "integra-schedules",
            label = "Horarios",
            icon = "🗓️",
            webPath = "/integra/schedules",
            parityStatus = "NATIVO",
            route = SCHEDULES,
        ),
        ProposedModule(
            key = "integra-espacios",
            label = "Espacios",
            icon = "🏛️",
            webPath = "/integra/espacios",
            parityStatus = "NATIVO",
            route = ESPACIOS,
        ),
    )
}
