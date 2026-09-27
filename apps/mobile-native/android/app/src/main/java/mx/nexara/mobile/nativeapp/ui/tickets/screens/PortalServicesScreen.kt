package mx.nexara.mobile.nativeapp.ui.tickets.screens

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormat
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiGrid
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxRefreshErrorBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSecondaryButton
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSpacing
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusLabels
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.enterprise.nxFriendlyError
import mx.nexara.mobile.nativeapp.ui.util.savePdfToCache
import mx.nexara.mobile.nativeapp.ui.util.sharePdfFile

@Suppress("UNUSED_PARAMETER")
@Composable
fun PortalServicesScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    val repo = remember(ctx) { TicketsRepository(ctx.applicationContext) }
    val scope = rememberCoroutineScope()

    var loading by remember { mutableStateOf(true) }
    var loaded by remember { mutableStateOf(false) }
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
                val (s, i, q) = withContext(Dispatchers.IO) {
                    Triple(repo.servicesSummary(), repo.portalInvoices(), repo.portalQuotes())
                }
                summary = s
                invoices = i
                quotes = q
                loaded = true
            }.onFailure { error = it.message }
            loading = false
        }
    }

    LaunchedEffect(Unit) { reload() }

    fun downloadInvoice(id: Long, kind: String) {
        scope.launch {
            downloading = "inv-$id-$kind"
            runCatching {
                val file = withContext(Dispatchers.IO) {
                    val bytes = if (kind == "xml") repo.downloadInvoiceXml(id) else repo.downloadInvoicePdf(id)
                    val ext = if (kind == "xml") "xml" else "pdf"
                    savePdfToCache(ctx, "factura-$id.$ext", bytes)
                }
                if (kind == "pdf") sharePdfFile(ctx, file, "Factura")
                else Toast.makeText(ctx, "XML guardado", Toast.LENGTH_SHORT).show()
            }.onFailure {
                Toast.makeText(ctx, nxFriendlyError(it.message), Toast.LENGTH_LONG).show()
            }
            downloading = null
        }
    }

    fun downloadQuote(id: Long) {
        scope.launch {
            downloading = "quote-$id"
            runCatching {
                val file = withContext(Dispatchers.IO) {
                    savePdfToCache(ctx, "cotizacion-$id.pdf", repo.downloadQuotePdf(id))
                }
                sharePdfFile(ctx, file, "Cotización")
            }.onFailure {
                Toast.makeText(ctx, nxFriendlyError(it.message), Toast.LENGTH_LONG).show()
            }
            downloading = null
        }
    }

    NxScreenScaffold(isRefreshing = loading && loaded, onRefresh = ::reload) {
        when {
            !loaded && loading -> NxSkeletonList(
                itemCount = 5,
                modifier = Modifier.fillMaxWidth().padding(NxSpacing.ListPadding),
            )
            !loaded && error != null -> NxErrorState(message = error, onRetry = ::reload)
            else -> {
                val stats = summary["summary"] as? Map<*, *> ?: emptyMap<String, Any?>()
                val projects = remember(summary) { mapListFromSummary(summary, "projects") }
                val contracts = remember(summary) { mapListFromSummary(summary, "contracts") }
                val visits = remember(summary) { mapListFromSummary(summary, "upcomingVisits") }
                val tickets = remember(summary) { mapListFromSummary(summary, "recentTickets") }

                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = NxSpacing.ListPadding,
                    verticalArrangement = Arrangement.spacedBy(NxSpacing.ListGap),
                ) {
                    if (error != null) {
                        item(key = "refresh-error") {
                            NxRefreshErrorBanner(message = error, onRetry = ::reload, onDismiss = { error = null })
                        }
                    }
                    item(key = "header") {
                        NxSectionHeader(
                            title = "Mis servicios",
                            subtitle = "Proyectos, contratos, visitas y documentos en un solo lugar.",
                        )
                    }
                    item(key = "kpis") {
                        NxKpiGrid(
                            items = listOf(
                                NxKpi("Proyectos activos", str(stats, "activeProjects"), tone = NxTone.Info),
                                NxKpi("Contratos", str(stats, "activeContracts"), tone = NxTone.Brand),
                                NxKpi("Próximas visitas", str(stats, "upcomingVisits"), tone = NxTone.Warning),
                                NxKpi("Tickets abiertos", str(stats, "openTickets"), tone = NxTone.Danger),
                            ),
                        )
                    }
                    if (projects.isNotEmpty()) {
                        item(key = "h-projects") { SectionTitle("Proyectos en ejecución") }
                        items(projects, key = { "p-${portalStr(it, "id")}" }, contentType = { "project" }) { p ->
                            NxPanelShell {
                                TitleWithStatus(portalStr(p, "title", "name").ifBlank { "Proyecto" }, portalStr(p, "status"))
                                val type = portalStr(p, "projectType")
                                if (type.isNotBlank()) Meta(NxStatusLabels.label(type))
                                val scopeText = portalStr(p, "scopeSummary")
                                if (scopeText.isNotBlank()) Body(scopeText)
                            }
                        }
                    }
                    if (contracts.isNotEmpty()) {
                        item(key = "h-contracts") { SectionTitle("Contratos de mantenimiento") }
                        items(contracts, key = { "c-${portalStr(it, "id")}" }, contentType = { "contract" }) { c ->
                            NxPanelShell {
                                TitleWithStatus(portalStr(c, "contractNumber", "title").ifBlank { "Contrato" }, null)
                                val title = portalStr(c, "title")
                                if (title.isNotBlank()) Body(title)
                                val sla = buildList {
                                    portalStr(c, "slaResponseHours").takeIf { it.isNotBlank() }?.let { add("Respuesta ${it} h") }
                                    portalStr(c, "slaResolutionHours").takeIf { it.isNotBlank() }?.let { add("Solución ${it} h") }
                                    portalStr(c, "frequency").takeIf { it.isNotBlank() }?.let { add(NxStatusLabels.label(it)) }
                                }
                                if (sla.isNotEmpty()) Meta(sla.joinToString(" · "))
                                val next = portalStr(c, "nextVisitDate")
                                if (next.isNotBlank()) Meta("Próxima visita: ${NxFormat.date(next)}")
                            }
                        }
                    }
                    if (visits.isNotEmpty()) {
                        item(key = "h-visits") { SectionTitle("Próximas visitas") }
                        items(visits, key = { "v-${portalStr(it, "id")}" }, contentType = { "visit" }) { v ->
                            NxPanelShell {
                                TitleWithStatus(NxFormat.dateTime(portalStr(v, "scheduledDate")), null)
                                @Suppress("UNCHECKED_CAST")
                                val contract = v["contract"] as? Map<String, Any?>
                                val label = portalStr(contract, "title", "contractNumber")
                                if (label.isNotBlank()) Body(label)
                            }
                        }
                    }
                    if (tickets.isNotEmpty()) {
                        item(key = "h-tickets") { SectionTitle("Tickets recientes") }
                        items(tickets, key = { "t-${portalStr(it, "id")}" }, contentType = { "ticket" }) { t ->
                            NxPanelShell {
                                val number = portalStr(t, "anNumber")
                                val title = portalStr(t, "titulo", "title")
                                TitleWithStatus(
                                    listOf(number, title).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { "Ticket" },
                                    portalStr(t, "estatus", "status"),
                                )
                            }
                        }
                    }
                    if (invoices.isNotEmpty()) {
                        item(key = "h-invoices") { SectionTitle("Facturas") }
                        items(invoices, key = { "inv-${it["id"]}" }, contentType = { "invoice" }) { inv ->
                            val id = (inv["id"] as? Number)?.toLong() ?: 0L
                            NxPanelShell {
                                TitleWithStatus(portalStr(inv, "invoiceNumber").ifBlank { "Factura" }, portalStr(inv, "status"))
                                Amount(NxFormat.money(inv["totalAmount"], portalStr(inv, "currency").ifBlank { "MXN" }))
                                Row(
                                    modifier = Modifier.padding(top = NxSpacing.S),
                                    horizontalArrangement = Arrangement.spacedBy(NxSpacing.S),
                                ) {
                                    NxSecondaryButton(
                                        text = "PDF",
                                        icon = Icons.Default.Download,
                                        onClick = { downloadInvoice(id, "pdf") },
                                        enabled = downloading == null && id > 0,
                                        loading = downloading == "inv-$id-pdf",
                                        modifier = Modifier.weight(1f),
                                    )
                                    NxSecondaryButton(
                                        text = "XML",
                                        icon = Icons.Default.Description,
                                        onClick = { downloadInvoice(id, "xml") },
                                        enabled = downloading == null && id > 0,
                                        loading = downloading == "inv-$id-xml",
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                            }
                        }
                    }
                    if (quotes.isNotEmpty()) {
                        item(key = "h-quotes") { SectionTitle("Cotizaciones") }
                        items(quotes, key = { "q-${it["id"]}" }, contentType = { "quote" }) { q ->
                            val id = (q["id"] as? Number)?.toLong() ?: 0L
                            NxPanelShell {
                                TitleWithStatus(portalStr(q, "quoteNumber").ifBlank { "Cotización" }, portalStr(q, "status"))
                                Amount(NxFormat.money(q["total"], portalStr(q, "currency").ifBlank { "MXN" }))
                                NxSecondaryButton(
                                    text = "Descargar PDF",
                                    icon = Icons.Default.Download,
                                    onClick = { downloadQuote(id) },
                                    enabled = downloading == null && id > 0,
                                    loading = downloading == "quote-$id",
                                    modifier = Modifier.fillMaxWidth().padding(top = NxSpacing.S),
                                )
                            }
                        }
                    }
                    if (projects.isEmpty() && contracts.isEmpty() && visits.isEmpty() && tickets.isEmpty() && invoices.isEmpty() && quotes.isEmpty()) {
                        item(key = "empty") {
                            NxEmptyState(
                                title = "Sin servicios",
                                subtitle = "Tus proyectos y documentos aparecerán aquí.",
                                icon = Icons.Default.Inventory2,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        color = NxColors.Slate,
        modifier = Modifier.padding(top = NxSpacing.S),
    )
}

@Composable
private fun TitleWithStatus(title: String, status: String?) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(NxSpacing.S),
    ) {
        Text(
            title,
            style = MaterialTheme.typography.titleSmall,
            color = NxColors.Slate,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (!status.isNullOrBlank()) {
            NxStatusChip(NxStatusLabels.label(status), NxStatusLabels.tone(status))
        }
    }
}

@Composable
private fun Body(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        color = NxColors.Slate,
        modifier = Modifier.padding(top = NxSpacing.Xs),
    )
}

@Composable
private fun Meta(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = NxColors.Muted,
        modifier = Modifier.padding(top = NxSpacing.Xxs),
    )
}

@Composable
private fun Amount(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        color = NxColors.Slate,
        modifier = Modifier.padding(top = NxSpacing.Xs),
    )
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
        is Number -> if (v.toDouble() % 1.0 == 0.0) v.toLong().toString() else v.toString()
        else -> v.toString()
    }
}
