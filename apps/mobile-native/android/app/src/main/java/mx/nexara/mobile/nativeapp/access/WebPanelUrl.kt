package mx.nexara.mobile.nativeapp.access

/**
 * Construye la URL web canónica de un módulo, igual que la resolvería el panel.
 *
 * Espejo de `apps/web/lib/legacy-path-remap.ts` (`LEGACY_PANEL_PREFIX_MAP`) y de
 * `apps/web/middleware.ts` (`CANONICAL_BY_INTERNAL_PREFIX`): cada panel vive en su
 * propio subdominio y los prefijos viejos se redirigen 308 al canónico.
 *
 * Antes la app mandaba **todo** a `consola.nexara.com.mx` con rutas de la app
 * `apps/mobile` ya borrada (`/operacion/...`, `/console/...`). Aterrizaba siempre en
 * el host del ERP aunque el módulo fuera de OPS o de ventas, y 31 de los módulos del
 * catálogo daban 404 porque la ruta ya no existe en la web actual.
 *
 * Ojo: `ModuleEntry.webPath` **no** se puede tocar — `ConsoleAccessRules` lo usa para
 * decidir permisos por rol. Por eso la corrección vive aquí y no en el catálogo.
 *
 * `scripts/check-app-web-parity.py` verifica contra el árbol real de `apps/web` que
 * todo lo que esto devuelve existe.
 */
object WebPanelUrl {

    private const val DOMAIN = "nexara.com.mx"

    /** Prefijo legacy → prefijo interno canónico. El más específico, primero. */
    private val LEGACY_PREFIXES = listOf(
        "/console" to "/erp",
        "/consola" to "/erp",
        "/core" to "/erp",
        "/contabilidad" to "/erp",
        "/people" to "/erp/hr",
        "/operacion" to "/ops",
        "/noc" to "/ops/noc",
        "/ventas" to "/crm",
        "/sales" to "/crm",
        "/web" to "/studio",
        "/portal" to "/tickets",
    )

    /**
     * Slug en español → slug canónico, igual que `SEGMENT_ALIASES` en
     * `legacy-path-remap.ts`. El catálogo nativo heredó los slugs en español de la
     * app vieja; la web los renombró al inglés.
     */
    private val SLUG_ALIASES = mapOf(
        "cotizaciones" to "quotes",
        "plantillas" to "templates",
        "proyectos" to "projects",
        "licitaciones" to "tenders",
        "productos" to "products",
        "clientes" to "clients",
        "oportunidades" to "opportunities",
        "cuotas" to "targets",
        "reportes" to "reports",
        "viaticos" to "viatics",
        "mis-viaticos" to "my-viatics",
        "mis-actividades" to "my-activities",
        "mis-evidencias" to "my-evidences",
        "mis-vehiculos" to "my-vehicles",
        "vehiculos" to "vehicles",
        "actividades" to "activities",
        "evidencias" to "evidences",
        "herramientas" to "tools",
        "mantenimiento" to "maintenance",
        "monitoreo" to "noc",
        "soporte" to "support",
        "reclutamiento" to "recruiting",
        "asistencia" to "attendance",
        "multas" to "fines",
        "organigrama" to "orgchart",
        "nomina" to "employee-payments",
        "gastos" to "expenses",
        "banca" to "banking",
        "contabilidad" to "accounting",
        "facturacion" to "invoicing",
        "almacen" to "warehouse",
        "compras" to "procurement",
        "auditoria" to "audit",
        "documentos" to "documents",
        "exportaciones" to "exports",
        "notificaciones" to "notifications-center",
        "calendario" to "calendar",
        "mi-perfil" to "my-profile",
        "aprobaciones" to "approvals",
        "usuarios" to "users",
        "configuracion" to "settings",
        "empleados" to "hr",
        "cvs" to "recruiting",
        "equipos" to "assets",
        "paginas" to "pages",
        "casos" to "cases",
        "noticias" to "news",
        "redes" to "social",
        "contactos" to "contacts",
        "boletin" to "newsletter",
    )

    private val SLUG_REMAPPED_PANELS = setOf("erp", "crm", "ops", "studio", "lab")

    /**
     * Módulos cuya ruta legacy no coincide con la web actual: la reorganización de
     * paneles metió `hr/` y `finance/`, y algunos módulos se mudaron de panel.
     */
    private val MODULE_REMAP = mapOf(
        "/erp/attendance" to "/erp/hr/attendance",
        "/erp/lunch-breaks" to "/erp/hr/lunch-breaks",
        "/erp/my-lunch-breaks" to "/erp/hr/lunch-breaks",
        "/erp/fines" to "/erp/hr/fines",
        "/erp/expenses" to "/erp/finance/expenses",
        "/erp/employee-payments" to "/erp/finance/employee-payments",
        "/erp/viatics" to "/erp/finance/viatics",
        "/erp/analytics" to "/erp/analytics/bi",
        "/erp/stock" to "/erp/warehouse",
        // Módulos que en la web viven en otro panel.
        "/erp/clients" to "/crm/clients",
        "/erp/quotes" to "/crm/quotes",
        "/erp/projects" to "/crm/projects",
        "/erp/recruiting" to "/ops/recruiting",
        "/erp/contact-messages" to "/studio/contacts",
        "/erp/newsletter" to "/studio/newsletter",
        "/ops/client-tickets" to "/ops/support",
        "/crm/quotes/nueva" to "/crm/quotes/new",
    )

    /**
     * Módulos sin equivalente en la web: o son exclusivos de la app, o el panel web
     * nunca los tuvo. Para estos no se ofrece "Abrir en la web" — mandar al usuario
     * a un 404 es peor que no ofrecer el botón.
     */
    private val NO_WEB_EQUIVALENT = setOf(
        "/erp/offline-queue",
        "/erp/my-preferences",
        "/erp/gestion-vendedores",
        "/crm/gestion-vendedores",
        "/crm/equipo-comparativa",
        "/crm/crecimiento",
        "/erp/work-projects",
        "/ops/work-projects",
        "/ops/service-sheets",
        "/erp/pagos",
        "/erp/horas",
    )

    /** Prefijo interno → subdominio canónico. */
    private val CANONICAL_SUBDOMAIN = mapOf(
        "/erp" to "core",
        "/crm" to "sales",
        "/ops" to "ops",
        "/studio" to "studio",
        "/lab" to "lab",
        "/integra" to "integra",
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
     * slugs otra vez (el prefijo puede destapar segmentos nuevos) y por último el
     * remapeo de módulos que cambiaron de sitio.
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

        val deduped = withPanel
            .replace(Regex("^/erp/hr/hr(?=/|$)"), "/erp/hr")
            .replace(Regex("^/erp/erp(?=/|$)"), "/erp")

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
