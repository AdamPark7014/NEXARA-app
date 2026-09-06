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
        "assets", "maintenance", "maintenance-contracts",
        "service-sheets", "client-tickets", "support", "noc", "support-sla",
        "service-clients",
        "cvs", "recruiting",
        "dispatch", "chat",
    )

    private val ERP_KEYS = setOf(
        "dashboard",
        "executive", "approvals", "notifications-center", "bi",
        "attendance", "lunch-breaks", "my-lunch-breaks",
        "hr", "fines", "users", "employee-payments",
        "accounting", "banking", "invoicing", "expenses",
        // La web tiene /erp/finance/viatics (appUrls.erpFinanceViatics), así que
        // viáticos también cuelga de ERP, no solo de OPS.
        "viatics", "my-viatics",
        "warehouse", "stock", "procurement",
        "documents", "audit", "analytics",
        // RH vive en ERP: url-matrix le da `/api/cvs/**` y `/ops/recruiting/**`,
        // pero su panel HOME es `core`. Sin esto, Recursos Humanos entraba a ERP
        // y no veía ni CVs ni reclutamiento — su trabajo diario.
        "cvs", "recruiting",
        "clients", "projects", "cotizaciones", "gestion-vendedores",
        "contact-messages", "news", "newsletter",
        "settings", "my-profile", "my-preferences", "offline-queue",
        "companies", "kb", "exports", "architecture", "calendar", "orgchart", "kpis-hr",
        "chat",
    )

    private val INTEGRA_KEYS = setOf(
        "integra-home",
        "integra-access",
        "integra-events",
        "integra-people",
        "integra-attendance",
        "integra-visitors",
        "integra-alarms",
        "integra-occupancy",
        "integra-devices",
        "integra-sites",
    )

    /** null = sin filtro (todos los módulos console). */
    fun consoleKeysFor(panel: PanelId): Set<String>? = when (panel) {
        PanelId.OPS -> OPS_KEYS
        PanelId.ERP -> ERP_KEYS
        else -> null
    }

    fun integraKeysFor(panel: PanelId): Set<String>? = when (panel) {
        PanelId.INTEGRA -> INTEGRA_KEYS
        else -> null
    }
}
