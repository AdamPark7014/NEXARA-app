package mx.nexara.mobile.nativeapp.ui.ventas

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
import mx.nexara.mobile.nativeapp.data.crm.CrmRepository

private val CrmGreen = Color(0xFF10B981)

data class TemplatesUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val items: List<Map<String, Any?>> = emptyList(),
    val showForm: Boolean = false,
    val saving: Boolean = false,
    val actionError: String? = null,
    val name: String = "",
    val description: String = "",
    val companyName: String = "",
    val companyEmail: String = "",
    val companyPhone: String = "",
    val companyRfc: String = "",
    val primaryColor: String = "#0f6ad6",
    val footerText: String = "",
)

class VentasTemplatesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = CrmRepository(app.applicationContext)
    private val _state = MutableStateFlow(TemplatesUiState())
    val state: StateFlow<TemplatesUiState> = _state

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null, actionError = null) }
            try {
                val list = withContext(Dispatchers.IO) { repo.orderTemplates() }
                _state.update { it.copy(isLoading = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun openForm() = _state.update {
        it.copy(
            showForm = true,
            name = "",
            description = "",
            companyName = "",
            companyEmail = "",
            companyPhone = "",
            companyRfc = "",
            primaryColor = "#0f6ad6",
            footerText = "",
            actionError = null,
        )
    }

    fun closeForm() = _state.update { it.copy(showForm = false, actionError = null) }

    fun setField(field: String, value: String) = _state.update {
        when (field) {
            "name" -> it.copy(name = value)
            "description" -> it.copy(description = value)
            "companyName" -> it.copy(companyName = value)
            "companyEmail" -> it.copy(companyEmail = value)
            "companyPhone" -> it.copy(companyPhone = value)
            "companyRfc" -> it.copy(companyRfc = value)
            "primaryColor" -> it.copy(primaryColor = value)
            "footerText" -> it.copy(footerText = value)
            else -> it
        }
    }

    fun create() {
        val s = _state.value
        if (s.name.isBlank()) {
            _state.update { it.copy(actionError = "El nombre es obligatorio") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(saving = true, actionError = null) }
            try {
                val payload = buildMap {
                    put("name", s.name.trim())
                    if (s.description.isNotBlank()) put("description", s.description.trim())
                    if (s.companyName.isNotBlank()) put("companyName", s.companyName.trim())
                    if (s.companyEmail.isNotBlank()) put("companyEmail", s.companyEmail.trim())
                    if (s.companyPhone.isNotBlank()) put("companyPhone", s.companyPhone.trim())
                    if (s.companyRfc.isNotBlank()) put("companyRfc", s.companyRfc.trim())
                    if (s.primaryColor.isNotBlank()) put("primaryColor", s.primaryColor.trim())
                    if (s.footerText.isNotBlank()) put("footerText", s.footerText.trim())
                }
                withContext(Dispatchers.IO) { repo.createOrderTemplate(payload) }
                _state.update { it.copy(saving = false, showForm = false) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, actionError = e.message) }
            }
        }
    }

    fun setDefault(id: Long) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.setOrderTemplateDefault(id) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(actionError = e.message) }
            }
        }
    }

    fun delete(id: Long) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.deleteOrderTemplate(id) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(actionError = e.message) }
            }
        }
    }
}

private fun tplStr(m: Map<String, Any?>, vararg keys: String): String {
    for (k in keys) {
        val v = m[k] ?: continue
        val s = v.toString()
        if (s.isNotBlank() && s != "null") return s
    }
    return ""
}

private fun tplId(m: Map<String, Any?>): Long? =
    (m["id"] as? Number)?.toLong() ?: m["id"]?.toString()?.toLongOrNull()

private fun tplBool(m: Map<String, Any?>, vararg keys: String): Boolean {
    for (k in keys) {
        when (val v = m[k]) {
            is Boolean -> return v
            is Number -> return v.toInt() != 0
            is String -> if (v.equals("true", true) || v == "1") return true
        }
    }
    return false
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VentasTemplatesScreen() {
    val ctx = LocalContext.current
    val vm: VentasTemplatesViewModel = viewModel(
        factory = object : androidx.lifecycle.ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T =
                VentasTemplatesViewModel(ctx.applicationContext as Application) as T
        },
    )
    val state by vm.state.collectAsState()
    var confirmDeleteId by remember { mutableStateOf<Long?>(null) }

    Scaffold(
        floatingActionButton = {
            if (!state.showForm) {
                FloatingActionButton(
                    onClick = vm::openForm,
                    containerColor = CrmGreen,
                ) { Icon(Icons.Default.Add, "Nueva plantilla") }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when {
                state.isLoading -> Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }
                !state.error.isNullOrBlank() && state.items.isEmpty() -> Column(
                    Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(state.error ?: "", color = MaterialTheme.colorScheme.error)
                    Button(onClick = vm::refresh) { Text("Reintentar") }
                }
                else -> LazyColumn(
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    item {
                        Text(
                            "Plantillas de cotización PDF",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            "Diseño corporativo reutilizable para cotizaciones.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (!state.actionError.isNullOrBlank()) {
                        item {
                            Text(state.actionError ?: "", color = MaterialTheme.colorScheme.error, fontSize = MaterialTheme.typography.bodySmall.fontSize)
                        }
                    }
                    if (state.items.isEmpty()) {
                        item {
                            Text("Sin plantillas. Crea la primera con el botón +.", Modifier.padding(vertical = 24.dp))
                        }
                    } else {
                        items(state.items, key = { tplId(it)?.toString() ?: it.hashCode().toString() }) { tpl ->
                            TemplateCard(
                                tpl = tpl,
                                onSetDefault = { tplId(tpl)?.let(vm::setDefault) },
                                onDelete = { tplId(tpl)?.let { confirmDeleteId = it } },
                            )
                        }
                    }
                }
            }
        }
    }

    if (state.showForm) {
        ModalBottomSheet(onDismissRequest = vm::closeForm) {
            Column(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("Nueva plantilla", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                OutlinedTextField(state.name, { vm.setField("name", it) }, label = { Text("Nombre *") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(state.description, { vm.setField("description", it) }, label = { Text("Descripción") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(state.companyName, { vm.setField("companyName", it) }, label = { Text("Empresa") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(state.companyEmail, { vm.setField("companyEmail", it) }, label = { Text("Email") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(state.companyPhone, { vm.setField("companyPhone", it) }, label = { Text("Teléfono") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(state.companyRfc, { vm.setField("companyRfc", it) }, label = { Text("RFC") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(state.primaryColor, { vm.setField("primaryColor", it) }, label = { Text("Color primario (#hex)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(state.footerText, { vm.setField("footerText", it) }, label = { Text("Pie de página") }, modifier = Modifier.fillMaxWidth())
                if (!state.actionError.isNullOrBlank()) {
                    Text(state.actionError ?: "", color = MaterialTheme.colorScheme.error, fontSize = MaterialTheme.typography.bodySmall.fontSize)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = vm::closeForm, modifier = Modifier.weight(1f)) { Text("Cancelar") }
                    Button(
                        onClick = vm::create,
                        enabled = !state.saving,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = CrmGreen),
                    ) {
                        if (state.saving) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                        else Text("Guardar")
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }

    confirmDeleteId?.let { id ->
        AlertDialog(
            onDismissRequest = { confirmDeleteId = null },
            title = { Text("Eliminar plantilla") },
            text = { Text("¿Eliminar esta plantilla de cotización?") },
            confirmButton = {
                TextButton(onClick = { vm.delete(id); confirmDeleteId = null }) { Text("Eliminar", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDeleteId = null }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun TemplateCard(
    tpl: Map<String, Any?>,
    onSetDefault: () -> Unit,
    onDelete: () -> Unit,
) {
    val isDefault = tplBool(tpl, "isDefault", "is_default")
    val colorHex = tplStr(tpl, "primaryColor", "primary_color").ifBlank { "#0f6ad6" }
    val swatch = runCatching { Color(android.graphics.Color.parseColor(colorHex)) }.getOrDefault(CrmGreen)

    Card(shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(
                    Modifier.size(14.dp).clip(CircleShape).background(swatch),
                )
                Text(
                    tplStr(tpl, "name", "nombre").ifBlank { "—" },
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                if (isDefault) {
                    AssistChip(
                        onClick = {},
                        label = { Text("Predeterminada", style = MaterialTheme.typography.labelSmall) },
                        leadingIcon = { Icon(Icons.Default.Star, null, Modifier.size(14.dp)) },
                        colors = AssistChipDefaults.assistChipColors(containerColor = CrmGreen.copy(alpha = 0.12f)),
                    )
                }
            }
            val desc = tplStr(tpl, "description", "descripcion")
            if (desc.isNotBlank()) {
                Text(desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            val company = tplStr(tpl, "companyName", "company_name")
            if (company.isNotBlank()) {
                Text(company, style = MaterialTheme.typography.labelMedium)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (!isDefault) {
                    TextButton(onClick = onSetDefault) { Text("Predeterminar") }
                }
                TextButton(onClick = onDelete, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) {
                    Icon(Icons.Default.Delete, null, Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Eliminar")
                }
            }
        }
    }
}
