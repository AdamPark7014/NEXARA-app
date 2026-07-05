package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
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
import mx.nexara.mobile.nativeapp.data.api.ToolKitAssignmentDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository

data class MyKitUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val reportText: String = "",
    val reportingId: Long? = null,
    val items: List<ToolKitAssignmentDto> = emptyList(),
)

class ConsoleToolMyKitViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)
    private val _state = MutableStateFlow(MyKitUiState())
    val state: StateFlow<MyKitUiState> = _state

    fun setReportText(v: String) = _state.update { it.copy(reportText = v) }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.myToolKit() }
                _state.update { it.copy(isLoading = false, items = list, error = null) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message ?: "No se pudo cargar mi kit") }
            }
        }
    }

    fun report(assignmentId: Long) {
        val text = _state.value.reportText.trim()
        if (text.length < 5) {
            _state.update { it.copy(error = "Describe el incidente (mín 5 caracteres)") }
            return
        }
        _state.update { it.copy(reportingId = assignmentId, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.reportKitIncident(assignmentId = assignmentId, description = text) }
                _state.update { it.copy(reportText = "", reportingId = null) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(reportingId = null, error = e.message ?: "No se pudo reportar") }
            }
        }
    }
}

@Composable
fun ConsoleToolMyKitScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
    onBack: () -> Unit = {},
) {
    val vm: ConsoleToolMyKitViewModel = viewModel()
    val state by vm.state.collectAsState()
    var selected by remember { mutableStateOf<ToolKitAssignmentDto?>(null) }

    if (state.items.isEmpty() && state.isLoading && state.error == null) vm.refresh()

    val sel = selected
    if (sel != null) {
        MyKitDetail(sel, reportText = state.reportText, reportingId = state.reportingId,
            onReport = { vm.report(sel.id) }, onChangeText = vm::setReportText,
            onBack = { selected = null })
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.Top,
    ) {
        Text("Mi Kit", style = MaterialTheme.typography.titleLarge)
        Spacer(modifier = Modifier.height(10.dp))
        Button(onClick = onBack) { Text("← Volver") }
        Spacer(modifier = Modifier.height(10.dp))

        if (state.isLoading) {
            Text("Cargando...", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }
        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
        }

        OutlinedTextField(
            value = state.reportText,
            onValueChange = vm::setReportText,
            label = { Text("Reportar incidente (texto)") },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(12.dp))

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(state.items) { item ->
                Card(
                    onClick = { selected = item },
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text("${item.inventoryItem.toolName} · ${item.inventoryItem.model}", style = MaterialTheme.typography.titleSmall)
                        Text("Serie: ${item.inventoryItem.serialNumber}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        Text("Tipo: ${item.assignmentType}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun MyKitDetail(
    item: ToolKitAssignmentDto,
    reportText: String,
    reportingId: Long?,
    onReport: () -> Unit,
    onChangeText: (String) -> Unit,
    onBack: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Button(onClick = onBack) { Text("← Mi Kit") } }
        item {
            Text("${item.inventoryItem.toolName} · ${item.inventoryItem.model}",
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
        }
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Equipo", style = MaterialTheme.typography.titleSmall)
                    mkRow("Número de serie", item.inventoryItem.serialNumber)
                    mkRow("Estatus",         item.inventoryItem.status)
                    mkRow("Tipo de asignación", item.assignmentType)
                    mkRow("Asignado el",     item.assignedAt.take(10))
                    item.dueReturnDate?.let { mkRow("Fecha de devolución", it.take(10)) }
                    item.replacementCount?.let { mkRow("Reemplazos", it.toString()) }
                }
            }
        }
        if (item.events.isNotEmpty()) {
            item {
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Historial de incidentes", style = MaterialTheme.typography.titleSmall)
                        item.events.forEach { ev ->
                            Column(Modifier.padding(vertical = 4.dp)) {
                                Text(ev.description, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium))
                                if (ev.resolution.isNotBlank()) {
                                    Text("Resolución: ${ev.resolution}", style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Text(ev.reportedAt.take(10), style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Reportar incidente", style = MaterialTheme.typography.titleSmall)
                    OutlinedTextField(
                        value = reportText,
                        onValueChange = onChangeText,
                        label = { Text("Descripción del problema") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Button(onClick = onReport, enabled = reportingId == null && reportText.isNotBlank()) {
                        Text(if (reportingId == item.id) "Enviando..." else "Enviar reporte")
                    }
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun mkRow(label: String, value: String) {
    if (value.isNotBlank() && value != "null") {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium))
        }
    }
}

