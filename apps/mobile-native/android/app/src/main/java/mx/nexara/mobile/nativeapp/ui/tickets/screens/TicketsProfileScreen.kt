package mx.nexara.mobile.nativeapp.ui.tickets.screens

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
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
import mx.nexara.mobile.nativeapp.data.tickets.PortalProfile
import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository

data class TicketsProfileUiState(
    val isLoading: Boolean = true,
    val saving: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val profile: PortalProfile? = null,
    val contactName: String = "",
    val contactEmail: String = "",
    val contactPhone: String = "",
    val address: String = "",
    val city: String = "",
    val state: String = "",
    val country: String = "",
)

class TicketsProfileViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = TicketsRepository(app.applicationContext)

    private val _state = MutableStateFlow(TicketsProfileUiState())
    val state: StateFlow<TicketsProfileUiState> = _state

    init {
        refresh()
    }

    fun setContactName(v: String) = _state.update { it.copy(contactName = v) }
    fun setContactEmail(v: String) = _state.update { it.copy(contactEmail = v) }
    fun setContactPhone(v: String) = _state.update { it.copy(contactPhone = v) }
    fun setAddress(v: String) = _state.update { it.copy(address = v) }
    fun setCity(v: String) = _state.update { it.copy(city = v) }
    fun setState(v: String) = _state.update { it.copy(state = v) }
    fun setCountry(v: String) = _state.update { it.copy(country = v) }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                val profile = withContext(Dispatchers.IO) { repo.profile() }
                _state.update {
                    it.copy(
                        isLoading = false,
                        profile = profile,
                        contactName = profile?.contactName.orEmpty(),
                        contactEmail = profile?.contactEmail.orEmpty(),
                        contactPhone = profile?.contactPhone.orEmpty(),
                        address = profile?.address.orEmpty(),
                        city = profile?.city.orEmpty(),
                        state = profile?.state.orEmpty(),
                        country = profile?.country.orEmpty(),
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo cargar el perfil",
                    )
                }
            }
        }
    }

    fun save() {
        val s = _state.value
        if (s.profile?.kind == PortalProfile.Kind.BRANCH) {
            _state.update { it.copy(message = "Perfil de sucursal: solo lectura") }
            return
        }
        _state.update { it.copy(saving = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                val updated = withContext(Dispatchers.IO) {
                    repo.updateProfile(
                        contactName = s.contactName,
                        contactEmail = s.contactEmail,
                        contactPhone = s.contactPhone,
                        address = s.address,
                        city = s.city,
                        state = s.state,
                        country = s.country,
                    )
                }
                val mapped = PortalProfile(
                    kind = PortalProfile.Kind.CLIENT,
                    id = updated.id,
                    name = updated.name ?: "",
                    logoUrl = updated.logoUrl,
                    contactName = updated.contactName,
                    contactEmail = updated.contactEmail,
                    contactPhone = updated.contactPhone,
                    address = updated.address,
                    city = updated.city,
                    state = updated.state,
                    country = updated.country,
                    branchNumber = null,
                )
                _state.update {
                    it.copy(
                        saving = false,
                        profile = mapped,
                        message = "Perfil actualizado",
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
fun TicketsProfileScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: TicketsProfileViewModel = viewModel()
    val state by vm.state.collectAsState()
    val editable = state.profile?.kind == PortalProfile.Kind.CLIENT

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.Top,
    ) {
        if (state.isLoading) {
            Text("Cargando perfil…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(10.dp))
            OutlinedButton(onClick = { vm.refresh() }) { Text("Reintentar") }
            return@Column
        }

        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(10.dp))
            OutlinedButton(onClick = { vm.refresh() }) { Text("Reintentar") }
            Spacer(Modifier.height(10.dp))
            OutlinedButton(onClick = onBack) { Text("Volver") }
            return@Column
        }

        if (!state.message.isNullOrBlank()) {
            Text(state.message!!, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(6.dp))
            OutlinedButton(onClick = vm::dismissMessage) { Text("Cerrar") }
            Spacer(Modifier.height(10.dp))
        }

        Text("Contacto", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(8.dp))

        OutlinedTextField(
            value = state.contactName,
            onValueChange = vm::setContactName,
            label = { Text("Nombre de contacto") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = editable,
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = state.contactEmail,
            onValueChange = vm::setContactEmail,
            label = { Text("Email") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = editable,
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = state.contactPhone,
            onValueChange = vm::setContactPhone,
            label = { Text("Teléfono") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = editable,
        )

        Spacer(Modifier.height(14.dp))
        Text("Dirección", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(8.dp))

        OutlinedTextField(
            value = state.address,
            onValueChange = vm::setAddress,
            label = { Text("Dirección") },
            modifier = Modifier.fillMaxWidth(),
            enabled = editable,
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = state.city,
            onValueChange = vm::setCity,
            label = { Text("Ciudad") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = editable,
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = state.state,
            onValueChange = vm::setState,
            label = { Text("Estado") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = editable,
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = state.country,
            onValueChange = vm::setCountry,
            label = { Text("País") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = editable,
        )

        Spacer(Modifier.height(14.dp))
        Button(
            onClick = { vm.save() },
            enabled = editable && !state.saving,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (state.saving) "Guardando…" else "Guardar cambios") }

        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Volver") }
    }
}

