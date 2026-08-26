package mx.nexara.mobile.nativeapp.ui.tickets.screens

import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiGrid
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.util.savePdfToCache
import mx.nexara.mobile.nativeapp.ui.util.sharePdfFile

@Composable
fun PortalServicesScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    val repo = remember(ctx) { TicketsRepository(ctx.applicationContext) }
    val scope = rememberCoroutineScope()

    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var summary by remember { mutableStateOf<Map<String, Any?>>(emptyMap()) }
    var invoices by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var quotes by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var downloading by remember { mutableStateOf<String?>(null) }

    fun reload() {
        scope.launch {
            loading = true
            error = null
            runCatching {
                withContext(Dispatchers.IO) {
                    summary = repo.servicesSummary()
                    invoices = repo.portalInvoices()
                    quotes = repo.portalQuotes()
                }
            }.onFailure { error = it.message }
            loading = false
        }
    }

    LaunchedEffect(Unit) { reload() }

    fun downloadInvoice(id: Long, kind: String) {
        scope.launch {
            downloading = "inv-$id-$kind"
            runCatching {
                val bytes = withContext(Dispatchers.IO) {
                    if (kind == "xml") repo.downloadInvoiceXml(id) else repo.downloadInvoicePdf(id)
                }
                val ext = if (kind == "xml") "xml" else "pdf"
                val file = savePdfToCache(ctx, "factura-$id.$ext", bytes)
                if (kind == "pdf") sharePdfFile(ctx, file, "Factura")
                else Toast.makeText(ctx, "XML guardado", Toast.LENGTH_SHORT).show()
            }.onFailure {
                Toast.makeText(ctx, it.message ?: "Error", Toast.LENGTH_LONG).show()
            }
            downloading = null
        }
    }

    fun downloadQuote(id: Long) {
        scope.launch {
            downloading = "quote-$id"
            runCatching {
                val bytes = withContext(Dispatchers.IO) { repo.downloadQuotePdf(id) }
                val file = savePdfToCache(ctx, "cotizacion-$id.pdf", bytes)
                sharePdfFile(ctx, file, "Cotización")
            }.onFailure {
                Toast.makeText(ctx, it.message ?: "Error", Toast.LENGTH_LONG).show()
            }
            downloading = null
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        OutlinedButton(onClick = onBack) { Text("← Portal") }
        when {
            loading -> NxLoadingBlock("Cargando mis servicios…")
            error != null -> NxEmptyState(
                title = "No se pudo cargar",
                subtitle = error!!,
                actionLabel = "Reintentar",
                onAction = ::reload,
            )
            else -> {
                val stats = summary["summary"] as? Map<*, *> ?: emptyMap<String, Any?>()
                val projects = mapListFromSummary(summary, "projects")
                val contracts = mapListFromSummary(summary, "contracts")
                val visits = mapListFromSummary(summary, "upcomingVisits")
                val tickets = mapListFromSummary(summary, "recentTickets")

                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    item {
                        Text("Mis servicios", fontWeight = FontWeight.Bold)
                        Text(
                            "Visión 360° de proyectos, contratos y soporte.",
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    item {
                        NxKpiGrid(
                            items = listOf(
                                NxKpi("Proyectos", str(stats, "activeProjects"), tone = NxTone.Info),
                                NxKpi("Contratos", str(stats, "activeContracts"), tone = NxTone.Brand),
                                NxKpi("Visitas", str(stats, "upcomingVisits"), tone = NxTone.Warning),
                                NxKpi("Tickets", str(stats, "openTickets"), tone = NxTone.Danger),
                            ),
                        )
                    }
                    if (projects.isNotEmpty()) {
                        item { Text("Proyectos en ejecución", fontWeight = FontWeight.SemiBold) }
                        items(projects, key = { "p-${portalStr(it, "id")}" }) { p ->
                            NxPanelShell {
                                Text(portalStr(p, "title", "name"), fontWeight = FontWeight.SemiBold)
                                Text("${portalStr(p, "status")} · ${portalStr(p, "projectType")}")
                                val scopeText = portalStr(p, "scopeSummary")
                                if (scopeText.isNotBlank()) Text(scopeText, modifier = Modifier.padding(top = 4.dp))
                            }
                        }
                    }
                    if (contracts.isNotEmpty()) {
                        item { Text("Contratos de mantenimiento", fontWeight = FontWeight.SemiBold) }
                        items(contracts, key = { "c-${portalStr(it, "id")}" }) { c ->
                            NxPanelShell {
                                Text(portalStr(c, "contractNumber"), fontWeight = FontWeight.SemiBold)
                                Text(portalStr(c, "title"))
                                Text(
                                    "SLA ${portalStr(c, "slaResponseHours")}h / ${portalStr(c, "slaResolutionHours")}h · ${portalStr(c, "frequency")}",
                                    modifier = Modifier.padding(top = 4.dp),
                                )
                                val next = portalStr(c, "nextVisitDate")
                                if (next.isNotBlank()) Text("Próxima visita: $next", modifier = Modifier.padding(top = 2.dp))
                            }
                        }
                    }
                    if (visits.isNotEmpty()) {
                        item { Text("Próximas visitas", fontWeight = FontWeight.SemiBold) }
                        items(visits, key = { "v-${portalStr(it, "id")}" }) { v ->
                            NxPanelShell {
                                Text(portalStr(v, "scheduledDate").take(16), fontWeight = FontWeight.SemiBold)
                                val contract = v["contract"] as? Map<*, *>
                                Text(portalStr(contract as? Map<String, Any?>, "title", "contractNumber"))
                            }
                        }
                    }
                    if (tickets.isNotEmpty()) {
                        item { Text("Tickets recientes", fontWeight = FontWeight.SemiBold) }
                        items(tickets, key = { "t-${portalStr(it, "id")}" }) { t ->
                            NxPanelShell {
                                Text("${portalStr(t, "anNumber")} · ${portalStr(t, "titulo", "title")}", fontWeight = FontWeight.SemiBold)
                                Text(portalStr(t, "estatus", "status"))
                            }
                        }
                    }
                    if (invoices.isNotEmpty()) {
                        item { Text("Facturas", fontWeight = FontWeight.SemiBold) }
                        items(invoices, key = { "inv-${it["id"]}" }) { inv ->
                            val id = (inv["id"] as? Number)?.toLong() ?: 0L
                            NxPanelShell {
                                Text(inv["invoiceNumber"]?.toString() ?: "Factura", fontWeight = FontWeight.SemiBold)
                                Text("${inv["status"]} · ${inv["totalAmount"]} ${inv["currency"] ?: "MXN"}")
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedButton(
                                        onClick = { downloadInvoice(id, "pdf") },
                                        enabled = downloading == null && id > 0,
                                    ) { Text(if (downloading == "inv-$id-pdf") "…" else "PDF") }
                                    OutlinedButton(
                                        onClick = { downloadInvoice(id, "xml") },
                                        enabled = downloading == null && id > 0,
                                    ) { Text(if (downloading == "inv-$id-xml") "…" else "XML") }
                                }
                            }
                        }
                    }
                    if (quotes.isNotEmpty()) {
                        item { Text("Cotizaciones", fontWeight = FontWeight.SemiBold) }
                        items(quotes, key = { "q-${it["id"]}" }) { q ->
                            val id = (q["id"] as? Number)?.toLong() ?: 0L
                            NxPanelShell {
                                Text(q["quoteNumber"]?.toString() ?: "Cotización", fontWeight = FontWeight.SemiBold)
                                Text("${q["status"]} · Total ${q["total"]}")
                                Button(
                                    onClick = { downloadQuote(id) },
                                    enabled = downloading == null && id > 0,
                                ) { Text(if (downloading == "quote-$id") "…" else "Descargar PDF") }
                            }
                        }
                    }
                    if (projects.isEmpty() && contracts.isEmpty() && visits.isEmpty() && tickets.isEmpty() && invoices.isEmpty() && quotes.isEmpty()) {
                        item { NxEmptyState(title = "Sin servicios", subtitle = "Tus proyectos y documentos aparecerán aquí.") }
                    }
                }
            }
        }
    }
}

private fun mapListFromSummary(summary: Map<String, Any?>, key: String): List<Map<String, Any?>> {
    val raw = summary[key]
    if (raw !is List<*>) return emptyList()
    return raw.mapNotNull { item ->
        when (item) {
            is Map<*, *> -> item.entries.associate { (k, v) -> k.toString() to v }
            else -> null
        }
    }
}

private fun portalStr(m: Map<String, Any?>?, vararg keys: String): String {
    if (m == null) return ""
    for (key in keys) {
        val v = m[key]
        if (v != null) {
            val s = v.toString().trim()
            if (s.isNotBlank() && s != "null") return s
        }
    }
    return ""
}

private fun str(m: Map<*, *>, key: String): String {
    val v = m[key]
    return when (v) {
        null -> "0"
        is Number -> v.toString()
        else -> v.toString()
    }
}
