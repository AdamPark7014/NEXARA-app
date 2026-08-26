package mx.nexara.mobile.nativeapp.ui.ventas

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.CotizacionDetailDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionItemDto
import mx.nexara.mobile.nativeapp.data.crm.CrmRepository
import mx.nexara.mobile.nativeapp.data.crm.SmartQuoteRepository
import mx.nexara.mobile.nativeapp.ui.common.PdfViewerScreen
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.fg
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.util.savePdfToCache
import mx.nexara.mobile.nativeapp.ui.util.sharePdfFile
import java.io.File

private data class QuoteEconomics(
    val costTotal: Double,
    val sellNet: Double,
    val marginAmt: Double,
    val marginPct: Double,
)

private fun computeQuoteEconomics(items: List<CotizacionItemDto>): QuoteEconomics {
    var costTotal = 0.0
    var sellNet = 0.0
    for (item in items) {
        if (item.unitCost > 0) costTotal += item.unitCost * item.qty
        sellNet += item.unitPrice * item.qty
    }
    costTotal = kotlin.math.round(costTotal * 100) / 100
    sellNet = kotlin.math.round(sellNet * 100) / 100
    val marginAmt = kotlin.math.round((sellNet - costTotal) * 100) / 100
    val marginPct = if (sellNet > 0) kotlin.math.round((marginAmt / sellNet) * 1000) / 10 else 0.0
    return QuoteEconomics(costTotal, sellNet, marginAmt, marginPct)
}

@Composable
fun VentasQuoteDetailScreen(
    cotizacionId: Long,
    onBack: () -> Unit,
) {
    val ctx = LocalContext.current
    val crmRepo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    val sqRepo = remember(ctx) { SmartQuoteRepository(ctx.applicationContext) }
    var detail by remember { mutableStateOf<CotizacionDetailDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var pdfFile by remember { mutableStateOf<File?>(null) }
    var showSend by remember { mutableStateOf(false) }
    var sendEmail by remember { mutableStateOf("") }
    var sendMessage by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var downloading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun reload() {
        scope.launch {
            loading = true
            error = null
            detail = runCatching { withContext(Dispatchers.IO) { crmRepo.cotizacionDetail(cotizacionId) } }
                .onFailure { error = it.message }
                .getOrNull()
            sendEmail = detail?.clientEmail.orEmpty()
            loading = false
        }
    }

    LaunchedEffect(cotizacionId) {
        reload()
    }

    if (pdfFile != null) {
        PdfViewerScreen(
            file = pdfFile!!,
            title = detail?.displayFolio ?: "Cotización",
            onClose = { pdfFile = null },
        )
        return
    }

    fun downloadPdf(internal: Boolean, share: Boolean = false) {
        val cot = detail ?: return
        scope.launch {
            downloading = true
            runCatching {
                val bytes = withContext(Dispatchers.IO) {
                    crmRepo.downloadCotizacionPdf(cot.id, internal = internal)
                }
                val suffix = if (internal) "-interno" else ""
                savePdfToCache(ctx, "cotizacion-${cot.id}$suffix.pdf", bytes)
            }.onSuccess { file ->
                if (share) {
                    sharePdfFile(ctx, file, "Compartir cotización")
                } else {
                    pdfFile = file
                }
            }.onFailure {
                Toast.makeText(ctx, it.message ?: "Error al descargar PDF", Toast.LENGTH_LONG).show()
            }
            downloading = false
        }
    }

    Scaffold(
        containerColor = NxColors.Surface,
        bottomBar = {
            if (!loading && detail != null) {
                QuoteStickyActionBar(
                    downloading = downloading,
                    onPdf = { downloadPdf(internal = false) },
                    onInternalPdf = { downloadPdf(internal = true) },
                    onSend = { showSend = true },
                    onShare = { downloadPdf(internal = false, share = true) },
                )
            }
        },
    ) { padding ->
        when {
            loading -> {
                Column(
                    Modifier.fillMaxSize().padding(padding).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OutlinedButton(onClick = onBack) { Text("← Cotizaciones") }
                    NxLoadingBlock("Cargando cotización…")
                }
            }
            detail == null -> {
                Column(
                    Modifier.fillMaxSize().padding(padding).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OutlinedButton(onClick = onBack) { Text("← Cotizaciones") }
                    NxErrorBlock(error ?: "No se pudo cargar la cotización") { reload() }
                }
            }
            else -> {
                val cot = detail!!
                val economics = remember(cot.items) { computeQuoteEconomics(cot.items) }
                val clientLabel = cot.clientName ?: cot.clientCompany ?: "Sin cliente"

                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item {
                        OutlinedButton(onClick = onBack) { Text("← Cotizaciones") }
                    }

                    item {
                        QuoteHeroHeader(
                            folio = cot.displayFolio,
                            status = cot.status,
                            clientName = clientLabel,
                            projectName = cot.projectName,
                            issueDate = cot.issueDate?.take(10),
                            validUntil = cot.validUntil?.take(10),
                            sentToEmail = cot.sentToEmail,
                        )
                    }

                    item {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            KpiMini(Modifier.weight(1f), "Subtotal", fmtMxnDetail(cot.subtotal))
                            KpiMini(Modifier.weight(1f), "IVA", fmtMxnDetail(cot.taxTotal))
                            KpiMini(Modifier.weight(1f), "Total", fmtMxnDetail(cot.total), bold = true)
                        }
                    }

                    if (economics.costTotal > 0) {
                        item {
                            NxPanelShell {
                                NxSectionHeader(
                                    title = "Resumen de margen",
                                    subtitle = "Vista interna de rentabilidad",
                                    trailing = {
                                        NxStatusChip(
                                            "${"%.1f".format(economics.marginPct)}%",
                                            quoteMarginTone(economics.marginPct),
                                        )
                                    },
                                )
                                QuoteDetailLine("Costo proveedor", fmtMxnDetail(economics.costTotal))
                                QuoteDetailLine("Venta neta", fmtMxnDetail(economics.sellNet))
                                QuoteDetailLine("Margen", fmtMxnDetail(economics.marginAmt))
                            }
                        }
                    }

                    item {
                        NxSectionHeader(
                            title = "Partidas",
                            subtitle = "${cot.items.size} líneas en esta cotización",
                        )
                    }

                    items(cot.items, key = { it.id }) { line ->
                        QuoteLineCard(line)
                    }

                    if (cot.hasCtLines) {
                        item {
                            CtOrderPanel(
                                repo = sqRepo,
                                cotizacionId = cot.id,
                                quoteStatus = cot.status,
                            )
                        }
                    }

                    item {
                        SupplierStatsBar(repo = sqRepo)
                    }

                    if (downloading) {
                        item {
                            NxLoadingBlock("Preparando PDF…")
                        }
                    }
                }
            }
        }
    }

    val cot = detail
    if (showSend && cot != null) {
        AlertDialog(
            onDismissRequest = { if (!sending) showSend = false },
            title = { Text("Enviar cotización") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = sendEmail,
                        onValueChange = { sendEmail = it },
                        label = { Text("Email del cliente") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = sendMessage,
                        onValueChange = { sendMessage = it },
                        label = { Text("Mensaje (opcional)") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        scope.launch {
                            sending = true
                            runCatching {
                                withContext(Dispatchers.IO) {
                                    crmRepo.sendCotizacion(cot.id, sendEmail.trim(), sendMessage.takeIf { it.isNotBlank() })
                                }
                            }.onSuccess {
                                Toast.makeText(ctx, "Cotización enviada", Toast.LENGTH_SHORT).show()
                                showSend = false
                                detail = withContext(Dispatchers.IO) { crmRepo.cotizacionDetail(cot.id) }
                            }.onFailure {
                                Toast.makeText(ctx, it.message ?: "Error al enviar", Toast.LENGTH_LONG).show()
                            }
                            sending = false
                        }
                    },
                    enabled = sendEmail.isNotBlank() && !sending,
                ) { Text(if (sending) "Enviando…" else "Enviar") }
            },
            dismissButton = {
                TextButton(onClick = { showSend = false }, enabled = !sending) { Text("Cancelar") }
            },
        )
    }
}

@Composable
private fun QuoteHeroHeader(
    folio: String,
    status: String,
    clientName: String,
    projectName: String?,
    issueDate: String?,
    validUntil: String?,
    sentToEmail: String?,
) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
            .background(
                Brush.verticalGradient(
                    colors = listOf(NxColors.Teal, Color(0xFF0F766E)),
                ),
            )
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                folio,
                style = MaterialTheme.typography.labelLarge,
                color = Color.White.copy(alpha = 0.9f),
                fontWeight = FontWeight.SemiBold,
            )
            NxStatusChip(cotStatusLabel(status), cotStatusTone(status))
        }
        Text(
            clientName,
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold, fontSize = 24.sp),
            color = Color.White,
        )
        if (!projectName.isNullOrBlank()) {
            Text(
                projectName,
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.85f),
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            if (!issueDate.isNullOrBlank()) {
                HeroMeta("Emisión", issueDate)
            }
            if (!validUntil.isNullOrBlank()) {
                HeroMeta("Válida hasta", validUntil)
            }
        }
        if (!sentToEmail.isNullOrBlank()) {
            Text(
                "Enviada a $sentToEmail",
                style = MaterialTheme.typography.labelSmall,
                color = Color.White.copy(alpha = 0.75f),
            )
        }
    }
}

@Composable
private fun HeroMeta(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.7f))
        Text(value, style = MaterialTheme.typography.bodySmall, color = Color.White, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun QuoteStickyActionBar(
    downloading: Boolean,
    onPdf: () -> Unit,
    onInternalPdf: () -> Unit,
    onSend: () -> Unit,
    onShare: () -> Unit,
) {
    Surface(tonalElevation = 8.dp, shadowElevation = 8.dp) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                QuoteActionButton(
                    modifier = Modifier.weight(1f),
                    label = "PDF",
                    icon = Icons.Default.PictureAsPdf,
                    onClick = onPdf,
                    enabled = !downloading,
                )
                QuoteActionButton(
                    modifier = Modifier.weight(1f),
                    label = "Interno",
                    icon = Icons.Default.Lock,
                    onClick = onInternalPdf,
                    enabled = !downloading,
                )
                QuoteActionButton(
                    modifier = Modifier.weight(1f),
                    label = "Enviar",
                    icon = Icons.Default.Send,
                    onClick = onSend,
                    enabled = !downloading,
                    filled = true,
                )
            }
            Spacer(Modifier.height(8.dp))
            QuoteActionButton(
                modifier = Modifier.fillMaxWidth(),
                label = "Compartir PDF",
                icon = Icons.Default.Share,
                onClick = onShare,
                enabled = !downloading,
            )
        }
    }
}

@Composable
private fun QuoteActionButton(
    modifier: Modifier,
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
    enabled: Boolean,
    filled: Boolean = false,
) {
    if (filled) {
        Button(
            onClick = onClick,
            enabled = enabled,
            modifier = modifier.height(52.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
        ) {
            QuoteActionContent(label, icon)
        }
    } else {
        OutlinedButton(
            onClick = onClick,
            enabled = enabled,
            modifier = modifier.height(52.dp),
            shape = RoundedCornerShape(12.dp),
        ) {
            QuoteActionContent(label, icon)
        }
    }
}

@Composable
private fun QuoteActionContent(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Icon(icon, contentDescription = label, modifier = Modifier.size(18.dp))
        Text(label, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun QuoteDetailLine(label: String, value: String?) {
    if (value.isNullOrBlank()) return
    Row(Modifier.fillMaxWidth()) {
        Text(label, fontWeight = FontWeight.Medium)
        Spacer(Modifier.weight(1f))
        Text(value, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun KpiMini(modifier: Modifier, label: String, value: String, bold: Boolean = false) {
    Card(
        modifier,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
        elevation = CardDefaults.cardElevation(1.dp),
    ) {
        Column(Modifier.padding(10.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                value,
                fontWeight = if (bold) FontWeight.Bold else FontWeight.SemiBold,
                color = if (bold) NxColors.Teal else MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun QuoteLineCard(line: CotizacionItemDto) {
    val marginPct = line.lineMarginPercent
    val marginTone = if (line.unitCost > 0) quoteMarginTone(marginPct) else NxTone.Neutral
    val accentColor = marginTone.fg()

    Card(
        Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
        elevation = CardDefaults.cardElevation(1.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().height(IntrinsicSize.Min),
        ) {
            Box(
                Modifier
                    .width(4.dp)
                    .fillMaxHeight()
                    .background(accentColor),
            )
            Column(
                Modifier.padding(12.dp).weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(line.name, fontWeight = FontWeight.SemiBold)
                val meta = listOfNotNull(line.brand, line.model, line.sku?.let { "SKU $it" })
                    .filter { it.isNotBlank() }
                    .joinToString(" · ")
                if (meta.isNotBlank()) {
                    Text(meta, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("${line.qty} × ${fmtMxnDetail(line.unitPrice)}", style = MaterialTheme.typography.bodySmall)
                    Text(fmtMxnDetail(line.lineTotal), fontWeight = FontWeight.Bold, color = NxColors.Teal)
                }
                if (line.unitCost > 0) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Costo", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(fmtMxnDetail(line.lineCost), style = MaterialTheme.typography.labelSmall)
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("Margen", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        NxStatusChip(
                            "${fmtMxnDetail(line.lineMargin)} · ${marginPct?.let { "%.1f".format(it) } ?: "—"}%",
                            marginTone,
                        )
                    }
                }
                if (!line.supplierCode.isNullOrBlank()) {
                    Text("Mayorista: ${line.supplierCode}", style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                }
            }
        }
    }
}

private fun fmtMxnDetail(v: Double): String {
    val nf = java.text.NumberFormat.getCurrencyInstance(java.util.Locale("es", "MX"))
    return nf.format(v)
}
