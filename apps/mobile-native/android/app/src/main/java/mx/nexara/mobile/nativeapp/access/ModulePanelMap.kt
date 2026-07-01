package mx.nexara.mobile.nativeapp.access

/**
 * Qué módulos del catálogo console pertenecen a ERP vs OPS (paridad web).
 */
object ModulePanelMap {
    private val OPS_KEYS = setOf(
        "dashboard",
        "activities", "my-activities",
        "evidences", "my-evidences",
        "viatics", "my-viatics",
        "vehicles", "my-vehicles",
        "gps", "tools",
        "projects", "work-projects",
        "assets", "maintenance",
        "service-sheets", "client-tickets",
        "cvs",
    )

    private val ERP_KEYS = setOf(
        "dashboard",
        "attendance", "lunch-breaks", "my-lunch-breaks",
        "hr", "fines", "users", "employee-payments",
        "accounting", "banking", "invoicing", "expenses",
        "warehouse", "stock", "procurement",
        "documents", "audit", "analytics",
        "clients", "projects", "cotizaciones", "gestion-vendedores",
        "contact-messages", "news", "newsletter",
        "settings", "my-profile", "my-preferences",
    )

    /** null = sin filtro (todos los módulos console). */
    fun consoleKeysFor(panel: PanelId): Set<String>? = when (panel) {
        PanelId.OPS -> OPS_KEYS
        PanelId.ERP -> ERP_KEYS
        else -> null
    }
}
