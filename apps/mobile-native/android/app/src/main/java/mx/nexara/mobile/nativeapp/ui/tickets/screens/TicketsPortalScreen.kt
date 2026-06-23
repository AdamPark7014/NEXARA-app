package mx.nexara.mobile.nativeapp.ui.tickets.screens

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
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
import mx.nexara.mobile.nativeapp.data.tickets.PortalProfile
import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository

private fun absoluteAssetUrl(raw: String?): String? {
    val value = raw?.trim().orEmpty()
    if (value.isBlank()) return null
    if (value.startsWith("http://") || value.startsWith("https://")) return value
    if (!value.startsWith("/")) return BuildConfig.API_BASE_URL.trimEnd('/') + "/" + value
    val origin = BuildConfig.API_BASE_URL.replace(Regex("/api/?$"), "").trimEnd('/')
    return origin + value
}

data class TicketsPortalUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val profile: PortalProfile? = null,
)

class TicketsPortalViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = TicketsRepository(app.applicationContext)

    private val _state = MutableStateFlow(TicketsPortalUiState())
    val state: StateFlow<TicketsPortalUiState> = _state

    init {
        refresh()
    }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val profile = withContext(Dispatchers.IO) { repo.profile() }
                _state.update { it.copy(isLoading = false, profile = profile, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo cargar el portal",
                    )
                }
            }
        }
    }
}

@Composable
fun TicketsPortalScreen(
    onExitToPanels: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenBranches: () -> Unit,
    onOpenRequests: () -> Unit,
    onOpenTickets: () -> Unit,
    onOpenFeedbackPending: () -> Unit,
    onOpenInventories: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: TicketsPortalViewModel = viewModel()
    val state by vm.state.collectAsState()
    val context = LocalContext.current

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.Top,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (state.isLoading) {
            Text("Cargando portal…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(10.dp))
            OutlinedButton(onClick = { vm.refresh() }) { Text("Reintentar") }
            return@Column
        }

        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(10.dp))
            Button(onClick = { vm.refresh() }) { Text("Reintentar") }
            Spacer(Modifier.height(10.dp))
            OutlinedButton(onClick = onExitToPanels) { Text("Salir a paneles") }
            return@Column
        }

        val profile = state.profile
        if (profile == null || profile.name.isBlank()) {
            Text("No se encontró perfil del portal.", color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(10.dp))
            OutlinedButton(onClick = onExitToPanels) { Text("Salir a paneles") }
            return@Column
        }

        val logo = absoluteAssetUrl(profile.logoUrl)
        if (logo != null) {
            AsyncImage(
                model = logo,
                contentDescription = "Logo cliente",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(96.dp),
            )
            Spacer(Modifier.height(10.dp))
        }

        Text(profile.name, style = MaterialTheme.typography.titleLarge)
        if (profile.kind == PortalProfile.Kind.BRANCH && !profile.branchNumber.isNullOrBlank()) {
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Sucursal: ${profile.branchNumber}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(12.dp))

        LazyColumn(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(onClick = { vm.refresh() }, modifier = Modifier.weight(1f)) { Text("Actualizar") }
                    OutlinedButton(onClick = onOpenProfile, modifier = Modifier.weight(1f)) { Text("Perfil") }
                    if (profile.kind == PortalProfile.Kind.CLIENT) {
                        OutlinedButton(onClick = onOpenBranches, modifier = Modifier.weight(1f)) { Text("Sucursales") }
                    }
                    OutlinedButton(onClick = onOpenRequests, modifier = Modifier.weight(1f)) { Text("Solicitudes") }
                    OutlinedButton(onClick = onOpenTickets, modifier = Modifier.weight(1f)) { Text("Tickets") }
                    if (profile.kind == PortalProfile.Kind.CLIENT) {
                        OutlinedButton(onClick = onOpenFeedbackPending, modifier = Modifier.weight(1f)) { Text("Feedback") }
                    }
                    OutlinedButton(onClick = onOpenInventories, modifier = Modifier.weight(1f)) { Text("Inventarios") }
                    OutlinedButton(onClick = onExitToPanels, modifier = Modifier.weight(1f)) { Text("Paneles") }
                }
            }
        }
    }
}

