package mx.nexara.mobile.nativeapp.access

import android.net.Uri
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

sealed class DeepLinkDestination {
    data object Notifications : DeepLinkDestination()

    /** Módulo; [entityId] y [params] abren detalle cuando aplica. */
    data class Module(
        val panel: PanelId,
        val key: String,
        val entityId: Long? = null,
        val params: Map<String, String> = emptyMap(),
    ) : DeepLinkDestination()
}

/**
 * Traduce rutas web (`relatedUrl` de notificaciones, push, `nexara://`) a destinos
 * de la app. Espejo de `coreSurfaceRedirect` (`apps/web/lib/core-surface.ts`):
 *
 * - Core conserva: `/erp/actividades/:id[/evidencias|/historial]`,
 *   `/erp/pizarra[/:userId][?vista=]`, `/erp/mis-actividades`,
 *   `/erp/asistencias[?tab=comidas]`, `/erp/chat`, `/erp/my-profile`, `/erp/clientes`.
 * - Paneles fuera de /erp: el detalle y las evidencias de actividad conservan el
 *   id, «Mi perfil» y «Mis actividades» van a su equivalente, todo lo demás cae en
 *   la casa de Core (Actividades).
 * - El portal (`/tickets`, `/portal`) solo lo abre una cuenta de cliente o de
 *   sucursal; eso lo decide [PanelAccessResolver] al consumir el destino.
 */
object DeepLinkParser {

    /** Parámetro con el id de la persona en `/erp/pizarra/:userId`. */
    const val BOARD_USER_PARAM = "userid"

    /** `/erp/pizarra`: la casa de Core. */
    val CORE_HOME = DeepLinkDestination.Module(panel = PanelId.ERP, key = CoreKeys.ACTIVITIES)

    /** Rutas web tipo `/erp/actividades/123` o URL absoluta con path y query. */
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

    private val ERP_HEADS = setOf("erp", "core")
    private val PORTAL_HEADS = setOf("portal", "tickets")

    /** `NON_ERP_PANEL_RE` de core-surface.ts. */
    private val NON_ERP_HEADS = setOf(
        "ops", "crm", "studio", "lab", "integra", "finance", "hr", "sales", "console",
        "consola", "contabilidad", "people", "operacion", "noc", "support", "ventas",
    )

    private val NOTIFICATION_SEGMENTS = setOf("notifications-center", "notifications", "notificaciones")

    private fun parseSegments(
        segments: List<String>,
        params: Map<String, String>,
    ): DeepLinkDestination? {
        if (segments.isEmpty()) return CORE_HOME
        val lower = segments.map { it.lowercase() }
        if (lower.last() in NOTIFICATION_SEGMENTS) return DeepLinkDestination.Notifications

        val head = lower.first()
        return when (head) {
            in PORTAL_HEADS -> portalDestination(lower.drop(1), params)
            in NON_ERP_HEADS -> legacyPanelDestination(head, lower.drop(1), params)
            in ERP_HEADS -> coreDestination(lower.drop(1), params)
            // `nexara://actividades/5`: sin prefijo de panel, se lee como Core.
            else -> coreDestination(lower, params)
        }
    }

    // ── Core (/erp) ─────────────────────────────────────────────────────────

    private val ACTIVITY_SEGMENTS = setOf("actividades", "activities", "pizarra")
    private val MY_ACTIVITIES_SEGMENTS = setOf("mis-actividades", "my-activities")
    private val EVIDENCE_LIST_SEGMENTS = setOf("my-evidences", "mis-evidencias", "evidences", "evidencias")
    private val ATTENDANCE_SEGMENTS = setOf("asistencias", "asistencia", "attendance")
    private val LUNCH_SEGMENTS = setOf("lunch-breaks", "my-lunch-breaks", "comidas")
    private val PROFILE_SEGMENTS = setOf("my-profile", "mi-perfil")
    private val CLIENT_SEGMENTS = setOf("clientes")

    // ── Módulos de «Más» (`CoreExtraModule`): la app abre su ficha, la web su página. ──
    private val VEHICLE_SEGMENTS = setOf("vehiculos", "vehicles", "mis-vehiculos", "my-vehicles")
    private val TOOL_SEGMENTS = setOf("herramientas", "tools")
    private val WAREHOUSE_SEGMENTS = setOf("almacen", "warehouse", "inventario")
    private val PROJECT_SEGMENTS = setOf("proyectos", "projects")
    private val ORGCHART_SEGMENTS = setOf("organigrama", "orgchart")

    /**
     * Viáticos. La web los tiene bajo `/erp/finance/viatics`, y los enlaces
     * viejos bajo `/ops/viatics` y `/ops/my-viatics`; las tres formas abren la
     * misma pantalla, conservando el id cuando viene.
     */
    private val VIATIC_SEGMENTS = setOf("viatics", "viaticos", "my-viatics", "mis-viaticos")

    private fun coreDestination(parts: List<String>, params: Map<String, String>): DeepLinkDestination {
        val extra = params.filterKeys { it !in ENTITY_ID_QUERY_KEYS }
        val first = parts.firstOrNull() ?: return CORE_HOME
        val second = parts.getOrNull(1)
        val activityId = params.longParam("activityid")

        return when {
            first == "pizarra" -> {
                val personId = second?.toLongOrNull()?.takeIf { it > 0L }
                module(
                    CoreKeys.ACTIVITIES,
                    params = when {
                        // Con persona se abre su día: ahí no hay pestañas que elegir.
                        personId != null -> extra + (BOARD_USER_PARAM to personId.toString())
                        // Quien pidió una vista concreta manda.
                        extra.containsKey("vista") -> extra
                        // «Pizarra» es el equipo. Sin esto el enlace caía en el
                        // valor por defecto de la pantalla, «Mis actividades», y
                        // un aviso que decía «ve a la pizarra» te dejaba viendo
                        // tu propia lista — la misma pantalla que
                        // `mis-actividades`, sin forma de notar la diferencia.
                        else -> extra + ("vista" to "equipo")
                    },
                )
            }
            first in MY_ACTIVITIES_SEGMENTS && activityId != null ->
                module(CoreKeys.ACTIVITIES, entityId = activityId, params = extra)
            first in MY_ACTIVITIES_SEGMENTS -> module(CoreKeys.MY_ACTIVITIES, params = extra)
            first in ACTIVITY_SEGMENTS -> {
                val id = second?.toLongOrNull()?.takeIf { it > 0L } ?: activityId
                if (id == null) return module(CoreKeys.ACTIVITIES, params = extra)
                val tab = parts.getOrNull(2)?.let { ACTIVITY_DETAIL_TABS[it] }
                module(
                    CoreKeys.ACTIVITIES,
                    entityId = id,
                    params = if (tab != null) extra + ("tab" to tab) else extra,
                )
            }
            first in EVIDENCE_LIST_SEGMENTS && activityId != null ->
                module(CoreKeys.ACTIVITIES, entityId = activityId, params = extra + ("tab" to "evidencias"))
            // KPIs del equipo antes que Asistencias: viven dentro de la misma ruta.
            first in ATTENDANCE_SEGMENTS && second == "indicadores" ->
                module(CoreKeys.KPIS_EQUIPO, params = extra)
            first in ATTENDANCE_SEGMENTS -> module(CoreKeys.ATTENDANCE, params = extra)
            first == "cotizaciones" ->
                module(CoreKeys.COTIZACIONES, entityId = second?.toLongOrNull()?.takeIf { it > 0L }, params = extra)
            first in PROJECT_SEGMENTS ->
                module(CoreKeys.PROYECTOS, entityId = second?.toLongOrNull()?.takeIf { it > 0L }, params = extra)
            first in WAREHOUSE_SEGMENTS && second in TOOL_SEGMENTS -> module(CoreKeys.HERRAMIENTAS, params = extra)
            first in WAREHOUSE_SEGMENTS -> module(CoreKeys.ALMACEN, params = extra)
            first in TOOL_SEGMENTS -> module(CoreKeys.HERRAMIENTAS, params = extra)
            first in VEHICLE_SEGMENTS ->
                module(CoreKeys.VEHICULOS, entityId = second?.toLongOrNull()?.takeIf { it > 0L }, params = extra)
            // `/erp/finance/viatics[/:id]` — donde la web tiene viáticos.
            first == "finance" && second in VIATIC_SEGMENTS ->
                module(
                    CoreKeys.VIATICOS,
                    entityId = parts.getOrNull(2)?.toLongOrNull()?.takeIf { it > 0L },
                    params = extra,
                )
            first in VIATIC_SEGMENTS ->
                module(CoreKeys.VIATICOS, entityId = second?.toLongOrNull()?.takeIf { it > 0L }, params = extra)
            first in ORGCHART_SEGMENTS || (first == "hr" && second in ORGCHART_SEGMENTS) ->
                module(CoreKeys.ORGANIGRAMA, params = extra)
            // `/erp/hr/attendance` y `/erp/hr/lunch-breaks` (appUrls viejos) → Asistencias.
            first == "hr" && second in ATTENDANCE_SEGMENTS -> module(CoreKeys.ATTENDANCE, params = extra)
            first in LUNCH_SEGMENTS || (first == "hr" && second in LUNCH_SEGMENTS) ->
                module(CoreKeys.ATTENDANCE, params = extra + ("tab" to "comidas"))
            first == CoreKeys.CHAT -> module(
                CoreKeys.CHAT,
                entityId = second?.toLongOrNull()?.takeIf { it > 0L } ?: params.longParam("channel"),
                params = extra,
            )
            first in PROFILE_SEGMENTS -> module(CoreKeys.MY_PROFILE, params = extra)
            first in CLIENT_SEGMENTS -> module(
                CoreKeys.CLIENTS,
                entityId = second?.toLongOrNull()?.takeIf { it > 0L },
                params = extra,
            )
            else -> CORE_HOME
        }
    }

    // ── Paneles fuera de /erp (coreSurfaceRedirect) ─────────────────────────

    private val LEGACY_ACTIVITY_HEADS = setOf("ops", "operacion")

    private fun legacyPanelDestination(
        head: String,
        parts: List<String>,
        params: Map<String, String>,
    ): DeepLinkDestination {
        val extra = params.filterKeys { it !in ENTITY_ID_QUERY_KEYS }
        val first = parts.firstOrNull()

        if (head in LEGACY_ACTIVITY_HEADS && first in setOf("activities", "actividades")) {
            val id = parts.getOrNull(1)?.takeIf { s -> s.all(Char::isDigit) }?.toLongOrNull()
            if (id != null && id > 0L) {
                val suffix = parts.getOrNull(2)
                return if (suffix == "evidences" || suffix == "evidencias") {
                    module(CoreKeys.ACTIVITIES, entityId = id, params = extra + ("tab" to "evidencias"))
                } else {
                    module(CoreKeys.ACTIVITIES, entityId = id, params = extra)
                }
            }
        }

        val activityId = params.longParam("activityid")
        if (head in LEGACY_ACTIVITY_HEADS && parts.size == 1 && activityId != null) {
            if (first in EVIDENCE_LIST_SEGMENTS) {
                return module(CoreKeys.ACTIVITIES, entityId = activityId, params = extra + ("tab" to "evidencias"))
            }
            if (first in MY_ACTIVITIES_SEGMENTS || first in setOf("activities", "actividades")) {
                return module(CoreKeys.ACTIVITIES, entityId = activityId, params = extra)
            }
        }

        if (parts.lastOrNull() == "my-profile") return module(CoreKeys.MY_PROFILE)
        if (head in LEGACY_ACTIVITY_HEADS && parts.size == 1 && first in MY_ACTIVITIES_SEGMENTS) {
            return module(CoreKeys.MY_ACTIVITIES)
        }
        // Viáticos vive en `/erp/finance/viatics`, y «finance» es un panel viejo:
        // `/finance/viatics/:id` y `/ops/viatics/:id` abren la misma pantalla.
        if (first in VIATIC_SEGMENTS && (head == "ops" || head == "finance")) {
            return module(
                CoreKeys.VIATICOS,
                entityId = parts.getOrNull(1)?.toLongOrNull()?.takeIf { it > 0L }
                    ?: params.longParam("highlight"),
                params = extra,
            )
        }

        // Módulos de OPS que se mudaron a Core (`coreSurfaceRedirect` → `MOVED_TO_CORE` en la web):
        // vehículos, herramientas y proyectos abren su ficha de «Más».
        if (head == "ops") {
            when {
                first in VEHICLE_SEGMENTS -> return module(
                    CoreKeys.VEHICULOS,
                    entityId = parts.getOrNull(1)?.toLongOrNull()?.takeIf { it > 0L },
                    params = extra,
                )
                first in TOOL_SEGMENTS -> return module(CoreKeys.HERRAMIENTAS, params = extra)
                first in PROJECT_SEGMENTS -> return module(
                    CoreKeys.PROYECTOS,
                    entityId = parts.getOrNull(1)?.toLongOrNull()?.takeIf { it > 0L },
                    params = extra,
                )
            }
        }
        return CORE_HOME
    }

    // ── Portal de clientes ──────────────────────────────────────────────────

    private val PORTAL_KEY_ALIASES = mapOf(
        "sucursales" to "branches",
        "solicitudes" to "requests",
        "inventarios" to "inventories",
        "feedback" to "feedback-pending",
        "mi-perfil" to "profile",
        "my-profile" to "profile",
    )

    private fun portalDestination(parts: List<String>, params: Map<String, String>): DeepLinkDestination {
        val pathId = parts.lastOrNull()?.takeIf { it.all(Char::isDigit) }?.toLongOrNull()
        val keyParts = if (pathId != null) parts.dropLast(1) else parts
        val raw = keyParts.lastOrNull() ?: "portal"
        val key = PORTAL_KEY_ALIASES[raw] ?: raw
        return DeepLinkDestination.Module(
            panel = PanelId.PORTAL,
            key = key,
            entityId = pathId ?: params.longParam("highlight") ?: params.longParam("id"),
            params = params.filterKeys { it !in ENTITY_ID_QUERY_KEYS },
        )
    }

    // ── Utilidades ──────────────────────────────────────────────────────────

    private val ENTITY_ID_QUERY_KEYS = setOf("highlight", "id", "channel", "activityid")

    /**
     * Sufijo de `/erp/actividades/{id}/<sufijo>` → clave de pestaña del detalle.
     * La web conserva `evidencias` e `historial`; los sufijos en inglés son de
     * los enlaces viejos de OPS.
     */
    private val ACTIVITY_DETAIL_TABS = mapOf(
        "evidencias" to "evidencias",
        "evidences" to "evidencias",
        "historial" to "historial",
        "history" to "historial",
    )

    private fun module(
        key: String,
        entityId: Long? = null,
        params: Map<String, String> = emptyMap(),
    ) = DeepLinkDestination.Module(panel = PanelId.ERP, key = key, entityId = entityId, params = params)

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
}
