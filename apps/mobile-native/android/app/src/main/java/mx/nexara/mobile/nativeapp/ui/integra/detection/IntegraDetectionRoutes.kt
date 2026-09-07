package mx.nexara.mobile.nativeapp.ui.integra.detection

/**
 * Contrato de cableado de DETECCIÓN y AJUSTES.
 *
 * Estas pantallas se construyeron sin tocar `IntegraNavHost.kt`, `ModuleCatalog.kt`
 * ni `ModulePanelMap.kt` — otros agentes trabajan en paralelo sobre esos ficheros
 * y el cableado lo hace una sola mano al final. Aquí quedan, en un solo sitio,
 * las constantes y los datos que ese cableado necesita, para que nadie tenga que
 * deducirlos leyendo las pantallas.
 *
 * ## Rutas
 *
 * ```kotlin
 * composable(IntegraDetectionRoutes.DETECTION) {
 *     IntegraDetectionCamerasScreen(
 *         onOpenCamera = { id -> nav.navigate(IntegraDetectionRoutes.cameraRoute(id)) },
 *         onOpenCapabilities = { nav.navigate(IntegraDetectionRoutes.CAPABILITIES) },
 *     )
 * }
 * composable(IntegraDetectionRoutes.CAPABILITIES) { IntegraDetectionCapabilitiesScreen() }
 * composable(
 *     route = IntegraDetectionRoutes.CAMERA,
 *     arguments = listOf(navArgument(IntegraDetectionRoutes.ARG_CAMERA_ID) { type = NavType.StringType }),
 * ) { entry ->
 *     IntegraDetectionTuningScreen(
 *         cameraId = entry.arguments?.getString(IntegraDetectionRoutes.ARG_CAMERA_ID).orEmpty(),
 *     )
 * }
 *
 * composable(IntegraDetectionRoutes.SETTINGS) {
 *     IntegraSettingsScreen(
 *         onOpenSite = { id -> nav.navigate(IntegraDetectionRoutes.siteRoute(id)) },
 *         onOpenNewSite = { nav.navigate(IntegraDetectionRoutes.SETTINGS_NEW) },
 *     )
 * }
 * composable(IntegraDetectionRoutes.SETTINGS_NEW) {
 *     IntegraNewSiteScreen(onCreated = { nav.popBackStack() })
 * }
 * composable(
 *     route = IntegraDetectionRoutes.SETTINGS_SITE,
 *     arguments = listOf(navArgument(IntegraDetectionRoutes.ARG_SITE_ID) { type = NavType.IntType }),
 * ) { entry ->
 *     IntegraSiteDetailScreen(
 *         siteId = entry.arguments?.getInt(IntegraDetectionRoutes.ARG_SITE_ID) ?: 0,
 *         onDeleted = { nav.popBackStack() },
 *     )
 * }
 * ```
 *
 * La cámara cuelga de `…/camera/{cameraId}` y no de `…/{cameraId}` a propósito:
 * con la forma corta, `integra/detection/capabilities` sería un `cameraId`
 * válido y el patrón se comería la ruta de capacidades.
 *
 * ## Títulos sugeridos para la barra
 *
 * | Ruta | Título |
 * |---|---|
 * | [DETECTION] | Detección |
 * | [CAMERA] | Sintonizar cámara |
 * | [CAPABILITIES] | Capacidades del parque |
 * | [SETTINGS] | Ajustes INTEGRA |
 * | [SETTINGS_SITE] | Sitio |
 * | [SETTINGS_NEW] | Nuevo sitio |
 */
object IntegraDetectionRoutes {
    const val ARG_CAMERA_ID = "cameraId"
    const val ARG_SITE_ID = "siteId"

    const val DETECTION = "integra/detection"
    const val CAMERA = "integra/detection/camera/{$ARG_CAMERA_ID}"
    const val CAPABILITIES = "integra/detection/capabilities"

    const val SETTINGS = "integra/settings"
    const val SETTINGS_NEW = "integra/settings/new"
    const val SETTINGS_SITE = "integra/settings/site/{$ARG_SITE_ID}"

    fun cameraRoute(cameraId: String): String = "integra/detection/camera/$cameraId"

    fun siteRoute(siteId: Int): String = "integra/settings/site/$siteId"

    /**
     * Claves de módulo que estas pantallas cubren.
     *
     * `integra-sites` ya existe en `ModulePanelMap.INTEGRA_KEYS` y en
     * `ModuleCatalog.integra` como SOLO_LECTURA; con [IntegraSettingsScreen]
     * pasa a ser administrable, así que su entrada del catálogo debería subir a
     * `NATIVO` y su `webPath` seguir apuntando a `/integra/settings`.
     * `integra-detection` es nueva y hay que añadirla a las dos listas.
     */
    val MODULE_KEYS: List<String> = listOf("integra-detection", "integra-sites")

    /**
     * Ruta de la que cuelga cada clave, para `integraRouteForKey` en el NavHost.
     * Los alias son los que ya usa el resto del fichero (clave desnuda y
     * castellano), para que un deep link que llegue con cualquiera de ellos
     * aterrice donde debe.
     */
    val ROUTE_BY_KEY: Map<String, String> = mapOf(
        "integra-detection" to DETECTION,
        "detection" to DETECTION,
        "deteccion" to DETECTION,
        "integra-sites" to SETTINGS,
        "integra-settings" to SETTINGS,
        "settings" to SETTINGS,
        "sitios" to SETTINGS,
        "ajustes" to SETTINGS,
    )
}

/**
 * Entradas propuestas para `ModuleCatalog.integra`, con el estado de paridad
 * **honesto**.
 *
 * `integra-detection` es `NATIVO` con una excepción que se dice en pantalla y
 * no se disimula: los **polígonos de zona son de solo lectura**. Todo lo demás
 * —interruptor del perfil, sensibilidad, confianza, objetivo, horario, guardado,
 * aplicación al equipo y sondeo de capacidades— se hace desde el teléfono. Se
 * marca `NATIVO` y no `SOLO_LECTURA` porque el módulo escribe de verdad; el
 * recorte concreto queda documentado aquí y en [DetectionRegionPreview], que es
 * donde alguien lo va a buscar. Si el criterio del proyecto es que cualquier
 * recorte baja la etiqueta, cámbiese a `SOLO_LECTURA` sin discusión: la
 * diferencia está escrita, que es lo que importa.
 */
data class ProposedModuleEntry(
    val key: String,
    val label: String,
    val icon: String,
    val webPath: String,
    val parityStatus: String,
    val note: String,
)

val PROPOSED_INTEGRA_MODULES: List<ProposedModuleEntry> = listOf(
    ProposedModuleEntry(
        key = "integra-detection",
        label = "Detección",
        icon = "🎯",
        webPath = "/integra/detection",
        parityStatus = "NATIVO",
        note = "Sensibilidad, confianza, objetivo, horario, guardar, aplicar al equipo y " +
            "sondear capacidades. Los polígonos de zona se ven pero NO se editan: eso " +
            "sigue siendo de la consola web.",
    ),
    ProposedModuleEntry(
        key = "integra-sites",
        label = "Ajustes",
        icon = "⚙️",
        webPath = "/integra/settings",
        parityStatus = "NATIVO",
        note = "Sube de SOLO_LECTURA: alta, etiqueta, activación, predeterminado, módulos " +
            "por sitio, sincronización y baja. Todo lo destructivo pasa por confirmación " +
            "que dice qué se pierde; la baja exige teclear el nombre del sitio.",
    ),
)
