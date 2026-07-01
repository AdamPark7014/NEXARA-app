package mx.nexara.mobile.nativeapp.access

/**
 * Paneles consolidados — espejo de apps/web/lib/access-matrix.ts (PANELS).
 */
enum class PanelId(
    val key: String,
    val displayName: String,
    val icon: String,
    val tagline: String,
    val accentArgb: Long,
    val legacyRoute: String,
) {
    ERP(
        key = "erp",
        displayName = "NEXARA ERP",
        icon = "⚙️",
        tagline = "Administración, finanzas, RH y gobierno",
        accentArgb = 0xFF0EA5E9,
        legacyRoute = "console",
    ),
    CRM(
        key = "crm",
        displayName = "NEXARA CRM",
        icon = "📈",
        tagline = "Pipeline comercial y clientes",
        accentArgb = 0xFF10B981,
        legacyRoute = "ventas",
    ),
    OPS(
        key = "ops",
        displayName = "NEXARA OPS",
        icon = "🚀",
        tagline = "Campo, NOC, soporte y mantenimiento",
        accentArgb = 0xFFF97316,
        legacyRoute = "operacion",
    ),
    STUDIO(
        key = "studio",
        displayName = "NEXARA STUDIO",
        icon = "🎨",
        tagline = "Marca, sitio público y casos",
        accentArgb = 0xFFA855F7,
        legacyRoute = "web",
    ),
    LAB(
        key = "lab",
        displayName = "NEXARA LAB",
        icon = "🧪",
        tagline = "Sandbox técnico y API health",
        accentArgb = 0xFF64748B,
        legacyRoute = "lab",
    ),
    PORTAL(
        key = "portal",
        displayName = "Portal clientes",
        icon = "🎫",
        tagline = "Tickets, sucursales e inventarios",
        accentArgb = 0xFF0D9488,
        legacyRoute = "tickets",
    ),
    ;

    companion object {
        fun fromKey(key: String): PanelId? = entries.firstOrNull { it.key == key || it.legacyRoute == key }

        /** Mapa panel legacy mobile → panel consolidado web. */
        fun fromLegacy(legacy: String): PanelId = when (legacy) {
            "console", "contabilidad", "people" -> ERP
            "ventas" -> CRM
            "operacion", "noc", "support" -> OPS
            "web" -> STUDIO
            "tickets" -> PORTAL
            "lab" -> LAB
            else -> entries.firstOrNull { it.key == legacy } ?: ERP
        }
    }
}
