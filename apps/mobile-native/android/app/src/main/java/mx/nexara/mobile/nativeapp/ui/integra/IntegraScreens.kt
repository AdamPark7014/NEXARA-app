package mx.nexara.mobile.nativeapp.ui.integra

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.integra.IntegraRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import java.time.Instant
import java.time.temporal.ChronoUnit

// ── Helpers ───────────────────────────────────────────────────────────────────

private fun str(m: Map<String, Any?>, vararg keys: String): String {
    for (k in keys) {
        val v = m[k] ?: continue
        val s = when (v) {
            is String -> v
            is Number -> v.toString()
            is Map<*, *> -> {
                @Suppress("UNCHECKED_CAST")
                str(v as Map<String, Any?>, "name", "nombre", "personName", "visitorName")
            }
            is List<*> -> v.firstOrNull()?.toString().orEmpty()
            else -> v.toString()
        }
        if (s.isNotBlank() && s != "null") return s
    }
    return ""
}

private fun bool(m: Map<String, Any?>, vararg keys: String): Boolean? {
    for (k in keys) {
        when (val v = m[k]) {
            is Boolean -> return v
            is String -> return v.equals("true", ignoreCase = true) || v == "1"
            is Number -> return v.toInt() != 0
        }
    }
    return null
}

private fun nestedPerson(root: Map<String, Any?>): Map<String, Any?> {
    val person = root["person"]
    return if (person is Map<*, *>) {
        @Suppress("UNCHECKED_CAST")
        person as Map<String, Any?>
    } else {
        root
    }
}

// ── Access (doors) ────────────────────────────────────────────────────────────

data class IntegraAccessUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val items: List<Map<String, Any?>> = emptyList(),
    val selected: Map<String, Any?>? = null,
    val reason: String = "",
    val acting: Boolean = false,
)

class IntegraAccessViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraAccessUiState())
    val state: StateFlow<IntegraAccessUiState> = _state

    init { refresh() }

    fun setReason(v: String) = _state.update { it.copy(reason = v, message = null) }
    fun select(item: Map<String, Any?>?) = _state.update { it.copy(selected = item, message = null) }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(
                loading = initial && it.items.isEmpty(),
                isRefreshing = !initial,
                error = null,
            )
        }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.doors() }
                _state.update { it.copy(loading = false, isRefreshing = false, items = list) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar las puertas"),
                    )
                }
            }
        }
    }

    fun openSelected() {
        val door = _state.value.selected ?: return
        val id = str(door, "id", "doorIndexCode", "doorId")
        val reason = _state.value.reason.trim()
        if (id.isBlank()) {
            _state.update { it.copy(error = "Puerta sin identificador") }
            return
        }
        if (reason.length < 3) {
            _state.update { it.copy(error = "Indica un motivo de al menos 3 caracteres") }
            return
        }
        _state.update { it.copy(acting = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.openDoor(id, reason) }
                _state.update {
                    it.copy(
                        acting = false,
                        message = "Puerta abierta: ${str(door, "name", "doorName")}",
                        selected = null,
                        reason = "",
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        acting = false,
                        error = e.toUserMessage("No se pudo abrir la puerta"),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraAccessScreen(vm: IntegraAccessViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val selected = s.selected

    if (selected != null) {
        LazyColumn(
            Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Text(
                    str(selected, "name", "doorName"),
                    style = MaterialTheme.typography.titleLarge,
                )
            }
            item { IntegraDetailLine("Ubicación", str(selected, "location", "regionName")) }
            item {
                val online = bool(selected, "online") ?: true
                IntegraDetailLine("Estado", if (online) "En línea" else "Fuera de línea")
            }
            item { IntegraDetailLine("Estado puerta", str(selected, "status", "doorState")) }
            item {
                OutlinedTextField(
                    value = s.reason,
                    onValueChange = vm::setReason,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Motivo de apertura") },
                    minLines = 2,
                )
            }
            item {
                Button(
                    onClick = vm::openSelected,
                    enabled = !s.acting,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (s.acting) "Abriendo…" else "Abrir puerta")
                }
            }
            item {
                OutlinedButton(onClick = { vm.select(null) }, modifier = Modifier.fillMaxWidth()) {
                    Text("Cancelar")
                }
            }
            s.message?.let { msg ->
                item { Text(msg, color = NxColors.Success) }
            }
            s.error?.let { err ->
                item { Text(err, color = NxColors.Danger) }
            }
        }
        return
    }

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando puertas…")
            s.error != null && s.items.isEmpty() -> NxErrorBlock(s.error!!) { vm.refresh() }
            s.items.isEmpty() -> NxEmptyState("Sin puertas", "No hay puertas configuradas en Integra.")
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                s.message?.let { msg ->
                    item { Text(msg, color = NxColors.Success, modifier = Modifier.padding(bottom = 4.dp)) }
                }
                s.error?.let { err ->
                    item { Text(err, color = NxColors.Danger, modifier = Modifier.padding(bottom = 4.dp)) }
                }
                items(s.items, key = { str(it, "id", "doorIndexCode") }) { door ->
                    val online = bool(door, "online") ?: true
                    Card(
                        onClick = { vm.select(door) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
                    ) {
                        Row(
                            Modifier.fillMaxWidth().padding(14.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    str(door, "name", "doorName"),
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text(
                                    str(door, "location", "regionName"),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = NxColors.Muted,
                                )
                            }
                            NxStatusChip(
                                if (online) "En línea" else "Offline",
                                if (online) NxTone.Success else NxTone.Neutral,
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── Events ────────────────────────────────────────────────────────────────────

data class IntegraEventsUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val items: List<Map<String, Any?>> = emptyList(),
    val query: String = "",
)

class IntegraEventsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraEventsUiState())
    val state: StateFlow<IntegraEventsUiState> = _state

    init { refresh() }

    fun setQuery(v: String) = _state.update { it.copy(query = v) }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(loading = initial && it.items.isEmpty(), isRefreshing = !initial, error = null)
        }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.events() }
                _state.update { it.copy(loading = false, isRefreshing = false, items = list) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar los eventos"),
                    )
                }
            }
        }
    }

    fun filtered(): List<Map<String, Any?>> {
        val q = _state.value.query.trim().lowercase()
        if (q.isBlank()) return _state.value.items
        return _state.value.items.filter {
            str(it, "personName", "doorName", "eventType").lowercase().contains(q)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraEventsScreen(vm: IntegraEventsViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val rows = vm.filtered()

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando eventos…")
            s.error != null && s.items.isEmpty() -> NxErrorBlock(s.error!!) { vm.refresh() }
            else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    NxSearchField(
                        value = s.query,
                        onValueChange = vm::setQuery,
                        placeholder = "Buscar persona o puerta…",
                    )
                }
                if (rows.isEmpty()) {
                    item { NxEmptyState("Sin eventos", "No hay eventos en las últimas 24 horas.") }
                } else {
                    items(rows, key = { str(it, "id", "eventId") + it.hashCode() }) { ev ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = NxColors.Card),
                        ) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    str(ev, "personName").ifBlank { "Sin persona" },
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text(
                                    "${str(ev, "doorName", "doorId")} · ${str(ev, "eventType", "eventTypeName")}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = NxColors.Muted,
                                )
                                Text(
                                    str(ev, "eventTime", "time", "occurredAt"),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = NxColors.Muted,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

// ── People ───────────────────────────────────────────────────────────────────

data class IntegraPeopleUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val items: List<Map<String, Any?>> = emptyList(),
    val query: String = "",
)

class IntegraPeopleViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraPeopleUiState())
    val state: StateFlow<IntegraPeopleUiState> = _state

    init { refresh() }

    fun setQuery(v: String) = _state.update { it.copy(query = v) }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(loading = initial && it.items.isEmpty(), isRefreshing = !initial, error = null)
        }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.people() }
                _state.update { it.copy(loading = false, isRefreshing = false, items = list) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar las personas"),
                    )
                }
            }
        }
    }

    fun filtered(): List<Map<String, Any?>> {
        val q = _state.value.query.trim().lowercase()
        if (q.isBlank()) return _state.value.items
        return _state.value.items.filter {
            str(it, "name", "personName").lowercase().contains(q) ||
                str(it, "id", "personId", "code").lowercase().contains(q)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraPeopleScreen(
    onOpenPerson: (String) -> Unit,
    vm: IntegraPeopleViewModel = viewModel(),
) {
    val s by vm.state.collectAsState()
    val rows = vm.filtered()

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando personas…")
            s.error != null && s.items.isEmpty() -> NxErrorBlock(s.error!!) { vm.refresh() }
            else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    NxSearchField(
                        value = s.query,
                        onValueChange = vm::setQuery,
                        placeholder = "Buscar por nombre o ID…",
                    )
                }
                if (rows.isEmpty()) {
                    item { NxEmptyState("Sin personas", "El espejo ACS está vacío o no tienes acceso.") }
                } else {
                    items(rows, key = { str(it, "id", "personId") }) { person ->
                        val id = str(person, "id", "personId")
                        Card(
                            onClick = { if (id.isNotBlank()) onOpenPerson(id) },
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = NxColors.Card),
                        ) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(str(person, "name", "personName"), fontWeight = FontWeight.SemiBold)
                                Text(
                                    "ID ${id.ifBlank { "—" }}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = NxColors.Muted,
                                )
                                val doors = person["doorNames"]
                                if (doors is List<*> && doors.isNotEmpty()) {
                                    Text(
                                        doors.joinToString(", "),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = NxColors.Muted,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

data class IntegraPersonDetailUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val data: Map<String, Any?> = emptyMap(),
)

class IntegraPersonDetailViewModel(app: Application, private val personId: String) : AndroidViewModel(app) {
    private val repo = IntegraRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraPersonDetailUiState())
    val state: StateFlow<IntegraPersonDetailUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val data = withContext(Dispatchers.IO) { repo.personDetail(personId) }
                _state.update { it.copy(loading = false, data = data) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        error = e.toUserMessage("No se pudo cargar la persona"),
                    )
                }
            }
        }
    }

    companion object {
        fun factory(app: Application, personId: String) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                IntegraPersonDetailViewModel(app, personId) as T
        }
    }
}

@Composable
fun IntegraPersonDetailScreen(personId: String) {
    val app = LocalContext.current.applicationContext as Application
    val vm: IntegraPersonDetailViewModel = viewModel(
        key = "integra-person-$personId",
        factory = IntegraPersonDetailViewModel.factory(app, personId),
    )
    val s by vm.state.collectAsState()
    val person = nestedPerson(s.data)

    when {
        s.loading -> NxLoadingBlock("Cargando ficha…")
        s.error != null -> NxErrorBlock(s.error!!) { vm.refresh() }
        else -> LazyColumn(
            Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Text(
                    str(person, "name", "personName").ifBlank { personId },
                    style = MaterialTheme.typography.titleLarge,
                )
            }
            item { IntegraDetailLine("ID ACS", personId) }
            item { IntegraDetailLine("Código", str(person, "code", "personCode", "employeeNo")) }
            item { IntegraDetailLine("Tipo", str(person, "userType", "type")) }
            item {
                val valid = bool(person, "validEnable")
                IntegraDetailLine("Vigencia", when (valid) {
                    true -> "Activa"
                    false -> "Deshabilitada"
                    null -> str(person, "validFrom", "validTo").ifBlank { "—" }
                })
            }
            item {
                val hasFace = bool(person, "hasFace", "hasLocalFace") == true
                IntegraDetailLine("Rostro", if (hasFace) "Registrado" else "Sin rostro")
            }
            val erp = s.data["erpUser"]
            if (erp is Map<*, *>) {
                @Suppress("UNCHECKED_CAST")
                val erpMap = erp as Map<String, Any?>
                item { IntegraDetailLine("Usuario ERP", str(erpMap, "nombre", "email")) }
            }
            val doors = person["doorNames"]
            if (doors is List<*> && doors.isNotEmpty()) {
                item { IntegraDetailLine("Puertas", doors.joinToString(", ")) }
            }
            item { IntegraDetailLine("Fuente", str(s.data, "source", "provider")) }
        }
    }
}

// ── Attendance ───────────────────────────────────────────────────────────────

data class IntegraAttendanceUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val items: List<Map<String, Any?>> = emptyList(),
    val days: Int = 7,
)

class IntegraAttendanceViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraAttendanceUiState())
    val state: StateFlow<IntegraAttendanceUiState> = _state

    init { refresh() }

    fun setDays(days: Int) {
        _state.update { it.copy(days = days) }
        refresh()
    }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(loading = initial && it.items.isEmpty(), isRefreshing = !initial, error = null)
        }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.attendance(_state.value.days) }
                _state.update { it.copy(loading = false, isRefreshing = false, items = list) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudo cargar la asistencia ACS"),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraAttendanceScreen(vm: IntegraAttendanceViewModel = viewModel()) {
    val s by vm.state.collectAsState()

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando asistencia…")
            s.error != null && s.items.isEmpty() -> NxErrorBlock(s.error!!) { vm.refresh() }
            else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = s.days == 7,
                            onClick = { vm.setDays(7) },
                            label = { Text("7 días") },
                        )
                        FilterChip(
                            selected = s.days == 14,
                            onClick = { vm.setDays(14) },
                            label = { Text("14 días") },
                        )
                    }
                }
                item {
                    NxSectionHeader(
                        title = "Asistencia deducida",
                        subtitle = "Primer y último acceso concedido por día",
                    )
                }
                if (s.items.isEmpty()) {
                    item { NxEmptyState("Sin registros", "No hay accesos en el rango seleccionado.") }
                } else {
                    items(s.items, key = { str(it, "day") + str(it, "personId") }) { row ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = NxColors.Card),
                        ) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    str(row, "personName").ifBlank { str(row, "personId") },
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text(
                                    "${str(row, "day")} · ${str(row, "firstAt")} → ${str(row, "lastAt")}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = NxColors.Muted,
                                )
                                Text(
                                    "Accesos: ${str(row, "passes")} · Denegados: ${str(row, "denied")}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = NxColors.Muted,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

// ── Visitors ───────────────────────────────────────────────────────────────────

data class IntegraVisitorsUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val appointments: List<Map<String, Any?>> = emptyList(),
    val recurring: List<Map<String, Any?>> = emptyList(),
    val tab: Int = 0,
    val registerName: String = "",
    val registerPhone: String = "",
    val registerPurpose: String = "",
    val registering: Boolean = false,
)

class IntegraVisitorsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraVisitorsUiState())
    val state: StateFlow<IntegraVisitorsUiState> = _state

    init { refresh() }

    fun setTab(tab: Int) = _state.update { it.copy(tab = tab) }
    fun setRegisterName(v: String) = _state.update { it.copy(registerName = v) }
    fun setRegisterPhone(v: String) = _state.update { it.copy(registerPhone = v) }
    fun setRegisterPurpose(v: String) = _state.update { it.copy(registerPurpose = v) }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(loading = initial && it.appointments.isEmpty(), isRefreshing = !initial, error = null)
        }
        viewModelScope.launch {
            try {
                val appts = withContext(Dispatchers.IO) { repo.visitorAppointments() }
                val rec = runCatching { withContext(Dispatchers.IO) { repo.recurringVisitors() } }
                    .getOrDefault(emptyList())
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        appointments = appts,
                        recurring = rec,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar las visitas"),
                    )
                }
            }
        }
    }

    fun register() {
        val name = _state.value.registerName.trim()
        if (name.isBlank()) {
            _state.update { it.copy(error = "Indica el nombre del visitante") }
            return
        }
        val now = Instant.now()
        val end = now.plus(4, ChronoUnit.HOURS)
        val body = mutableMapOf<String, Any?>(
            "visitorInfoList" to listOf(
                mapOf(
                    "visitorName" to name,
                    "phoneNo" to _state.value.registerPhone.trim(),
                    "gender" to 1,
                ),
            ),
            "visitStartTime" to now.toString(),
            "visitEndTime" to end.toString(),
        )
        val purpose = _state.value.registerPurpose.trim()
        if (purpose.isNotBlank()) body["visitPurpose"] = purpose

        _state.update { it.copy(registering = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.registerVisitor(body) }
                _state.update {
                    it.copy(
                        registering = false,
                        message = "Visita registrada",
                        registerName = "",
                        registerPhone = "",
                        registerPurpose = "",
                        tab = 0,
                    )
                }
                refresh(initial = false)
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        registering = false,
                        error = e.toUserMessage("No se pudo registrar la visita"),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraVisitorsScreen(vm: IntegraVisitorsViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    var tab by remember { mutableIntStateOf(s.tab) }

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando visitantes…")
            else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    ScrollableTabRow(selectedTabIndex = tab, edgePadding = 0.dp) {
                        Tab(selected = tab == 0, onClick = { tab = 0; vm.setTab(0) }, text = { Text("Citas") })
                        Tab(selected = tab == 1, onClick = { tab = 1; vm.setTab(1) }, text = { Text("Registrar") })
                        Tab(selected = tab == 2, onClick = { tab = 2; vm.setTab(2) }, text = { Text("Recurrentes") })
                    }
                }
                s.message?.let { msg ->
                    item { Text(msg, color = NxColors.Success) }
                }
                s.error?.let { err ->
                    item { Text(err, color = NxColors.Danger) }
                }

                when (tab) {
                    0 -> {
                        if (s.appointments.isEmpty()) {
                            item {
                                NxEmptyState(
                                    "Sin citas",
                                    "No hay visitas en el rango reciente o el sitio no usa módulo cloud.",
                                )
                            }
                        } else {
                            items(s.appointments, key = { it.hashCode() }) { appt ->
                                Card(
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = CardDefaults.cardColors(containerColor = NxColors.Card),
                                ) {
                                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Text(
                                            str(appt, "visitorName", "name"),
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                        Text(
                                            str(appt, "visitStartTime", "startTime"),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = NxColors.Muted,
                                        )
                                        Text(
                                            str(appt, "visitPurpose", "purpose", "status"),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = NxColors.Muted,
                                        )
                                    }
                                }
                            }
                        }
                    }
                    1 -> {
                        item {
                            OutlinedTextField(
                                value = s.registerName,
                                onValueChange = vm::setRegisterName,
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("Nombre del visitante") },
                            )
                        }
                        item {
                            OutlinedTextField(
                                value = s.registerPhone,
                                onValueChange = vm::setRegisterPhone,
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("Teléfono (opcional)") },
                            )
                        }
                        item {
                            OutlinedTextField(
                                value = s.registerPurpose,
                                onValueChange = vm::setRegisterPurpose,
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("Propósito (opcional)") },
                            )
                        }
                        item {
                            Button(
                                onClick = vm::register,
                                enabled = !s.registering,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(if (s.registering) "Registrando…" else "Registrar visita")
                            }
                        }
                    }
                    else -> {
                        if (s.recurring.isEmpty()) {
                            item { NxEmptyState("Sin recurrentes", "No hay visitas recurrentes activas.") }
                        } else {
                            items(s.recurring, key = { str(it, "id", "visitorName") }) { rec ->
                                Card(
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = CardDefaults.cardColors(containerColor = NxColors.Card),
                                ) {
                                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Text(str(rec, "visitorName", "name"), fontWeight = FontWeight.SemiBold)
                                        Text(
                                            str(rec, "weekdays", "timeFrom", "timeTo"),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = NxColors.Muted,
                                        )
                                        Text(
                                            "${str(rec, "validFrom")} → ${str(rec, "validTo")}",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = NxColors.Muted,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun IntegraDetailLine(label: String, value: String) {
    if (value.isBlank()) return
    Column(Modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
        Text(value, style = MaterialTheme.typography.bodyLarge)
    }
}
