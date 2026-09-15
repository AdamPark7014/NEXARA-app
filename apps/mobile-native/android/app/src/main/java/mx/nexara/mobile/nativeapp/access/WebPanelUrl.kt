package mx.nexara.mobile.nativeapp.access

/**
 * Construye la URL web canónica de un módulo de Core, igual que la resolvería el panel.
 *
 * Solo existe NEXARA Core (`core.nexara.com.mx/erp/...`) y el portal de clientes
 * (`portal.nexara.com.mx/tickets/...`). Los prefijos viejos de consola se leen
 * como `/erp`.
 *
 * `scripts/check-app-web-parity.py` lee las tablas de este archivo y verifica
 * contra el árbol real de `apps/web` que todo lo que devuelve el catálogo existe.
 */
object WebPanelUrl {

    private const val DOMAIN = "nexara.com.mx"

    /** Prefijo legacy → prefijo interno canónico. El más específico, primero. */
    private val LEGACY_PREFIXES = listOf(
        "/console" to "/erp",
        "/consola" to "/erp",
        "/core" to "/erp",
        "/portal" to "/tickets",
    )

    /** Slug en español → slug canónico de Core. */
    private val SLUG_ALIASES = mapOf(
        "mi-perfil" to "my-profile",
        "notificaciones" to "notifications-center",
    )

    private val SLUG_REMAPPED_PANELS = setOf("erp")

    /** Módulos de Core cuya ruta vieja no coincide con la web actual. */
    private val MODULE_REMAP = mapOf(
        "/erp/actividades" to "/erp/pizarra",
        "/erp/attendance" to "/erp/asistencias",
        "/erp/clients" to "/erp/clientes",
    )

    /**
     * Pantallas exclusivas de la app: para estas no se ofrece "Abrir en la web" —
     * mandar al usuario a un 404 es peor que no ofrecer el botón.
     */
    private val NO_WEB_EQUIVALENT = setOf(
        "/erp/offline-queue",
    )

    /** Prefijo interno → subdominio canónico. */
    private val CANONICAL_SUBDOMAIN = mapOf(
        "/erp" to "core",
        "/tickets" to "portal",
    )

    /**
     * @param webPath ruta del módulo tal cual la declara `ModuleCatalog` (admite
     *                prefijos legacy) o ya canónica. Una URL absoluta se devuelve
     *                intacta.
     * @return la URL a abrir, o `null` si el módulo no existe en la web.
     */
    fun forPath(webPath: String?): String? {
        val raw = webPath?.trim().orEmpty()
        if (raw.isEmpty()) return null
        if (raw.startsWith("http://") || raw.startsWith("https://")) return raw

        val canonicalPath = normalizePath(if (raw.startsWith("/")) raw else "/$raw")
        if (canonicalPath in NO_WEB_EQUIVALENT) return null

        val subdomain = CANONICAL_SUBDOMAIN.entries
            .firstOrNull { (prefix, _) ->
                canonicalPath == prefix || canonicalPath.startsWith("$prefix/")
            }
            ?.value
            ?: return null

        return "https://$subdomain.$DOMAIN$canonicalPath"
    }

    /**
     * Mismo orden que `normalizeLegacyPath` en la web: slugs, prefijo de panel,
     * slugs otra vez y por último el remapeo de módulos que cambiaron de sitio.
     */
    internal fun normalizePath(path: String): String {
        val clean = remapSlugs(path.trimEnd('/').ifEmpty { "/" })
        val withPanel = LEGACY_PREFIXES.firstNotNullOfOrNull { (legacy, canonical) ->
            when {
                clean == legacy -> canonical
                clean.startsWith("$legacy/") -> canonical + clean.removePrefix(legacy)
                else -> null
            }
        } ?: clean

        val deduped = withPanel.replace(Regex("^/erp/erp(?=/|$)"), "/erp")
        val canonical = remapSlugs(deduped)
        return MODULE_REMAP[canonical] ?: canonical
    }

    /** Traduce los slugs de todos los segmentos menos el del panel. */
    private fun remapSlugs(path: String): String {
        val segments = path.split('/').filter { it.isNotBlank() }
        if (segments.size < 2 || segments.first() !in SLUG_REMAPPED_PANELS) return path
        val head = segments.first()
        val tail = segments.drop(1).map { SLUG_ALIASES[it] ?: it }
        return "/" + (listOf(head) + tail).joinToString("/")
    }
}
