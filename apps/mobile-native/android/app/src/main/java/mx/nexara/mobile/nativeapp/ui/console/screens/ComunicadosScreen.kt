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
import mx.nexara.mobile.nativeapp.data.api.InternalComunicadoDto
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
 * Comunicados internos — `internal-comunicados`.
 *
 * En la web vive escondido dentro de `/erp/news`, pestaña «Comunicados». En el
 * teléfono es al revés: el aviso de la empresa es justo lo que se lee de pie,
 * y hasta hoy no existía en la app.
 *
 * Recorte deliberado y dicho en pantalla: **redactar, editar y borrar se
 * quedan en la web.** Escribir un comunicado a toda la plantilla en un teclado
 * de teléfono no es trabajo de campo. Lo que sí es de campo es leerlo y —si ya
 * está redactado— darle salida desde donde uno esté.
 */

data class ComunicadosUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val query: String = "",
    /** "todos" | "Borrador" | "Enviado" — mismos valores que guarda el API. */
    val estadoFilter: String = "todos",
    val items: List<InternalComunicadoDto> = emptyList(),
    val selected: InternalComunicadoDto? = null,
    val detailLoading: Boolean = false,
    val acting: Boolean = false,
)

class ComunicadosViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(ComunicadosUiState())
    val state: StateFlow<ComunicadosUiState> = _state

    init { refresh() }

    fun setQuery(v: String) = _state.update { it.copy(query = v) }

    fun setEstadoFilter(v: String) {
        _state.update { it.copy(estadoFilter = v) }
        refresh(initial = false)
    }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(loading = initial && it.items.isEmpty(), isRefreshing = !initial, error = null)
        }
        viewModelScope.launch {
            try {
                val estado = _state.value.estadoFilter.takeIf { it != "todos" }
                val list = withContext(Dispatchers.IO) { repo.internalComunicados(estado) }
                _state.update { it.copy(loading = false, isRefreshing = false, items = list) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar los comunicados"),
                    )
                }
            }
        }
    }

    /**
     * Abre la ficha. Se pinta primero la fila del listado y luego se completa
     * con el cuerpo: así el título aparece de inmediato y no se mira una
     * pantalla en blanco mientras baja el texto.
     */
    fun open(row: InternalComunicadoDto) {
        _state.update { it.copy(selected = row, message = null) }
        val id = row.id ?: return
        if (row.hasBody) return
        _state.update { it.copy(detailLoading = true) }
        viewModelScope.launch {
            runCatching { withContext(Dispatchers.IO) { repo.internalComunicado(id) } }
                .onSuccess { full ->
                    _state.update { s ->
                        if (s.selected?.id != id) s else s.copy(detailLoading = false, selected = full)
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            detailLoading = false,
                            error = e.toUserMessage("No se pudo leer el comunicado"),
                        )
                    }
                }
        }
    }

    fun close() = _state.update { it.copy(selected = null, error = null) }

    /** Marca el comunicado como enviado. Sólo tiene efecto sobre borradores. */
    fun enviar(id: Long) {
        _state.update { it.copy(acting = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.enviarInternalComunicado(id) }
                _state.update { it.copy(acting = false, selected = null, message = "Comunicado enviado") }
                refresh(initial = false)
            } catch (e: Exception) {
                _state.update {
                    it.copy(acting = false, error = e.toUserMessage("No se pudo enviar el comunicado"))
                }
            }
        }
    }

    fun filtered(): List<InternalComunicadoDto> {
        val q = _state.value.query.trim().lowercase()
        val list = _state.value.items
        if (q.isBlank()) return list
        return list.filter {
            it.displayTitle.lowercase().contains(q) ||
                it.audiencia.lowercase().contains(q) ||
                it.autorNombre.lowercase().contains(q)
        }
    }
}

private fun estadoTone(estado: String): NxTone = when {
    estado.equals("Enviado", ignoreCase = true) -> NxTone.Success
    estado.equals("Borrador", ignoreCase = true) -> NxTone.Warning
    estado.equals("Programado", ignoreCase = true) -> NxTone.Info
    else -> NxTone.Neutral
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ComunicadosModuleScreen(vm: ComunicadosViewModel = viewModel()) {
    val s by vm.state.collectAsState()

    s.selected?.let { row ->
        ComunicadoDetail(
            row = row,
            loading = s.detailLoading,
            acting = s.acting,
            error = s.error,
            onEnviar = { id -> vm.enviar(id) },
            onBack = { vm.close() },
        )
        return
    }

    Column(Modifier.fillMaxSize().background(NxColors.Surface)) {
        PullToRefreshBox(
            isRefreshing = s.isRefreshing,
            onRefresh = { vm.refresh(initial = false) },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    NxSectionHeader(
                        "Comunicados internos",
                        subtitle = if (s.items.isNotEmpty()) {
                            "${s.items.size} avisos · ${s.items.count { it.isDraft }} en borrador"
                        } else {
                            "Avisos de la empresa"
                        },
                    )
                }
                item {
                    NxSearchField(
                        value = s.query,
                        onValueChange = vm::setQuery,
                        placeholder = "Buscar comunicado…",
                    )
                }
                item {
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        listOf("todos" to "Todos", "Borrador" to "Borradores", "Enviado" to "Enviados")
                            .forEach { (value, label) ->
                                FilterChip(
                                    selected = s.estadoFilter == value,
                                    onClick = { vm.setEstadoFilter(value) },
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
                    item { NxLoadingBlock("Cargando comunicados…") }
                } else {
                    val list = vm.filtered()
                    if (list.isEmpty()) {
                        item {
                            NxEmptyState(
                                "Sin comunicados",
                                "No hay avisos con los filtros actuales.",
                                actionLabel = "Actualizar",
                                onAction = { vm.refresh(initial = false) },
                            )
                        }
                    } else {
                        items(list.take(80), key = { it.rowKey }) { row ->
                            NxPanelShell(onClick = { vm.open(row) }) {
                                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        row.displayTitle,
                                        fontWeight = FontWeight.Bold,
                                        color = NxColors.Slate,
                                        modifier = Modifier.weight(1f),
                                    )
                                    NxStatusChip(row.estado.ifBlank { "—" }, estadoTone(row.estado))
                                }
                                Text(
                                    listOf(row.audiencia, row.autorNombre)
                                        .filter { it.isNotBlank() }
                                        .joinToString(" · "),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = NxColors.Muted,
                                )
                                if (row.isUrgent) {
                                    Text(
                                        "Prioridad ${row.prioridad}",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = NxColors.Danger,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                                row.readPercent?.let { pct ->
                                    Text(
                                        "Leído por ${row.lecturas} de ${row.totalDestinatarios} ($pct %)",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = NxColors.Teal,
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

@Composable
private fun ComunicadoDetail(
    row: InternalComunicadoDto,
    loading: Boolean,
    acting: Boolean,
    error: String?,
    onEnviar: (Long) -> Unit,
    onBack: () -> Unit,
) {
    var confirming by remember { mutableStateOf(false) }

    LazyColumn(
        Modifier.fillMaxSize().background(NxColors.Surface),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                OutlinedButton(onClick = onBack) { Text("← Volver") }
                NxStatusChip(row.estado.ifBlank { "—" }, estadoTone(row.estado))
            }
        }
        item { NxSectionHeader(row.displayTitle, subtitle = row.audiencia.ifBlank { "Comunicado interno" }) }

        error?.takeIf { it.isNotBlank() }?.let { msg -> item { NxErrorBlock(msg) } }

        item {
            NxPanelShell {
                DetailLine("Audiencia", row.audiencia)
                DetailLine("Prioridad", row.prioridad)
                DetailLine("Autor", row.autorNombre)
                DetailLine("Programado", row.scheduledAt.take(16).replace('T', ' '))
                DetailLine("Enviado", row.sentAt.take(16).replace('T', ' '))
                if (row.totalDestinatarios > 0) {
                    DetailLine("Lecturas", "${row.lecturas} / ${row.totalDestinatarios}")
                }
            }
        }

        item {
            NxPanelShell {
                when {
                    loading -> NxLoadingBlock("Cargando el texto…")
                    row.cuerpo.isBlank() -> Text(
                        "Este comunicado no trae texto.",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                    else -> Text(row.cuerpo, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        if (row.isDraft && row.id != null) {
            item {
                Button(
                    onClick = { confirming = true },
                    enabled = !acting && !loading,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (acting) "Enviando…" else "Enviar comunicado") }
            }
        }
        item {
            // El recorte, dicho: nadie debería descubrirlo buscando un botón
            // que no existe.
            Text(
                "Redactar, editar y borrar comunicados se hace desde la consola web.",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
        item { Spacer(Modifier.height(24.dp)) }
    }

    if (confirming && row.id != null) {
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text("Enviar «${row.displayTitle}»") },
            text = {
                Text(
                    "El comunicado queda marcado como enviado para " +
                        "${row.audiencia.ifBlank { "la audiencia configurada" }}. " +
                        "No se puede volver a borrador desde la app.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirming = false
                    onEnviar(row.id)
                }) { Text("Enviar") }
            },
            dismissButton = { TextButton(onClick = { confirming = false }) { Text("Cancelar") } },
        )
    }
}
