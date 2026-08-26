package mx.nexara.mobile.nativeapp.ui.tickets.screens



import android.app.Application

import android.content.Intent

import android.net.Uri

import androidx.activity.compose.rememberLauncherForActivityResult

import androidx.activity.result.contract.ActivityResultContracts

import androidx.compose.foundation.background

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

import androidx.compose.material3.Button

import androidx.compose.material3.ExperimentalMaterial3Api

import androidx.compose.material3.MaterialTheme

import androidx.compose.material3.OutlinedButton

import androidx.compose.material3.OutlinedTextField

import androidx.compose.material3.Text

import androidx.compose.material3.pulltorefresh.PullToRefreshBox

import androidx.compose.runtime.Composable

import androidx.compose.runtime.LaunchedEffect

import androidx.compose.runtime.collectAsState

import androidx.compose.runtime.getValue

import androidx.compose.ui.Alignment

import androidx.compose.ui.Modifier

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

import mx.nexara.mobile.nativeapp.data.api.ClientPortalInventoryItemDto

import mx.nexara.mobile.nativeapp.data.api.ClientPortalInventorySnapshotDto

import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels

import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository

import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState

import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock

import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock

import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell

import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip

import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

import mx.nexara.mobile.nativeapp.ui.util.openFile

import java.io.File



data class InventoryDetailUiState(

    val isLoading: Boolean = true,

    val isRefreshing: Boolean = false,

    val saving: Boolean = false,

    val downloading: Boolean = false,

    val error: String? = null,

    val message: String? = null,

    val snapshot: ClientPortalInventorySnapshotDto? = null,

    val notes: String = "",

    val markCompleted: Boolean = false,

    val confirmDifference: Boolean = false,

)



class TicketsInventoryDetailViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = TicketsRepository(app.applicationContext)

    private val _state = MutableStateFlow(InventoryDetailUiState())

    val state: StateFlow<InventoryDetailUiState> = _state

    private var activeId: Long? = null



    init {

        refreshOnModels(

            models = setOf("InventorySnapshot", "InventoryItem"),

            refresh = { load(activeId, initial = false) },

        )

    }



    fun load(id: Long?, initial: Boolean = true) {

        activeId = id

        if (id == null) {

            _state.update { it.copy(isLoading = false, error = "Inventario inválido") }

            return

        }

        _state.update {

            if (initial) it.copy(isLoading = true, error = null, message = null)

            else it.copy(isRefreshing = true, error = null, message = null)

        }

        viewModelScope.launch {

            try {

                val detail = withContext(Dispatchers.IO) { repo.inventoryDetail(id) }

                _state.update {

                    it.copy(

                        isLoading = false,

                        isRefreshing = false,

                        snapshot = detail,

                        notes = detail.notes ?: "",

                        markCompleted = (detail.status ?: "").uppercase() == "COMPLETED",

                        confirmDifference = false,

                    )

                }

            } catch (e: Exception) {

                _state.update {

                    it.copy(

                        isLoading = false,

                        isRefreshing = false,

                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo cargar inventario",

                    )

                }

            }

        }

    }



    fun setNotes(v: String) = _state.update { it.copy(notes = v) }

    fun toggleCompleted() = _state.update { it.copy(markCompleted = !it.markCompleted) }

    fun toggleConfirmDifference() = _state.update { it.copy(confirmDifference = !it.confirmDifference) }

    fun dismissMessage() = _state.update { it.copy(message = null) }



    fun downloadPdf(id: Long?) {

        if (id == null) return

        _state.update { it.copy(downloading = true, error = null, message = null) }

        viewModelScope.launch {

            try {

                val bytes = withContext(Dispatchers.IO) { repo.inventoryReportPdfBytes(id) }

                val app = getApplication<Application>()

                val dir = File(app.cacheDir, "downloads").apply { mkdirs() }

                val file = File(dir, "inventario-$id.pdf")

                file.writeBytes(bytes)

                openFile(app, file, "application/pdf")

                _state.update { it.copy(downloading = false, message = "PDF descargado") }

            } catch (e: Exception) {

                _state.update {

                    it.copy(

                        downloading = false,

                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo descargar PDF",

                    )

                }

            }

        }

    }



    fun decide(id: Long?, decision: String) {

        if (id == null) return

        _state.update { it.copy(saving = true, error = null, message = null) }

        viewModelScope.launch {

            try {

                val updated = withContext(Dispatchers.IO) { repo.decideInventory(id, decision) }

                _state.update { it.copy(saving = false, snapshot = updated, message = "Inventario actualizado") }

            } catch (e: Exception) {

                _state.update {

                    it.copy(

                        saving = false,

                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo actualizar",

                    )

                }

            }

        }

    }



    fun uploadMedia(uris: List<Uri>, onResolveBytes: suspend (Uri) -> Pair<String, ByteArray>?) {

        if (uris.isEmpty()) return

        _state.update { it.copy(saving = true, error = null, message = null) }

        viewModelScope.launch {

            try {

                val files = withContext(Dispatchers.IO) {

                    uris.mapNotNull { onResolveBytes(it) }

                }

                withContext(Dispatchers.IO) {

                    repo.uploadInventoryMedia(files)

                }

                _state.update { it.copy(saving = false, message = "Archivos subidos") }

            } catch (e: Exception) {

                _state.update {

                    it.copy(

                        saving = false,

                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo subir media",

                    )

                }

            }

        }

    }



    fun syncSnapshot() {

        val snap = _state.value.snapshot ?: return

        val branchId = snap.branch?.id ?: return

        _state.update { it.copy(saving = true, error = null, message = null) }

        viewModelScope.launch {

            try {

                val updated = withContext(Dispatchers.IO) {

                    repo.syncInventory(

                        branchId = branchId,

                        snapshotId = snap.id,

                        title = snap.title,

                        notes = _state.value.notes,

                        completed = _state.value.markCompleted,

                        confirmDifference = _state.value.confirmDifference,

                        items = snap.items,

                    )

                }

                _state.update {

                    it.copy(

                        saving = false,

                        snapshot = updated,

                        message = "Inventario sincronizado",

                    )

                }

            } catch (e: Exception) {

                _state.update {

                    it.copy(

                        saving = false,

                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo sincronizar",

                    )

                }

            }

        }

    }

}



private fun inventoryStatusTone(status: String?): NxTone = when ((status ?: "").uppercase()) {

    "COMPLETED", "APPROVED" -> NxTone.Success

    "REJECTED" -> NxTone.Danger

    "PENDING", "DRAFT" -> NxTone.Warning

    else -> NxTone.Info

}



@OptIn(ExperimentalMaterial3Api::class)

@Composable

fun TicketsInventoryDetailScreen(

    inventoryId: Long?,

    onBack: () -> Unit,

    modifier: Modifier = Modifier,

) {

    val vm: TicketsInventoryDetailViewModel = viewModel()

    val state by vm.state.collectAsState()

    val context = LocalContext.current



    val pickFiles = rememberLauncherForActivityResult(

        contract = ActivityResultContracts.OpenMultipleDocuments(),

    ) { uris ->

        if (uris.isNullOrEmpty()) return@rememberLauncherForActivityResult

        uris.forEach { uri ->

            try {

                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)

            } catch (_: Exception) {}

        }

        vm.uploadMedia(uris) { uri ->

            try {

                val name = uri.lastPathSegment?.substringAfterLast('/') ?: "file.jpg"

                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@uploadMedia null

                name to bytes

            } catch (_: Exception) {

                null

            }

        }

    }



    LaunchedEffect(inventoryId) { vm.load(inventoryId, initial = true) }



    Column(modifier = modifier.fillMaxSize()) {

        Row(

            horizontalArrangement = Arrangement.spacedBy(8.dp),

            modifier = Modifier

                .fillMaxWidth()

                .padding(horizontal = 16.dp, vertical = 16.dp),

        ) {

            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Volver") }

            OutlinedButton(onClick = { vm.load(inventoryId, initial = false) }, modifier = Modifier.weight(1f)) { Text("Actualizar") }

        }



        if (state.isLoading) {

            NxLoadingBlock("Cargando inventario…")

            return@Column

        }



        PullToRefreshBox(

            isRefreshing = state.isRefreshing,

            onRefresh = { vm.load(inventoryId, initial = false) },

            modifier = Modifier.fillMaxSize(),

        ) {

            LazyColumn(

                modifier = Modifier

                    .fillMaxSize()

                    .background(NxColors.Surface)

                    .padding(horizontal = 16.dp),

                verticalArrangement = Arrangement.spacedBy(10.dp),

            ) {

                item {

                    Text("Detalle inventario", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)

                    Text(

                        "Revisa items, sincroniza cambios y aprueba el conteo",

                        style = MaterialTheme.typography.bodySmall,

                        color = MaterialTheme.colorScheme.onSurfaceVariant,

                    )

                }



                if (!state.message.isNullOrBlank()) {

                    item {

                        NxPanelShell(contentPadding = PaddingValues(12.dp)) {

                            Text(state.message!!, color = MaterialTheme.colorScheme.primary)

                            OutlinedButton(onClick = vm::dismissMessage) { Text("Cerrar aviso") }

                        }

                    }

                }



                if (!state.error.isNullOrBlank()) {

                    item {

                        NxErrorBlock(state.error!!) { vm.load(inventoryId, initial = true) }

                    }

                }



                val snap = state.snapshot

                if (snap == null) {

                    item {

                        NxEmptyState(

                            title = "Inventario no encontrado",

                            subtitle = "No hay datos para este inventario.",

                        )

                    }

                    return@LazyColumn

                }



                item {

                    NxPanelShell(contentPadding = PaddingValues(14.dp)) {

                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {

                            Text(snap.title ?: "Inventario #${snap.id}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))

                            snap.status?.takeIf { it.isNotBlank() }?.let { NxStatusChip(it, inventoryStatusTone(it)) }

                        }

                        val meta = listOfNotNull(

                            snap.branch?.name?.takeIf { it.isNotBlank() },

                        ).joinToString(" · ")

                        if (meta.isNotBlank()) {

                            Text(meta, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)

                        }

                    }

                }



                item {

                    NxPanelShell(contentPadding = PaddingValues(12.dp)) {

                        Text("Acciones", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)

                        Spacer(Modifier.height(8.dp))

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {

                            Button(

                                onClick = { vm.downloadPdf(snap.id) },

                                enabled = !state.downloading,

                                modifier = Modifier.weight(1f),

                            ) { Text(if (state.downloading) "Descargando…" else "PDF") }

                            OutlinedButton(

                                onClick = { pickFiles.launch(arrayOf("image/*")) },

                                enabled = !state.saving,

                                modifier = Modifier.weight(1f),

                            ) { Text(if (state.saving) "Subiendo…" else "Subir fotos") }

                        }

                        Spacer(Modifier.height(8.dp))

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {

                            OutlinedButton(

                                onClick = vm::toggleCompleted,

                                enabled = !state.saving,

                                modifier = Modifier.weight(1f),

                            ) { Text(if (state.markCompleted) "Marcado: COMPLETADO" else "Marcar: COMPLETADO") }

                            OutlinedButton(

                                onClick = vm::toggleConfirmDifference,

                                enabled = !state.saving,

                                modifier = Modifier.weight(1f),

                            ) { Text(if (state.confirmDifference) "ConfirmDiff: Sí" else "ConfirmDiff: No") }

                        }

                        Spacer(Modifier.height(8.dp))

                        Button(

                            onClick = vm::syncSnapshot,

                            enabled = !state.saving,

                            modifier = Modifier.fillMaxWidth(),

                        ) { Text(if (state.saving) "Sincronizando…" else "Sincronizar inventario") }

                        Spacer(Modifier.height(8.dp))

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {

                            OutlinedButton(

                                onClick = { vm.decide(snap.id, "APPROVED") },

                                enabled = !state.saving,

                                modifier = Modifier.weight(1f),

                            ) { Text("Aprobar") }

                            OutlinedButton(

                                onClick = { vm.decide(snap.id, "REJECTED") },

                                enabled = !state.saving,

                                modifier = Modifier.weight(1f),

                            ) { Text("Rechazar") }

                        }

                    }

                }



                item {

                    NxPanelShell(contentPadding = PaddingValues(12.dp)) {

                        OutlinedTextField(

                            value = state.notes,

                            onValueChange = vm::setNotes,

                            label = { Text("Notas") },

                            modifier = Modifier.fillMaxWidth(),

                        )

                    }

                }



                val items: List<ClientPortalInventoryItemDto> = snap.items ?: emptyList()

                item {

                    Text("Items (${items.size})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)

                }



                if (items.isEmpty()) {

                    item {

                        NxEmptyState(

                            title = "Sin items",

                            subtitle = "Este inventario no tiene equipos registrados.",

                        )

                    }

                } else {

                    items(items, key = { (it.id ?: 0L).toString() + (it.serialNumber ?: "") }) { item ->

                        NxPanelShell(contentPadding = PaddingValues(12.dp)) {

                            Text(item.itemName ?: "Equipo", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium)

                            val meta = buildList {

                                item.serialNumber?.takeIf { it.isNotBlank() }?.let { add("SN: $it") }

                                item.compareState?.takeIf { it.isNotBlank() }?.let { add(it) }

                                item.itemStatus?.takeIf { it.isNotBlank() }?.let { add(it) }

                            }.joinToString(" · ")

                            if (meta.isNotBlank()) {

                                Text(meta, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)

                            }

                        }

                    }

                }



                item { Spacer(Modifier.height(8.dp)) }

            }

        }

    }

}


