package mx.nexara.mobile.nativeapp.ui.modules

import androidx.compose.runtime.Composable
import mx.nexara.mobile.nativeapp.ui.common.SimpleRow

/**
 * Pantallas de módulos que listan payloads genéricos (Map<String, Any?>).
 * Se construyen con GenericListModuleScreen y extraen campos comunes
 * (id/title/subtitle/status/createdAt/etc.) de manera defensiva.
 */

private fun s(m: Map<String, Any?>, vararg keys: String): String? {
    for (k in keys) {
        val v = m[k]
        if (v != null) {
            val str = when (v) {
                is String -> v
                is Number -> v.toString()
                is Boolean -> v.toString()
                else -> v.toString()
            }
            if (str.isNotBlank() && str != "null") return str
        }
    }
    return null
}

private fun id(m: Map<String, Any?>): String =
    s(m, "id", "uuid", "_id", "folio", "code", "number") ?: m.hashCode().toString()

private fun joinNotBlank(vararg parts: String?): String? =
    parts.filterNotNull().filter { it.isNotBlank() }.takeIf { it.isNotEmpty() }?.joinToString(" · ")

private fun toRow(
    m: Map<String, Any?>,
    titleKeys: Array<String>,
    subtitleKeys: Array<String> = emptyArray(),
    metaKeys: Array<String> = arrayOf("createdAt", "updatedAt", "date", "fecha", "fechaCreacion"),
    statusKeys: Array<String> = arrayOf("status", "estatus", "state", "estado"),
): SimpleRow {
    return SimpleRow(
        id = id(m),
        title = s(m, *titleKeys) ?: "#${id(m)}",
        subtitle = s(m, *subtitleKeys),
        meta = s(m, *metaKeys),
        trailing = s(m, *statusKeys),
    )
}

// ── HR ────────────────────────────────────────────────────────────────────
@Composable
fun HrModuleScreen() = GenericListModuleScreen(title = "Recursos humanos · Permisos") { repo ->
    repo.hrLeaves().map {
        toRow(
            it,
            titleKeys = arrayOf("reason", "motivo", "type", "tipo", "title"),
            subtitleKeys = arrayOf("userName", "user", "employeeName", "employee"),
            metaKeys = arrayOf("startDate", "fechaInicio", "endDate", "fechaFin", "createdAt"),
        )
    }
}

// ── Warehouse ─────────────────────────────────────────────────────────────
@Composable
fun WarehouseModuleScreen() = GenericListModuleScreen(title = "Bodega") { repo ->
    repo.warehouse().map {
        toRow(
            it,
            titleKeys = arrayOf("name", "nombre", "title"),
            subtitleKeys = arrayOf("code", "codigo", "location", "ubicacion"),
        )
    }
}

// ── Stock ─────────────────────────────────────────────────────────────────
@Composable
fun StockModuleScreen() = GenericListModuleScreen(title = "Almacén") { repo ->
    repo.stock().map {
        toRow(
            it,
            titleKeys = arrayOf("name", "nombre", "productName", "itemName", "title"),
            subtitleKeys = arrayOf("sku", "code", "codigo"),
            metaKeys = arrayOf("quantity", "cantidad", "stock"),
        )
    }
}

// ── Procurement · Requisitions ───────────────────────────────────────────
@Composable
fun ProcurementModuleScreen() = GenericListModuleScreen(title = "Compras · Requisiciones") { repo ->
    repo.requisitions().map {
        toRow(
            it,
            titleKeys = arrayOf("title", "titulo", "description", "descripcion", "folio", "number"),
            subtitleKeys = arrayOf("requestedBy", "solicitante", "departmentName", "department"),
        )
    }
}

// ── Maintenance · Work Orders ────────────────────────────────────────────
@Composable
fun MaintenanceModuleScreen() = GenericListModuleScreen(title = "Mantenimiento · Órdenes") { repo ->
    repo.workOrders().map {
        toRow(
            it,
            titleKeys = arrayOf("title", "titulo", "description", "descripcion", "orderNumber", "number"),
            subtitleKeys = arrayOf("assetName", "asset", "equipmentName"),
            metaKeys = arrayOf("scheduledDate", "dueDate", "createdAt"),
        )
    }
}

// ── Assets (maintenance assets) ──────────────────────────────────────────
@Composable
fun AssetsModuleScreen() = GenericListModuleScreen(title = "Activos") { repo ->
    repo.maintenanceAssets().map {
        toRow(
            it,
            titleKeys = arrayOf("name", "nombre", "assetName"),
            subtitleKeys = arrayOf("code", "tag", "serial"),
            metaKeys = arrayOf("location", "ubicacion", "area"),
        )
    }
}

// ── Service Sheets ───────────────────────────────────────────────────────
@Composable
fun ServiceSheetsModuleScreen() = GenericListModuleScreen(title = "Hojas de servicio") { repo ->
    repo.serviceSheets().map {
        toRow(
            it,
            titleKeys = arrayOf("folio", "number", "title", "titulo"),
            subtitleKeys = arrayOf("clientName", "cliente", "activityAn", "anNumber"),
        )
    }
}

// ── CVs ──────────────────────────────────────────────────────────────────
@Composable
fun CvsModuleScreen() = GenericListModuleScreen(title = "CVs") { repo ->
    repo.cvs().map {
        toRow(
            it,
            titleKeys = arrayOf("fullName", "name", "nombre", "title", "fileName"),
            subtitleKeys = arrayOf("position", "puesto", "role", "email"),
            metaKeys = arrayOf("uploadedAt", "createdAt"),
        )
    }
}

// ── Client Tickets (client-ticket-requests) ──────────────────────────────
@Composable
fun ClientTicketsModuleScreen() = GenericListModuleScreen(title = "Tickets de clientes") { repo ->
    repo.clientTicketRequests().map {
        toRow(
            it,
            titleKeys = arrayOf("title", "titulo", "subject", "asunto", "folio"),
            subtitleKeys = arrayOf("clientName", "cliente", "branchName", "sucursal"),
            metaKeys = arrayOf("createdAt", "requestedAt"),
        )
    }
}

// ── Projects (proyectos) ─────────────────────────────────────────────────
@Composable
fun ProjectsModuleScreen() = GenericListModuleScreen(title = "Proyectos") { repo ->
    repo.projects().map {
        toRow(
            it,
            titleKeys = arrayOf("name", "nombre", "title", "titulo"),
            subtitleKeys = arrayOf("clientName", "cliente", "description", "descripcion"),
            metaKeys = arrayOf("startDate", "endDate", "createdAt"),
        )
    }
}

// ── Leads / Oportunidades (reutilizan client-ticket-requests en defecto)
@Composable
fun LeadsModuleScreen() = GenericListModuleScreen(title = "Leads") { repo ->
    repo.clientTicketRequests().map {
        toRow(
            it,
            titleKeys = arrayOf("contactName", "clientName", "name", "nombre", "subject"),
            subtitleKeys = arrayOf("email", "phone", "telefono"),
            metaKeys = arrayOf("createdAt", "requestedAt"),
        )
    }
}
