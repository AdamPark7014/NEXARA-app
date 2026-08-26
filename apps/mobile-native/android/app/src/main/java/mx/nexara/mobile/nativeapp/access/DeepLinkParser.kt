package mx.nexara.mobile.nativeapp.access

import android.net.Uri
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import mx.nexara.mobile.nativeapp.access.PanelId.CRM
import mx.nexara.mobile.nativeapp.access.PanelId.ERP
import mx.nexara.mobile.nativeapp.access.PanelId.LAB
import mx.nexara.mobile.nativeapp.access.PanelId.OPS
import mx.nexara.mobile.nativeapp.access.PanelId.PORTAL
import mx.nexara.mobile.nativeapp.access.PanelId.STUDIO

sealed class DeepLinkDestination {
    data object Notifications : DeepLinkDestination()

    /** Selector de paneles (hub principal). */
    data object PanelHub : DeepLinkDestination()

    /** Módulo de panel; [entityId] y [params] abren detalle cuando aplica. */
    data class Module(
        val panel: PanelId,
        val key: String,
        val entityId: Long? = null,
        val params: Map<String, String> = emptyMap(),
    ) : DeepLinkDestination()
}

object DeepLinkParser {
    private val segmentAliases = mapOf(
        "clientes" to "clients",
        "oportunidades" to "oportunidades",
        "opportunities" to "oportunidades",
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
        "cola-offline" to "offline-queue",
        "offline" to "offline-queue",
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
        "quotes" to "cotizaciones",
        "cotizacion" to "cotizaciones",
        "cotizaciones" to "cotizaciones",
        "smart-quote" to "smart-quote",
        "cotizar" to "smart-quote",
        "nueva-cotizacion" to "smart-quote",
        "cotizacion-nueva" to "smart-quote",
        "chat" to "chat",
        "dispatch" to "dispatch",
        "tickets" to "tickets",
    )

    /** Rutas web tipo `/crm/opportunities/123` o URL absoluta con path y query. */
    fun parseWebPath(pathOrUrl: String): DeepLinkDestination? {
        val trimmed = pathOrUrl.trim()
        if (trimmed.isBlank()) return null

        val (pathPart, queryPart) = when {
            trimmed.startsWith("http://") || trimmed.startsWith("https://") -> {
                val uri = Uri.parse(trimmed)
                Pair(uri.path?.trim('/') ?: "", uri.encodedQuery)
            }
            else -> {
                val qIdx = trimmed.indexOf('?')
                if (qIdx >= 0) {
                    Pair(trimmed.substring(0, qIdx).trim('/'), trimmed.substring(qIdx + 1))
                } else {
                    Pair(trimmed.trim('/'), null)
                }
            }
        }

        val params = parseQueryParams(queryPart)
        val segments = pathPart.split('/').filter { it.isNotBlank() }
        if (segments.isEmpty() && params.isEmpty()) return null
        return parseSegments(segments, params)
    }

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

        val params = uri.queryParameterNames.orEmpty()
            .mapNotNull { name ->
                uri.getQueryParameter(name)?.let { name.lowercase() to it }
            }
            .toMap()

        if (segments.isEmpty() && params.isEmpty()) return null
        return parseSegments(segments, params)
    }

    private fun parseSegments(
        segments: List<String>,
        params: Map<String, String> = emptyMap(),
    ): DeepLinkDestination? {
        if (segments.isEmpty()) return null

        val joined = segments.joinToString("/")
        if (joined == "notifications-center" || joined == "notifications" || segments.last() == "notifications-center") {
            return DeepLinkDestination.Notifications
        }
        if (joined == "panels" || joined == "paneles" || segments.singleOrNull() in setOf("panels", "paneles")) {
            return DeepLinkDestination.PanelHub
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

        val activityDetail = parseActivityDetailPath(moduleParts)
        if (activityDetail != null) {
            val extraParams = params.filterKeys { it !in ENTITY_ID_QUERY_KEYS }
            return DeepLinkDestination.Module(
                panel = panel,
                key = activityDetail.key,
                entityId = activityDetail.entityId,
                params = extraParams + ("tab" to activityDetail.tab),
            )
        }

        val pathEntityId = moduleParts.lastOrNull()
            ?.takeIf { it.all(Char::isDigit) }
            ?.toLongOrNull()

        val parts = moduleParts.let { p ->
            if (pathEntityId != null && p.isNotEmpty()) p.dropLast(1) else p
        }

        val rawKey = parts.lastOrNull() ?: "dashboard"
        val key = segmentAliases[rawKey.lowercase()] ?: rawKey.lowercase()

        if (key == "notifications-center") return DeepLinkDestination.Notifications
        if (key == "panels" || key == "paneles") return DeepLinkDestination.PanelHub

        val entityId = resolveEntityId(key, pathEntityId, params)
        val extraParams = params.filterKeys { it !in ENTITY_ID_QUERY_KEYS }

        return DeepLinkDestination.Module(
            panel = panel,
            key = key,
            entityId = entityId,
            params = extraParams,
        )
    }

    private val ENTITY_ID_QUERY_KEYS = setOf("highlight", "id", "channel", "activityid")

    private fun resolveEntityId(
        key: String,
        pathEntityId: Long?,
        params: Map<String, String>,
    ): Long? {
        pathEntityId?.let { return it }
        return when (key) {
            "chat" -> params.longParam("channel")
            "my-evidences", "evidences" -> params.longParam("activityid")
            else -> params.longParam("highlight") ?: params.longParam("id")
        }
    }

    private fun parseQueryParams(query: String?): Map<String, String> {
        if (query.isNullOrBlank()) return emptyMap()
        return query.split('&')
            .mapNotNull { pair ->
                val idx = pair.indexOf('=')
                if (idx <= 0) return@mapNotNull null
                val name = URLDecoder.decode(pair.substring(0, idx), StandardCharsets.UTF_8).lowercase()
                val value = URLDecoder.decode(pair.substring(idx + 1), StandardCharsets.UTF_8)
                name to value
            }
            .toMap()
    }

    private fun Map<String, String>.longParam(name: String): Long? =
        this[name]?.toLongOrNull()?.takeIf { it > 0L }

    private val ACTIVITY_DETAIL_SUFFIXES = setOf(
        "operacion", "info", "evidencias", "viaticos", "equipo",
        "materiales", "historial", "incidencias", "aprobaciones", "edit",
    )

    private data class ActivityDetailPath(val key: String, val entityId: Long, val tab: String)

    private fun parseActivityDetailPath(moduleParts: List<String>): ActivityDetailPath? {
        if (moduleParts.size < 2) return null
        val tab = moduleParts.last().lowercase()
        if (!ACTIVITY_DETAIL_SUFFIXES.contains(tab)) return null
        val idSeg = moduleParts[moduleParts.size - 2]
        if (!idSeg.all(Char::isDigit)) return null
        val entityId = idSeg.toLongOrNull() ?: return null
        val prefixParts = moduleParts.dropLast(2)
        val rawKey = prefixParts.lastOrNull() ?: "activities"
        val key = segmentAliases[rawKey.lowercase()] ?: rawKey.lowercase()
        if (key !in setOf("activities", "my-activities")) return null
        return ActivityDetailPath(key = key, entityId = entityId, tab = tab)
    }
}
