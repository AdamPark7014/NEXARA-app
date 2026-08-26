package mx.nexara.mobile.nativeapp.ui.ventas

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.CtOrderPreviewDto
import mx.nexara.mobile.nativeapp.data.api.SupplierStatsResponseDto
import mx.nexara.mobile.nativeapp.data.crm.SmartQuoteRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.fg
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

const val QUOTE_MARGIN_OK_THRESHOLD = 20.0

@Composable
fun SupplierStatsBar(
    repo: SmartQuoteRepository,
    modifier: Modifier = Modifier,
    showRefresh: Boolean = true,
) {
    var stats by remember { mutableStateOf<SupplierStatsResponseDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var refreshKey by remember { mutableIntStateOf(0) }

    fun load() {
        refreshKey++
    }

    LaunchedEffect(repo, refreshKey) {
        loading = true
        error = null
        stats = runCatching { withContext(Dispatchers.IO) { repo.supplierStats() } }
            .onFailure { error = it.message }
            .getOrNull()
        loading = false
    }

    if (!loading && stats?.suppliers.isNullOrEmpty() && error == null) return

    NxPanelShell(modifier = modifier) {
        NxSectionHeader(
            title = "Economía por mayorista",
            subtitle = "Costo proveedor vs venta neta",
            trailing = if (showRefresh) {
                {
                    OutlinedButton(
                        onClick = { load() },
                        enabled = !loading,
                    ) { Text(if (loading) "…" else "Actualizar") }
                }
            } else {
                null
            },
        )

        when {
            loading && stats == null -> {
                NxLoadingBlock("Cargando economía por mayorista…")
            }
            error != null && stats == null -> {
                NxErrorBlock(error!!) { load() }
            }
            else -> {
                val data = stats ?: return@NxPanelShell
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                        .background(NxColors.TealSoft).padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Margen global", style = MaterialTheme.typography.labelMedium)
                    Text(
                        "${data.totals?.marginPercent?.let { "%.1f".format(it) } ?: "—"}% · ${fmtMxnShort(data.totals?.sellWithTax ?: 0.0)} c/IVA",
                        fontWeight = FontWeight.Bold,
                        color = NxColors.Teal,
                    )
                }
                data.suppliers.forEach { s ->
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                            .background(NxColors.Surface).padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(
                            "${s.quoteCount} cotiz. · ${s.lineCount} partidas",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(s.label.ifBlank { s.supplierCode }, fontWeight = FontWeight.Bold)
                        StatRow("Costo", fmtMxnShort(s.costNet))
                        StatRow("Venta neta", fmtMxnShort(s.sellNet))
                        val marginTone = quoteMarginTone(s.marginPercent)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Margen", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(
                                "${fmtMxnShort(s.marginAmount)} (${"%.1f".format(s.marginPercent)}%)",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                                color = marginTone.fg(),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun CtOrderPanel(
    repo: SmartQuoteRepository,
    cotizacionId: Long,
    quoteStatus: String,
    modifier: Modifier = Modifier,
) {
    var preview by remember { mutableStateOf<CtOrderPreviewDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var success by remember { mutableStateOf<String?>(null) }
    var almacen by remember { mutableStateOf("01A") }
    val scope = rememberCoroutineScope()

    fun reloadPreview() {
        scope.launch {
            loading = true
            error = null
            preview = runCatching { withContext(Dispatchers.IO) { repo.ctOrderPreview(cotizacionId) } }
                .onFailure { error = it.message }
                .getOrNull()
            loading = false
        }
    }

    LaunchedEffect(cotizacionId) {
        loading = true
        error = null
        preview = runCatching { withContext(Dispatchers.IO) { repo.ctOrderPreview(cotizacionId) } }
            .onFailure { error = it.message }
            .getOrNull()
        loading = false
    }

    if (!loading && preview?.lines.isNullOrEmpty() && error == null) return

    val approved = quoteStatus.uppercase() == "APPROVED"

    NxPanelShell(modifier = modifier) {
        NxSectionHeader(
            title = "Pedido CT Online",
            subtitle = if (approved) "Cotización aprobada — listo para enviar" else "Aprueba la cotización para enviar el pedido",
            trailing = {
                if (approved) {
                    NxStatusChip("Aprobada", NxTone.Success)
                } else {
                    NxStatusChip("Pendiente", NxTone.Warning)
                }
            },
        )

        when {
            loading && preview == null -> {
                NxLoadingBlock("Cargando pedido CT…")
            }
            error != null && preview == null -> {
                NxErrorBlock(error!!) { reloadPreview() }
            }
            else -> {
                val data = preview ?: return@NxPanelShell
                if (data.lines.isEmpty()) return@NxPanelShell

                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                        .background(NxColors.Surface).padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    StatRow("Partidas CT", "${data.lines.size}")
                    StatRow("Costo", fmtMxnShort(data.subtotalCost))
                    StatRow("Venta", fmtMxnShort(data.subtotalSell))
                    StatRow("Margen", fmtMxnShort(data.marginAmount))
                    data.lines.take(3).forEach { line ->
                        Text(
                            "· ${line.qty}× ${line.nombre.take(40)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (data.lines.size > 3) {
                        Text("+${data.lines.size - 3} más…", style = MaterialTheme.typography.labelSmall)
                    }
                }
                OutlinedTextField(
                    value = almacen,
                    onValueChange = { almacen = it },
                    label = { Text("Almacén CT") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = approved && !submitting,
                )
                if (error != null) {
                    NxErrorBlock(error!!)
                }
                if (success != null) {
                    Text(success!!, color = NxColors.Success, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                }
                preview?.existingOrders?.filter { it.status.uppercase() != "CONFIRMED" }.orEmpty().forEach { order ->
                    OutlinedButton(
                        onClick = {
                            scope.launch {
                                submitting = true
                                error = null
                                runCatching {
                                    withContext(Dispatchers.IO) { repo.confirmCtOrder(order.id) }
                                }.onSuccess {
                                    success = "Pedido confirmado en CT"
                                    reloadPreview()
                                }.onFailure {
                                    error = it.message ?: "No se pudo confirmar"
                                }
                                submitting = false
                            }
                        },
                        enabled = !submitting,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Confirmar pedido #${order.id}${order.externalFolio?.let { " ($it)" } ?: ""}")
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = { reloadPreview() },
                        enabled = !submitting && !loading,
                        modifier = Modifier.weight(1f),
                    ) { Text("Actualizar") }
                    Button(
                        onClick = {
                            scope.launch {
                                submitting = true
                                error = null
                                success = null
                                runCatching {
                                    withContext(Dispatchers.IO) {
                                        repo.submitCtOrder(cotizacionId, almacen.trim(), confirmNow = false)
                                    }
                                }.onSuccess {
                                    success = "Pedido CT enviado correctamente"
                                }.onFailure {
                                    error = it.message ?: "No se pudo enviar el pedido"
                                }
                                submitting = false
                            }
                        },
                        enabled = approved && almacen.isNotBlank() && !submitting,
                        modifier = Modifier.weight(1f),
                    ) {
                        if (submitting) {
                            CircularProgressIndicator(modifier = Modifier.padding(4.dp))
                        } else {
                            Text("Enviar pedido CT")
                        }
                    }
                }
            }
        }
    }
}

fun quoteMarginTone(percent: Double?): NxTone {
    val pct = percent ?: return NxTone.Neutral
    return if (pct >= QUOTE_MARGIN_OK_THRESHOLD) NxTone.Success else NxTone.Danger
}

fun cotStatusTone(status: String?): NxTone = when (status?.lowercase()) {
    "approved", "aprobada", "won" -> NxTone.Success
    "sent", "enviada" -> NxTone.Info
    "draft", "borrador" -> NxTone.Warning
    "rejected", "rechazada", "lost" -> NxTone.Danger
    else -> NxTone.Neutral
}

fun cotStatusColorAndroid(status: String?): Color {
    return cotStatusTone(status).fg()
}

fun cotStatusLabel(status: String): String = when (status.uppercase()) {
    "DRAFT" -> "Borrador"
    "SENT" -> "Enviada"
    "APPROVED" -> "Aprobada"
    else -> status.replaceFirstChar { it.uppercase() }
}

private fun fmtMxnShort(v: Double): String = when {
    v >= 1_000_000 -> "$${"%.1f".format(v / 1_000_000)}M"
    v >= 1_000 -> "$${"%.0f".format(v / 1_000)}K"
    else -> "$${"%.2f".format(v)}"
}
