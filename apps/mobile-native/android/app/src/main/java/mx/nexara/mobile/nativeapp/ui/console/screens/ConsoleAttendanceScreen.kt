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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
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
import mx.nexara.mobile.nativeapp.data.api.AttendanceRangeDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.console.util.currentWeekRange

data class AttendanceUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val from: String = currentWeekRange().from,
    val to: String = currentWeekRange().to,
    val payload: AttendanceRangeDto? = null,
)

class ConsoleAttendanceViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)

    private val _state = MutableStateFlow(AttendanceUiState())
    val state: StateFlow<AttendanceUiState> = _state

    fun refresh() {
        val snapshot = _state.value
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val res = withContext(Dispatchers.IO) {
                    repo.attendanceRange(from = snapshot.from, to = snapshot.to, tryHierarchyFirst = true)
                }
                _state.update { it.copy(isLoading = false, payload = res, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = e.message?.takeIf { msg -> msg.isNotBlank() } ?: "No se pudo cargar asistencia",
                    )
                }
            }
        }
    }
}

@Composable
fun ConsoleAttendanceScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val vm: ConsoleAttendanceViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.payload == null && state.isLoading && state.error == null) {
        vm.refresh()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.Top,
    ) {
        Text("Asistencia", style = MaterialTheme.typography.titleLarge)
        Spacer(modifier = Modifier.height(10.dp))
        Text(
            text = "Rango: ${state.from} → ${state.to}",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
        )
        Spacer(modifier = Modifier.height(10.dp))

        if (state.isLoading) {
            Text("Cargando asistencia...", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }

        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.height(12.dp))
            Button(onClick = { vm.refresh() }) { Text("Reintentar") }
            return@Column
        }

        val payload = state.payload
        val users = payload?.users ?: emptyList()

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text("Usuarios: ${users.size}", style = MaterialTheme.typography.labelLarge)
                Text(
                    "Total minutos: ${payload?.totalMinutesAll ?: 0}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(users.take(200)) { u ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(u.userName ?: "Usuario ${u.userId}", style = MaterialTheme.typography.titleSmall)
                        Text(
                            "Minutos: ${u.totalMinutes ?: 0}",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }
    }
}

