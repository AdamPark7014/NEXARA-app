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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.HrReviewDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/**
 * Evaluaciones de desempeño — `hr/reviews`.
 *
 * `getHrReviewsRaw` llevaba escrito desde hacía meses sin que ninguna pantalla
 * lo llamara: exactamente el mismo defecto que dejó `chat` invisible. Aquí se
 * cablea, y con las dos acciones que la web sí tenía:
 *
 *  - **Enviar** (`DRAFT → SUBMITTED`), la firma de quien evalúa.
 *  - **Acusar de recibido** (`SUBMITTED → ACKNOWLEDGED`), del evaluado.
 *
 * Redactar la evaluación —calificación, fortalezas, áreas de mejora,
 * objetivos— sigue en la web: son cuatro campos de texto largo y una nota
 * numérica que se piensan sentado, no en un andén.
 */

data class HrReviewsUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val query: String = "",
    /** "todos" | "mias" | "DRAFT" | "SUBMITTED" | "ACKNOWLEDGED" */
    val filter: String = "todos",
    val items: List<HrReviewDto> = emptyList(),
    val selected: HrReviewDto? = null,
    val actingId: Long? = null,
    val myUserId: Long? = null,
)

class HrReviewsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val authRepo = AuthRepository(app.applicationContext)
    private val _state = MutableStateFlow(HrReviewsUiState())
    val state: StateFlow<HrReviewsUiState> = _state

    init {
        loadSession()
        refresh()
    }

    private fun loadSession() {
        viewModelScope.launch {
            val session = withContext(Dispatchers.IO) { runCatching { authRepo.loadSession() }.getOrNull() }
            _state.update { it.copy(myUserId = session?.id) }
        }
    }

    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun setFilter(v: String) = _state.update { it.copy(filter = v) }
    fun select(row: HrReviewDto?) = _state.update { it.copy(selected = row, message = null) }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(loading = initial && it.items.isEmpty(), isRefreshing = !initial, error = null)
        }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.hrReviewDtos() }
                _state.update { it.copy(loading = false, isRefreshing = false, items = list) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar las evaluaciones"),
                    )
                }
            }
        }
    }

    fun submit(id: Long) = act(id, "Evaluación enviada") { repo.submitHrReview(id) }

    fun acknowledge(id: Long) = act(id, "Acuse registrado") { repo.acknowledgeHrReview(id) }

    private fun act(id: Long, ok: String, block: suspend () -> Unit) {
        _state.update { it.copy(actingId = id, error = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { block() }
                _state.update { it.copy(actingId = null, message = ok, selected = null) }
                refresh(initial = false)
            } catch (e: Exception) {
                _state.update { it.copy(actingId = null, error = e.toUserMessage()) }
            }
        }
    }

    fun filtered(): List<HrReviewDto> {
        val s = _state.value
        var list = s.items
        list = when (s.filter) {
            "todos" -> list
            // «Mías» es lo que un empleado abre: su evaluación, no la de todos.
            "mias" -> s.myUserId?.let { uid -> list.filter { it.userId == uid } } ?: list
            else -> list.filter { it.status.equals(s.filter, ignoreCase = true) }
        }
        val q = s.query.trim().lowercase()
        if (q.isNotBlank()) {
            list = list.filter {
                it.userName.lowercase().contains(q) ||
                    it.reviewerName.lowercase().contains(q) ||
                    it.goals.lowercase().contains(q)
            }
        }
        return list
    }
}

private fun reviewTone(status: String): NxTone = when (status.uppercase()) {
    "DRAFT" -> NxTone.Warning
    "SUBMITTED" -> NxTone.Info
    "ACKNOWLEDGED" -> NxTone.Success
    else -> NxTone.Neutral
}

private fun ratingLabel(v: Double?): String =
    if (v == null) "—" else String.format(java.util.Locale("es", "MX"), "%.1f / 5", v)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HrReviewsSection(contentPadding: PaddingValues = PaddingValues(16.dp)) {
    val vm: HrReviewsViewModel = viewModel()
    val s by vm.state.collectAsState()

    s.selected?.let { row ->
        // Se relee de la lista: tras enviar o acusar, la copia guardada seguiría
        // enseñando el estatus viejo.
        val fresh = s.items.firstOrNull { it.id == row.id } ?: row
        HrReviewDetail(
            row = fresh,
            isMine = s.myUserId != null && fresh.userId == s.myUserId,
            acting = s.actingId == fresh.id,
            error = s.error,
            onSubmit = { id -> vm.submit(id) },
            onAcknowledge = { id -> vm.acknowledge(id) },
            onBack = { vm.select(null) },
        )
        return
    }

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            Modifier.fillMaxSize().background(NxColors.Surface),
            contentPadding = contentPadding,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                NxSectionHeader(
                    "RR. HH. · Evaluaciones",
                    subtitle = if (s.items.isNotEmpty()) {
                        "${s.items.size} evaluaciones · ${s.items.count { it.canAcknowledge }} sin acuse"
                    } else {
                        "Desempeño y acuses de recibido"
                    },
                )
            }
            item {
                NxSearchField(
                    value = s.query,
                    onValueChange = vm::setQuery,
                    placeholder = "Buscar por persona…",
                )
            }
            item {
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf(
                        "todos" to "Todas",
                        "mias" to "Mías",
                        "SUBMITTED" to "Sin acuse",
                        "DRAFT" to "Borradores",
                        "ACKNOWLEDGED" to "Acusadas",
                    ).forEach { (value, label) ->
                        FilterChip(
                            selected = s.filter == value,
                            onClick = { vm.setFilter(value) },
                            label = { Text(label) },
                        )
                    }
                }
            }
            if (!s.message.isNullOrBlank()) {
                item { Text(s.message!!, color = NxColors.Success, fontWeight = FontWeight.SemiBold) }
            }
            if (!s.error.isNullOrBlank()) {
                item { NxErrorBlock(s.error!!) { vm.refresh(initial = false) } }
            }
            if (s.loading) {
                item { NxLoadingBlock("Cargando evaluaciones…") }
            } else {
                val list = vm.filtered()
                if (list.isEmpty()) {
                    item {
                        NxEmptyState(
                            "Sin evaluaciones",
                            "No hay evaluaciones con los filtros actuales.",
                            actionLabel = "Actualizar",
                            onAction = { vm.refresh(initial = false) },
                        )
                    }
                } else {
                    items(list.take(80), key = { it.rowKey }) { row ->
                        NxPanelShell(onClick = { vm.select(row) }) {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    row.displayTitle,
                                    fontWeight = FontWeight.Bold,
                                    color = NxColors.Slate,
                                    modifier = Modifier.weight(1f),
                                )
                                NxStatusChip(row.statusLabel, reviewTone(row.status))
                            }
                            Text(
                                listOf(row.periodLabel, row.reviewDate, row.reviewerName)
                                    .filter { it.isNotBlank() && it != "—" }
                                    .joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                                color = NxColors.Muted,
                            )
                            Text(
                                ratingLabel(row.overallRating),
                                style = MaterialTheme.typography.labelSmall,
                                color = NxColors.Teal,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

@Composable
private fun HrReviewDetail(
    row: HrReviewDto,
    isMine: Boolean,
    acting: Boolean,
    error: String?,
    onSubmit: (Long) -> Unit,
    onAcknowledge: (Long) -> Unit,
    onBack: () -> Unit,
) {
    var confirmingAck by remember { mutableStateOf(false) }

    LazyColumn(
        Modifier.fillMaxSize().background(NxColors.Surface),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                OutlinedButton(onClick = onBack) { Text("← Volver") }
                NxStatusChip(row.statusLabel, reviewTone(row.status))
            }
        }
        item {
            NxSectionHeader(
                row.displayTitle,
                subtitle = "${row.periodLabel} · ${row.reviewDate.ifBlank { "sin fecha" }}",
            )
        }

        error?.takeIf { it.isNotBlank() }?.let { msg -> item { NxErrorBlock(msg) } }

        item {
            NxPanelShell {
                DetailLine("Evaluado", row.userName)
                DetailLine("Evalúa", row.reviewerName)
                DetailLine("Periodo", row.periodLabel)
                DetailLine("Fecha", row.reviewDate)
                DetailLine("Calificación", ratingLabel(row.overallRating))
            }
        }

        if (row.strengths.isNotBlank()) {
            item {
                NxPanelShell {
                    Text("Fortalezas", fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                    Text(row.strengths, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        if (row.areasOfImprovement.isNotBlank()) {
            item {
                NxPanelShell {
                    Text("Áreas de mejora", fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                    Text(row.areasOfImprovement, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        if (row.goals.isNotBlank()) {
            item {
                NxPanelShell {
                    Text("Objetivos", fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                    Text(row.goals, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        if (row.comments.isNotBlank()) {
            item {
                NxPanelShell {
                    Text("Comentarios", fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                    Text(row.comments, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        if (row.canSubmit && row.id != null) {
            item {
                Button(
                    onClick = { onSubmit(row.id) },
                    enabled = !acting,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (acting) "Enviando…" else "Enviar evaluación") }
            }
        }
        if (row.canAcknowledge && row.id != null) {
            item {
                Button(
                    onClick = { confirmingAck = true },
                    enabled = !acting,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (acting) "Registrando…" else "Acusar de recibido") }
            }
            if (!isMine) {
                item {
                    // El API sólo comprueba empresa y estatus, no que seas tú
                    // el evaluado. Decirlo evita un acuse firmado por error en
                    // nombre de otra persona.
                    Text(
                        "Esta evaluación no es tuya: el acuse lo debería dar ${row.userName.ifBlank { "la persona evaluada" }}.",
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Warning,
                    )
                }
            }
        }
        item {
            Text(
                "Crear y editar evaluaciones se hace desde la consola web.",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
        item { Spacer(Modifier.height(24.dp)) }
    }

    if (confirmingAck && row.id != null) {
        AlertDialog(
            onDismissRequest = { confirmingAck = false },
            title = { Text("Acusar de recibido") },
            text = {
                Text(
                    "Queda registrado que leíste la evaluación de ${row.periodLabel.lowercase()} " +
                        "de ${row.userName.ifBlank { "esta persona" }}. No se puede deshacer.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmingAck = false
                    onAcknowledge(row.id)
                }) { Text("Acusar") }
            },
            dismissButton = { TextButton(onClick = { confirmingAck = false }) { Text("Cancelar") } },
        )
    }
}
