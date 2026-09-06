package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.background
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import mx.nexara.mobile.nativeapp.data.api.SystemSettingDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
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
    val isRefreshing: Boolean = false,
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
    val apiKeys: List<Map<String, Any?>> = emptyList(),
    val apiKeysError: String? = null,
    val newApiKeyName: String = "",
    val createdApiKeyToken: String? = null,
    val webhooks: List<Map<String, Any?>> = emptyList(),
    val webhookDlq: List<Map<String, Any?>> = emptyList(),
    val webhooksError: String? = null,
    val integrationsBusy: Boolean = false,
)

class ConsoleSettingsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)

    private val _state = MutableStateFlow(SettingsUiState())
    val state: StateFlow<SettingsUiState> = _state

    init {
        refresh()
        refreshIntegrations()
        refreshOnModels(
            models = setOf("SystemSetting"),
            refresh = ::refresh,
        )
    }

    /**
     * API keys y webhooks dependen del plan de la empresa (Nest responde 402/403
     * si la feature no está incluida), así que cada bloque falla por separado.
     */
    fun refreshIntegrations() {
        viewModelScope.launch {
            val keys = withContext(Dispatchers.IO) { runCatching { repo.companyApiKeys() } }
            val hooks = withContext(Dispatchers.IO) { runCatching { repo.webhooks() } }
            val dlq = withContext(Dispatchers.IO) { runCatching { repo.webhooksDlq() } }
            _state.update {
                it.copy(
                    apiKeys = keys.getOrDefault(emptyList()),
                    apiKeysError = keys.exceptionOrNull()?.message,
                    webhooks = hooks.getOrDefault(emptyList()),
                    webhookDlq = dlq.getOrDefault(emptyList()),
                    webhooksError = hooks.exceptionOrNull()?.message,
                )
            }
        }
    }

    fun setNewApiKeyName(v: String) = _state.update { it.copy(newApiKeyName = v) }

    fun dismissCreatedApiKey() = _state.update { it.copy(createdApiKeyToken = null) }

    fun createApiKey() {
        val name = _state.value.newApiKeyName.trim()
        if (name.isEmpty()) return
        _state.update { it.copy(integrationsBusy = true, message = null) }
        viewModelScope.launch {
            try {
                val created = withContext(Dispatchers.IO) { repo.createCompanyApiKey(name) }
                val token = listOf("token", "apiKey", "key", "plainKey")
                    .firstNotNullOfOrNull { k -> created[k]?.toString()?.takeIf { t -> t.isNotBlank() } }
                _state.update {
                    it.copy(
                        integrationsBusy = false,
                        newApiKeyName = "",
                        createdApiKeyToken = token,
                        message = "API key \"$name\" creada",
                        messageIsError = false,
                    )
                }
                refreshIntegrations()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        integrationsBusy = false,
                        message = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo crear la API key",
                        messageIsError = true,
                    )
                }
            }
        }
    }

    fun revokeApiKey(id: Long) {
        _state.update { it.copy(integrationsBusy = true, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.revokeCompanyApiKey(id) }
                _state.update {
                    it.copy(integrationsBusy = false, message = "API key revocada", messageIsError = false)
                }
                refreshIntegrations()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        integrationsBusy = false,
                        message = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo revocar",
                        messageIsError = true,
                    )
                }
            }
        }
    }

    fun replayDelivery(deliveryId: Long) {
        _state.update { it.copy(integrationsBusy = true, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.replayWebhookDelivery(deliveryId) }
                _state.update {
                    it.copy(integrationsBusy = false, message = "Entrega reenviada", messageIsError = false)
                }
                refreshIntegrations()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        integrationsBusy = false,
                        message = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo reenviar",
                        messageIsError = true,
                    )
                }
            }
        }
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

    fun refresh(initial: Boolean = true) {
        val refreshing = !initial
        _state.update { it.copy(isLoading = initial && it.settings.isEmpty(), isRefreshing = refreshing, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.settingsList() }
                val edits = list.associate { row -> row.key to row.value }
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
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
                        isRefreshing = false,
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsoleSettingsScreen(
    onExitToPanels: () -> Unit,
    contentPadding: PaddingValues = PaddingValues(16.dp),
    onOpenOfflineQueue: (() -> Unit)? = null,
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

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().background(NxColors.Surface).padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            NxSectionHeader("Ajustes del sistema", "Requiere permiso console.admin.")
        }

        if (onOpenOfflineQueue != null) {
            item {
                NxPanelShell(onClick = onOpenOfflineQueue) {
                    Text("Cola offline", fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                    Text(
                        "Ver y sincronizar mutaciones pendientes del dispositivo",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                }
            }
        }

        item {
            NxPanelShell {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("API keys de la empresa", style = MaterialTheme.typography.titleSmall, color = NxColors.Slate)
                    if (!state.apiKeysError.isNullOrBlank()) {
                        Text(
                            state.apiKeysError!!,
                            color = NxColors.Danger,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    state.createdApiKeyToken?.let { token ->
                        Text(
                            "Token (solo se muestra ahora): $token",
                            color = NxColors.Teal,
                            style = MaterialTheme.typography.bodySmall,
                        )
                        TextButton(onClick = vm::dismissCreatedApiKey) { Text("Ocultar token") }
                    }
                    if (state.apiKeys.isEmpty() && state.apiKeysError.isNullOrBlank()) {
                        Text("Sin API keys activas", color = NxColors.Muted, style = MaterialTheme.typography.bodySmall)
                    }
                    state.apiKeys.forEach { row ->
                        val id = (row["id"] as? Number)?.toLong() ?: return@forEach
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(row["name"]?.toString() ?: "API key #$id", fontWeight = FontWeight.SemiBold)
                                val meta = listOfNotNull(
                                    row["prefix"]?.toString(),
                                    (row["scopes"] as? List<*>)?.joinToString(", "),
                                ).filter { it.isNotBlank() }.joinToString(" · ")
                                if (meta.isNotBlank()) {
                                    Text(meta, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                                }
                            }
                            TextButton(
                                onClick = { vm.revokeApiKey(id) },
                                enabled = !state.integrationsBusy,
                            ) { Text("Revocar", color = NxColors.Danger) }
                        }
                    }
                    OutlinedTextField(
                        value = state.newApiKeyName,
                        onValueChange = vm::setNewApiKeyName,
                        label = { Text("Nombre de la nueva API key") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Button(
                        onClick = vm::createApiKey,
                        enabled = !state.integrationsBusy && state.newApiKeyName.trim().isNotEmpty(),
                        colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                    ) { Text("+ Crear API key") }
                }
            }
        }

        item {
            NxPanelShell {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Webhooks outbound", style = MaterialTheme.typography.titleSmall, color = NxColors.Slate)
                    if (!state.webhooksError.isNullOrBlank()) {
                        Text(
                            state.webhooksError!!,
                            color = NxColors.Danger,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    if (state.webhooks.isEmpty() && state.webhooksError.isNullOrBlank()) {
                        Text("Sin webhooks configurados", color = NxColors.Muted, style = MaterialTheme.typography.bodySmall)
                    }
                    state.webhooks.forEach { row ->
                        Column(Modifier.fillMaxWidth()) {
                            Text(row["name"]?.toString() ?: "Webhook", fontWeight = FontWeight.SemiBold)
                            row["url"]?.toString()?.let {
                                Text(it.take(70), style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                            }
                        }
                    }
                    if (state.webhookDlq.isNotEmpty()) {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "Entregas fallidas (${state.webhookDlq.size})",
                            fontWeight = FontWeight.SemiBold,
                            color = NxColors.Danger,
                        )
                        state.webhookDlq.take(20).forEach { row ->
                            val id = (row["id"] as? Number)?.toLong() ?: return@forEach
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(row["eventType"]?.toString() ?: "Entrega #$id")
                                    row["lastError"]?.toString()?.takeIf { it.isNotBlank() }?.let {
                                        Text(it.take(60), style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                                    }
                                }
                                TextButton(
                                    onClick = { vm.replayDelivery(id) },
                                    enabled = !state.integrationsBusy,
                                ) { Text("Reenviar") }
                            }
                        }
                    }
                }
            }
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
                NxPanelShell(contentPadding = PaddingValues(12.dp)) {
                    Text(
                        text = "${state.settings.size}",
                        style = MaterialTheme.typography.headlineSmall,
                        color = NxColors.Teal,
                    )
                    Text("Total", style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
                }
                NxPanelShell(contentPadding = PaddingValues(12.dp)) {
                    Text(
                        text = "${grouped.size}",
                        style = MaterialTheme.typography.headlineSmall,
                        color = NxColors.Info,
                    )
                    Text("Categorías", style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
                }
            }
        }

        if (state.message != null) {
            item {
                Text(
                    text = state.message!!,
                    color = if (state.messageIsError) NxColors.Danger else NxColors.Teal,
                    style = MaterialTheme.typography.bodyMedium,
                )
                TextButton(onClick = vm::dismissMessage) { Text("Cerrar aviso") }
            }
        }

        when {
            state.isLoading -> item { NxLoadingBlock("Cargando configuraciones…") }
            !state.error.isNullOrBlank() -> {
                item { NxErrorBlock(state.error!!) { vm.refresh() } }
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
                        color = NxColors.Teal,
                    )
                }

                if (categoryRows.isEmpty()) {
                    item {
                        NxEmptyState(
                            title = "Sin configuraciones",
                            subtitle = "No hay ajustes en esta categoría.",
                        )
                    }
                }

                items(categoryRows, key = { it.key }) { row ->
                    NxPanelShell {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(row.label?.takeIf { it.isNotBlank() } ?: row.key, style = MaterialTheme.typography.titleSmall, color = NxColors.Slate)
                            if (!row.label.isNullOrBlank() && row.label != row.key) {
                                Text(row.key, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
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
                                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
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
                    NxPanelShell {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Agregar configuración", style = MaterialTheme.typography.titleSmall, color = NxColors.Slate)
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
                                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
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
}

fun userCanManageSystemSettings(isSuperAdmin: Boolean, permissions: List<String>): Boolean =
    isSuperAdmin || permissions.contains(PERM_CONSOLE_ADMIN)
