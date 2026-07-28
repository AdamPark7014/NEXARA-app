package mx.nexara.mobile.nativeapp.ui.console.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.CatalogProductDto
import mx.nexara.mobile.nativeapp.data.api.StockLevelDto
import mx.nexara.mobile.nativeapp.data.api.StockMovementDto
import mx.nexara.mobile.nativeapp.data.api.WarehouseDto
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import mx.nexara.mobile.nativeapp.ui.common.BarcodeScannerScreen
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlert
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlertBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiGrid
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import kotlin.math.abs

private val WhTeal = Color(0xFF0D9488)
private val WhRed = Color(0xFFEF4444)
private val WhAmber = Color(0xFFF59E0B)
private val WhGreen = Color(0xFF10B981)

private enum class WhAction { RECEIVE, ISSUE, COUNT, TRANSFER }

private fun skuMatchScore(sku: String, name: String, q: String): Int {
    val skuLower = sku.lowercase()
    val nameLower = name.lowercase()
    val exactSku = q.isNotBlank() && skuLower == q
    val startsSku = q.isNotBlank() && skuLower.startsWith(q)
    return when {
        exactSku -> 0
        startsSku -> 1
        q.isBlank() -> 3
        skuLower.contains(q) || nameLower.contains(q) -> 2
        else -> 9
    }
}

/**
 * WMS móvil enterprise: inventario, alertas, recepción, despacho y conteo físico.
 */
@Composable
fun WarehouseWmsScreen(initialTab: Int = 0) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repo = remember { ExtraRepository(context) }
    val user = remember { AuthRepository(context).loadSession() }
    val canManage = user?.isSuperAdmin == true ||
        (user?.permissions ?: emptyList()).any {
            it.contains("stock.manage") || it.contains("warehouse.manage") || it.contains("console.admin")
        }

    var tab by remember { mutableIntStateOf(initialTab.coerceIn(0, 3)) }
    var loading by remember { mutableStateOf(true) }
    var message by remember { mutableStateOf<String?>(null) }
    var acting by remember { mutableStateOf(false) }

    var warehouses by remember { mutableStateOf<List<WarehouseDto>>(emptyList()) }
    var stock by remember { mutableStateOf<List<StockLevelDto>>(emptyList()) }
    var alerts by remember { mutableStateOf<List<StockLevelDto>>(emptyList()) }
    var products by remember { mutableStateOf<List<CatalogProductDto>>(emptyList()) }
    var movements by remember { mutableStateOf<List<StockMovementDto>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    var skuQuery by remember { mutableStateOf("") }

    var action by remember { mutableStateOf<WhAction?>(null) }
    var selectedLevel by remember { mutableStateOf<StockLevelDto?>(null) }

    var formProductId by remember { mutableStateOf<Long?>(null) }
    var formProductLabel by remember { mutableStateOf("") }
    var formWarehouseId by remember { mutableStateOf<Long?>(null) }
    var formWarehouseLabel by remember { mutableStateOf("") }
    var formToWarehouseId by remember { mutableStateOf<Long?>(null) }
    var formToWarehouseLabel by remember { mutableStateOf("") }
    var formQty by remember { mutableStateOf("") }
    var formCounted by remember { mutableStateOf("") }
    var formRef by remember { mutableStateOf("") }
    var formNotes by remember { mutableStateOf("") }
    var formUnitCost by remember { mutableStateOf("") }
    var pickProduct by remember { mutableStateOf(false) }
    var pickWarehouse by remember { mutableStateOf(false) }
    var pickToWarehouse by remember { mutableStateOf(false) }
    var scanBarcode by remember { mutableStateOf(false) }

    suspend fun reload() {
        loading = true
        val wh = withContext(Dispatchers.IO) { repo.warehouses() }
        val levels = withContext(Dispatchers.IO) { repo.stockLevels() }
        val low = withContext(Dispatchers.IO) {
            runCatching { repo.lowStockLevelDtos() }.getOrElse { levels.filter { it.isLow } }
        }
        val moves = withContext(Dispatchers.IO) {
            runCatching { repo.stockMovementDtos() }.getOrDefault(emptyList())
        }
        val catalog = if (canManage) {
            withContext(Dispatchers.IO) { runCatching { repo.catalogProductDtos() }.getOrDefault(emptyList()) }
        } else emptyList()
        warehouses = wh
        stock = levels
        alerts = low
        movements = moves
        products = catalog
        loading = false
    }

    LaunchedEffect(Unit) { reload() }

    fun resetForm() {
        formProductId = null
        formProductLabel = ""
        formWarehouseId = null
        formWarehouseLabel = ""
        formToWarehouseId = null
        formToWarehouseLabel = ""
        formQty = ""
        formCounted = ""
        formRef = ""
        formNotes = ""
        formUnitCost = ""
        pickProduct = false
        pickWarehouse = false
        pickToWarehouse = false
        skuQuery = ""
    }

    fun openAction(a: WhAction, level: StockLevelDto? = null) {
        resetForm()
        action = a
        selectedLevel = level
        if (level != null) {
            formProductId = level.productId
            formProductLabel = level.name.ifBlank { level.sku.ifBlank { "Producto" } }
            formWarehouseId = level.warehouseId
            formWarehouseLabel = level.warehouseName.orEmpty()
            if (a == WhAction.COUNT) {
                formCounted = level.quantity.toInt().toString()
            }
        }
    }

    if (scanBarcode) {
        BarcodeScannerScreen(
            onResult = { code ->
                skuQuery = code
                query = code
                scanBarcode = false
                pickProduct = true
            },
            onCancel = { scanBarcode = false },
        )
        return
    }

    if (pickProduct) {
        val q = (skuQuery.ifBlank { query }).trim().lowercase()
        LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    OutlinedButton(onClick = { pickProduct = false }) { Text("← Cancelar") }
                    Text("SKU / producto", fontWeight = FontWeight.Bold)
                }
            }
            item {
                Button(
                    onClick = { scanBarcode = true },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = WhTeal),
                ) { Text("📷 Escanear código de barras") }
            }
            item {
                OutlinedTextField(
                    value = skuQuery.ifBlank { query },
                    onValueChange = { skuQuery = it; query = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Escanear o escribir SKU exacto…") },
                    singleLine = true,
                )
                Text(
                    "Prioriza coincidencia exacta de SKU (pistola / teclado / cámara)",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFF64748B),
                )
            }
            if (products.isNotEmpty()) {
                val list = products
                    .map { p -> skuMatchScore(p.sku, p.name, q) to p }
                    .filter { it.first < 9 || q.isBlank() }
                    .sortedBy { it.first }
                    .map { it.second }
                items(list.take(80), key = { "${it.id}-${it.sku}" }) { p ->
                    val exact = q.isNotBlank() && p.sku.lowercase() == q
                    Card(
                        modifier = Modifier.fillMaxWidth().clickable {
                            formProductId = p.id
                            formProductLabel = p.label
                            pickProduct = false
                            query = ""
                            skuQuery = ""
                        },
                        colors = CardDefaults.cardColors(
                            containerColor = if (exact) Color(0xFFCCFBF1) else Color.White,
                        ),
                    ) {
                        Column(Modifier.padding(12.dp)) {
                            Text(p.name, fontWeight = FontWeight.SemiBold)
                            Text(
                                if (exact) "✓ SKU ${p.sku}" else p.sku,
                                style = MaterialTheme.typography.bodySmall,
                                color = if (exact) WhTeal else Color(0xFF64748B),
                            )
                        }
                    }
                }
            } else {
                val list = stock
                    .map { p -> skuMatchScore(p.sku, p.name, q) to p }
                    .filter { it.first < 9 || q.isBlank() }
                    .sortedBy { it.first }
                    .map { it.second }
                items(list.take(80), key = { "${it.productId}-${it.sku}" }) { p ->
                    val exact = q.isNotBlank() && p.sku.lowercase() == q
                    Card(
                        modifier = Modifier.fillMaxWidth().clickable {
                            formProductId = p.productId
                            formProductLabel = buildString {
                                append(p.name.ifBlank { "Producto" })
                                if (p.sku.isNotBlank()) append(" (${p.sku})")
                            }
                            pickProduct = false
                            query = ""
                            skuQuery = ""
                        },
                        colors = CardDefaults.cardColors(
                            containerColor = if (exact) Color(0xFFCCFBF1) else Color.White,
                        ),
                    ) {
                        Column(Modifier.padding(12.dp)) {
                            Text(p.name, fontWeight = FontWeight.SemiBold)
                            Text(
                                if (exact) "✓ SKU ${p.sku}" else p.sku,
                                style = MaterialTheme.typography.bodySmall,
                                color = if (exact) WhTeal else Color(0xFF64748B),
                            )
                        }
                    }
                }
            }
        }
        return
    }

    if (pickWarehouse || pickToWarehouse) {
        val choosingTo = pickToWarehouse
        LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    OutlinedButton(onClick = { pickWarehouse = false; pickToWarehouse = false }) { Text("← Cancelar") }
                    Text(if (choosingTo) "Bodega destino" else "Bodega origen", fontWeight = FontWeight.Bold)
                }
            }
            items(warehouses, key = { "${it.id}-$choosingTo" }) { w ->
                Card(
                    modifier = Modifier.fillMaxWidth().clickable {
                        val id = w.id
                        val label = w.label
                        if (choosingTo) {
                            formToWarehouseId = id
                            formToWarehouseLabel = label
                            pickToWarehouse = false
                        } else {
                            formWarehouseId = id
                            formWarehouseLabel = label
                            pickWarehouse = false
                        }
                    },
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Text(w.name, fontWeight = FontWeight.SemiBold)
                        Text(
                            w.code.ifBlank { w.city.orEmpty() },
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }
        return
    }

    val currentAction = action
    if (currentAction != null) {
        val title = when (currentAction) {
            WhAction.RECEIVE -> "Recepción (entrada)"
            WhAction.ISSUE -> "Despacho (salida)"
            WhAction.COUNT -> "Conteo físico"
            WhAction.TRANSFER -> "Transferencia entre bodegas"
        }
        LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    OutlinedButton(onClick = { action = null; selectedLevel = null; resetForm() }) {
                        Text("← Cancelar")
                    }
                    Text(title, fontWeight = FontWeight.Bold)
                }
            }
            item {
                Text(
                    when (currentAction) {
                        WhAction.RECEIVE -> "Incrementa stock en la bodega destino."
                        WhAction.ISSUE -> "Descuenta stock de la bodega origen."
                        WhAction.COUNT -> "Ajusta por diferencia entre existencia y conteo."
                        WhAction.TRANSFER -> "Mueve stock de origen → destino (mismo SKU)."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF64748B),
                )
            }
            item {
                OutlinedButton(onClick = { pickProduct = true }, modifier = Modifier.fillMaxWidth()) {
                    Text(if (formProductLabel.isBlank()) "Seleccionar producto / SKU" else "Producto: $formProductLabel")
                }
            }
            item {
                OutlinedButton(onClick = { pickWarehouse = true }, modifier = Modifier.fillMaxWidth()) {
                    Text(
                        if (formWarehouseLabel.isBlank()) {
                            if (currentAction == WhAction.TRANSFER) "Bodega origen" else "Seleccionar bodega"
                        } else {
                            if (currentAction == WhAction.TRANSFER) "Origen: $formWarehouseLabel" else "Bodega: $formWarehouseLabel"
                        },
                    )
                }
            }
            if (currentAction == WhAction.TRANSFER) {
                item {
                    OutlinedButton(onClick = { pickToWarehouse = true }, modifier = Modifier.fillMaxWidth()) {
                        Text(if (formToWarehouseLabel.isBlank()) "Bodega destino" else "Destino: $formToWarehouseLabel")
                    }
                }
            }
            if (currentAction == WhAction.COUNT) {
                val onHand = selectedLevel?.quantity ?: 0.0
                item { Text("Existencia sistema: ${onHand.toInt()} uds", fontWeight = FontWeight.SemiBold) }
                item {
                    OutlinedTextField(
                        value = formCounted,
                        onValueChange = { formCounted = it.filter { c -> c.isDigit() || c == '.' } },
                        label = { Text("Cantidad contada") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                }
            } else {
                item {
                    OutlinedTextField(
                        value = formQty,
                        onValueChange = { formQty = it.filter { c -> c.isDigit() || c == '.' } },
                        label = { Text("Cantidad") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                }
            }
            if (currentAction == WhAction.RECEIVE) {
                item {
                    OutlinedTextField(
                        value = formUnitCost,
                        onValueChange = { formUnitCost = it.filter { c -> c.isDigit() || c == '.' } },
                        label = { Text("Costo unitario (opcional)") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                }
            }
            item {
                OutlinedTextField(
                    value = formRef,
                    onValueChange = { formRef = it },
                    label = { Text("Referencia (OT / PO / folio)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
            item {
                OutlinedTextField(
                    value = formNotes,
                    onValueChange = { formNotes = it },
                    label = { Text("Notas") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                )
            }
            if (!message.isNullOrBlank()) {
                item {
                    Text(
                        message!!,
                        color = if (message!!.startsWith("✅")) WhGreen else WhRed,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            item {
                Button(
                    onClick = {
                        val pid = formProductId
                        val wid = formWarehouseId
                        if (pid == null || wid == null) {
                            message = "❌ Selecciona producto y bodega"
                            return@Button
                        }
                        if (currentAction == WhAction.TRANSFER && formToWarehouseId == null) {
                            message = "❌ Selecciona bodega destino"
                            return@Button
                        }
                        if (currentAction == WhAction.TRANSFER && formToWarehouseId == wid) {
                            message = "❌ Origen y destino deben ser distintos"
                            return@Button
                        }
                        scope.launch {
                            acting = true
                            message = null
                            try {
                                when (currentAction) {
                                    WhAction.RECEIVE -> {
                                        val qty = formQty.toDoubleOrNull()
                                        if (qty == null || qty <= 0) {
                                            message = "❌ Cantidad inválida"
                                            return@launch
                                        }
                                        withContext(Dispatchers.IO) {
                                            repo.createStockMovement(
                                                type = "RECEIPT",
                                                productId = pid,
                                                quantity = qty,
                                                toWarehouseId = wid,
                                                unitCost = formUnitCost.toDoubleOrNull(),
                                                reference = formRef.ifBlank { null },
                                                notes = formNotes.ifBlank { null },
                                            )
                                        }
                                        message = "✅ Recepción registrada"
                                    }
                                    WhAction.ISSUE -> {
                                        val qty = formQty.toDoubleOrNull()
                                        if (qty == null || qty <= 0) {
                                            message = "❌ Cantidad inválida"
                                            return@launch
                                        }
                                        withContext(Dispatchers.IO) {
                                            repo.createStockMovement(
                                                type = "DISPATCH",
                                                productId = pid,
                                                quantity = qty,
                                                fromWarehouseId = wid,
                                                reference = formRef.ifBlank { null },
                                                notes = formNotes.ifBlank { null },
                                            )
                                        }
                                        message = "✅ Despacho registrado"
                                    }
                                    WhAction.TRANSFER -> {
                                        val qty = formQty.toDoubleOrNull()
                                        val toId = formToWarehouseId
                                        if (qty == null || qty <= 0 || toId == null) {
                                            message = "❌ Cantidad o destino inválido"
                                            return@launch
                                        }
                                        withContext(Dispatchers.IO) {
                                            repo.createStockMovement(
                                                type = "TRANSFER",
                                                productId = pid,
                                                quantity = qty,
                                                fromWarehouseId = wid,
                                                toWarehouseId = toId,
                                                reference = formRef.ifBlank { null },
                                                notes = formNotes.ifBlank { null },
                                            )
                                        }
                                        message = "✅ Transferencia registrada"
                                    }
                                    WhAction.COUNT -> {
                                        val counted = formCounted.toDoubleOrNull()
                                        if (counted == null || counted < 0) {
                                            message = "❌ Conteo inválido"
                                            return@launch
                                        }
                                        val onHand = selectedLevel?.quantity ?: 0.0
                                        val delta = counted - onHand
                                        if (delta == 0.0) {
                                            message = "✅ Sin diferencia — no hay ajuste"
                                            return@launch
                                        }
                                        withContext(Dispatchers.IO) {
                                            if (delta > 0) {
                                                repo.createStockMovement(
                                                    type = "ADJUSTMENT",
                                                    productId = pid,
                                                    quantity = abs(delta),
                                                    toWarehouseId = wid,
                                                    reference = formRef.ifBlank { "CONTEO" },
                                                    notes = formNotes.ifBlank { "Conteo físico (+${delta.toInt()})" },
                                                )
                                            } else {
                                                repo.createStockMovement(
                                                    type = "ADJUSTMENT",
                                                    productId = pid,
                                                    quantity = abs(delta),
                                                    fromWarehouseId = wid,
                                                    reference = formRef.ifBlank { "CONTEO" },
                                                    notes = formNotes.ifBlank { "Conteo físico (${delta.toInt()})" },
                                                )
                                            }
                                        }
                                        message = "✅ Ajuste por conteo registrado (Δ ${delta.toInt()})"
                                    }
                                }
                                action = null
                                selectedLevel = null
                                resetForm()
                                reload()
                            } catch (e: Exception) {
                                message = "❌ ${e.message?.takeIf { it.isNotBlank() } ?: "No se pudo registrar"}"
                            } finally {
                                acting = false
                            }
                        }
                    },
                    enabled = !acting && canManage,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = WhTeal),
                ) {
                    Text(if (acting) "Registrando…" else "Confirmar movimiento")
                }
            }
        }
        return
    }

    val level = selectedLevel
    if (level != null) {
        val qty = level.quantity
        val low = level.isLow
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item { OutlinedButton(onClick = { selectedLevel = null }) { Text("← Inventario") } }
            item {
                Text(
                    level.name.ifBlank { "Producto" },
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
            }
            item {
                Card(
                    Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = if (low) Color(0xFFFEE2E2) else Color.White),
                ) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        DetailLine("SKU", level.sku)
                        DetailLine("Existencia", "${qty.toInt()} uds")
                        DetailLine(
                            "Mínimo / reorder",
                            when {
                                level.minStock != null -> level.minStock.toInt().toString()
                                level.reorderPoint != null -> level.reorderPoint.toInt().toString()
                                else -> "—"
                            },
                        )
                        DetailLine("Bodega", level.warehouseName.orEmpty())
                        DetailLine("Ubicación", level.location.orEmpty())
                        DetailLine("Categoría", level.category.orEmpty())
                    }
                }
            }
            if (canManage) {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { openAction(WhAction.RECEIVE, level) },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = WhGreen),
                        ) { Text("Recibir") }
                        OutlinedButton(
                            onClick = { openAction(WhAction.ISSUE, level) },
                            modifier = Modifier.weight(1f),
                        ) { Text("Despachar") }
                    }
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(
                            onClick = { openAction(WhAction.TRANSFER, level) },
                            modifier = Modifier.weight(1f),
                        ) { Text("Transferir") }
                        Button(
                            onClick = { openAction(WhAction.COUNT, level) },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = WhTeal),
                        ) { Text("Conteo") }
                    }
                }
            }
        }
        return
    }

    val filteredStock = remember(stock, query) {
        val q = query.trim().lowercase()
        if (q.isBlank()) stock
        else stock.filter {
            (it.name + it.sku).lowercase().contains(q) ||
                (it.warehouseName ?: "").lowercase().contains(q)
        }
    }
    val filteredWh = remember(warehouses, query) {
        val q = query.trim().lowercase()
        if (q.isBlank()) warehouses
        else warehouses.filter {
            (it.name + it.code + (it.city ?: "")).lowercase().contains(q)
        }
    }
    val lowCount = alerts.size.coerceAtLeast(stock.count { it.isLow })
    val totalUnits = stock.sumOf { it.quantity }

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
            NxSectionHeader(title = "Almacén WMS", subtitle = "Recepción · despacho · transferencia · conteo")
            Spacer(Modifier.height(8.dp))
            NxKpiGrid(
                items = listOf(
                    NxKpi("SKUs", "${stock.size}", tone = NxTone.Brand),
                    NxKpi("Unidades", "${totalUnits.toInt()}", tone = NxTone.Info),
                    NxKpi("Stock bajo", "$lowCount", hint = "≤ reorder", tone = if (lowCount > 0) NxTone.Danger else NxTone.Success),
                    NxKpi("Movimientos", "${movements.size}", tone = NxTone.Neutral),
                ),
            )
            if (lowCount > 0) {
                Spacer(Modifier.height(8.dp))
                NxAlertBanner(
                    NxAlert(
                        id = "low",
                        title = "$lowCount SKUs bajo punto de reorden",
                        subtitle = "Prioriza recepción o requisición",
                        tone = NxTone.Danger,
                        actionLabel = "Ver",
                        onAction = { tab = 2 },
                    ),
                )
            }
            if (!message.isNullOrBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    message!!,
                    color = if (message!!.startsWith("✅")) WhGreen else WhRed,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            if (canManage) {
                Spacer(Modifier.height(8.dp))
                Row(
                    Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FilterChip(selected = false, onClick = { openAction(WhAction.RECEIVE) }, label = { Text("+ Recibir") })
                    FilterChip(selected = false, onClick = { openAction(WhAction.ISSUE) }, label = { Text("Despachar") })
                    FilterChip(selected = false, onClick = { openAction(WhAction.TRANSFER) }, label = { Text("Transferir") })
                    FilterChip(selected = false, onClick = { openAction(WhAction.COUNT) }, label = { Text("Conteo") })
                    FilterChip(selected = tab == 3, onClick = { tab = 3 }, label = { Text("Historial") })
                }
            }
        }

        ScrollableTabRow(selectedTabIndex = tab) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Inventario") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Bodegas") })
            Tab(selected = tab == 2, onClick = { tab = 2 }, text = { Text("Alertas ($lowCount)") })
            Tab(selected = tab == 3, onClick = { tab = 3 }, text = { Text("Movimientos") })
        }

        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            placeholder = { Text("Buscar SKU, producto o bodega…") },
            singleLine = true,
        )

        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = WhTeal)
            }
        } else {
            when (tab) {
                0 -> LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
                    if (filteredStock.isEmpty()) {
                        item { Text("Sin niveles de stock", color = Color(0xFF64748B), modifier = Modifier.padding(24.dp)) }
                    }
                    items(filteredStock.take(120), key = { "${it.id}-${it.productId}" }) { row ->
                        val qty = row.quantity
                        val low = row.isLow
                        Card(
                            onClick = { selectedLevel = row },
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = if (low) Color(0xFFFFF1F2) else Color.White),
                        ) {
                            Row(
                                Modifier.padding(12.dp).fillMaxWidth(),
                                Arrangement.SpaceBetween,
                                Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(row.name.ifBlank { "Producto" }, fontWeight = FontWeight.Bold)
                                    Text(
                                        buildString {
                                            append(row.sku)
                                            val wh = row.warehouseName.orEmpty()
                                            if (wh.isNotBlank()) {
                                                if (isNotEmpty()) append(" · ")
                                                append(wh)
                                            }
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = Color(0xFF64748B),
                                    )
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text("${qty.toInt()}", fontWeight = FontWeight.Bold, color = if (low) WhRed else WhTeal)
                                    Text("uds", style = MaterialTheme.typography.labelSmall, color = Color(0xFF64748B))
                                }
                            }
                        }
                    }
                }
                1 -> LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
                    items(filteredWh.take(80), key = { "${it.id}" }) { w ->
                        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), shape = RoundedCornerShape(12.dp)) {
                            Column(Modifier.padding(12.dp)) {
                                Text(w.name.ifBlank { "Bodega" }, fontWeight = FontWeight.Bold)
                                Text(
                                    w.code.ifBlank { w.city ?: w.address.orEmpty() },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color(0xFF64748B),
                                )
                            }
                        }
                    }
                }
                2 -> LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
                    if (alerts.isEmpty()) {
                        item {
                            Text(
                                "Sin alertas de stock bajo — inventario saludable",
                                color = WhGreen,
                                modifier = Modifier.padding(24.dp),
                            )
                        }
                    }
                    items(alerts.take(100), key = { "a-${it.id}-${it.productId}" }) { row ->
                        Card(
                            onClick = { selectedLevel = row; tab = 0 },
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF1F2)),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Column(Modifier.padding(12.dp)) {
                                Text(row.name, fontWeight = FontWeight.Bold, color = WhRed)
                                Text(
                                    "Existencia ${row.quantity.toInt()} · reorder ${row.reorderPoint?.toInt() ?: row.minStock?.toInt() ?: 0}",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                                if (canManage) {
                                    Spacer(Modifier.height(6.dp))
                                    Text("Toca para recibir →", style = MaterialTheme.typography.labelSmall, color = WhAmber)
                                }
                            }
                        }
                    }
                }
                else -> LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
                    if (movements.isEmpty()) {
                        item {
                            Text(
                                "Sin movimientos registrados",
                                color = Color(0xFF64748B),
                                modifier = Modifier.padding(24.dp),
                            )
                        }
                    }
                    items(movements.take(80), key = { "m-${it.id}" }) { row ->
                        val type = row.type.ifBlank { "MOV" }
                        Card(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                                    Text(type, fontWeight = FontWeight.Bold, color = WhTeal)
                                    Text(
                                        "${row.quantity.toInt()} uds",
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                                Text(
                                    row.productName.ifBlank { row.sku.ifBlank { "Producto" } },
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                                val from = row.fromWarehouseName.orEmpty()
                                val to = row.toWarehouseName.orEmpty()
                                val route = when {
                                    from.isNotBlank() && to.isNotBlank() -> "$from → $to"
                                    to.isNotBlank() -> "→ $to"
                                    from.isNotBlank() -> "← $from"
                                    else -> ""
                                }
                                if (route.isNotBlank()) {
                                    Text(route, style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
                                }
                                val meta = buildList {
                                    row.reference?.takeIf { it.isNotBlank() }?.let { add(it) }
                                    row.createdAt?.takeIf { it.isNotBlank() }?.let {
                                        add(it.take(16).replace('T', ' '))
                                    }
                                }.joinToString(" · ")
                                if (meta.isNotBlank()) {
                                    Text(meta, style = MaterialTheme.typography.labelSmall, color = Color(0xFF94A3B8))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
