package mx.nexara.mobile.nativeapp.ui.console.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader

private val COLUMN_META = listOf(
    "pendiente" to "Pendiente",
    "en_curso" to "En curso",
    "por_validar" to "Por validar",
    "completadas_hoy" to "Completadas hoy",
)

@Composable
fun ConsoleDispatchScreen(
    onOpenActivity: (Long) -> Unit = {},
) {
    val ctx = LocalContext.current
    val repo = remember(ctx) { ConsoleRepository(ctx.applicationContext) }
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var board by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var reassignCard by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var reassigning by remember { mutableStateOf(false) }
    var reassignError by remember { mutableStateOf<String?>(null) }
    var selectedIds by remember { mutableStateOf(setOf<Long>()) }
    var bulkUserId by remember { mutableStateOf<Long?>(null) }
    var bulkAssigning by remember { mutableStateOf(false) }
    var bulkMsg by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var showBulkPicker by remember { mutableStateOf(false) }

    fun reload() {
        scope.launch {
            loading = true
            error = null
            runCatching {
                withContext(Dispatchers.IO) { repo.dispatchBoard() }
            }.onSuccess {
                board = it
                selectedIds = emptySet()
                bulkMsg = null
            }.onFailure {
                error = it.toUserMessage("No se pudo cargar el despacho")
            }
            loading = false
        }
    }

    LaunchedEffect(Unit) { reload() }

    @Suppress("UNCHECKED_CAST")
    val assignableUsers = board?.get("assignableUsers") as? List<Map<String, Any?>> ?: emptyList()

    fun toggleSelected(id: Long) {
        selectedIds = if (id in selectedIds) selectedIds - id else selectedIds + id
    }

    fun runBulkAssign(userId: Long) {
        if (selectedIds.isEmpty()) return
        bulkAssigning = true
        bulkMsg = null
        scope.launch {
            var ok = 0
            var fail = 0
            for (activityId in selectedIds) {
                runCatching {
                    withContext(Dispatchers.IO) {
                        repo.reassignActivity(activityId, userId, "Asignación desde despacho móvil")
                    }
                }.onSuccess { ok += 1 }.onFailure { fail += 1 }
            }
            bulkMsg = "$ok OT reasignadas${if (fail > 0) " · $fail fallaron" else ""}"
            bulkAssigning = false
            showBulkPicker = false
            bulkUserId = null
            reload()
        }
    }

    if (reassignCard != null) {
        val activityId = dispatchLong(reassignCard, "id")
        AlertDialog(
            onDismissRequest = { if (!reassigning) reassignCard = null },
            title = { Text("Reasignar OT") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        dispatchStr(reassignCard!!, "anNumber").ifBlank { "OT #$activityId" },
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (reassignError != null) {
                        Text(reassignError!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                    if (assignableUsers.isEmpty()) {
                        Text("No hay técnicos asignables.", style = MaterialTheme.typography.bodySmall)
                    } else {
                        assignableUsers.forEach { user ->
                            val userId = dispatchLong(user, "id")
                            TextButton(
                                onClick = {
                                    if (activityId <= 0L || userId <= 0L) return@TextButton
                                    reassigning = true
                                    reassignError = null
                                    scope.launch {
                                        runCatching {
                                            withContext(Dispatchers.IO) {
                                                repo.reassignActivity(activityId, userId, "Reasignación desde despacho móvil")
                                            }
                                        }.onSuccess {
                                            reassignCard = null
                                            reload()
                                        }.onFailure {
                                            reassignError = it.toUserMessage("No se pudo reasignar")
                                        }
                                        reassigning = false
                                    }
                                },
                                enabled = !reassigning,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(dispatchStr(user, "nombre"))
                            }
                        }
                    }
                    if (reassigning) {
                        CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { reassignCard = null }, enabled = !reassigning) {
                    Text("Cancelar")
                }
            },
        )
    }

    if (showBulkPicker) {
        AlertDialog(
            onDismissRequest = { if (!bulkAssigning) showBulkPicker = false },
            title = { Text("Asignar ${selectedIds.size} OT") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (assignableUsers.isEmpty()) {
                        Text("No hay técnicos asignables.")
                    } else {
                        assignableUsers.forEach { user ->
                            val userId = dispatchLong(user, "id")
                            val selected = bulkUserId == userId
                            TextButton(
                                onClick = { bulkUserId = userId },
                                enabled = !bulkAssigning,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(
                                    buildString {
                                        if (selected) append("✓ ")
                                        append(dispatchStr(user, "nombre"))
                                    },
                                )
                            }
                        }
                    }
                    if (bulkAssigning) {
                        CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val uid = bulkUserId ?: return@TextButton
                        runBulkAssign(uid)
                    },
                    enabled = !bulkAssigning && bulkUserId != null && selectedIds.isNotEmpty(),
                ) { Text(if (bulkAssigning) "Asignando…" else "Confirmar") }
            },
            dismissButton = {
                TextButton(onClick = { showBulkPicker = false }, enabled = !bulkAssigning) {
                    Text("Cancelar")
                }
            },
        )
    }

    when {
        loading -> BoxCenter { NxLoadingBlock("Cargando despacho…") }
        error != null -> BoxCenter {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(error ?: "Error", color = MaterialTheme.colorScheme.error)
                Button(onClick = { reload() }) { Text("Reintentar") }
            }
        }
        board == null -> BoxCenter {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Sin datos de despacho", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(onClick = { reload() }) { Text("Actualizar") }
            }
        }
        else -> {
            @Suppress("UNCHECKED_CAST")
            val columns = board!!["columns"] as? Map<String, Any?> ?: emptyMap()
            @Suppress("UNCHECKED_CAST")
            val technicians = board!!["technicians"] as? List<Map<String, Any?>> ?: emptyList()
            val q = query.trim().lowercase()

            fun matchesQuery(card: Map<String, Any?>): Boolean {
                if (q.isBlank()) return true
                val hay = buildString {
                    append(dispatchStr(card, "anNumber"))
                    append(' ')
                    append(dispatchStr(card, "titulo"))
                    append(' ')
                    append(dispatchStr(card, "branchName", "branchCity"))
                    append(' ')
                    append(dispatchNestedStr(card, "client", "name"))
                    append(' ')
                    append(dispatchNestedStr(card, "responsable", "nombre"))
                    append(' ')
                    append(dispatchStr(card, "estatus", "prioridad"))
                }.lowercase()
                return hay.contains(q)
            }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Despacho OT", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        OutlinedButton(onClick = { reload() }, enabled = !bulkAssigning) {
                            Text("Actualizar")
                        }
                    }
                }

                item {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        label = { Text("Buscar OT / cliente / técnico") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                if (assignableUsers.isNotEmpty()) {
                    item {
                        Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("Asignación masiva", fontWeight = FontWeight.SemiBold)
                                Text(
                                    if (selectedIds.isEmpty()) {
                                        "Marca OT con el check o mantén pulsada una tarjeta para reasignar una."
                                    } else {
                                        "${selectedIds.size} OT seleccionadas"
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                if (!bulkMsg.isNullOrBlank()) {
                                    Text(bulkMsg!!, style = MaterialTheme.typography.bodySmall)
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(
                                        onClick = { showBulkPicker = true },
                                        enabled = !bulkAssigning && selectedIds.isNotEmpty(),
                                    ) { Text(if (bulkAssigning) "Asignando…" else "Asignar seleccionadas") }
                                    if (selectedIds.isNotEmpty()) {
                                        OutlinedButton(
                                            onClick = { selectedIds = emptySet() },
                                            enabled = !bulkAssigning,
                                        ) { Text("Limpiar") }
                                    }
                                }
                            }
                        }
                    }
                }

                if (technicians.isNotEmpty()) {
                    item {
                        NxSectionHeader("Carga de técnicos", "${technicians.size} activos")
                    }
                    items(technicians, key = { dispatchStr(it, "id") }) { tech ->
                        TechnicianLoadCard(tech)
                    }
                }

                COLUMN_META.forEach { (key, title) ->
                    @Suppress("UNCHECKED_CAST")
                    val cards = (columns[key] as? List<Map<String, Any?>> ?: emptyList())
                        .filter(::matchesQuery)
                    item {
                        Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text(
                            "${cards.size} OT",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (cards.isEmpty()) {
                        item {
                            Text(
                                if (q.isBlank()) "Sin OT en esta columna" else "Sin coincidencias",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    items(cards, key = { "$key-${dispatchStr(it, "id")}" }) { card ->
                        val id = dispatchLong(card, "id")
                        DispatchCard(
                            card = card,
                            selected = id in selectedIds,
                            canSelect = assignableUsers.isNotEmpty() && id > 0L,
                            onToggleSelect = { if (id > 0L) toggleSelected(id) },
                            onClick = {
                                if (id > 0L) onOpenActivity(id)
                            },
                            onLongClick = {
                                reassignError = null
                                reassignCard = card
                            },
                        )
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DispatchCard(
    card: Map<String, Any?>,
    selected: Boolean,
    canSelect: Boolean,
    onToggleSelect: () -> Unit,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
) {
    Card(
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = onClick, onLongClick = onLongClick),
    ) {
        Row(
            Modifier.padding(start = 4.dp, end = 14.dp, top = 10.dp, bottom = 10.dp),
            verticalAlignment = Alignment.Top,
        ) {
            if (canSelect) {
                Checkbox(checked = selected, onCheckedChange = { onToggleSelect() })
            }
            Column(
                Modifier.weight(1f).padding(vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(
                        dispatchStr(card, "anNumber").ifBlank { "OT #${dispatchStr(card, "id")}" },
                        fontWeight = FontWeight.Bold,
                    )
                    Text(dispatchStr(card, "prioridad"), style = MaterialTheme.typography.bodySmall)
                }
                Text(dispatchStr(card, "titulo"), style = MaterialTheme.typography.bodyMedium)
                Text(
                    dispatchStr(card, "branchName", "branchCity").ifBlank {
                        dispatchNestedStr(card, "client", "name")
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                val responsable = dispatchNestedStr(card, "responsable", "nombre")
                if (responsable.isNotBlank()) {
                    Text("👷 $responsable", style = MaterialTheme.typography.labelSmall)
                }
                Text(dispatchStr(card, "estatus"), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun TechnicianLoadCard(tech: Map<String, Any?>) {
    Card(
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(dispatchStr(tech, "nombre"), fontWeight = FontWeight.SemiBold)
                Text(
                    "${dispatchInt(tech, "activas")} activas · ${dispatchInt(tech, "enCurso")} en curso",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                "${dispatchInt(tech, "completadasHoy")} hoy",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
private fun BoxCenter(content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { content() }
}

private fun dispatchStr(m: Map<String, Any?>?, vararg keys: String): String {
    if (m == null) return ""
    for (k in keys) {
        val v = m[k] ?: continue
        val s = v.toString()
        if (s.isNotBlank() && s != "null") return s
    }
    return ""
}

private fun dispatchNestedStr(m: Map<String, Any?>?, parent: String, child: String): String {
    val nested = m?.get(parent) as? Map<String, Any?> ?: return ""
    return dispatchStr(nested, child)
}

private fun dispatchLong(m: Map<String, Any?>?, vararg keys: String): Long {
    val s = dispatchStr(m, *keys)
    return s.toLongOrNull() ?: 0L
}

private fun dispatchInt(m: Map<String, Any?>?, vararg keys: String): Int {
    val s = dispatchStr(m, *keys)
    return s.toIntOrNull() ?: 0
}
