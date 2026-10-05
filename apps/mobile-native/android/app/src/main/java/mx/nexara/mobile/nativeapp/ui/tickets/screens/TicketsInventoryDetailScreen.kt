package mx.nexara.mobile.nativeapp.ui.tickets.screens



import android.app.Application

import android.content.Intent

import android.net.Uri

import androidx.activity.compose.rememberLauncherForActivityResult

import androidx.activity.result.contract.ActivityResultContracts

import androidx.compose.foundation.background

import androidx.compose.foundation.selection.toggleable

import androidx.compose.material3.Switch

import androidx.compose.ui.semantics.Role

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

import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels

import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository

import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState

import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock

import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList

import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell

import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusLabels

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

    /**
     * `null` mientras no se sabe. Aprobar y rechazar sólo existen en
     * `client-portal`: a una sucursal el API le responde 403 y la web de
     * sucursal no los enseña, así que sólo se pintan con `false`.
     */
    val isBranchUser: Boolean? = null,

)



class TicketsInventoryDetailViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = TicketsRepository(app.applicationContext)

    private val _state = MutableStateFlow(InventoryDetailUiState())

    val state: StateFlow<InventoryDetailUiState> = _state

    private var activeId: Long? = null



    init {

        refreshOnModels(

            models = setOf("InventorySnapshot", "InventoryItem"),

            // Un cambio en otro lado no pisa las notas que se están escribiendo
            // ni el aviso de lo que se acaba de hacer (la sincronización misma
            // dispara este evento y borraba «Inventario sincronizado»).
            refresh = { activeId?.let { load(it, initial = false, keepDraft = true) } },

        )

    }



    /**
     * `keepDraft`: tras una acción (o un aviso en tiempo real) se conservan las
     * notas, los interruptores y el aviso de éxito; sólo se actualiza el
     * inventario. La carga inicial y el gesto de recargar los reinician.
     */
    fun load(id: Long?, initial: Boolean = true, keepDraft: Boolean = false) {

        activeId = id

        if (id == null) {

            _state.update { it.copy(isLoading = false, error = "Inventario inválido") }

            return

        }

        _state.update {

            when {

                initial -> it.copy(isLoading = true, error = null, message = null)

                keepDraft -> it.copy(isRefreshing = true, error = null)

                else -> it.copy(isRefreshing = true, error = null, message = null)

            }

        }

        viewModelScope.launch {

            try {

                val (detail, branchUser) = withContext(Dispatchers.IO) {

                    repo.inventoryDetail(id) to repo.isBranchUser()

                }

                _state.update {

                    if (keepDraft) {

                        it.copy(

                            isLoading = false,

                            isRefreshing = false,

                            snapshot = detail,

                            isBranchUser = branchUser,

                        )

                    } else {

                        it.copy(

                            isLoading = false,

                            isRefreshing = false,

                            snapshot = detail,

                            isBranchUser = branchUser,

                            notes = detail.notes ?: "",

                            markCompleted = (detail.status ?: "").uppercase() == "COMPLETED",

                            confirmDifference = false,

                        )

                    }

                }

            } catch (e: Exception) {

                _state.update {

                    it.copy(

                        isLoading = false,

                        isRefreshing = false,

                        error = e.toUserMessage("No se pudo cargar inventario"),

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

                        error = e.toUserMessage("No se pudo descargar PDF"),

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

                // El API responde el inventario SIN sucursal ni equipos: ponerlo
                // tal cual dejaba la pantalla en «Items (0)». Se toma sólo el
                // estatus nuevo y se vuelve a pedir el detalle completo.
                _state.update {

                    it.copy(

                        saving = false,

                        snapshot = it.snapshot?.let { s ->

                            s.copy(status = updated.status ?: s.status, approvedAt = updated.approvedAt)

                        },

                        message = if (decision == "APPROVED") "Inventario aprobado" else "Inventario rechazado",

                    )

                }

                load(id, initial = false, keepDraft = true)

            } catch (e: Exception) {

                _state.update {

                    it.copy(

                        saving = false,

                        error = e.toUserMessage("No se pudo actualizar"),

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

                        error = e.toUserMessage("No se pudo subir media"),

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

                // Sin `items`: el API conserva los equipos que ya tiene, con sus
                // fotos. Mandar `snap.items` (sin `equipmentName`) hacía que el
                // API los descartara todos y dejara el inventario vacío.
                val updated = withContext(Dispatchers.IO) {

                    repo.syncInventory(

                        branchId = branchId,

                        snapshotId = snap.id,

                        title = snap.title,

                        notes = _state.value.notes,

                        completed = _state.value.markCompleted,

                        confirmDifference = _state.value.confirmDifference,

                    )

                }

                val complete = updated.items != null && updated.branch != null

                _state.update {

                    it.copy(

                        saving = false,

                        snapshot = if (complete) updated else it.snapshot,

                        confirmDifference = false,

                        message = "Inventario sincronizado",

                    )

                }

                if (!complete) load(snap.id, initial = false, keepDraft = true)

            } catch (e: Exception) {

                _state.update {

                    it.copy(

                        saving = false,

                        error = e.toUserMessage("No se pudo sincronizar"),

                    )

                }

            }

        }

    }

}



/** Renglón con interruptor: título, explicación y `Switch` (toda la fila es tocable). */
@Composable
private fun InventoryToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    enabled: Boolean,
    onToggle: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .toggleable(value = checked, enabled = enabled, role = Role.Switch, onValueChange = { onToggle() })
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f).padding(end = 12.dp)) {
            Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        // `onCheckedChange = null`: el toque lo maneja la fila (accesible como un solo control).
        Switch(checked = checked, onCheckedChange = null, enabled = enabled)
    }
}



private fun inventoryStatusTone(status: String?): NxTone = when ((status ?: "").uppercase()) {

    "COMPLETED", "APPROVED" -> NxTone.Success

    "REJECTED" -> NxTone.Danger

    "PENDING", "DRAFT" -> NxTone.Warning

    else -> NxTone.Info

}



@Suppress("UNUSED_PARAMETER")
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

        if (state.isLoading) {

            NxSkeletonList(itemCount = 5, modifier = Modifier.fillMaxWidth().padding(16.dp))

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

                            snap.status?.takeIf { it.isNotBlank() }?.let { NxStatusChip(NxStatusLabels.label(it), inventoryStatusTone(it)) }

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

                        // Interruptores con su nombre completo, no «Marcado:
                        // COMPLETADO» / «ConfirmDiff: Sí». Se aplican al sincronizar.
                        InventoryToggleRow(

                            title = "Marcar como completado",

                            subtitle = "Al sincronizar, el inventario queda como terminado.",

                            checked = state.markCompleted,

                            enabled = !state.saving,

                            onToggle = vm::toggleCompleted,

                        )

                        InventoryToggleRow(

                            title = "Confirmar diferencia de equipos",

                            subtitle = "Actívalo si el número de equipos cambió respecto al inventario anterior.",

                            checked = state.confirmDifference,

                            enabled = !state.saving,

                            onToggle = vm::toggleConfirmDifference,

                        )

                        Spacer(Modifier.height(8.dp))

                        Button(

                            onClick = vm::syncSnapshot,

                            enabled = !state.saving,

                            modifier = Modifier.fillMaxWidth(),

                        ) { Text(if (state.saving) "Sincronizando…" else "Sincronizar inventario") }

                        // Aprobar y rechazar: sólo la cuenta cliente (a una
                        // sucursal el API le responde 403).
                        if (state.isBranchUser == false) {

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

                            // `equipmentName` (lo que manda el API), con respaldo a `itemName`.
                            Text(item.displayName() ?: "Equipo", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium)

                            // «SN: … · Sin cambios · Activo» en vez de «UNCHANGED · ACTIVE».
                            val meta = inventoryItemMeta(item)

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


