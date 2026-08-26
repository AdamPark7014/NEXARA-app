package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
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
import mx.nexara.mobile.nativeapp.data.api.HrStaffDto
import mx.nexara.mobile.nativeapp.data.api.ProcParse
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

data class UserRowUi(
    val id: Long,
    val nombre: String,
    val email: String?,
    val roleName: String?,
    val departmentName: String?,
    val puesto: String?,
    val estadoRrhh: String?,
    val isActive: Boolean,
    val employeeNumber: String?,
    val fechaIngreso: String?,
)

data class UsersUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val query: String = "",
    val users: List<UserRowUi> = emptyList(),
    val selectedUser: UserRowUi? = null,
)

class ConsoleUsersViewModel(app: Application) : AndroidViewModel(app) {
    private val consoleRepo = ConsoleRepository(app.applicationContext)
    private val extraRepo = ExtraRepository(app.applicationContext)

    private val _state = MutableStateFlow(UsersUiState())
    val state: StateFlow<UsersUiState> = _state

    init {
        refreshOnModels(
            models = setOf("User", "Role", "Department"),
            refresh = { refresh(initial = false) },
        )
    }

    fun setQuery(value: String) = _state.update { it.copy(query = value) }
    fun selectUser(user: UserRowUi?) = _state.update { it.copy(selectedUser = user) }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(
                isLoading = initial && it.users.isEmpty(),
                isRefreshing = !initial,
                error = null,
            )
        }
        viewModelScope.launch {
            try {
                val merged = withContext(Dispatchers.IO) { loadUsers() }
                _state.update {
                    it.copy(isLoading = false, isRefreshing = false, users = merged, error = null)
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.message?.takeIf { msg -> msg.isNotBlank() } ?: "No se pudieron cargar usuarios",
                    )
                }
            }
        }
    }

    private suspend fun loadUsers(): List<UserRowUi> {
        val base = consoleRepo.usersFetch(preferAssignable = false)
        val hrById = mutableMapOf<Long, HrStaffDto>()
        var page = 1
        repeat(10) {
            val batch = extraRepo.hrStaffDtos(page = page, limit = 100)
            if (batch.isEmpty()) return@repeat
            batch.forEach { hr -> if (hr.id > 0L) hrById[hr.id] = hr }
            if (batch.size < 100) return@repeat
            page++
        }

        return base.map { u ->
            val hr = hrById[u.id]
            val raw = hr?.raw.orEmpty()
            val role = ProcParse.str(
                raw["roleName"],
                (raw["role"] as? Map<*, *>)?.get("nombre"),
            ).takeIf { it.isNotBlank() }
            val dept = ProcParse.str(
                raw["departmentName"],
                (raw["department"] as? Map<*, *>)?.get("nombre"),
            ).takeIf { it.isNotBlank() }
            UserRowUi(
                id = u.id,
                nombre = u.nombre,
                email = u.email,
                roleName = role,
                departmentName = dept,
                puesto = ProcParse.str(raw["puesto"]).takeIf { it.isNotBlank() },
                estadoRrhh = ProcParse.str(raw["estadoRRHH"], hr?.estadoRrhh).takeIf { it.isNotBlank() },
                isActive = hr?.isActive ?: true,
                employeeNumber = ProcParse.str(raw["employeeNumber"]).takeIf { it.isNotBlank() },
                fechaIngreso = ProcParse.str(raw["fechaIngreso"]).takeIf { it.isNotBlank() },
            )
        }.sortedBy { it.nombre.lowercase() }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsoleUsersScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val vm: ConsoleUsersViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.users.isEmpty() && state.isLoading && state.error == null) {
        vm.refresh(initial = true)
    }

    val selected = state.selectedUser
    if (selected != null) {
        UserDetailScreen(user = selected, onBack = { vm.selectUser(null) })
        return
    }

    val q = state.query.trim().lowercase()
    val filtered = if (q.isBlank()) {
        state.users
    } else {
        state.users.filter { u ->
            "${u.nombre} ${u.email ?: ""} ${u.roleName ?: ""} ${u.departmentName ?: ""} ${u.puesto ?: ""}"
                .lowercase()
                .contains(q)
        }
    }

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(contentPadding),
            verticalArrangement = Arrangement.Top,
        ) {
            Text("Usuarios", style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(10.dp))

            if (state.isLoading) {
                NxLoadingBlock("Cargando usuarios…")
                return@Column
            }

            if (!state.error.isNullOrBlank()) {
                Text(state.error!!, color = MaterialTheme.colorScheme.error)
                Spacer(modifier = Modifier.height(12.dp))
                Button(onClick = { vm.refresh(initial = true) }) { Text("Reintentar") }
                return@Column
            }

            OutlinedTextField(
                value = state.query,
                onValueChange = vm::setQuery,
                label = { Text("Buscar nombre, rol o departamento") },
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

            if (filtered.isEmpty()) {
                NxEmptyState(
                    title = "Sin usuarios",
                    subtitle = if (q.isBlank()) "No hay usuarios visibles en tu organización." else "Ningún usuario coincide con la búsqueda.",
                )
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    items(filtered.take(300), key = { it.id }) { u ->
                        UserListCard(u, onClick = { vm.selectUser(u) })
                    }
                }
            }
        }
    }
}

@Composable
private fun UserListCard(u: UserRowUi, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(u.nombre, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold))
                    if (!u.email.isNullOrBlank()) {
                        Text(u.email, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (!u.isActive) {
                    NxStatusChip("Inactivo", NxTone.Danger)
                }
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (!u.roleName.isNullOrBlank()) {
                    NxStatusChip(u.roleName, NxTone.Brand)
                }
                if (!u.departmentName.isNullOrBlank()) {
                    NxStatusChip(u.departmentName, NxTone.Info)
                }
                if (!u.puesto.isNullOrBlank()) {
                    NxStatusChip(u.puesto, NxTone.Neutral)
                }
            }
        }
    }
}

@Composable
private fun UserDetailScreen(user: UserRowUi, onBack: () -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Button(onClick = onBack) { Text("← Usuarios") } }
        item {
            Text(user.nombre, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
            if (!user.email.isNullOrBlank()) {
                Text(user.email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Información", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
                    DetailRow("Rol", user.roleName)
                    DetailRow("Departamento", user.departmentName)
                    DetailRow("Puesto", user.puesto)
                    DetailRow("No. empleado", user.employeeNumber)
                    DetailRow("Estado RRHH", user.estadoRrhh)
                    DetailRow("Fecha ingreso", user.fechaIngreso?.take(10))
                    DetailRow("Estatus", if (user.isActive) "Activo" else "Inactivo")
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun DetailRow(label: String, value: String?) {
    if (value.isNullOrBlank()) return
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium))
    }
}
