package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import mx.nexara.mobile.nativeapp.data.api.SystemSettingDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels
import retrofit2.HttpException

private const val PERM_CONSOLE_ADMIN = "console.admin"

private val DEFAULT_CATEGORY_ORDER = listOf(
    "general",
    "empresa",
    "fiscal",
    "notificaciones",
    "seguridad",
)

private fun categoryLabel(key: String): String = when (key) {
    "general" -> "⚙️ General"
    "empresa" -> "🏢 Empresa"
    "fiscal" -> "🧾 Fiscal"
    "notificaciones" -> "🔔 Notificaciones"
    "seguridad" -> "🔒 Seguridad"
    else -> key.replaceFirstChar { c -> if (c.isLowerCase()) c.uppercaseChar() else c }
}

data class SettingsUiState(
    val isLoading: Boolean = true,
    val saving: Boolean = false,
    val error: String? = null,
    val settings: List<SystemSettingDto> = emptyList(),
    val activeCategory: String = "general",
    val editValues: Map<String, String> = emptyMap(),
    val newKey: String = "",
    val newLabel: String = "",
    val newValue: String = "",
    val message: String? = null,
    val messageIsError: Boolean = false,
    val pendingDeleteKey: String? = null,
)

class ConsoleSettingsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)

    private val _state = MutableStateFlow(SettingsUiState())
    val state: StateFlow<SettingsUiState> = _state

    init {
        refresh()
        refreshOnModels(
            models = setOf("SystemSetting"),
            refresh = ::refresh,
        )
    }

    fun setActiveCategory(cat: String) = _state.update { it.copy(activeCategory = cat) }

    fun setEdit(key: String, value: String) =
        _state.update { s -> s.copy(editValues = s.editValues + (key to value)) }

    fun setNewKey(v: String) = _state.update { it.copy(newKey = v) }
    fun setNewLabel(v: String) = _state.update { it.copy(newLabel = v) }
    fun setNewValue(v: String) = _state.update { it.copy(newValue = v) }

    fun dismissMessage() = _state.update { it.copy(message = null, messageIsError = false) }

    fun requestDelete(key: String) = _state.update { it.copy(pendingDeleteKey = key) }

    fun dismissDelete() = _state.update { it.copy(pendingDeleteKey = null) }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.settingsList() }
                val edits = list.associate { row -> row.key to row.value }
                _state.update {
                    it.copy(
                        isLoading = false,
                        settings = list,
                        editValues = edits,
                        error = null,
                    )
                }
            } catch (e: Exception) {
                val msg = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudieron cargar ajustes"
                val forbidden = msg.contains("403", ignoreCase = true) ||
                    (e is HttpException && e.code() == 403)
                _state.update {
                    it.copy(
                        isLoading = false,
                        settings = emptyList(),
                        error = if (forbidden) {
                            "No tienes permiso para administrar ajustes del sistema (console.admin)."
                        } else {
                            msg
                        },
                    )
                }
            }
        }
    }

    fun save(key: String) {
        val cat = _state.value.activeCategory
        val value = _state.value.editValues[key] ?: ""
        _state.update { it.copy(saving = true, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.settingsUpsert(key = key, value = value, category = cat, label = null)
                }
                _state.update {
                    it.copy(
                        saving = false,
                        message = "\"$key\" guardado",
                        messageIsError = false,
                    )
                }
                refresh()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        saving = false,
                        message = e.message?.takeIf { m -> m.isNotBlank() } ?: "Error al guardar",
                        messageIsError = true,
                    )
                }
            }
        }
    }

    fun addNew() {
        val key = _state.value.newKey.trim()
        if (key.isEmpty()) return
        val cat = _state.value.activeCategory
        val value = _state.value.newValue
        val label = _state.value.newLabel.trim().takeIf { it.isNotEmpty() }
        _state.update { it.copy(saving = true, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.settingsUpsert(key = key, value = value, category = cat, label = label)
                }
                _state.update {
                    it.copy(
                        saving = false,
                        newKey = "",
                        newLabel = "",
                        newValue = "",
                        message = "\"$key\" creado",
                        messageIsError = false,
                    )
                }
                refresh()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        saving = false,
                        message = e.message?.takeIf { m -> m.isNotBlank() } ?: "Error al crear",
                        messageIsError = true,
                    )
                }
            }
        }
    }

    fun confirmDelete() {
        val key = _state.value.pendingDeleteKey ?: return
        _state.update { it.copy(saving = true, pendingDeleteKey = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.settingsDelete(key) }
                _state.update {
                    it.copy(
                        saving = false,
                        message = "\"$key\" eliminado",
                        messageIsError = false,
                    )
                }
                refresh()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        saving = false,
                        message = e.message?.takeIf { m -> m.isNotBlank() } ?: "Error al eliminar",
                        messageIsError = true,
                    )
                }
            }
        }
    }
}

@Composable
fun ConsoleSettingsScreen(
    onExitToPanels: () -> Unit,
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val vm: ConsoleSettingsViewModel = viewModel()
    val state by vm.state.collectAsState()

    val grouped = state.settings.groupBy { it.category.ifBlank { "general" } }
    val allCategories = (DEFAULT_CATEGORY_ORDER + grouped.keys).distinct()

    val categoryRows = grouped[state.activeCategory].orEmpty()

    if (state.pendingDeleteKey != null) {
        AlertDialog(
            onDismissRequest = vm::dismissDelete,
            title = { Text("Eliminar configuración") },
            text = { Text("¿Eliminar \"${state.pendingDeleteKey}\"?") },
            confirmButton = {
                TextButton(onClick = vm::confirmDelete) { Text("Eliminar") }
            },
            dismissButton = {
                TextButton(onClick = vm::dismissDelete) { Text("Cancelar") }
            },
        )
    }

    LazyColumn(
        modifier = Modifier.padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("Ajustes del sistema", style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Requiere permiso console.admin.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        item {
            Row(modifier = Modifier.horizontalScroll(rememberScrollState())) {
                allCategories.forEach { cat ->
                    FilterChip(
                        selected = state.activeCategory == cat,
                        onClick = { vm.setActiveCategory(cat) },
                        label = { Text(categoryLabel(cat)) },
                        modifier = Modifier.padding(end = 8.dp),
                    )
                }
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Card(colors = CardDefaults.cardColors()) {
                    Column(Modifier.padding(12.dp)) {
                        Text(
                            text = "${state.settings.size}",
                            style = MaterialTheme.typography.headlineSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Text("Total", style = MaterialTheme.typography.labelMedium)
                    }
                }
                Card(colors = CardDefaults.cardColors()) {
                    Column(Modifier.padding(12.dp)) {
                        Text(
                            text = "${grouped.size}",
                            style = MaterialTheme.typography.headlineSmall,
                            color = MaterialTheme.colorScheme.tertiary,
                        )
                        Text("Categorías", style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }

        if (state.message != null) {
            item {
                Text(
                    text = state.message!!,
                    color = if (state.messageIsError) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.primary
                    },
                    style = MaterialTheme.typography.bodyMedium,
                )
                TextButton(onClick = vm::dismissMessage) { Text("Cerrar aviso") }
            }
        }

        when {
            state.isLoading -> item { Text("Cargando configuraciones…") }
            !state.error.isNullOrBlank() -> {
                item {
                    Text(state.error!!, color = MaterialTheme.colorScheme.error)
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(onClick = { vm.refresh() }) { Text("Reintentar") }
                }
                item {
                    OutlinedButton(onClick = onExitToPanels, modifier = Modifier.fillMaxWidth()) {
                        Text("Salir a paneles")
                    }
                }
            }
            else -> {
                item {
                    Text(
                        categoryLabel(state.activeCategory),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }

                if (categoryRows.isEmpty()) {
                    item {
                        Text(
                            "No hay configuraciones en esta categoría.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                items(categoryRows, key = { it.key }) { row ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    ) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(row.label?.takeIf { it.isNotBlank() } ?: row.key, style = MaterialTheme.typography.titleSmall)
                            if (!row.label.isNullOrBlank() && row.label != row.key) {
                                Text(row.key, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            OutlinedTextField(
                                value = state.editValues[row.key] ?: row.value,
                                onValueChange = { vm.setEdit(row.key, it) },
                                label = { Text("Valor") },
                                singleLine = false,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(
                                    onClick = { vm.save(row.key) },
                                    enabled = !state.saving,
                                ) { Text("Guardar") }
                                OutlinedButton(
                                    onClick = { vm.requestDelete(row.key) },
                                    enabled = !state.saving,
                                ) { Text("Eliminar") }
                            }
                        }
                    }
                }

                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                    ) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Agregar configuración", style = MaterialTheme.typography.titleSmall)
                            OutlinedTextField(
                                value = state.newKey,
                                onValueChange = vm::setNewKey,
                                label = { Text("Clave") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            OutlinedTextField(
                                value = state.newLabel,
                                onValueChange = vm::setNewLabel,
                                label = { Text("Etiqueta (opcional)") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            OutlinedTextField(
                                value = state.newValue,
                                onValueChange = vm::setNewValue,
                                label = { Text("Valor") },
                                singleLine = false,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Button(
                                onClick = vm::addNew,
                                enabled = !state.saving && state.newKey.trim().isNotEmpty(),
                            ) { Text("+ Agregar") }
                        }
                    }
                }

                item {
                    OutlinedButton(onClick = onExitToPanels, modifier = Modifier.fillMaxWidth()) {
                        Text("Salir a paneles")
                    }
                }
            }
        }
    }
}

fun userCanManageSystemSettings(isSuperAdmin: Boolean, permissions: List<String>): Boolean =
    isSuperAdmin || permissions.contains(PERM_CONSOLE_ADMIN)
