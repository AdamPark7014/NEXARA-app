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

import androidx.compose.foundation.rememberScrollState

import androidx.compose.foundation.verticalScroll

import androidx.compose.material3.Button

import androidx.compose.material3.DropdownMenuItem

import androidx.compose.material3.ExperimentalMaterial3Api

import androidx.compose.material3.ExposedDropdownMenuBox

import androidx.compose.material3.ExposedDropdownMenuDefaults

import androidx.compose.material3.MaterialTheme

import androidx.compose.material3.OutlinedButton

import androidx.compose.material3.OutlinedTextField

import androidx.compose.material3.Scaffold

import androidx.compose.material3.Text

import androidx.compose.material3.pulltorefresh.PullToRefreshBox

import androidx.compose.runtime.Composable

import androidx.compose.runtime.LaunchedEffect

import androidx.compose.runtime.collectAsState

import androidx.compose.runtime.getValue

import androidx.compose.runtime.mutableStateOf

import androidx.compose.runtime.remember

import androidx.compose.runtime.rememberCoroutineScope

import androidx.compose.runtime.setValue

import androidx.compose.ui.Modifier

import androidx.compose.ui.text.font.FontWeight

import androidx.compose.ui.text.input.ImeAction

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

import mx.nexara.mobile.nativeapp.data.api.ClientBranchDto

import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository

import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock

import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField

import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock

import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell

import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader

import mx.nexara.mobile.nativeapp.ui.enterprise.NxSnackbarHost

import mx.nexara.mobile.nativeapp.ui.enterprise.rememberNxSnackbarHostState

import mx.nexara.mobile.nativeapp.ui.enterprise.requiredFieldError



data class TicketsRequestNewUiState(

    val isLoading: Boolean = true,

    val isRefreshing: Boolean = false,

    val saving: Boolean = false,

    val error: String? = null,

    val message: String? = null,

    val branches: List<ClientBranchDto> = emptyList(),

    val selectedBranchId: Long? = null,

    val description: String = "",

    val requestType: String = "ISSUE",

    val urgency: String = "MEDIUM",

    val evidenceUris: List<String> = emptyList(),

)



class TicketsRequestNewViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = TicketsRepository(app.applicationContext)

    private val authRepo = AuthRepository(app.applicationContext)

    private val _state = MutableStateFlow(TicketsRequestNewUiState())

    val state: StateFlow<TicketsRequestNewUiState> = _state



    init {

        val isBranchUser = authRepo.loadSession()?.isBranchUser == true

        if (isBranchUser) {

            _state.update { it.copy(isLoading = false, branches = emptyList(), selectedBranchId = null) }

        } else {

            refreshBranches(initial = true)

        }

    }



    fun setDescription(v: String) = _state.update { it.copy(description = v) }

    fun setRequestType(v: String) = _state.update { it.copy(requestType = v) }

    fun setUrgency(v: String) = _state.update { it.copy(urgency = v) }

    fun setBranch(id: Long?) = _state.update { it.copy(selectedBranchId = id) }

    fun setEvidenceUris(uris: List<String>) = _state.update { it.copy(evidenceUris = uris) }

    fun clearEvidence() = _state.update { it.copy(evidenceUris = emptyList()) }

    fun dismissMessage() = _state.update { it.copy(message = null) }



    fun refreshBranches(initial: Boolean = false) {

        _state.update {

            if (initial) it.copy(isLoading = true, error = null)

            else it.copy(isRefreshing = true, error = null)

        }

        viewModelScope.launch {

            try {

                val branches = withContext(Dispatchers.IO) { repo.branches() }

                _state.update { it.copy(isLoading = false, isRefreshing = false, branches = branches, error = null) }

            } catch (e: Exception) {

                _state.update {

                    it.copy(

                        isLoading = false,

                        isRefreshing = false,

                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudieron cargar sucursales",

                    )

                }

            }

        }

    }



    fun submit(

        evidenceResolver: (suspend (Uri) -> Pair<String, ByteArray>?)? = null,

    ) {

        val s = _state.value

        val desc = s.description.trim()

        if (desc.isBlank()) return

        _state.update { it.copy(saving = true, error = null, message = null) }

        viewModelScope.launch {

            try {

                val evidenceFiles = if (evidenceResolver != null && s.evidenceUris.isNotEmpty()) {

                    withContext(Dispatchers.IO) {

                        s.evidenceUris.mapNotNull { raw ->

                            runCatching { evidenceResolver(Uri.parse(raw)) }.getOrNull()

                        }

                    }

                } else null

                withContext(Dispatchers.IO) {

                    repo.createRequest(

                        description = desc,

                        urgency = s.urgency,

                        requestType = s.requestType,

                        dueAtIso = null,

                        branchId = s.selectedBranchId,

                        evidenceFiles = evidenceFiles,

                    )

                }

                _state.update { it.copy(saving = false, message = "Solicitud creada", description = "", evidenceUris = emptyList()) }

            } catch (e: Exception) {

                _state.update {

                    it.copy(

                        saving = false,

                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo crear la solicitud",

                    )

                }

            }

        }

    }

}



@Composable

@OptIn(ExperimentalMaterial3Api::class)

fun TicketsRequestNewScreen(

    onBack: () -> Unit,

    modifier: Modifier = Modifier,

) {

    val vm: TicketsRequestNewViewModel = viewModel()

    val state by vm.state.collectAsState()

    val showBranchSelector = state.branches.isNotEmpty()

    val context = androidx.compose.ui.platform.LocalContext.current

    val snackbarHostState = rememberNxSnackbarHostState()


    val isBranchUser = remember {

        AuthRepository(context).loadSession()?.isBranchUser == true

    }



    val descriptionError = requiredFieldError(state.description, "Descripción")

    val canSubmit = descriptionError == null && !state.saving && !state.isLoading



    LaunchedEffect(state.message) {

        state.message?.let { msg ->

            snackbarHostState.showSnackbar(msg)

            vm.dismissMessage()

        }

    }



    val pickEvidence = rememberLauncherForActivityResult(

        contract = ActivityResultContracts.OpenMultipleDocuments(),

    ) { uris ->

        if (uris.isNullOrEmpty()) return@rememberLauncherForActivityResult

        uris.forEach { uri ->

            try {

                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)

            } catch (_: Exception) {}

        }

        vm.setEvidenceUris(uris.map { it.toString() })

    }



    Scaffold(

        modifier = modifier.fillMaxSize(),

        snackbarHost = { NxSnackbarHost(snackbarHostState) },

    ) { padding ->

        Column(modifier = Modifier.fillMaxSize().padding(padding)) {

            Row(

                horizontalArrangement = Arrangement.spacedBy(8.dp),

                modifier = Modifier

                    .fillMaxWidth()

                    .padding(horizontal = 16.dp, vertical = 16.dp),

            ) {

                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Volver") }

                Button(

                    onClick = {

                        vm.submit(

                            evidenceResolver = if (!isBranchUser) null else { uri ->

                                try {

                                    val name = uri.lastPathSegment?.substringAfterLast('/') ?: "evidence.jpg"

                                    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }

                                    if (bytes == null) null else name to bytes

                                } catch (_: Exception) {

                                    null

                                }

                            },

                        )

                    },

                    enabled = canSubmit,

                    modifier = Modifier.weight(1f),

                ) { Text(if (state.saving) "Enviando…" else "Crear") }

            }



            if (state.isLoading) {

                NxLoadingBlock("Cargando sucursales…")

                return@Column

            }



            PullToRefreshBox(

                isRefreshing = state.isRefreshing,

                onRefresh = { vm.refreshBranches(initial = false) },

                modifier = Modifier.fillMaxSize(),

            ) {

                Column(

                    modifier = Modifier

                        .fillMaxSize()

                        .background(NxColors.Surface)

                        .verticalScroll(rememberScrollState())

                        .padding(horizontal = 16.dp),

                    verticalArrangement = Arrangement.Top,

                ) {

                    Text("Nueva solicitud", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)

                    Text(

                        "Describe el problema o solicita mantenimiento preventivo",

                        style = MaterialTheme.typography.bodySmall,

                        color = MaterialTheme.colorScheme.onSurfaceVariant,

                    )

                    Spacer(Modifier.height(12.dp))



                    if (!state.error.isNullOrBlank()) {

                        NxErrorBlock(state.error!!) { vm.refreshBranches(initial = true) }

                        Spacer(Modifier.height(10.dp))

                    }



                    NxPanelShell(contentPadding = PaddingValues(14.dp)) {

                        NxSectionHeader("Descripción")

                        NxFormTextField(

                            value = state.description,

                            onValueChange = vm::setDescription,

                            label = "Descripción *",

                            error = descriptionError,

                            singleLine = false,

                            minLines = 3,

                            imeAction = ImeAction.Done,

                        )



                        if (isBranchUser) {

                            Spacer(Modifier.height(10.dp))

                            NxSectionHeader("Evidencias")

                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {

                                OutlinedButton(

                                    onClick = { pickEvidence.launch(arrayOf("image/*")) },

                                    enabled = !state.saving,

                                    modifier = Modifier.weight(1f),

                                ) { Text(if (state.evidenceUris.isEmpty()) "Agregar evidencias" else "Evidencias (${state.evidenceUris.size})") }

                                OutlinedButton(

                                    onClick = { vm.clearEvidence() },

                                    enabled = !state.saving && state.evidenceUris.isNotEmpty(),

                                    modifier = Modifier.weight(1f),

                                ) { Text("Quitar") }

                            }

                        }

                    }



                    Spacer(Modifier.height(10.dp))



                    NxPanelShell(contentPadding = PaddingValues(14.dp)) {

                        NxSectionHeader("Clasificación")



                        if (showBranchSelector) {

                            var branchExpanded by remember { mutableStateOf(false) }

                            val selectedBranchLabel = state.branches.firstOrNull { it.id == state.selectedBranchId }?.name ?: "Sin sucursal"



                            ExposedDropdownMenuBox(

                                expanded = branchExpanded,

                                onExpandedChange = { branchExpanded = !branchExpanded },

                            ) {

                                OutlinedTextField(

                                    value = selectedBranchLabel,

                                    onValueChange = {},

                                    readOnly = true,

                                    label = { Text("Sucursal") },

                                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = branchExpanded) },

                                    modifier = Modifier.menuAnchor().fillMaxWidth(),

                                )

                                ExposedDropdownMenu(

                                    expanded = branchExpanded,

                                    onDismissRequest = { branchExpanded = false },

                                ) {

                                    DropdownMenuItem(

                                        text = { Text("Sin sucursal") },

                                        onClick = {

                                            vm.setBranch(null)

                                            branchExpanded = false

                                        },

                                    )

                                    state.branches.forEach { b ->

                                        DropdownMenuItem(

                                            text = { Text(b.name) },

                                            onClick = {

                                                vm.setBranch(b.id)

                                                branchExpanded = false

                                            },

                                        )

                                    }

                                }

                            }

                            Spacer(Modifier.height(10.dp))

                        }



                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {

                            var urgencyExpanded by remember { mutableStateOf(false) }

                            ExposedDropdownMenuBox(

                                expanded = urgencyExpanded,

                                onExpandedChange = { urgencyExpanded = !urgencyExpanded },

                                modifier = Modifier.weight(1f),

                            ) {

                                OutlinedTextField(

                                    value = state.urgency,

                                    onValueChange = {},

                                    readOnly = true,

                                    label = { Text("Urgencia") },

                                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = urgencyExpanded) },

                                    modifier = Modifier.menuAnchor().fillMaxWidth(),

                                )

                                ExposedDropdownMenu(expanded = urgencyExpanded, onDismissRequest = { urgencyExpanded = false }) {

                                    listOf("LOW", "MEDIUM", "HIGH").forEach { u ->

                                        DropdownMenuItem(

                                            text = { Text(u) },

                                            onClick = { vm.setUrgency(u); urgencyExpanded = false },

                                        )

                                    }

                                }

                            }



                            var typeExpanded by remember { mutableStateOf(false) }

                            ExposedDropdownMenuBox(

                                expanded = typeExpanded,

                                onExpandedChange = { typeExpanded = !typeExpanded },

                                modifier = Modifier.weight(1f),

                            ) {

                                OutlinedTextField(

                                    value = state.requestType,

                                    onValueChange = {},

                                    readOnly = true,

                                    label = { Text("Tipo") },

                                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = typeExpanded) },

                                    modifier = Modifier.menuAnchor().fillMaxWidth(),

                                )

                                ExposedDropdownMenu(expanded = typeExpanded, onDismissRequest = { typeExpanded = false }) {

                                    listOf("ISSUE", "PREVENTIVE_INVENTORY").forEach { t ->

                                        DropdownMenuItem(

                                            text = { Text(t) },

                                            onClick = { vm.setRequestType(t); typeExpanded = false },

                                        )

                                    }

                                }

                            }

                        }

                    }



                    Spacer(Modifier.height(16.dp))

                }

            }

        }

    }

}

