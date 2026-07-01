package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
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
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.ViaticDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl

data class ViaticsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val query: String = "",
    val viatics: List<ViaticDto> = emptyList(),
)

class ConsoleViaticsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)

    private val _state = MutableStateFlow(ViaticsUiState())
    val state: StateFlow<ViaticsUiState> = _state

    fun setQuery(v: String) = _state.update { it.copy(query = v) }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.viaticsFetch() }
                _state.update { it.copy(isLoading = false, viatics = list, error = null) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message ?: "No se pudieron cargar viáticos") }
            }
        }
    }
}

@Composable
fun ConsoleViaticsScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val context = LocalContext.current
    val vm: ConsoleViaticsViewModel = viewModel()
    val state by vm.state.collectAsState()
    var selected by remember { mutableStateOf<ViaticDto?>(null) }
    var statusFilter by remember { mutableStateOf("todos") }

    if (state.viatics.isEmpty() && state.isLoading && state.error == null) vm.refresh()

    // Viatic detail view
    if (selected != null) {
        val v = selected!!
        val statusColor = viaticStatusColor(v.estatusPago ?: "")
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    OutlinedButton(onClick = { selected = null }) { Text("← Volver") }
                    Text(v.estatusPago ?: "—", color = statusColor, fontWeight = FontWeight.SemiBold)
                }
            }
            item { Text("Viático #${v.id}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        fun r(k: String, va: String) { if (va.isNotBlank()) item { Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) { Text(k, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(0.4f)); Text(va, modifier = Modifier.weight(0.6f)) } } }
                        if (!v.actividad?.anNumber.isNullOrBlank()) DetailLine("Actividad (AN)", v.actividad!!.anNumber)
                        if (!v.usuario?.nombre.isNullOrBlank()) DetailLine("Empleado", v.usuario!!.nombre)
                        DetailLine("Razón de gasto", v.razonGasto ?: "—")
                        DetailLine("Monto solicitado", viaticFmt(v.montoSolicitado))
                        DetailLine("Estado de pago", v.estatusPago ?: "—")
                        DetailLine("Fecha", v.createdAt?.take(10) ?: "—")
                    }
                }
            }
            if (!v.ticketEvidenciaUrl.isNullOrBlank()) {
                item {
                    Button(onClick = { openExternalUrl(context, v.ticketEvidenciaUrl!!) }, Modifier.fillMaxWidth()) {
                        Text("Ver comprobante / ticket")
                    }
                }
            }
        }
        return
    }

    val allStatuses = listOf("todos") + state.viatics.mapNotNull { it.estatusPago }.distinct().sorted()
    val q = state.query.trim().lowercase()
    val filtered = state.viatics.filter { v ->
        val matchStatus = statusFilter == "todos" || (v.estatusPago ?: "").equals(statusFilter, true)
        val matchQuery = q.isBlank() || buildString {
            append(v.actividad?.anNumber ?: ""); append(" ")
            append(v.razonGasto ?: ""); append(" ")
            append(v.usuario?.nombre ?: "")
        }.lowercase().contains(q)
        matchStatus && matchQuery
    }

    val totalMonto = state.viatics.sumOf { it.montoSolicitado ?: 0.0 }
    val totalPendiente = state.viatics.filter { (it.estatusPago ?: "").equals("pendiente", true) }.sumOf { it.montoSolicitado ?: 0.0 }
    val totalPagado = state.viatics.filter { (it.estatusPago ?: "").equals("pagado", true) || (it.estatusPago ?: "").equals("pagada", true) }.sumOf { it.montoSolicitado ?: 0.0 }

    Column(Modifier.fillMaxSize().padding(contentPadding)) {
        Text("Viáticos", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))

        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            Button(onClick = { vm.refresh() }) { Text("Reintentar") }
            return@Column
        }

        if (state.isLoading) {
            Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }
            return@Column
        }

        // KPI strip
        if (state.viatics.isNotEmpty()) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                KpiChip("Total", "${state.viatics.size}", null, Modifier.weight(1f))
                KpiChip("Pend.", viaticFmt(totalPendiente), Color(0xFFE65100), Modifier.weight(1f))
                KpiChip("Pagado", viaticFmt(totalPagado), Color(0xFF2E7D32), Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
        }

        OutlinedTextField(
            value = state.query,
            onValueChange = vm::setQuery,
            placeholder = { Text("Buscar (AN, empleado, razón)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))

        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            allStatuses.forEach { st ->
                FilterChip(selected = statusFilter == st, onClick = { statusFilter = st }, label = { Text(st, style = MaterialTheme.typography.labelSmall) })
            }
        }
        Spacer(Modifier.height(8.dp))

        if (filtered.isEmpty()) {
            Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Sin viáticos", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                items(filtered.take(200), key = { it.id }) { v ->
                    val statusColor = viaticStatusColor(v.estatusPago ?: "")
                    Card(
                        modifier = Modifier.fillMaxWidth().clickable { selected = v },
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    ) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                                Text(
                                    v.actividad?.anNumber?.let { "AN: $it" } ?: "Viático #${v.id}",
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.weight(1f),
                                )
                                Text(viaticFmt(v.montoSolicitado), fontWeight = FontWeight.Bold, color = statusColor)
                            }
                            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                                Text(v.usuario?.nombre ?: "", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                                Text(v.estatusPago ?: "—", fontSize = 12.sp, color = statusColor, fontWeight = FontWeight.SemiBold)
                            }
                            if (!v.razonGasto.isNullOrBlank()) {
                                Text(v.razonGasto!!, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun viaticStatusColor(status: String): Color = when {
    status.equals("pagado", true) || status.equals("pagada", true) || status.equals("aprobado", true) -> Color(0xFF2E7D32)
    status.equals("pendiente", true) -> Color(0xFFE65100)
    status.equals("rechazado", true) || status.equals("cancelado", true) -> Color(0xFFDC2626)
    else -> Color.Gray
}

private fun viaticFmt(amount: Double?): String {
    if (amount == null) return "$0"
    return when {
        amount >= 1_000_000 -> "$" + String.format("%.1fM", amount / 1_000_000)
        amount >= 1_000 -> "$" + String.format("%.0fK", amount / 1_000)
        else -> "$" + String.format("%,.0f", amount)
    }
}

