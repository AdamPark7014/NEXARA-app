package mx.nexara.mobile.nativeapp.ui.tickets.screens



import android.app.Application

import android.net.Uri

import android.content.Context

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

import coil.compose.AsyncImage

import kotlinx.coroutines.Dispatchers

import kotlinx.coroutines.flow.MutableStateFlow

import kotlinx.coroutines.flow.StateFlow

import kotlinx.coroutines.flow.update

import kotlinx.coroutines.launch

import kotlinx.coroutines.withContext

import mx.nexara.mobile.nativeapp.BuildConfig

import mx.nexara.mobile.nativeapp.data.api.ClientBranchDto

import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository

import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock

import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock

import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell

import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip

import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone



private fun absoluteAssetUrl(raw: String?): String? {

    val value = raw?.trim().orEmpty()

    if (value.isBlank()) return null

    if (value.startsWith("http://") || value.startsWith("https://")) return value

    if (!value.startsWith("/")) return BuildConfig.API_BASE_URL.trimEnd('/') + "/" + value

    val origin = BuildConfig.API_BASE_URL.replace(Regex("/api/?$"), "").trimEnd('/')

    return origin + value

}



private fun Context.readLogoBytes(uri: Uri): ByteArray? =

    runCatching { contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()



private fun Context.logoFilenameFor(uri: Uri): String {

    val fromPath = uri.lastPathSegment?.takeIf { it.contains('.') }

    if (fromPath != null) return fromPath

    val mime = contentResolver.getType(uri)

    return when {

        mime?.contains("png", ignoreCase = true) == true -> "logo.png"

        mime?.contains("webp", ignoreCase = true) == true -> "logo.webp"

        else -> "logo.jpg"

    }

}



data class TicketsBranchEditUiState(

    val isLoading: Boolean = true,

    val isRefreshing: Boolean = false,

    val saving: Boolean = false,

    val error: String? = null,

    val message: String? = null,

    val branch: ClientBranchDto? = null,

    val name: String = "",

    val branchNumber: String = "",

    val portalEmail: String = "",

    val portalPassword: String = "",

    val address: String = "",

    val city: String = "",

    val state: String = "",

    val country: String = "",

    val placeId: String = "",

    val latitud: String = "",

    val longitud: String = "",

    val isActive: Boolean = true,

    val logoUri: Uri? = null,

)



class TicketsBranchEditViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = TicketsRepository(app.applicationContext)

    private val _state = MutableStateFlow(TicketsBranchEditUiState())

    val state: StateFlow<TicketsBranchEditUiState> = _state



    fun load(branchId: Long?, initial: Boolean = true) {

        _state.update {

            if (initial) it.copy(isLoading = true, error = null, message = null)

            else it.copy(isRefreshing = true, error = null, message = null)

        }

        viewModelScope.launch {

            try {

                val branch = withContext(Dispatchers.IO) {

                    branchId?.let { id -> repo.branches().firstOrNull { it.id == id } }

                }

                _state.update { s ->

                    if (branch == null && branchId != null) {

                        s.copy(isLoading = false, isRefreshing = false, branch = null)

                    } else if (branch == null) {

                        s.copy(isLoading = false, isRefreshing = false, branch = null)

                    } else {

                        s.copy(

                            isLoading = false,

                            isRefreshing = false,

                            branch = branch,

                            name = branch.name,

                            branchNumber = branch.branchNumber ?: "",

                            portalEmail = branch.portalEmail ?: "",

                            portalPassword = "",

                            address = branch.address ?: "",

                            city = branch.city ?: "",

                            state = branch.state ?: "",

                            country = branch.country ?: "",

                            placeId = branch.placeId ?: "",

                            latitud = branch.latitud?.toString() ?: "",

                            longitud = branch.longitud?.toString() ?: "",

                            isActive = branch.isActive ?: true,

                        )

                    }

                }

            } catch (e: Exception) {

                _state.update {

                    it.copy(

                        isLoading = false,

                        isRefreshing = false,

                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo cargar la sucursal",

                    )

                }

            }

        }

    }



    fun setName(v: String) = _state.update { it.copy(name = v) }

    fun setBranchNumber(v: String) = _state.update { it.copy(branchNumber = v) }

    fun setPortalEmail(v: String) = _state.update { it.copy(portalEmail = v) }

    fun setPortalPassword(v: String) = _state.update { it.copy(portalPassword = v) }

    fun setAddress(v: String) = _state.update { it.copy(address = v) }

    fun setCity(v: String) = _state.update { it.copy(city = v) }

    fun setState(v: String) = _state.update { it.copy(state = v) }

    fun setCountry(v: String) = _state.update { it.copy(country = v) }

    fun setPlaceId(v: String) = _state.update { it.copy(placeId = v) }

    fun setLatitud(v: String) = _state.update { it.copy(latitud = v) }

    fun setLongitud(v: String) = _state.update { it.copy(longitud = v) }

    fun toggleActive() = _state.update { it.copy(isActive = !it.isActive) }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    fun setLogoUri(value: Uri?) = _state.update { it.copy(logoUri = value) }



    fun save(branchId: Long?, context: Context) {

        val s = _state.value

        _state.update { it.copy(saving = true, error = null, message = null) }

        viewModelScope.launch {

            try {

                val lat = s.latitud.trim().toDoubleOrNull()

                val lng = s.longitud.trim().toDoubleOrNull()

                val logoUri = s.logoUri

                val logoBytes = logoUri?.let { uri ->

                    withContext(Dispatchers.IO) { context.readLogoBytes(uri) }

                }

                if (logoUri != null && logoBytes == null) {

                    throw IllegalStateException("No se pudo leer la imagen seleccionada")

                }

                val logoFilename = logoUri?.let { context.logoFilenameFor(it) }



                val saved = withContext(Dispatchers.IO) {

                    if (branchId == null) {

                        repo.createBranch(

                            name = s.name,

                            branchNumber = s.branchNumber,

                            address = s.address,

                            city = s.city,

                            state = s.state,

                            country = s.country,

                            placeId = s.placeId,

                            latitud = lat,

                            longitud = lng,

                            portalEmail = s.portalEmail,

                            portalPassword = s.portalPassword,

                            isActive = s.isActive,

                            logoBytes = logoBytes,

                            logoFilename = logoFilename,

                        )

                    } else {

                        repo.updateBranch(

                            id = branchId,

                            name = s.name,

                            branchNumber = s.branchNumber,

                            address = s.address,

                            city = s.city,

                            state = s.state,

                            country = s.country,

                            placeId = s.placeId,

                            latitud = lat,

                            longitud = lng,

                            portalEmail = s.portalEmail,

                            portalPassword = s.portalPassword.takeIf { it.isNotBlank() },

                            isActive = s.isActive,

                            logoBytes = logoBytes,

                            logoFilename = logoFilename,

                        )

                    }

                }



                _state.update {

                    it.copy(

                        saving = false,

                        branch = saved,

                        logoUri = null,

                        message = if (branchId == null) "Sucursal creada" else "Sucursal actualizada",

                    )

                }

            } catch (e: Exception) {

                _state.update {

                    it.copy(

                        saving = false,

                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo guardar",

                    )

                }

            }

        }

    }

}



@OptIn(ExperimentalMaterial3Api::class)

@Composable

fun TicketsBranchEditScreen(

    branchId: Long?,

    onBack: () -> Unit,

    modifier: Modifier = Modifier,

) {

    val vm: TicketsBranchEditViewModel = viewModel()

    val state by vm.state.collectAsState()

    val context = LocalContext.current



    val pickLogo = rememberLauncherForActivityResult(

        contract = ActivityResultContracts.GetContent(),

    ) { uri: Uri? ->

        vm.setLogoUri(uri)

    }



    LaunchedEffect(branchId) {

        vm.load(branchId, initial = true)

    }



    Column(modifier = modifier.fillMaxSize()) {

        Row(

            horizontalArrangement = Arrangement.spacedBy(8.dp),

            modifier = Modifier

                .fillMaxWidth()

                .padding(horizontal = 16.dp, vertical = 16.dp),

        ) {

            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Volver") }

            Button(

                onClick = { vm.save(branchId, context) },

                enabled = !state.saving,

                modifier = Modifier.weight(1f),

            ) { Text(if (state.saving) "Guardando…" else "Guardar") }

        }



        if (state.isLoading) {

            NxLoadingBlock("Cargando sucursal…")

            return@Column

        }



        PullToRefreshBox(

            isRefreshing = state.isRefreshing,

            onRefresh = { vm.load(branchId, initial = false) },

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

                Text(

                    if (branchId == null) "Nueva sucursal" else "Editar sucursal",

                    style = MaterialTheme.typography.titleLarge,

                    fontWeight = FontWeight.Bold,

                )

                Text(

                    "Datos de acceso, ubicación y logo del portal",

                    style = MaterialTheme.typography.bodySmall,

                    color = MaterialTheme.colorScheme.onSurfaceVariant,

                )

                Spacer(Modifier.height(12.dp))



                if (!state.message.isNullOrBlank()) {

                    NxPanelShell(contentPadding = PaddingValues(12.dp)) {

                        Text(state.message!!, color = MaterialTheme.colorScheme.primary)

                        OutlinedButton(onClick = vm::dismissMessage) { Text("Cerrar") }

                    }

                    Spacer(Modifier.height(10.dp))

                }



                if (!state.error.isNullOrBlank()) {

                    NxErrorBlock(state.error!!) { vm.load(branchId, initial = true) }

                    Spacer(Modifier.height(10.dp))

                }



                NxPanelShell(contentPadding = PaddingValues(14.dp)) {

                    Text("Datos generales", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)

                    Spacer(Modifier.height(8.dp))

                    OutlinedTextField(

                        value = state.name,

                        onValueChange = vm::setName,

                        label = { Text("Nombre *") },

                        modifier = Modifier.fillMaxWidth(),

                        singleLine = true,

                    )

                    Spacer(Modifier.height(8.dp))

                    OutlinedTextField(

                        value = state.branchNumber,

                        onValueChange = vm::setBranchNumber,

                        label = { Text("Número de sucursal *") },

                        modifier = Modifier.fillMaxWidth(),

                        singleLine = true,

                    )

                    Spacer(Modifier.height(8.dp))

                    OutlinedTextField(

                        value = state.portalEmail,

                        onValueChange = vm::setPortalEmail,

                        label = { Text("Usuario (email) *") },

                        modifier = Modifier.fillMaxWidth(),

                        singleLine = true,

                    )

                    Spacer(Modifier.height(8.dp))

                    OutlinedTextField(

                        value = state.portalPassword,

                        onValueChange = vm::setPortalPassword,

                        label = { Text(if (branchId == null) "Password *" else "Password (opcional)") },

                        modifier = Modifier.fillMaxWidth(),

                        singleLine = true,

                    )

                    Spacer(Modifier.height(10.dp))

                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {

                        Text("Estatus", style = MaterialTheme.typography.labelMedium)

                        NxStatusChip(

                            if (state.isActive) "Activa" else "Inactiva",

                            if (state.isActive) NxTone.Success else NxTone.Neutral,

                        )

                    }

                    OutlinedButton(onClick = vm::toggleActive, modifier = Modifier.fillMaxWidth()) {

                        Text(if (state.isActive) "Cambiar a inactiva" else "Cambiar a activa")

                    }

                }



                Spacer(Modifier.height(12.dp))



                NxPanelShell(contentPadding = PaddingValues(14.dp)) {

                    Text("Dirección (opcional)", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)

                    Spacer(Modifier.height(8.dp))

                    OutlinedTextField(

                        value = state.address,

                        onValueChange = vm::setAddress,

                        label = { Text("Dirección") },

                        modifier = Modifier.fillMaxWidth(),

                    )

                    Spacer(Modifier.height(8.dp))

                    OutlinedTextField(

                        value = state.city,

                        onValueChange = vm::setCity,

                        label = { Text("Ciudad") },

                        modifier = Modifier.fillMaxWidth(),

                        singleLine = true,

                    )

                    Spacer(Modifier.height(8.dp))

                    OutlinedTextField(

                        value = state.state,

                        onValueChange = vm::setState,

                        label = { Text("Estado") },

                        modifier = Modifier.fillMaxWidth(),

                        singleLine = true,

                    )

                    Spacer(Modifier.height(8.dp))

                    OutlinedTextField(

                        value = state.country,

                        onValueChange = vm::setCountry,

                        label = { Text("País") },

                        modifier = Modifier.fillMaxWidth(),

                        singleLine = true,

                    )

                }



                Spacer(Modifier.height(12.dp))



                NxPanelShell(contentPadding = PaddingValues(14.dp)) {

                    Text("Coordenadas (opcional)", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)

                    Spacer(Modifier.height(8.dp))

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {

                        OutlinedTextField(

                            value = state.latitud,

                            onValueChange = vm::setLatitud,

                            label = { Text("Latitud") },

                            modifier = Modifier.weight(1f),

                            singleLine = true,

                        )

                        OutlinedTextField(

                            value = state.longitud,

                            onValueChange = vm::setLongitud,

                            label = { Text("Longitud") },

                            modifier = Modifier.weight(1f),

                            singleLine = true,

                        )

                    }

                }



                Spacer(Modifier.height(12.dp))



                NxPanelShell(contentPadding = PaddingValues(14.dp)) {

                    Text("Logo", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)

                    Spacer(Modifier.height(8.dp))



                    val currentLogoUrl = absoluteAssetUrl(state.branch?.logoUrl)

                    val previewModel: Any? = state.logoUri ?: currentLogoUrl



                    if (previewModel != null) {

                        AsyncImage(

                            model = previewModel,

                            contentDescription = "Logo sucursal",

                            modifier = Modifier

                                .fillMaxWidth()

                                .height(120.dp),

                        )

                        Spacer(Modifier.height(8.dp))

                    }



                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {

                        OutlinedButton(

                            onClick = { pickLogo.launch("image/*") },

                            modifier = Modifier.weight(1f),

                        ) { Text("Elegir imagen") }

                        OutlinedButton(

                            onClick = { vm.setLogoUri(null) },

                            enabled = state.logoUri != null,

                            modifier = Modifier.weight(1f),

                        ) { Text("Quitar") }

                    }

                }



                Spacer(Modifier.height(16.dp))

            }

        }

    }

}


