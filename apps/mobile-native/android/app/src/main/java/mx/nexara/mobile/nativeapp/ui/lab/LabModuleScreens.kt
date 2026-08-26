package mx.nexara.mobile.nativeapp.ui.lab

import android.app.Application
import androidx.compose.foundation.background
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.text.font.FontWeight
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
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.lab.LabRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader

private val SlateText = NxColors.Slate
private val SubText = NxColors.Muted
private val TealColor = NxColors.Teal

// ── Health ────────────────────────────────────────────────────────────────────

data class LabHealthUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val basic: String? = null,
    val summary: LabHealthSummaryDto? = null,
    val error: String? = null,
)

class LabHealthViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = LabRepository(app.applicationContext)
    private val _state = MutableStateFlow(LabHealthUiState())
    val state: StateFlow<LabHealthUiState> = _state

    init { refresh() }

    fun refresh(pullToRefresh: Boolean = false) {
        _state.update {
            if (pullToRefresh) it.copy(isRefreshing = true, error = null)
            else it.copy(loading = true, error = null)
        }
        viewModelScope.launch {
            try {
                val basic = withContext(Dispatchers.IO) { repo.basicHealth() }
                val summary = withContext(Dispatchers.IO) { repo.healthSummary() }
                _state.update {
                    it.copy(loading = false, isRefreshing = false, basic = basic, summary = summary)
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudo cargar el estado de la API"),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LabHealthScreen(onBack: () -> Unit) {
    val vm: LabHealthViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.loading && !state.isRefreshing && state.basic == null && state.error == null) {
        Box(Modifier.fillMaxSize().background(NxColors.Surface), contentAlignment = Alignment.Center) {
            NxLoadingBlock("Cargando salud de API…")
        }
        return
    }

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.refresh(pullToRefresh = true) },
        modifier = Modifier.fillMaxSize(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(NxColors.Surface)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Monitoreo de endpoints y métricas del servidor.",
                style = MaterialTheme.typography.bodySmall,
                color = SubText,
            )

            if (!state.error.isNullOrBlank()) {
                NxErrorBlock(state.error!!, onRetry = { vm.refresh(pullToRefresh = true) })
            }

            if (state.basic != null) {
                NxSectionHeader("Endpoint básico", "GET /health")
                NxPanelShell {
                    Text(
                        state.basic ?: "—",
                        style = MaterialTheme.typography.bodySmall,
                        color = SlateText,
                    )
                }
            }

            state.summary?.let { s ->
                NxSectionHeader("Resumen LAB", "Métricas en tiempo real")
                NxPanelShell {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        LabHealthRow("Memoria", "${s.memoryMB ?: "—"} MB")
                        LabHealthRow("Uptime", formatUptimeSeconds(s.uptime))
                        s.counts?.let { c ->
                            LabHealthRow("Usuarios", (c.users ?: 0).toString())
                            LabHealthRow("Proyectos", (c.projects ?: 0).toString())
                            LabHealthRow("OT abiertas", (c.openTickets ?: 0).toString())
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LabHealthRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = SubText)
        Text(value, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = SlateText)
    }
}

private fun formatUptimeSeconds(seconds: Double?): String {
    if (seconds == null) return "—"
    val total = seconds.toLong()
    val days = total / 86400
    val hours = (total % 86400) / 3600
    val mins = (total % 3600) / 60
    return when {
        days > 0 -> "${days}d ${hours}h"
        hours > 0 -> "${hours}h ${mins}m"
        else -> "${mins}m"
    }
}

// ── Feature flags ─────────────────────────────────────────────────────────────

data class LabFlagsUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val actingKey: String? = null,
    val rows: List<FeatureFlagDto> = emptyList(),
)

class LabFlagsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = LabRepository(app.applicationContext)
    private val _state = MutableStateFlow(LabFlagsUiState())
    val state: StateFlow<LabFlagsUiState> = _state

    init { refresh() }

    fun refresh(pullToRefresh: Boolean = false) {
        _state.update {
            if (pullToRefresh) it.copy(isRefreshing = true, error = null)
            else it.copy(loading = true, error = null)
        }
        viewModelScope.launch {
            try {
                val rows = withContext(Dispatchers.IO) { repo.flags() }
                _state.update { it.copy(loading = false, isRefreshing = false, rows = rows) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar los flags"),
                    )
                }
            }
        }
    }

    fun toggle(key: String, enabled: Boolean) {
        _state.update { it.copy(actingKey = key) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.setFlag(key, enabled) }
                _state.update { it.copy(actingKey = null) }
                refresh(pullToRefresh = true)
            } catch (e: Exception) {
                _state.update { it.copy(actingKey = null, error = e.message) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LabFlagsScreen(onBack: () -> Unit) {
    val vm: LabFlagsViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.loading && !state.isRefreshing && state.rows.isEmpty() && state.error == null) {
        Box(Modifier.fillMaxSize().background(NxColors.Surface), contentAlignment = Alignment.Center) {
            NxLoadingBlock("Cargando flags…")
        }
        return
    }

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.refresh(pullToRefresh = true) },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(NxColors.Surface)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Text(
                    "Activa o desactiva toggles de funcionalidad en el entorno.",
                    style = MaterialTheme.typography.bodySmall,
                    color = SubText,
                )
            }

            if (!state.error.isNullOrBlank()) {
                item { NxErrorBlock(state.error!!) { vm.refresh(pullToRefresh = true) } }
            }

            item {
                NxSectionHeader("Flags", "${state.rows.size} configurados · ${state.rows.count { it.enabled == true }} activos")
            }

            items(state.rows, key = { it.key }) { f ->
                NxPanelShell {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                f.key,
                                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                                color = SlateText,
                            )
                            Text(
                                f.scope ?: f.description ?: "",
                                style = MaterialTheme.typography.bodySmall,
                                color = SubText,
                            )
                        }
                        Switch(
                            checked = f.enabled == true,
                            onCheckedChange = { vm.toggle(f.key, it) },
                            enabled = state.actingKey == null,
                        )
                    }
                }
            }

            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

// ── AI Sandbox ────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
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
    var isRefreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun resetForm() {
        output = ""
        meta = ""
        isRefreshing = false
    }

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = {
            isRefreshing = true
            resetForm()
            isRefreshing = false
        },
        modifier = Modifier.fillMaxSize(),
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .background(NxColors.Surface)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Prueba prompts contra el proveedor configurado en el backend.",
                style = MaterialTheme.typography.bodySmall,
                color = SubText,
            )

            NxPanelShell(contentPadding = PaddingValues(16.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = model,
                        onValueChange = { model = it },
                        label = { Text("Modelo") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = systemPrompt,
                        onValueChange = { systemPrompt = it },
                        label = { Text("System prompt") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = prompt,
                        onValueChange = { prompt = it },
                        label = { Text("Prompt") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 4,
                    )
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
                                    meta = ""
                                } finally {
                                    running = false
                                }
                            }
                        },
                        enabled = !running && prompt.isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = TealColor),
                    ) {
                        Text(if (running) "Ejecutando…" else "Ejecutar")
                    }
                }
            }

            if (meta.isNotBlank() || output.isNotBlank()) {
                NxSectionHeader("Respuesta", meta.ifBlank { null })
                NxPanelShell {
                    if (meta.isNotBlank()) {
                        Text(meta, style = MaterialTheme.typography.labelSmall, color = TealColor)
                        Spacer(Modifier.height(8.dp))
                    }
                    if (running) {
                        NxLoadingBlock("Generando respuesta…")
                    } else if (output.isNotBlank()) {
                        Text(output, style = MaterialTheme.typography.bodySmall, color = SlateText)
                    }
                }
            }
        }
    }
}
