package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ToolRequestDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock

// ── State & VM ───────────────────────────────────────────────────────────────

data class ToolsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val query: String = "",
    val my: List<ToolRequestDto> = emptyList(),
    val all: List<ToolRequestDto> = emptyList(),
)

class ConsoleToolsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)
    private val _state = MutableStateFlow(ToolsUiState())
    val state: StateFlow<ToolsUiState> = _state

    fun setQuery(v: String) = _state.update { it.copy(query = v) }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val my = withContext(Dispatchers.IO) { repo.myToolRequests() }
                val all = withContext(Dispatchers.IO) {
                    runCatching { repo.toolRequests(null) }.getOrDefault(emptyList())
                }
                _state.update { it.copy(isLoading = false, my = my, all = all, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(isLoading = false, error = e.message ?: "No se pudieron cargar herramientas")
                }
            }
        }
    }
}

// ── Colors ────────────────────────────────────────────────────────────────────

private val TlTeal = Color(0xFF0D9488)
private val TlTealLight = Color(0xFFCCFBF1)
private val TlSlate = Color(0xFF0F172A)
private val TlSub = Color(0xFF64748B)
private val TlBlue = Color(0xFF3B82F6)
private val TlBlueLight = Color(0xFFDBEAFE)
private val TlAmber = Color(0xFFF59E0B)
private val TlAmberLight = Color(0xFFFEF3C7)
private val TlGreen = Color(0xFF10B981)
private val TlGreenLight = Color(0xFFD1FAE5)
private val TlRed = Color(0xFFEF4444)

private fun toolStatusColor(status: String?): Color {
    val s = (status ?: "").lowercase()
    return when {
        s.contains("aprobad") || s.contains("activ") -> TlGreen
        s.contains("pendiente") || s.contains("solicit") -> TlAmber
        s.contains("rechazad") || s.contains("vencid") -> TlRed
        s.contains("asignad") -> TlBlue
        else -> TlSub
    }
}

// ── Tab definitions ──────────────────────────────────────────────────────────

private sealed class ToolsTab(val key: String, val label: String, val icon: String, val forAdmin: Boolean) {
    object Solicitar : ToolsTab("request", "Solicitar", "📝", forAdmin = false)
    object MiKit : ToolsTab("my-kit", "Mi Kit", "🧰", forAdmin = false)
    object Usuarios : ToolsTab("manage", "Usuarios", "👥", forAdmin = true)
    object Inventario : ToolsTab("inventory", "Inventario", "🏭", forAdmin = true)
    object Renovaciones : ToolsTab("renewals", "Renovaciones", "↻", forAdmin = true)
}

// ── Main composable ──────────────────────────────────────────────────────────

@Composable
fun ConsoleToolsScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
    onOpenInventory: () -> Unit = {},
    onOpenMyKit: () -> Unit = {},
    onOpenKitsUsers: () -> Unit = {},
    onOpenRenewals: () -> Unit = {},
) {
    val context = LocalContext.current
    val authRepo = remember(context) { AuthRepository(context) }
    val user = remember { authRepo.loadSession() }
    val isSuperAdmin = user?.isSuperAdmin == true
    val isAdmin = !isSuperAdmin && (user?.permissions ?: emptyList()).contains("console.admin")
    val canManage = isAdmin || isSuperAdmin

    val vm: ConsoleToolsViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.isLoading && state.error == null && state.my.isEmpty()) vm.refresh()

    // Build visible tabs matching web logic
    val tabs = remember(isSuperAdmin, canManage) {
        buildList {
            if (!isSuperAdmin) {
                add(ToolsTab.Solicitar)
                add(ToolsTab.MiKit)
            }
            if (canManage) {
                add(ToolsTab.Usuarios)
                add(ToolsTab.Inventario)
                add(ToolsTab.Renovaciones)
            }
        }
    }
    var selectedTab by remember(isSuperAdmin) {
        mutableStateOf(if (isSuperAdmin) ToolsTab.Inventario.key else ToolsTab.Solicitar.key)
    }

    val q = state.query.trim().lowercase()
    fun filter(list: List<ToolRequestDto>) = list.filter { t ->
        if (q.isBlank()) true else buildString {
            append(t.toolName); append(" "); append(t.model); append(" ")
            append(t.serialNumber); append(" "); append(t.status)
            append(" "); append(t.requestedBy?.nombre ?: "")
        }.lowercase().contains(q)
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(contentPadding),
    ) {
        // Header: only counts (title in TopAppBar)
        Text(
            buildString {
                if (!isSuperAdmin) append("${state.my.size} propias")
                if (canManage) { if (isNotEmpty()) append("  ·  "); append("${state.all.size} equipo") }
            },
            style = MaterialTheme.typography.bodySmall,
            color = TlSub,
        )
        Spacer(Modifier.height(12.dp))

        // Tab bar (horizontal scroll)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            tabs.forEach { tab ->
                val sel = selectedTab == tab.key
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (sel) TlTeal else Color(0xFFF1F5F9))
                        .clickable { selectedTab = tab.key }
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(tab.icon, fontSize = 16.sp)
                        Text(
                            tab.label,
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = if (sel) Color.White else Color(0xFF475569),
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(14.dp))

        // Loading / error
        if (state.isLoading) {
            NxLoadingBlock("Cargando herramientas…")
            return@Column
        }
        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(8.dp))
            Button(onClick = { vm.refresh() }) { Text("Reintentar") }
            return@Column
        }

        // Tab content
        when (selectedTab) {
            ToolsTab.Solicitar.key -> {
                // My requests list + search
                OutlinedTextField(
                    value = state.query,
                    onValueChange = vm::setQuery,
                    label = { Text("Buscar herramienta") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                )
                Spacer(Modifier.height(10.dp))
                val my = filter(state.my)
                Text(
                    "Mis solicitudes — ${my.size}",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = TlSlate,
                )
                Spacer(Modifier.height(8.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (my.isEmpty()) {
                        item { Text("Sin solicitudes activas", color = Color(0xFF94A3B8)) }
                    } else {
                        items(my.take(100)) { t -> ToolRequestCard(t) }
                    }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }

            ToolsTab.MiKit.key -> {
                // Navigate to dedicated kit screen
                LaunchedEffect(Unit) { onOpenMyKit() }
                NxLoadingBlock("Cargando mi kit…")
            }

            ToolsTab.Usuarios.key -> {
                // Navigate to kits-users screen
                LaunchedEffect(Unit) { onOpenKitsUsers() }
                NxLoadingBlock("Cargando kits de usuarios…")
            }

            ToolsTab.Inventario.key -> {
                // Navigate to inventory screen
                LaunchedEffect(Unit) { onOpenInventory() }
                NxLoadingBlock("Cargando inventario…")
            }

            ToolsTab.Renovaciones.key -> {
                // Navigate to renewals screen
                LaunchedEffect(Unit) { onOpenRenewals() }
                NxLoadingBlock("Cargando renovaciones…")
            }

            else -> {
                // Admin requests overview
                OutlinedTextField(
                    value = state.query,
                    onValueChange = vm::setQuery,
                    label = { Text("Buscar") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                )
                Spacer(Modifier.height(10.dp))
                val all = filter(state.all)
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(all.take(100)) { t -> ToolRequestCard(t, showUser = true) }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }
}

// ── Card composable ──────────────────────────────────────────────────────────

@Composable
private fun ToolRequestCard(t: ToolRequestDto, showUser: Boolean = false) {
    val statusColor = toolStatusColor(t.status)
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp),
    ) {
        Row(modifier = Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .height(56.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(statusColor),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    t.toolName.ifBlank { "Herramienta #${t.id}" },
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = TlSlate,
                )
                Text(
                    listOfNotNull(t.model.takeIf { it.isNotBlank() }, t.serialNumber.takeIf { it.isNotBlank() }).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = TlSub,
                )
                if (showUser && !t.requestedBy?.nombre.isNullOrBlank()) {
                    Text("👤 ${t.requestedBy!!.nombre}", style = MaterialTheme.typography.bodySmall, color = TlSub)
                }
                if (!t.expectedReturnDate.isNullOrBlank()) {
                    Text("Devuelve: ${t.expectedReturnDate}", style = MaterialTheme.typography.labelSmall, color = TlSub)
                }
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(statusColor.copy(alpha = 0.13f))
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            ) {
                Text(
                    t.status.ifBlank { "–" },
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                    color = statusColor,
                )
            }
        }
    }
}

