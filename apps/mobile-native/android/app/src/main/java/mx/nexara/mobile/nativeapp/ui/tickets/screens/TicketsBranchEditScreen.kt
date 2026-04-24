package mx.nexara.mobile.nativeapp.ui.tickets.screens

import android.app.Application
import android.net.Uri
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import mx.nexara.mobile.nativeapp.data.api.ClientBranchDto
import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository

data class TicketsBranchEditUiState(
    val isLoading: Boolean = true,
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
    val logoUri: String? = null,
)

class TicketsBranchEditViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = TicketsRepository(app.applicationContext)
    private val _state = MutableStateFlow(TicketsBranchEditUiState())
    val state: StateFlow<TicketsBranchEditUiState> = _state

    fun load(branchId: Long?) {
        _state.update { it.copy(isLoading = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                val branch = withContext(Dispatchers.IO) {
                    branchId?.let { id -> repo.branches().firstOrNull { it.id == id } }
                }
                _state.update { s ->
                    if (branch == null) {
                        s.copy(isLoading = false, branch = null)
                    } else {
                        s.copy(
                            isLoading = false,
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
    fun setLogoUri(value: String?) = _state.update { it.copy(logoUri = value) }

    fun save(branchId: Long?) {
        val s = _state.value
        _state.update { it.copy(saving = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                val lat = s.latitud.trim().toDoubleOrNull()
                val lng = s.longitud.trim().toDoubleOrNull()
                val logoBytes = s.logoUri?.let { uriString ->
                    withContext(Dispatchers.IO) {
                        val uri = Uri.parse(uriString)
                        getApplication<Application>().contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    }
                }
                val logoFilename = s.logoUri?.let { uriString ->
                    try {
                        val uri = Uri.parse(uriString)
                        uri.lastPathSegment?.takeIf { it.contains('.') } ?: "logo.jpg"
                    } catch (_: Exception) {
                        "logo.jpg"
                    }
                }

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
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION,
                )
            } catch (_: Exception) {
                // Best effort; not all providers allow persistable permission.
            }
        }
        vm.setLogoUri(uri?.toString())
    }

    LaunchedEffect(branchId) {
        vm.load(branchId)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.Top,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Volver") }
            Button(
                onClick = { vm.save(branchId) },
                enabled = !state.saving,
                modifier = Modifier.weight(1f),
            ) { Text(if (state.saving) "Guardando…" else "Guardar") }
        }

        Spacer(Modifier.height(12.dp))
        Text(if (branchId == null) "Nueva sucursal" else "Editar sucursal", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))

        if (state.isLoading) {
            Text("Cargando…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }

        if (!state.message.isNullOrBlank()) {
            Text(state.message!!, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(6.dp))
            OutlinedButton(onClick = vm::dismissMessage) { Text("Cerrar") }
            Spacer(Modifier.height(10.dp))
        }

        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(10.dp))
        }

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

        Spacer(Modifier.height(14.dp))
        Text("Dirección (opcional)", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
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

        Spacer(Modifier.height(14.dp))
        Text("Coordenadas (opcional)", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
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

        Spacer(Modifier.height(10.dp))
        OutlinedButton(onClick = vm::toggleActive, modifier = Modifier.fillMaxWidth()) {
            Text(if (state.isActive) "Estatus: Activa (tocar para cambiar)" else "Estatus: Inactiva (tocar para cambiar)")
        }
        Spacer(Modifier.height(12.dp))

        Text("Logo", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(8.dp))

        val currentLogoUrl = state.branch?.logoUrl
        val previewModel: Any? = when {
            !state.logoUri.isNullOrBlank() -> Uri.parse(state.logoUri)
            !currentLogoUrl.isNullOrBlank() -> currentLogoUrl
            else -> null
        }

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
                onClick = { pickLogo.launch(arrayOf("image/*")) },
                modifier = Modifier.weight(1f),
            ) { Text("Elegir imagen") }
            OutlinedButton(
                onClick = { vm.setLogoUri(null) },
                enabled = !state.logoUri.isNullOrBlank(),
                modifier = Modifier.weight(1f),
            ) { Text("Quitar") }
        }
    }
}

