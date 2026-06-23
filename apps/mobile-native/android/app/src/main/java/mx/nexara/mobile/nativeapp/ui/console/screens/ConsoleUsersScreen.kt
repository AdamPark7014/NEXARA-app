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
import mx.nexara.mobile.nativeapp.data.api.VisibleUserDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels

data class UsersUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val query: String = "",
    val users: List<VisibleUserDto> = emptyList(),
)

class ConsoleUsersViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)

    private val _state = MutableStateFlow(UsersUiState())
    val state: StateFlow<UsersUiState> = _state

    init {
        refreshOnModels(
            models = setOf("User", "Role", "Department"),
            refresh = ::refresh,
        )
    }

    fun setQuery(value: String) = _state.update { it.copy(query = value) }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.usersFetch(preferAssignable = true) }
                _state.update { it.copy(isLoading = false, users = list, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = e.message?.takeIf { msg -> msg.isNotBlank() } ?: "No se pudieron cargar usuarios",
                    )
                }
            }
        }
    }
}

@Composable
fun ConsoleUsersScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val vm: ConsoleUsersViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.users.isEmpty() && state.isLoading && state.error == null) {
        vm.refresh()
    }

    val q = state.query.trim().lowercase()
    val filtered = if (q.isBlank()) state.users else state.users.filter { u ->
        val hay = "${u.nombre} ${u.email ?: ""}".lowercase()
        hay.contains(q)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.Top,
    ) {
        Text("Usuarios", style = MaterialTheme.typography.titleLarge)
        Spacer(modifier = Modifier.height(10.dp))

        if (state.isLoading) {
            Text("Cargando usuarios...", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }

        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.height(12.dp))
            Button(onClick = { vm.refresh() }) { Text("Reintentar") }
            return@Column
        }

        OutlinedTextField(
            value = state.query,
            onValueChange = vm::setQuery,
            label = { Text("Buscar") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(10.dp))
        Text(
            text = "Total: ${filtered.size}",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(10.dp))

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(filtered.take(300)) { u ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(u.nombre, style = MaterialTheme.typography.titleSmall)
                        if (!u.email.isNullOrBlank()) {
                            Text(u.email!!, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

