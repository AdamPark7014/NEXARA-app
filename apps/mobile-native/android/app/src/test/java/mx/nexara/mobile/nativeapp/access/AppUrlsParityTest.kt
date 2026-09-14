package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog
import org.junit.Assert.fail
import org.junit.Test

/**
 * Paridad app ↔ web.
 *
 * `apps/api/src/common/app-urls.ts` es la fuente de verdad de los `relatedUrl` que
 * el backend mete en notificaciones, calendario y alertas. Esas mismas URLs llegan
 * a la app por push y por deep link, así que **toda** ruta que el API sepa emitir
 * tiene que aterrizar en un módulo que la app sepa abrir.
 *
 * Core-only (apps/web/lib/core-surface.ts): las rutas `/ops/...` ya no abren un
 * panel OPS; aterrizan en ERP, y las de evidencias con `activityId` abren el
 * detalle de esa actividad.
 *
 * Cada caso de aquí es una llamada real de `appUrls`. Si añades una función allí,
 * añade su fila aquí: es lo único que evita que una notificación abra la nada.
 *
 * El test acumula todos los fallos y los reporta juntos — así una sola corrida
 * dice exactamente qué rutas están rotas, en vez de morir en la primera.
 */
class AppUrlsParityTest {

    /**
     * @param url        lo que devuelve appUrls (ver app-urls.ts)
     * @param panel      panel esperado
     * @param key        clave de módulo nativa esperada
     * @param entityId   id esperado, o null si la ruta no lleva entidad
     */
    private data class Case(
        val source: String,
        val url: String,
        val panel: PanelId,
        val key: String,
        val entityId: Long?,
    )

    private val cases = listOf(
        // ── CRM (appUrls.crm*) ───────────────────────────────────────────────
        Case("crmOpportunity", "/crm/opportunities/1", PanelId.CRM, "oportunidades", 1L),
        Case("crmLead", "/crm/leads?highlight=1", PanelId.CRM, "leads", 1L),
        Case("crmClient", "/crm/clients/1", PanelId.CRM, "clientes", 1L),
        Case("crmQuote", "/crm/quotes/1", PanelId.CRM, "cotizaciones", 1L),
        Case("crmProject", "/crm/projects/1", PanelId.CRM, "proyectos", 1L),
        Case("crmTender", "/crm/tenders?highlight=1", PanelId.CRM, "licitaciones", 1L),

        // ── OPS legado (appUrls.ops*) → Core ERP ─────────────────────────────
        Case("opsActivity", "/ops/activities/1", PanelId.ERP, "activities", 1L),
        Case("opsActivityEvidences", "/ops/activities/1/evidences", PanelId.ERP, "activities", 1L),
        Case("opsMyEvidences", "/ops/my-evidences?activityId=1", PanelId.ERP, "activities", 1L),
        Case("opsEvidencesReview", "/ops/evidences?activityId=1", PanelId.ERP, "activities", 1L),
        Case("opsViatic", "/ops/viatics?highlight=1", PanelId.ERP, "viatics", 1L),
        Case("opsMyViatics", "/ops/my-viatics?highlight=1", PanelId.ERP, "my-viatics", 1L),
        Case("opsMyVehicles", "/ops/my-vehicles?highlight=1", PanelId.ERP, "my-vehicles", 1L),
        Case("opsProject", "/ops/projects/1", PanelId.ERP, "projects", 1L),
        Case("opsMaintenance", "/ops/maintenance?woId=1", PanelId.ERP, "maintenance", 1L),
        Case("opsTools", "/ops/tools?tab=requests&highlight=1", PanelId.ERP, "tools", 1L),
        Case("opsToolsRenewals", "/ops/tools?tab=renewals&highlight=1", PanelId.ERP, "tools", 1L),
        Case("opsVehicles", "/ops/vehicles?tab=requests&highlight=1", PanelId.ERP, "vehicles", 1L),
        Case("opsActivities", "/ops/activities", PanelId.ERP, "activities", null),
        Case(
            "opsMaintenanceContracts",
            "/ops/maintenance/contracts?highlight=1",
            PanelId.ERP,
            "maintenance-contracts",
            1L,
        ),
        Case("opsSupport", "/ops/support/1", PanelId.ERP, "support", 1L),
        Case("opsSupportNew", "/ops/support/new?activityId=1", PanelId.ERP, "support", null),

        // ── Core (/erp) ──────────────────────────────────────────────────────
        Case("coreActivity", "/erp/actividades/1", PanelId.ERP, "activities", 1L),
        Case("coreActivityEvidences", "/erp/actividades/1/evidencias", PanelId.ERP, "activities", 1L),
        Case("coreActivityHistory", "/erp/actividades/1/historial", PanelId.ERP, "activities", 1L),
        Case("corePizarra", "/erp/pizarra", PanelId.ERP, "activities", null),
        Case("coreMisActividades", "/erp/mis-actividades", PanelId.ERP, "my-activities", null),
        Case("coreAsistencias", "/erp/asistencias", PanelId.ERP, "attendance", null),
        Case("coreMyProfile", "/erp/my-profile", PanelId.ERP, "my-profile", null),

        // ── ERP (appUrls.erp*) ───────────────────────────────────────────────
        Case("erpFines", "/erp/hr/fines?highlight=1", PanelId.ERP, "fines", 1L),
        Case("erpAttendance", "/erp/hr/attendance?tab=day&highlight=1", PanelId.ERP, "attendance", 1L),
        Case("erpAttendanceLunch", "/erp/hr/lunch-breaks", PanelId.ERP, "lunch-breaks", null),
        Case("erpExpenses", "/erp/finance/expenses?highlight=1", PanelId.ERP, "expenses", 1L),
        Case("erpUsers", "/erp/users?highlight=1", PanelId.ERP, "users", 1L),
        Case("erpProcurement", "/erp/procurement?tab=orders&id=1", PanelId.ERP, "procurement", 1L),
        Case("erpProcurementReceipt", "/erp/procurement?tab=receipts&poId=1", PanelId.ERP, "procurement", 1L),
        Case("erpWarehouse", "/erp/warehouse?productId=1", PanelId.ERP, "warehouse", 1L),
        Case("erpAccounting", "/erp/accounting?highlight=1", PanelId.ERP, "accounting", 1L),
        Case("erpInvoicing", "/erp/invoicing?highlight=1", PanelId.ERP, "invoicing", 1L),
        Case("erpApprovals", "/erp/approvals?highlight=1", PanelId.ERP, "approvals", 1L),
        Case("erpFinanceViatics", "/erp/finance/viatics?highlight=1", PanelId.ERP, "viatics", 1L),
        Case("erpLunchBreaks", "/erp/hr/lunch-breaks?highlight=1", PanelId.ERP, "lunch-breaks", 1L),

        // ── INTEGRA ──────────────────────────────────────────────────────────
        Case("integraAccess", "/integra/access", PanelId.INTEGRA, "integra-access", null),
        Case("integraEvents", "/integra/events", PanelId.INTEGRA, "integra-events", null),
        Case("integraAlarms", "/integra/alarms", PanelId.INTEGRA, "integra-alarms", null),
        Case("integraOccupancy", "/integra/occupancy", PanelId.INTEGRA, "integra-occupancy", null),
        Case("integraDevices", "/integra/devices", PanelId.INTEGRA, "integra-devices", null),
        Case("integraSites", "/integra/sites", PanelId.INTEGRA, "integra-sites", null),
    )

    @Test
    fun everyApiUrlResolvesToTheExpectedNativeModule() {
        val problems = mutableListOf<String>()

        for (case in cases) {
            val dest = DeepLinkParser.parseWebPath(case.url)
            if (dest !is DeepLinkDestination.Module) {
                problems += "${case.source}  ${case.url}  ->  no resuelve a un módulo (dio $dest)"
                continue
            }
            if (dest.panel != case.panel) {
                problems += "${case.source}  ${case.url}  ->  panel ${dest.panel}, se esperaba ${case.panel}"
            }
            if (dest.key != case.key) {
                problems += "${case.source}  ${case.url}  ->  key '${dest.key}', se esperaba '${case.key}'"
            }
            if (dest.entityId != case.entityId) {
                problems += "${case.source}  ${case.url}  ->  entityId ${dest.entityId}, se esperaba ${case.entityId}"
            }
        }

        if (problems.isNotEmpty()) {
            fail("Rutas del API que la app no resuelve igual que la web:\n" + problems.joinToString("\n"))
        }
    }

    /** La clave resuelta tiene que existir de verdad en el catálogo del panel. */
    @Test
    fun everyResolvedKeyExistsInTheModuleCatalog() {
        val problems = mutableListOf<String>()

        for (case in cases) {
            val dest = DeepLinkParser.parseWebPath(case.url) as? DeepLinkDestination.Module ?: continue
            val catalogKeys = catalogKeysFor(dest.panel)
            if (catalogKeys != null && dest.key !in catalogKeys) {
                problems += "${case.source}  ${case.url}  ->  '${dest.key}' no existe en el catálogo de ${dest.panel}"
            }
        }

        if (problems.isNotEmpty()) {
            fail("Módulos inexistentes a los que apunta una notificación:\n" + problems.joinToString("\n"))
        }
    }

    private fun catalogKeysFor(panel: PanelId): Set<String>? = when (panel) {
        PanelId.CRM -> ModuleCatalog.ventas.map { it.key }.toSet()
        PanelId.STUDIO -> ModuleCatalog.studio.map { it.key }.toSet()
        PanelId.LAB -> ModuleCatalog.lab.map { it.key }.toSet()
        PanelId.INTEGRA -> ModuleCatalog.integra.map { it.key }.toSet()
        PanelId.ERP, PanelId.OPS -> {
            val console = ModuleCatalog.console.map { it.key }.toSet()
            ModulePanelMap.consoleKeysFor(panel)?.intersect(console) ?: console
        }
        else -> null
    }
}
