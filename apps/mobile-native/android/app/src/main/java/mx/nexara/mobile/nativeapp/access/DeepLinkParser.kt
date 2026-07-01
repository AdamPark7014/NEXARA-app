package mx.nexara.mobile.nativeapp.access

import android.net.Uri
import mx.nexara.mobile.nativeapp.access.PanelId.CRM
import mx.nexara.mobile.nativeapp.access.PanelId.ERP
import mx.nexara.mobile.nativeapp.access.PanelId.LAB
import mx.nexara.mobile.nativeapp.access.PanelId.OPS
import mx.nexara.mobile.nativeapp.access.PanelId.PORTAL
import mx.nexara.mobile.nativeapp.access.PanelId.STUDIO

sealed class DeepLinkDestination {
    data object Notifications : DeepLinkDestination()
    data class Module(val panel: PanelId, val key: String) : DeepLinkDestination()
}

object DeepLinkParser {
    private val segmentAliases = mapOf(
        "clientes" to "clients",
        "oportunidades" to "oportunidades",
        "productos" to "productos",
        "proyectos" to "projects",
        "viaticos" to "viatics",
        "mis-viaticos" to "my-viatics",
        "actividades" to "activities",
        "mis-actividades" to "my-activities",
        "evidencias" to "evidences",
        "mis-evidencias" to "my-evidences",
        "vehiculos" to "vehicles",
        "herramientas" to "tools",
        "asistencia" to "attendance",
        "empleados" to "hr",
        "multas" to "fines",
        "gastos" to "expenses",
        "banca" to "banking",
        "facturacion" to "invoicing",
        "contabilidad" to "accounting",
        "almacen" to "warehouse",
        "compras" to "procurement",
        "auditoria" to "audit",
        "notificaciones" to "notifications-center",
        "notifications-center" to "notifications-center",
        "mi-perfil" to "my-profile",
        "configuracion" to "settings",
        "usuarios" to "users",
        "leads" to "leads",
        "noticias" to "news",
        "dashboard" to "dashboard",
        "flags" to "flags",
        "health" to "health",
        "branches" to "branches",
        "sucursales" to "branches",
        "requests" to "requests",
        "solicitudes" to "requests",
        "inventories" to "inventories",
        "inventarios" to "inventories",
        "feedback" to "feedback-pending",
        "soporte" to "client-tickets",
        "support" to "client-tickets",
        "client-tickets" to "client-tickets",
        "executive" to "executive",
        "approvals" to "approvals",
        "bi" to "bi",
        "analytics" to "analytics",
        "noc" to "noc",
        "sla" to "support-sla",
        "support-sla" to "support-sla",
        "maintenance-contracts" to "maintenance-contracts",
        "contratos" to "maintenance-contracts",
        "companies" to "companies",
        "kb" to "kb",
        "exports" to "exports",
        "architecture" to "architecture",
        "calendar" to "calendar",
        "orgchart" to "orgchart",
        "kpis-hr" to "kpis-hr",
        "kpis" to "kpis-hr",
        "service-clients" to "service-clients",
        "clientes-servicio" to "service-clients",
        "plantillas" to "plantillas",
        "templates" to "plantillas",
    )

    fun parse(uri: Uri?): DeepLinkDestination? {
        if (uri == null) return null
        val segments = buildList {
            val host = uri.host?.lowercase()
            val pathSegs = uri.pathSegments.orEmpty()
            if (!host.isNullOrBlank() && !host.contains(".")) {
                add(host)
                addAll(pathSegs)
            } else {
                addAll(pathSegs)
            }
        }.filter { it.isNotBlank() }
        if (segments.isEmpty()) return null

        val joined = segments.joinToString("/")
        if (joined == "notifications-center" || joined == "notifications" || segments.last() == "notifications-center") {
            return DeepLinkDestination.Notifications
        }

        val head = segments.first().lowercase()
        val (panel, moduleParts) = when (head) {
            "erp", "console", "people", "contabilidad" -> ERP to segments.drop(1)
            "ops", "operacion", "noc", "support" -> OPS to segments.drop(1)
            "crm", "ventas" -> CRM to segments.drop(1)
            "studio", "web" -> STUDIO to segments.drop(1)
            "lab" -> LAB to segments.drop(1)
            "portal", "tickets" -> PORTAL to segments.drop(1)
            else -> ERP to segments
        }

        val rawKey = moduleParts.lastOrNull() ?: "dashboard"
        val key = segmentAliases[rawKey.lowercase()] ?: rawKey
        if (key == "notifications-center") return DeepLinkDestination.Notifications
        return DeepLinkDestination.Module(panel = panel, key = key)
    }
}
