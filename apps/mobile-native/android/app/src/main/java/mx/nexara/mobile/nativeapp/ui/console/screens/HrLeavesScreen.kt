package mx.nexara.mobile.nativeapp.ui.console.screens

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository

data class HrLeavesUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val query: String = "",
    val typeFilter: String = "todos",
    val items: List<Map<String, Any?>> = emptyList(),
)

class HrLeavesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(HrLeavesUiState())
    val state: StateFlow<HrLeavesUiState> = _state

    init { refresh() }

    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun setTypeFilter(v: String) = _state.update { it.copy(typeFilter = v) }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.hrLeaves() }
                _state.update { it.copy(loading = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    fun filtered(): List<Map<String, Any?>> {
        val s = _state.value
        var list = s.items
        if (s.typeFilter != "todos") {
            list = list.filter { str(it, "type", "tipo").equals(s.typeFilter, ignoreCase = true) }
        }
        val q = s.query.trim().lowercase()
        if (q.isNotBlank()) {
            list = list.filter { row ->
                buildString {
                    append(str(row, "reason", "motivo", "type"))
                    append(str(row, "userName", "employeeName", "nombre"))
                }.lowercase().contains(q)
            }
        }
        return list
    }

    private fun str(m: Map<String, Any?>, vararg keys: String): String {
        for (k in keys) {
            val v = m[k]?.toString()?.trim().orEmpty()
            if (v.isNotBlank() && v != "null") return v
        }
        return ""
    }
}

@Composable
fun HrLeavesScreen(onBack: () -> Unit = {}, contentPadding: PaddingValues = PaddingValues(16.dp)) {
    val vm: HrLeavesViewModel = viewModel()
    val state by vm.state.collectAsState()
    val filtered = vm.filtered()
    val types = listOf("todos") + state.items.mapNotNull { row ->
        row["type"]?.toString()?.takeIf { it.isNotBlank() } ?: row["tipo"]?.toString()
    }.distinct().sorted()
    val pending = state.items.count { strMap(it, "status", "estado").equals("pendiente", true) }

    Column(Modifier.fillMaxSize().padding(contentPadding)) {
        Text("RR. HH. · Permisos", style = MaterialTheme.typography.titleLarge)
        if (!state.loading && state.items.isNotEmpty()) {
            Text("${state.items.size} solicitudes · $pending pendientes", color = Color(0xFF64748B), style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = state.query, onValueChange = vm::setQuery, label = { Text("Buscar") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            types.take(6).forEach { t ->
                Button(onClick = { vm.setTypeFilter(t) }, enabled = state.typeFilter != t) {
                    Text(t.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() })
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        when {
            state.loading -> CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
            state.error != null -> Text(state.error!!, color = MaterialTheme.colorScheme.error)
            filtered.isEmpty() -> Text("Sin solicitudes", color = Color(0xFF64748B))
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(filtered.take(80), key = { strMap(it, "id") }) { row ->
                    HrLeaveCard(row)
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Button(onClick = onBack) { Text("Volver") }
    }
}

@Composable
private fun HrLeaveCard(row: Map<String, Any?>) {
    val reason = strMap(row, "reason", "motivo", "type")
    val user = strMap(row, "userName", "employeeName", "nombre")
    val status = strMap(row, "status", "estado")
    Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.padding(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(reason.ifBlank { "Permiso" }, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Text(status, style = MaterialTheme.typography.labelSmall, color = Color(0xFF0D9488))
            }
            if (user.isNotBlank()) Text(user, style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
        }
    }
}

private fun strMap(m: Map<String, Any?>, vararg keys: String): String {
    for (k in keys) {
        val v = m[k]?.toString()?.trim().orEmpty()
        if (v.isNotBlank() && v != "null") return v
    }
    return ""
}
