package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.ui.console.ConsoleRoutes
import mx.nexara.mobile.nativeapp.ui.console.CoreExtraModule
import org.junit.Assert.fail
import org.junit.Test

/**
 * Paridad app ↔ web de los `relatedUrl` que emite el API.
 *
 * `apps/api/src/common/app-urls.ts` es la fuente de verdad de las URLs que el
 * backend mete en notificaciones y push. Core-only (`apps/web/lib/core-surface.ts`):
 * las rutas de Core se abren tal cual, el detalle/evidencias de actividad de OPS
 * conserva el id, y todo lo demás aterriza en la casa de Core (Actividades) —
 * igual que el middleware de la web.
 *
 * El test acumula todos los fallos y los reporta juntos.
 */
class AppUrlsParityTest {

    private data class Case(
        val source: String,
        val url: String,
        val panel: PanelId,
        val key: String,
        val entityId: Long?,
    )

    private fun home(source: String, url: String) = Case(source, url, PanelId.ERP, "activities", null)

    private val cases = listOf(
        // ── Core (/erp) ──────────────────────────────────────────────────────
        Case("coreActivity", "/erp/actividades/1", PanelId.ERP, "activities", 1L),
        Case("coreActivityEvidences", "/erp/actividades/1/evidencias", PanelId.ERP, "activities", 1L),
        Case("coreActivityHistory", "/erp/actividades/1/historial", PanelId.ERP, "activities", 1L),
        Case("corePizarra", "/erp/pizarra", PanelId.ERP, "activities", null),
        Case("coreMisActividades", "/erp/mis-actividades", PanelId.ERP, "my-activities", null),
        Case("coreAsistencias", "/erp/asistencias", PanelId.ERP, "attendance", null),
        Case("coreChat", "/erp/chat?channel=1", PanelId.ERP, "chat", 1L),
        Case("coreMyProfile", "/erp/my-profile", PanelId.ERP, "my-profile", null),
        Case("coreClientes", "/erp/clientes", PanelId.ERP, "erp-clients", null),

        // ── OPS legado que conserva la actividad ─────────────────────────────
        Case("opsActivity", "/ops/activities/1", PanelId.ERP, "activities", 1L),
        Case("opsActivityEvidences", "/ops/activities/1/evidences", PanelId.ERP, "activities", 1L),
        Case("opsMyEvidences", "/ops/my-evidences?activityId=1", PanelId.ERP, "activities", 1L),
        Case("opsEvidencesReview", "/ops/evidences?activityId=1", PanelId.ERP, "activities", 1L),
        Case("opsActivities", "/ops/activities", PanelId.ERP, "activities", null),

        // ── Asistencia vieja → Asistencias ───────────────────────────────────
        Case("erpAttendance", "/erp/hr/attendance?tab=day&highlight=1", PanelId.ERP, "attendance", null),
        Case("erpLunchBreaks", "/erp/hr/lunch-breaks?highlight=1", PanelId.ERP, "attendance", null),

        // ── Todo lo que ya no existe → casa de Core ──────────────────────────
        home("crmOpportunity", "/crm/opportunities/1"),
        home("crmLead", "/crm/leads?highlight=1"),
        home("crmClient", "/crm/clients/1"),
        home("crmQuote", "/crm/quotes/1"),
        home("opsMaintenance", "/ops/maintenance?woId=1"),
        home("opsSupport", "/ops/support/1"),
        home("erpFines", "/erp/hr/fines?highlight=1"),
        home("erpExpenses", "/erp/finance/expenses?highlight=1"),
        home("erpUsers", "/erp/users?highlight=1"),
        home("erpProcurement", "/erp/procurement?tab=orders&id=1"),
        home("erpApprovals", "/erp/approvals?highlight=1"),
        home("integraAccess", "/integra/access"),

        // ── Módulos de «Más»: el aviso abre su ficha, no la casa de Core ─────
        Case("erpMisVehiculos", "/erp/vehiculos/mis-vehiculos?highlight=1", PanelId.ERP, CoreKeys.VEHICULOS, null),
        Case("erpVehiculos", "/erp/vehiculos?tab=requests&highlight=1", PanelId.ERP, CoreKeys.VEHICULOS, null),
        Case("erpHerramientas", "/erp/almacen/herramientas?tab=requests&highlight=1", PanelId.ERP, CoreKeys.HERRAMIENTAS, null),
        Case("erpAlmacen", "/erp/almacen?productId=1", PanelId.ERP, CoreKeys.ALMACEN, null),
        Case("erpOrganigrama", "/erp/organigrama", PanelId.ERP, CoreKeys.ORGANIGRAMA, null),
        Case("erpCotizaciones", "/erp/cotizaciones/1", PanelId.ERP, CoreKeys.COTIZACIONES, 1L),
        // Enlaces viejos de OPS que la web ya manda a Core.
        Case("opsProject", "/ops/projects/1", PanelId.ERP, CoreKeys.PROYECTOS, 1L),
        Case("opsMyVehicles", "/ops/my-vehicles?highlight=1", PanelId.ERP, CoreKeys.VEHICULOS, null),
        Case("opsTools", "/ops/tools?tab=requests&highlight=1", PanelId.ERP, CoreKeys.HERRAMIENTAS, null),
        Case("erpWarehouse", "/erp/warehouse?productId=1", PanelId.ERP, CoreKeys.ALMACEN, null),
        // Viáticos: el aviso trae el id y abre ESE viático, no la lista. Antes
        // de tener pantalla caía en la casa de Core.
        Case("opsViatic", "/ops/viatics?highlight=1", PanelId.ERP, CoreKeys.VIATICOS, 1L),
        Case("erpViatics", "/erp/finance/viatics", PanelId.ERP, CoreKeys.VIATICOS, null),
        Case("erpViaticDetail", "/erp/finance/viatics/1", PanelId.ERP, CoreKeys.VIATICOS, 1L),
    )

    @Test
    fun everyApiUrlResolvesLikeTheWeb() {
        val problems = mutableListOf<String>()
        for (case in cases) {
            val dest = DeepLinkParser.parseWebPath(case.url)
            if (dest !is DeepLinkDestination.Module) {
                problems += "${case.source}  ${case.url}  ->  no resuelve a un módulo (dio $dest)"
                continue
            }
            if (dest.panel != case.panel) problems += "${case.source}  ${case.url}  ->  panel ${dest.panel}, se esperaba ${case.panel}"
            if (dest.key != case.key) problems += "${case.source}  ${case.url}  ->  key '${dest.key}', se esperaba '${case.key}'"
            if (dest.entityId != case.entityId) problems += "${case.source}  ${case.url}  ->  entityId ${dest.entityId}, se esperaba ${case.entityId}"
        }
        if (problems.isNotEmpty()) {
            fail("Rutas del API que la app no resuelve igual que la web:\n" + problems.joinToString("\n"))
        }
    }

    /**
     * Toda clave de Core resuelta tiene que tener pantalla en el NavHost: una pestaña
     * ([ConsoleRoutes.forModuleKey]) o su ficha de «Más» ([CoreExtraModule]).
     */
    @Test
    fun everyResolvedCoreKeyHasARoute() {
        val problems = cases.mapNotNull { case ->
            val dest = DeepLinkParser.parseWebPath(case.url) as? DeepLinkDestination.Module ?: return@mapNotNull null
            val tieneRuta = ConsoleRoutes.forModuleKey(dest.key) != null || CoreExtraModule.fromKey(dest.key) != null
            if (dest.panel == PanelId.ERP && !tieneRuta) {
                "${case.source}  ${case.url}  ->  '${dest.key}' no tiene ruta en Core"
            } else {
                null
            }
        }
        if (problems.isNotEmpty()) fail(problems.joinToString("\n"))
    }
}
