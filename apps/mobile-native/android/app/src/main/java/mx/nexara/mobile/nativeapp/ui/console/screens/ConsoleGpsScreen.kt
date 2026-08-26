package mx.nexara.mobile.nativeapp.ui.console.screens

import android.Manifest
import android.app.Application
import android.content.pm.PackageManager
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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.android.gms.location.LocationServices
import com.google.android.gms.maps.model.LatLng
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.GpsLocationDto
import mx.nexara.mobile.nativeapp.data.api.VisibleUserDto
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.common.MapPin
import mx.nexara.mobile.nativeapp.ui.common.NexaraMap
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl
import java.time.LocalDate

data class GpsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val consent: Boolean? = null,
    val myLocation: GpsLocationDto? = null,
    val team: List<GpsLocationDto> = emptyList(),
    val trajectory: List<GpsLocationDto> = emptyList(),
    val trajectoryDate: String = LocalDate.now().toString(),
    val trajectoryUserOptions: List<VisibleUserDto> = emptyList(),
    val selectedTrajectoryUserId: Long? = null,
    val loadingTrajectory: Boolean = false,
    val posting: Boolean = false,
    val consentToggling: Boolean = false,
)

class ConsoleGpsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)

    private val _state = MutableStateFlow(GpsUiState())
    val state: StateFlow<GpsUiState> = _state

    fun refresh(isOwnerView: Boolean, initial: Boolean = true) {
        val today = LocalDate.now().toString()
        _state.update {
            it.copy(
                isLoading = initial && it.myLocation == null && it.team.isEmpty(),
                isRefreshing = !initial,
                error = null,
                trajectoryDate = today,
            )
        }
        viewModelScope.launch {
            try {
                val me = withContext(Dispatchers.IO) { repo.gpsMe() }
                val team = if (isOwnerView) {
                    withContext(Dispatchers.IO) {
                        runCatching { repo.gpsTeam() }.getOrDefault(emptyList())
                    }
                } else {
                    emptyList()
                }
                val userOptions = if (isOwnerView) {
                    withContext(Dispatchers.IO) { loadTrajectoryUserOptions(team) }
                } else {
                    emptyList()
                }
                val selectedId = _state.value.selectedTrajectoryUserId
                val trajectory = if (isOwnerView && selectedId == null) {
                    emptyList()
                } else {
                    val trajectoryUserId = if (isOwnerView) selectedId else null
                    withContext(Dispatchers.IO) {
                        runCatching { repo.gpsTrajectory(date = today, userId = trajectoryUserId) }
                            .getOrDefault(emptyList())
                    }
                }
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        consent = me.consent,
                        myLocation = me.location,
                        team = team,
                        trajectory = trajectory,
                        trajectoryDate = today,
                        trajectoryUserOptions = userOptions,
                        error = null,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.message ?: "No se pudo cargar GPS",
                    )
                }
            }
        }
    }

    fun setTrajectoryUser(userId: Long?) {
        val today = LocalDate.now().toString()
        _state.update {
            it.copy(
                selectedTrajectoryUserId = userId,
                loadingTrajectory = true,
                trajectoryDate = today,
            )
        }
        viewModelScope.launch {
            try {
                val trajectory = withContext(Dispatchers.IO) {
                    repo.gpsTrajectory(date = today, userId = userId)
                }
                _state.update {
                    it.copy(
                        trajectory = trajectory,
                        loadingTrajectory = false,
                        error = null,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loadingTrajectory = false,
                        error = e.message ?: "No se pudo cargar el trayecto",
                    )
                }
            }
        }
    }

    fun toggleConsent(enabled: Boolean) {
        _state.update { it.copy(consentToggling = true, error = null) }
        viewModelScope.launch {
            try {
                val result = withContext(Dispatchers.IO) { repo.gpsUpdateConsent(enabled) }
                _state.update {
                    it.copy(
                        consent = result.consent ?: enabled,
                        consentToggling = false,
                    )
                }
                refresh(isOwnerView = false)
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        consentToggling = false,
                        error = e.message ?: "No se pudo actualizar el consentimiento GPS",
                    )
                }
            }
        }
    }

    fun postNow(lat: Double, lng: Double, speedKmh: Double?) {
        _state.update { it.copy(posting = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.gpsPost(lat, lng, speedKmh) }
                refresh(isOwnerView = false)
            } catch (e: Exception) {
                _state.update { it.copy(posting = false, error = e.message ?: "No se pudo enviar ubicación") }
            } finally {
                _state.update { it.copy(posting = false) }
            }
        }
    }

    private suspend fun loadTrajectoryUserOptions(team: List<GpsLocationDto>): List<VisibleUserDto> {
        val fromTeam = team.mapNotNull { loc ->
            loc.usuario?.let { VisibleUserDto(it.id, it.nombre, it.email) }
                ?: VisibleUserDto(loc.usuarioId, "Usuario ${loc.usuarioId}", null)
        }
        val fromUsers = runCatching { repo.usersFetch(preferAssignable = true) }.getOrDefault(emptyList())
        return (fromTeam + fromUsers).distinctBy { it.id }.sortedBy { it.nombre.lowercase() }
    }
}

private fun gpsCoord(value: Any?): Double? =
    when (value) {
        is Number -> value.toDouble()
        is String -> value.toDoubleOrNull()
        else -> null
    }

private fun trajectoryPolyline(trajectory: List<GpsLocationDto>): List<LatLng> =
    trajectory.mapNotNull { loc ->
        val lat = gpsCoord(loc.latitud) ?: return@mapNotNull null
        val lng = gpsCoord(loc.longitud) ?: return@mapNotNull null
        LatLng(lat, lng)
    }

private fun trajectoryPin(loc: GpsLocationDto, index: Int, total: Int): MapPin? {
    val lat = gpsCoord(loc.latitud) ?: return null
    val lng = gpsCoord(loc.longitud) ?: return null
    val time = loc.ultimaActualizacion?.takeLast(8)?.take(5) ?: "—"
    val label = when (index) {
        0 -> "Inicio"
        total - 1 -> if (total > 1) "Fin" else "Punto"
        else -> "Punto ${index + 1}"
    }
    return MapPin(
        id = "traj-${loc.id}-$index",
        lat = lat,
        lng = lng,
        title = label,
        snippet = time,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsoleGpsScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val context = LocalContext.current
    val vm: ConsoleGpsViewModel = viewModel()
    val state by vm.state.collectAsState()

    val authRepo = remember(context) { AuthRepository(context) }
    val user = remember(authRepo) { authRepo.loadSession() }
    val isSuperAdmin = user?.isSuperAdmin == true
    val isAdmin = !isSuperAdmin && (user?.permissions ?: emptyList()).contains("console.admin")
    val isOwnerView = isSuperAdmin || isAdmin

    if (state.isLoading && state.error == null && state.myLocation == null && state.team.isEmpty()) {
        vm.refresh(isOwnerView, initial = true)
    }

    val hasPerm =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.refresh(isOwnerView, initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(NxColors.Surface)
            .padding(contentPadding),
        verticalArrangement = Arrangement.Top,
    ) {
        NxSectionHeader(
            title = if (isOwnerView) "Monitoreo GPS del equipo" else "GPS",
            subtitle = if (isOwnerView) "Ubicaciones en tiempo real" else "Comparte tu ubicación con el equipo",
        )
        Spacer(modifier = Modifier.height(10.dp))

        if (state.isLoading) {
            NxLoadingBlock("Cargando GPS…")
            return@Column
        }
        if (!state.error.isNullOrBlank()) {
            NxErrorBlock(state.error!!) { vm.refresh(isOwnerView, initial = false) }
            return@Column
        }

        if (!isOwnerView) {
            NxPanelShell {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Compartir ubicación", style = MaterialTheme.typography.titleSmall)
                        Text(
                            if (state.consent == true) "GPS activo" else "GPS inactivo",
                            color = if (state.consent == true) NxColors.Success else NxColors.Muted,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    Switch(
                        checked = state.consent == true,
                        onCheckedChange = vm::toggleConsent,
                        enabled = !state.consentToggling,
                    )
                }
            }
            Spacer(modifier = Modifier.height(12.dp))

            if (!hasPerm) {
                mx.nexara.mobile.nativeapp.ui.common.LocationPermissionBanner(
                    message = "Activa la ubicación para enviar tu GPS al equipo.",
                    requestOnAppear = true,
                )
                Spacer(modifier = Modifier.height(12.dp))
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
        } else {
            Button(onClick = { vm.refresh(isOwnerView, initial = false) }, enabled = !state.isLoading) {
                Text("Actualizar ubicaciones")
            }
            Spacer(modifier = Modifier.height(12.dp))

            if (state.trajectoryUserOptions.isNotEmpty()) {
                var userMenuExpanded by remember { mutableStateOf(false) }
                val selectedUser = state.trajectoryUserOptions.firstOrNull { it.id == state.selectedTrajectoryUserId }
                val selectedLabel = selectedUser?.nombre ?: "Ver trayecto de…"

                    ExposedDropdownMenuBox(
                        expanded = userMenuExpanded,
                        onExpandedChange = { userMenuExpanded = it },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        OutlinedTextField(
                            value = selectedLabel,
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Trayecto del día") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = userMenuExpanded) },
                            modifier = Modifier
                                .menuAnchor()
                                .fillMaxWidth(),
                        )
                        DropdownMenu(
                            expanded = userMenuExpanded,
                            onDismissRequest = { userMenuExpanded = false },
                        ) {
                            state.trajectoryUserOptions.forEach { u ->
                                DropdownMenuItem(
                                    text = { Text(u.nombre) },
                                    onClick = {
                                        vm.setTrajectoryUser(u.id)
                                        userMenuExpanded = false
                                    },
                                )
                            }
                        }
                    }
                Spacer(modifier = Modifier.height(12.dp))
            }
        }

        val all = if (isOwnerView) {
            buildList {
                addAll(state.team)
                state.myLocation?.let { add(it) }
            }
        } else {
            buildList {
                state.myLocation?.let { add(it) }
                addAll(state.team)
            }
        }

        val polylinePoints = trajectoryPolyline(state.trajectory)
        val trajectoryPins = if (polylinePoints.isNotEmpty()) {
            val total = state.trajectory.size
            listOfNotNull(
                state.trajectory.firstOrNull()?.let { trajectoryPin(it, 0, total) },
                if (total > 1) state.trajectory.lastOrNull()?.let { trajectoryPin(it, total - 1, total) } else null,
            )
        } else {
            emptyList()
        }
        val livePins = all.mapNotNull { loc ->
            val lat = gpsCoord(loc.latitud) ?: return@mapNotNull null
            val lng = gpsCoord(loc.longitud) ?: return@mapNotNull null
            MapPin(
                id = "live-${loc.usuarioId}",
                lat = lat,
                lng = lng,
                title = loc.usuario?.nombre ?: "Usuario ${loc.usuarioId}",
                snippet = "$lat, $lng",
            )
        }
        val mapPins = if (trajectoryPins.isNotEmpty()) trajectoryPins else livePins

        NexaraMap(
            pins = mapPins,
            polylinePoints = polylinePoints,
            modifier = Modifier.fillMaxWidth().height(280.dp),
            height = 280.dp,
        )
        Spacer(modifier = Modifier.height(12.dp))

        val showTrajectoryList = state.trajectory.isNotEmpty() && (!isOwnerView || state.selectedTrajectoryUserId != null)
        if (showTrajectoryList) {
            val trajTitle = if (isOwnerView) {
                val name = state.trajectoryUserOptions.firstOrNull { it.id == state.selectedTrajectoryUserId }?.nombre
                "Trayecto de ${name ?: "usuario"} · ${state.trajectory.size} punto(s)"
            } else {
                "Trayecto de hoy · ${state.trajectory.size} punto(s)"
            }
            Text(
                trajTitle,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            if (state.loadingTrajectory) {
                Spacer(modifier = Modifier.height(8.dp))
                NxLoadingBlock("Cargando trayecto…")
            } else {
                Spacer(modifier = Modifier.height(8.dp))
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.fillMaxWidth().height(160.dp),
                ) {
                    items(state.trajectory.take(50), key = { it.id }) { pt ->
                        val lat = gpsCoord(pt.latitud)
                        val lng = gpsCoord(pt.longitud)
                        NxPanelShell {
                            Column {
                                Text(
                                    pt.ultimaActualizacion?.take(19)?.replace('T', ' ') ?: "—",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Medium,
                                )
                                if (lat != null && lng != null) {
                                    Text(
                                        "${lat}, $lng",
                                        color = NxColors.Muted,
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                            }
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
        }

        if (all.isEmpty() && polylinePoints.isEmpty()) {
            NxEmptyState(
                title = if (isOwnerView) "Sin ubicaciones" else "Sin ubicación enviada",
                subtitle = if (isOwnerView)
                    "Aún no hay ubicaciones reportadas por el equipo."
                else "Activa el GPS y envía tu ubicación con el botón de arriba.",
            )
        }

        if (all.isNotEmpty()) {
            NxSectionHeader("Ubicaciones activas", "${all.size} usuario(s)")
            Spacer(modifier = Modifier.height(8.dp))
        }

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(all.take(200), key = { "${it.usuarioId}-${it.id}" }) { item ->
                val lat = item.latitud.toString()
                val lng = item.longitud.toString()
                NxPanelShell {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        val name = item.usuario?.nombre ?: "Usuario ${item.usuarioId}"
                        Text(name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        Text("$lat, $lng", color = NxColors.Muted, style = MaterialTheme.typography.bodySmall)
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
}
