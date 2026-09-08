package mx.nexara.mobile.nativeapp.ui.console.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.data.api.GoodsReceiptDetailDto
import mx.nexara.mobile.nativeapp.data.api.PurchaseOrderDetailDto
import mx.nexara.mobile.nativeapp.data.api.RfqComparisonDto
import mx.nexara.mobile.nativeapp.data.api.RfqLineDto
import mx.nexara.mobile.nativeapp.data.api.RfqSupplierQuoteDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import java.util.Locale

/**
 * Compras, la parte que sólo existía en `apps/web/.../erp/procurement/page.tsx`:
 * ficha de orden con aprobación, ficha de recepción y ciclo de RFQ.
 *
 * Vive fuera de `OpsModuleScreens.kt` porque ese archivo ya cargaba con seis
 * módulos; el estado y el ViewModel siguen allí, que es donde los busca quien
 * abre la pantalla.
 */

// ── Formato y tonos ─────────────────────────────────────────────────────────

/**
 * `procMoney` y no `money` a secas: `FinanceRichScreens.kt` ya tiene su propio
 * `fmtMoney` privado en el mismo paquete y dos nombres iguales confunden más
 * de lo que ahorran.
 */
internal fun procMoney(v: Double?): String =
    if (v == null) "—" else String.format(Locale("es", "MX"), "$%,.2f", v)

private fun qty(v: Double?): String {
    if (v == null) return "—"
    // Las cantidades vienen como Decimal(14,4): 3.0000 se lee mejor como «3».
    return if (v % 1.0 == 0.0) v.toLong().toString()
    else String.format(Locale("es", "MX"), "%.4f", v).trimEnd('0').trimEnd('.')
}

internal fun purchaseOrderTone(status: String): NxTone = when (status.uppercase()) {
    "DRAFT" -> NxTone.Warning
    "CONFIRMED" -> NxTone.Info
    "PARTIALLY_RECEIVED" -> NxTone.Brand
    "RECEIVED", "CLOSED" -> NxTone.Success
    "CANCELLED" -> NxTone.Danger
    else -> NxTone.Neutral
}

internal fun purchaseOrderStatusLabel(status: String): String = when (status.uppercase()) {
    "DRAFT" -> "Borrador"
    "CONFIRMED" -> "Confirmada"
    "PARTIALLY_RECEIVED" -> "Recibida parcial"
    "RECEIVED" -> "Recibida"
    "CLOSED" -> "Cerrada"
    "CANCELLED" -> "Cancelada"
    else -> status.ifBlank { "—" }
}

internal fun rfqTone(status: String): NxTone = when (status.uppercase()) {
    "DRAFT" -> NxTone.Neutral
    "SENT" -> NxTone.Info
    "QUOTED" -> NxTone.Warning
    "AWARDED" -> NxTone.Success
    "CANCELLED" -> NxTone.Danger
    else -> NxTone.Neutral
}

internal fun rfqStatusLabel(status: String): String = when (status.uppercase()) {
    "DRAFT" -> "Borrador"
    "SENT" -> "Enviada"
    "QUOTED" -> "Cotizada"
    "AWARDED" -> "Adjudicada"
    "CANCELLED" -> "Cancelada"
    else -> status.ifBlank { "—" }
}

@Composable
private fun BackRow(onBack: () -> Unit, trailing: (@Composable () -> Unit)? = null) {
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
        OutlinedButton(onClick = onBack) { Text("← Volver") }
        trailing?.invoke()
    }
}

// ── Orden de compra ─────────────────────────────────────────────────────────

/**
 * Ficha de la OC con sus partidas y, si sigue en borrador, la aprobación.
 *
 * Se pide confirmación explícita: `approvePurchaseOrder` la mueve a
 * `CONFIRMED`, notifica a quien la creó y no tiene vuelta atrás desde la app.
 */
@Composable
internal fun PurchaseOrderDetailScreen(
    po: PurchaseOrderDetailDto,
    state: ProcurementUiState,
    onApprove: (Long) -> Unit,
    onBack: () -> Unit,
) {
    var confirming by remember { mutableStateOf(false) }

    LazyColumn(
        Modifier.fillMaxSize().background(NxColors.Surface),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            BackRow(onBack) {
                NxStatusChip(purchaseOrderStatusLabel(po.status), purchaseOrderTone(po.status))
            }
        }
        item { NxSectionHeader(po.displayTitle, subtitle = po.supplierName.ifBlank { "Orden de compra" }) }

        state.detailError?.takeIf { it.isNotBlank() }?.let { msg ->
            item { NxErrorBlock(msg) }
        }

        item {
            NxPanelShell {
                DetailLine("Proveedor", po.supplierName)
                DetailLine("RFC", po.supplierRfc)
                DetailLine("Fecha", po.orderDate)
                DetailLine("Entrega estimada", po.expectedDate)
                DetailLine("Requisición", po.requisitionNumber)
                DetailLine("Condiciones", po.paymentTerms)
                DetailLine("Entregar en", po.shippingAddress)
                DetailLine("Creó", po.createdByName)
                DetailLine("Aprobó", po.approvedByName)
                DetailLine("Fecha aprobación", po.approvedAt)
                if (po.receiptCount > 0) DetailLine("Recepciones", po.receiptCount.toString())
                DetailLine("Notas", po.notes)
            }
        }

        item {
            NxPanelShell {
                DetailLine("Subtotal", procMoney(po.subtotal))
                DetailLine("Impuestos", procMoney(po.taxAmount))
                Row(Modifier.fillMaxWidth()) {
                    Text("Total ${po.currency}", fontWeight = FontWeight.Bold, color = NxColors.Slate)
                    Spacer(Modifier.weight(1f))
                    Text(procMoney(po.totalAmount), fontWeight = FontWeight.Bold, color = NxColors.Teal)
                }
            }
        }

        item { Text("Partidas", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) }
        if (po.items.isEmpty()) {
            item { NxEmptyState("Sin partidas", "Esta orden no trae renglones capturados.") }
        } else {
            items(po.items, key = { it.rowKey }) { item ->
                NxPanelShell {
                    Text(item.description.ifBlank { "Partida" }, fontWeight = FontWeight.SemiBold)
                    if (item.sku.isNotBlank()) {
                        Text(item.sku, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                    }
                    Row(Modifier.fillMaxWidth()) {
                        Text(
                            "${qty(item.quantity)} × ${procMoney(item.unitPrice)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = NxColors.Muted,
                        )
                        Spacer(Modifier.weight(1f))
                        Text(procMoney(item.total), fontWeight = FontWeight.SemiBold)
                    }
                    // Lo que falta por recibir es el dato que se busca de pie
                    // en el andén; la web lo enseña en otra pantalla.
                    if (item.pendingQty > 0.0 && (item.receivedQty ?: 0.0) > 0.0) {
                        Text(
                            "Pendiente por recibir: ${qty(item.pendingQty)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = NxColors.Warning,
                        )
                    }
                }
            }
        }

        if (po.canApprove && po.id != null) {
            item {
                Button(
                    onClick = { confirming = true },
                    enabled = !state.acting,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (state.acting) "Aprobando…" else "Aprobar orden") }
            }
        } else if (po.isApproved) {
            item {
                Text(
                    "Aprobada por ${po.approvedByName.ifBlank { "—" }}",
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Success,
                )
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }

    if (confirming && po.id != null) {
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text("Aprobar ${po.displayTitle}") },
            text = {
                Text(
                    "La orden pasa a confirmada por ${procMoney(po.totalAmount)} " +
                        "con ${po.supplierName.ifBlank { "el proveedor" }}. " +
                        "Desde la app no se puede deshacer.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirming = false
                    onApprove(po.id)
                }) { Text("Aprobar") }
            },
            dismissButton = {
                TextButton(onClick = { confirming = false }) { Text("Cancelar") }
            },
        )
    }
}

// ── Recepción de mercancía ──────────────────────────────────────────────────

/**
 * Ficha de recepción: qué llegó, qué se rechazó, con qué lote y cuánto landed
 * cost se prorrateó. Es consulta: dar de alta una recepción exige capturar
 * cantidades renglón por renglón contra la OC, y eso se queda en la web.
 */
@Composable
internal fun GoodsReceiptDetailScreen(
    gr: GoodsReceiptDetailDto,
    onBack: () -> Unit,
) {
    LazyColumn(
        Modifier.fillMaxSize().background(NxColors.Surface),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            BackRow(onBack) {
                if (gr.rejectedLines > 0) {
                    NxStatusChip("${gr.rejectedLines} con rechazo", NxTone.Danger)
                } else {
                    NxStatusChip("Sin rechazos", NxTone.Success)
                }
            }
        }
        item { NxSectionHeader(gr.displayTitle, subtitle = gr.supplierName.ifBlank { "Recepción de mercancía" }) }

        item {
            NxPanelShell {
                DetailLine("Fecha", gr.receiptDate)
                DetailLine("Orden de compra", gr.poNumber)
                DetailLine("Proveedor", gr.supplierName)
                DetailLine(
                    "Almacén",
                    listOf(gr.warehouseCode, gr.warehouseName).filter { it.isNotBlank() }.joinToString(" · "),
                )
                DetailLine("Recibió", gr.receivedByName)
                DetailLine("Notas", gr.notes)
            }
        }

        if (gr.landedCostTotal > 0.0) {
            item {
                NxPanelShell {
                    Text("Landed cost", fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                    DetailLine("Flete", procMoney(gr.freightCost))
                    DetailLine("Seguro", procMoney(gr.insuranceCost))
                    DetailLine("Aduana", procMoney(gr.customsCost))
                    DetailLine("Otros", procMoney(gr.otherLandedCost))
                    Row(Modifier.fillMaxWidth()) {
                        Text("Total prorrateado", fontWeight = FontWeight.Bold)
                        Spacer(Modifier.weight(1f))
                        Text(procMoney(gr.landedCostTotal), fontWeight = FontWeight.Bold, color = NxColors.Teal)
                    }
                }
            }
        }

        item { Text("Renglones recibidos", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) }
        if (gr.items.isEmpty()) {
            item { NxEmptyState("Sin renglones", "Esta recepción no trae partidas.") }
        } else {
            items(gr.items, key = { it.rowKey }) { item ->
                NxPanelShell {
                    Text(item.description.ifBlank { "Partida" }, fontWeight = FontWeight.SemiBold)
                    if (item.sku.isNotBlank()) {
                        Text(item.sku, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                    }
                    Row(Modifier.fillMaxWidth()) {
                        Text("Recibido ${qty(item.quantityReceived)}", style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.weight(1f))
                        Text(procMoney(item.unitPrice), style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                    }
                    if (item.hasRejection) {
                        Text(
                            "Rechazado ${qty(item.quantityRejected)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = NxColors.Danger,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    if (item.lotNumber.isNotBlank()) {
                        Text("Lote ${item.lotNumber}", style = MaterialTheme.typography.labelSmall, color = NxColors.Teal)
                    }
                    if (item.notes.isNotBlank()) {
                        Text(item.notes, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                    }
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

// ── RFQ: comparativa, captura de precio y adjudicación ──────────────────────

/**
 * La comparativa de la web, en vertical.
 *
 * El servidor ya calcula el mejor precio y el mejor plazo; aquí sólo se marcan.
 * Adjudicar exige que el proveedor tenga TODAS sus líneas con precio — el API
 * responde 400 si falta alguna, así que el botón se apaga antes de llegar.
 */
@Composable
internal fun RfqComparisonScreen(
    cmp: RfqComparisonDto,
    state: ProcurementUiState,
    vm: ProcurementViewModel,
) {
    val rfq = cmp.rfq
    var awarding by remember { mutableStateOf<RfqSupplierQuoteDto?>(null) }
    var cancelling by remember { mutableStateOf(false) }

    LazyColumn(
        Modifier.fillMaxSize().background(NxColors.Surface),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            BackRow({ vm.closeRfq() }) {
                NxStatusChip(rfqStatusLabel(rfq.status), rfqTone(rfq.status))
            }
        }
        item {
            NxSectionHeader(
                rfq.displayTitle,
                subtitle = listOf(rfq.requisitionNumber, rfq.requisitionTitle)
                    .filter { it.isNotBlank() }
                    .joinToString(" · ")
                    .ifBlank { "Solicitud de cotización" },
            )
        }

        state.detailError?.takeIf { it.isNotBlank() }?.let { msg ->
            item { NxErrorBlock(msg) }
        }

        item {
            NxPanelShell {
                DetailLine("Vence", rfq.dueDate)
                DetailLine("Creada", rfq.createdAt)
                DetailLine("Líneas", rfq.lineCount.toString())
                DetailLine("Orden generada", rfq.awardedPoNumber)
                DetailLine("Notas", rfq.notes)
            }
        }

        if (cmp.suppliers.isEmpty()) {
            item { NxEmptyState("Sin proveedores", "Esta RFQ no tiene líneas asignadas a ningún proveedor.") }
        }

        cmp.suppliers.forEach { sup ->
            item(key = sup.rowKey) {
                NxPanelShell {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            sup.supplierName.ifBlank { "Proveedor" },
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f),
                        )
                        Text(procMoney(sup.totalPrice), fontWeight = FontWeight.Bold, color = NxColors.Teal)
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (sup.supplierId != null && sup.supplierId == cmp.bestPriceSupplierId) {
                            NxStatusChip("Mejor precio", NxTone.Success)
                        }
                        if (sup.supplierId != null && sup.supplierId == cmp.bestLeadTimeSupplierId) {
                            NxStatusChip("Mejor plazo", NxTone.Info)
                        }
                        if (!sup.isComplete) NxStatusChip("Cotización incompleta", NxTone.Warning)
                    }
                    Text(
                        "${sup.quotedLines}/${sup.totalLines} líneas cotizadas" +
                            if (sup.maxLeadTimeDays > 0) " · hasta ${sup.maxLeadTimeDays} días" else "",
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Muted,
                    )
                }
            }

            items(sup.lines, key = { "line-${it.rowKey}" }) { line ->
                RfqLineRow(line = line, enabled = rfq.canAward && !state.acting) { vm.startQuote(line) }
            }

            if (rfq.canAward) {
                item(key = "award-${sup.rowKey}") {
                    Button(
                        onClick = { awarding = sup },
                        enabled = sup.isComplete && !state.acting && sup.supplierId != null,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            if (sup.isComplete) "Adjudicar a ${sup.supplierName}"
                            else "Faltan ${sup.totalLines - sup.quotedLines} precio(s)",
                        )
                    }
                }
            }
            item(key = "sep-${sup.rowKey}") { Spacer(Modifier.height(6.dp)) }
        }

        if (rfq.canCancel && rfq.id != null) {
            item {
                TextButton(onClick = { cancelling = true }, enabled = !state.acting) {
                    Text("Cancelar RFQ", color = NxColors.Danger)
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }

    // Captura del precio de una línea.
    if (state.quoteLineId != null) {
        AlertDialog(
            onDismissRequest = { vm.cancelQuote() },
            title = { Text("Cotizar línea") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = state.quotePrice,
                        onValueChange = vm::setQuotePrice,
                        label = { Text("Precio unitario") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = state.quoteLeadTime,
                        onValueChange = vm::setQuoteLeadTime,
                        label = { Text("Días de entrega (opcional)") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = state.quoteNotes,
                        onValueChange = vm::setQuoteNotes,
                        label = { Text("Notas (opcional)") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { vm.submitQuote() }, enabled = !state.acting) { Text("Guardar") }
            },
            dismissButton = {
                TextButton(onClick = { vm.cancelQuote() }) { Text("Cancelar") }
            },
        )
    }

    awarding?.let { sup ->
        val supplierId = sup.supplierId
        AlertDialog(
            onDismissRequest = { awarding = null },
            title = { Text("Adjudicar a ${sup.supplierName}") },
            text = {
                Text(
                    "Se genera una orden de compra por ${procMoney(sup.totalPrice)} con las " +
                        "${sup.totalLines} línea(s) de este proveedor. La RFQ queda cerrada.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        awarding = null
                        if (supplierId != null) vm.awardRfq(supplierId)
                    },
                    enabled = supplierId != null,
                ) { Text("Adjudicar") }
            },
            dismissButton = { TextButton(onClick = { awarding = null }) { Text("Cancelar") } },
        )
    }

    if (cancelling && rfq.id != null) {
        AlertDialog(
            onDismissRequest = { cancelling = false },
            title = { Text("Cancelar ${rfq.displayTitle}") },
            text = { Text("La solicitud queda cancelada y ya no se podrá adjudicar.") },
            confirmButton = {
                TextButton(onClick = {
                    cancelling = false
                    vm.cancelRfqDoc(rfq.id)
                }) { Text("Cancelar RFQ", color = NxColors.Danger) }
            },
            dismissButton = { TextButton(onClick = { cancelling = false }) { Text("Volver") } },
        )
    }
}

@Composable
private fun RfqLineRow(line: RfqLineDto, enabled: Boolean, onClick: () -> Unit) {
    NxPanelShell(
        modifier = Modifier.padding(start = 12.dp),
        onClick = if (enabled) onClick else null,
        contentPadding = PaddingValues(12.dp),
    ) {
        Text(line.description.ifBlank { "Línea" }, style = MaterialTheme.typography.bodyMedium)
        if (line.sku.isNotBlank()) {
            Text(line.sku, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Cant. ${qty(line.quantity)}", style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
            Spacer(Modifier.weight(1f))
            if (line.isQuoted) {
                Text(
                    "${procMoney(line.unitPrice)} → ${procMoney(line.lineTotal)}",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                )
            } else {
                Text(
                    if (enabled) "Sin precio · tocar para cotizar" else "Sin precio",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Warning,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
        if (line.leadTimeDays != null && line.leadTimeDays > 0) {
            Text(
                "${line.leadTimeDays} días de entrega",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
    }
}
