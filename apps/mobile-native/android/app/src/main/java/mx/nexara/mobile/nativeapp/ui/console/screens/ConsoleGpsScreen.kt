package mx.nexara.mobile.nativeapp.ui.console.screens

import android.Manifest
import android.app.Application
import android.content.pm.PackageManager
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.android.gms.location.LocationServices
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.GpsLocationDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl

data class GpsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val myLocation: GpsLocationDto? = null,
    val team: List<GpsLocationDto> = emptyList(),
    val posting: Boolean = false,
)

class ConsoleGpsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)

    private val _state = MutableStateFlow(GpsUiState())
    val state: StateFlow<GpsUiState> = _state

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val me = withContext(Dispatchers.IO) { repo.gpsMe() }
                val team = withContext(Dispatchers.IO) {
                    runCatching { repo.gpsTeam() }.getOrDefault(emptyList())
                }
                _state.update { it.copy(isLoading = false, myLocation = me.location, team = team, error = null) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message ?: "No se pudo cargar GPS") }
            }
        }
    }

    fun postNow(lat: Double, lng: Double, speedKmh: Double?) {
        _state.update { it.copy(posting = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.gpsPost(lat, lng, speedKmh) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(posting = false, error = e.message ?: "No se pudo enviar ubicación") }
            } finally {
                _state.update { it.copy(posting = false) }
            }
        }
    }
}

@Composable
fun ConsoleGpsScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val context = LocalContext.current
    val vm: ConsoleGpsViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.isLoading && state.error == null && state.myLocation == null) vm.refresh()

    val hasPerm =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.Top,
    ) {
        Text("GPS", style = MaterialTheme.typography.titleLarge)
        Spacer(modifier = Modifier.height(10.dp))

        if (state.isLoading) {
            Text("Cargando...", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }
        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.height(12.dp))
            Button(onClick = { vm.refresh() }) { Text("Reintentar") }
            return@Column
        }

        if (!hasPerm) {
            Text(
                "Falta permiso de ubicación. Actívalo para enviar tu GPS.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Button(
                onClick = {
                    val fused = LocationServices.getFusedLocationProviderClient(context)
                    fused.lastLocation.addOnSuccessListener { loc ->
                        if (loc != null) {
                            val speedKmh = if (loc.hasSpeed()) (loc.speed.toDouble() * 3.6) else null
                            vm.postNow(loc.latitude, loc.longitude, speedKmh)
                        }
                    }
                },
                enabled = !state.posting,
            ) {
                Text(if (state.posting) "Enviando..." else "Enviar mi ubicación ahora")
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        val all = buildList {
            state.myLocation?.let { add(it) }
            addAll(state.team)
        }

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(all.take(200)) { item ->
                val lat = item.latitud.toString()
                val lng = item.longitud.toString()
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        val name = item.usuario?.nombre ?: "Usuario ${item.usuarioId}"
                        Text(name, style = MaterialTheme.typography.titleSmall)
                        Text("$lat, $lng", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = { openExternalUrl(context, "https://www.google.com/maps?q=$lat,$lng") }) {
                            Text("Ver en mapa")
                        }
                    }
                }
            }
        }
    }
}

