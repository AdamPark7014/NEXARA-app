package mx.nexara.mobile.nativeapp.ui.lab

import android.app.Application
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.FeatureFlagDto
import mx.nexara.mobile.nativeapp.data.api.LabHealthSummaryDto
import mx.nexara.mobile.nativeapp.data.lab.LabRepository

// ── Health ────────────────────────────────────────────────────────────────────

@Composable
fun LabHealthScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val repo = remember(context) { LabRepository(context) }
    var loading by remember { mutableStateOf(true) }
    var basic by remember { mutableStateOf<String?>(null) }
    var summary by remember { mutableStateOf<LabHealthSummaryDto?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    suspend fun load() {
        loading = true
        error = null
        try {
            val b = withContext(Dispatchers.IO) { repo.basicHealth() }
            val s = withContext(Dispatchers.IO) { repo.healthSummary() }
            basic = b
            summary = s
        } catch (e: Exception) {
            error = e.message ?: "Error"
        } finally {
            loading = false
        }
    }

    LaunchedEffect(Unit) { load() }

    Column(
        modifier = Modifier.fillMaxSize().padding(20.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("API Health", style = MaterialTheme.typography.headlineSmall)
        when {
            loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
            error != null -> Text("Error: $error", color = MaterialTheme.colorScheme.error)
            else -> {
                Text("GET /health", style = MaterialTheme.typography.labelMedium)
                Text(basic ?: "—", style = MaterialTheme.typography.bodySmall)
                summary?.let { s ->
                    Spacer(Modifier.height(8.dp))
                    Text("Resumen LAB", style = MaterialTheme.typography.titleSmall)
                    Text("Memoria: ${s.memoryMB ?: "—"} MB", style = MaterialTheme.typography.bodySmall)
                    Text("Uptime: ${s.uptime?.toInt() ?: "—"}s", style = MaterialTheme.typography.bodySmall)
                    s.counts?.let { c ->
                        Text("Usuarios: ${c.users ?: 0} · Proyectos: ${c.projects ?: 0} · OT: ${c.openTickets ?: 0}",
                            style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        Button(onClick = { scope.launch { load() } }) { Text("Actualizar") }
        Button(onClick = onBack) { Text("Volver") }
    }
}

// ── Feature flags ─────────────────────────────────────────────────────────────

data class LabFlagsUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val actingKey: String? = null,
    val rows: List<FeatureFlagDto> = emptyList(),
)

class LabFlagsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = LabRepository(app.applicationContext)
    private val _state = MutableStateFlow(LabFlagsUiState())
    val state: StateFlow<LabFlagsUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val rows = withContext(Dispatchers.IO) { repo.flags() }
                _state.update { it.copy(loading = false, rows = rows) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Error") }
            }
        }
    }

    fun toggle(key: String, enabled: Boolean) {
        _state.update { it.copy(actingKey = key) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.setFlag(key, enabled) }
                _state.update { it.copy(actingKey = null) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(actingKey = null, error = e.message) }
            }
        }
    }
}

@Composable
fun LabFlagsScreen(onBack: () -> Unit) {
    val vm: LabFlagsViewModel = viewModel()
    val state by vm.state.collectAsState()

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Feature flags", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))
        if (state.loading) Text("Cargando…")
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(state.rows, key = { it.key }) { f ->
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(f.key, style = MaterialTheme.typography.titleSmall)
                        Text(f.scope ?: f.description ?: "", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(
                        checked = f.enabled == true,
                        onCheckedChange = { vm.toggle(f.key, it) },
                        enabled = state.actingKey == null,
                    )
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Button(onClick = onBack) { Text("Volver") }
    }
}

// ── AI Sandbox ────────────────────────────────────────────────────────────────

@Composable
fun LabAiScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val repo = remember(context) { LabRepository(context) }
    var model by remember { mutableStateOf("gpt-4o-mini") }
    var systemPrompt by remember { mutableStateOf("") }
    var prompt by remember { mutableStateOf("") }
    var output by remember { mutableStateOf("") }
    var meta by remember { mutableStateOf("") }
    var running by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(
        Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("AI Sandbox", style = MaterialTheme.typography.titleLarge)
        OutlinedTextField(value = model, onValueChange = { model = it }, label = { Text("Modelo") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = systemPrompt, onValueChange = { systemPrompt = it }, label = { Text("System prompt") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = prompt, onValueChange = { prompt = it }, label = { Text("Prompt") }, modifier = Modifier.fillMaxWidth(), minLines = 4)
        Button(
            onClick = {
                running = true
                scope.launch {
                    try {
                        val res = withContext(Dispatchers.IO) {
                            repo.runAi(model, prompt.trim(), systemPrompt)
                        }
                        output = res.output.orEmpty()
                        meta = "${res.provider} · ${res.elapsedMs}ms" + if (res.isMock == true) " · mock" else ""
                    } catch (e: Exception) {
                        output = e.message ?: "Error"
                    } finally {
                        running = false
                    }
                }
            },
            enabled = !running && prompt.isNotBlank(),
        ) { Text(if (running) "Ejecutando…" else "Ejecutar") }
        if (meta.isNotBlank()) Text(meta, style = MaterialTheme.typography.labelSmall)
        if (output.isNotBlank()) Text(output, style = MaterialTheme.typography.bodySmall)
        Button(onClick = onBack) { Text("Volver") }
    }
}
