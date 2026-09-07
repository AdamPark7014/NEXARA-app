package mx.nexara.mobile.nativeapp.ui.integra.map

/**
 * Contrato de cableado del PLANO y del PANORAMA.
 *
 * Este archivo no navega ni registra nada: `IntegraNavHost.kt`,
 * `ModuleCatalog.kt`, `ModulePanelMap.kt` y `DeepLinkParser.kt` son propiedad de
 * otro turno. Aquí sólo se declaran las constantes y los metadatos que ese
 * cableado necesita, para que enchufarlo sea copiar valores y no deducirlos
 * leyendo las pantallas. Mismo formato que `SchedulesRoutes` y que
 * `IntegraDetectionRoutes`.
 *
 * ## Aviso de paquete
 *
 * El panorama vive en `ui/integra/map` y `data/integra/map` junto con el plano
 * porque la regla de propiedad de este turno sólo daba esos dos paquetes. Son
 * dos módulos distintos y el nombre del paquete no lo refleja. Moverlo a
 * `ui/integra/dashboard` es una renombrada mecánica —ningún otro paquete importa
 * de aquí—, pero **rompería las rutas de este contrato**, así que se deja dicho
 * en vez de hacerlo a medias.
 *
 * ## Registro previsto en `IntegraNavHost`
 *
 * ```kotlin
 * composable(IntegraMapRoutes.MAP) {
 *     IntegraMapScreen(
 *         onOpenKey = { key ->
 *             nav.navigate(integraRouteForKey(key)) { launchSingleTop = true }
 *         },
 *     )
 * }
 * composable(IntegraMapRoutes.DASHBOARD) {
 *     IntegraDashboardScreen(
 *         onOpenKey = { key ->
 *             nav.navigate(integraRouteForKey(key)) { launchSingleTop = true }
 *         },
 *     )
 * }
 * ```
 *
 * `onOpenKey` es opcional en las dos pantallas (`null` por defecto): sin él
 * simplemente no se pintan los saltos a otros módulos, y nada se rompe.
 *
 * Y en `integraRouteForKey`, antes del `when` local o dentro de él:
 * ```kotlin
 * IntegraMapRoutes.ROUTE_BY_KEY[key.lowercase()]?.let { return it }
 * ```
 *
 * ## El hub de inicio
 *
 * `integra-dashboard` **no sustituye** a `IntegraHomeScreen`: el hub es un menú
 * de veinte tarjetas y esto es el estado del sistema. Conviven. La colocación
 * que tiene sentido es una tarjeta «Panorama» la primera del grupo de Operación:
 *
 * ```kotlin
 * hubCard("integra-dashboard", "📊", "Panorama", "Estado del sitio ahora", Color(0xFF0F766E), onOpenKey)
 * hubCard("integra-map", "🗺️", "Plano", "Dónde está cada equipo", Color(0xFF3F6212), onOpenKey)
 * ```
 *
 * Si en algún momento se decide que INTEGRA arranque en el panorama en lugar de
 * en el menú, basta cambiar `startDestination`; las dos pantallas son
 * independientes y ninguna asume ser la primera.
 */
object IntegraMapRoutes {

    // ── Rutas ────────────────────────────────────────────────────────────────

    const val MAP = "integra/map"
    const val DASHBOARD = "integra/dashboard"

    /**
     * Sin argumentos de ruta, y es deliberado.
     *
     * El plano podría abrirse por pin (`integra/map/pin/{pinId}`), pero un id de
     * pin sólo existe mientras exista ese pin: la consola web lo borra y el
     * enlace queda apuntando a la nada. Cuando haga falta llegar a un equipo
     * concreto, el camino bueno es el módulo del equipo, no una coordenada.
     */

    // ── Títulos para la barra superior de `IntegraNavHost` ────────────────────

    const val TITLE_MAP = "Plano del sitio"
    const val TITLE_DASHBOARD = "Panorama INTEGRA"

    fun titleForRoute(route: String?): String? = when (route) {
        MAP -> TITLE_MAP
        DASHBOARD -> TITLE_DASHBOARD
        else -> null
    }

    // ── Claves de módulo ─────────────────────────────────────────────────────

    const val KEY_MAP = "integra-map"
    const val KEY_DASHBOARD = "integra-dashboard"

    /** Las dos claves nuevas. Van también a `ModulePanelMap.INTEGRA_KEYS`. */
    val MODULE_KEYS: List<String> = listOf(KEY_MAP, KEY_DASHBOARD)

    /**
     * Ruta de la que cuelga cada clave, para `integraRouteForKey`.
     *
     * Los alias son los mismos que ya usa el resto del fichero: clave desnuda,
     * segmento de la ruta web y castellano, para que un enlace copiado del
     * navegador aterrice en la pantalla nativa equivalente.
     */
    val ROUTE_BY_KEY: Map<String, String> = mapOf(
        KEY_MAP to MAP,
        "map" to MAP,
        "plano" to MAP,
        "mapa" to MAP,
        "floorplan" to MAP,
        KEY_DASHBOARD to DASHBOARD,
        "dashboard" to DASHBOARD,
        "panorama" to DASHBOARD,
        "tablero" to DASHBOARD,
        "resumen" to DASHBOARD,
    )

    /**
     * Alias para `DeepLinkParser.INTEGRA_KEY_ALIASES` (segmento → clave).
     *
     * Ojo con `dashboard`: en la web `/integra/dashboard` es un `redirect` a
     * `/integra`, así que un enlace viejo con ese segmento sigue circulando y
     * tiene que aterrizar en algún sitio. Aquí aterriza en el panorama nativo,
     * que es justo lo que ese redirect enseña.
     */
    val DEEP_LINK_ALIASES: Map<String, String> = mapOf(
        "map" to KEY_MAP,
        "plano" to KEY_MAP,
        "mapa" to KEY_MAP,
        "floorplans" to KEY_MAP,
        KEY_MAP to KEY_MAP,
        "dashboard" to KEY_DASHBOARD,
        "panorama" to KEY_DASHBOARD,
        "tablero" to KEY_DASHBOARD,
        KEY_DASHBOARD to KEY_DASHBOARD,
    )

    // ── Entradas propuestas para `ModuleCatalog.integra` ──────────────────────

    /**
     * Metadatos de catálogo, como datos y no como `ModuleEntry`, para no
     * depender de un archivo que este turno no puede tocar.
     */
    data class ProposedModule(
        val key: String,
        val label: String,
        val icon: String,
        val webPath: String,
        val parityStatus: String,
        val route: String,
        val note: String,
    )

    val PROPOSED_MODULES: List<ProposedModule> = listOf(
        ProposedModule(
            key = KEY_MAP,
            label = "Plano",
            icon = "🗺️",
            webPath = "/integra/map",
            // Honesto y sin adornos: la pantalla LEE. No hay una sola llamada de
            // escritura en `IntegraMapRepository`, y la propia pantalla lo dice.
            parityStatus = "SOLO_LECTURA",
            route = MAP,
            note = "Plano con zoom, arrastre y ficha del pin al tocarlo, con el estado vivo " +
                "de esa puerta o cámara, más la cobertura del plano y los pines que apuntan " +
                "a equipos dados de baja. NO coloca, NO mueve, NO borra pines y NO sube " +
                "planos: eso se queda en la consola web. La razón está escrita en " +
                "IntegraMapScreen y en IntegraMapRepository — situar un equipo con el dedo " +
                "sale mal, y en la web un toque en un pin llegó a borrarlo sin preguntar.",
        ),
        ProposedModule(
            key = KEY_DASHBOARD,
            label = "Panorama",
            icon = "📊",
            webPath = "/integra/dashboard",
            // También SOLO_LECTURA, y por el mismo criterio: un panel que sólo
            // consulta no es NATIVO por muchas tarjetas que tenga. Todo lo que
            // se puede hacer desde aquí es irse a otro módulo.
            parityStatus = "SOLO_LECTURA",
            route = DASHBOARD,
            note = "Estado del enlace, puertas y cámaras en línea con su resto «sin " +
                "reportar», alarmas abiertas de 24 h con las cinco primeras, gente en sitio, " +
                "KPI del día e inventario. Ninguna métrica inventada: sale de dashboard, " +
                "alarms/queue, occupancy, push/events/stats y cameras. Un endpoint que no " +
                "responde se dice; no se pinta cero.",
        ),
    )

    /**
     * Checklist de cableado, para que no se quede a medias:
     *
     *  1. `ModulePanelMap.INTEGRA_KEYS` += [MODULE_KEYS]. Sin esto,
     *     `allowedIntegraKeys()` las descarta y la tarjeta no se pinta nunca
     *     aunque la ruta exista.
     *  2. `ModuleCatalog.integra` += las dos entradas de [PROPOSED_MODULES].
     *  3. `IntegraNavHost`: los dos `composable`, el resolutor
     *     ([ROUTE_BY_KEY]), los títulos ([titleForRoute]) y las dos tarjetas del
     *     hub.
     *  4. `DeepLinkParser.INTEGRA_KEY_ALIASES` += [DEEP_LINK_ALIASES].
     */
    val WIRING_CHECKLIST: List<String> = listOf(
        "ModulePanelMap.INTEGRA_KEYS += integra-map, integra-dashboard",
        "ModuleCatalog.integra += las dos entradas de PROPOSED_MODULES",
        "IntegraNavHost: composables + ROUTE_BY_KEY + titleForRoute + tarjetas del hub",
        "DeepLinkParser.INTEGRA_KEY_ALIASES += DEEP_LINK_ALIASES",
    )
}
