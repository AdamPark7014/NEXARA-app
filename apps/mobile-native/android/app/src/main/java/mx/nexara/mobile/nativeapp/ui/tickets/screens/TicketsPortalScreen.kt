package mx.nexara.mobile.nativeapp.ui.tickets.screens

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
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
import mx.nexara.mobile.nativeapp.data.api.ClientPortalTicketDto
import mx.nexara.mobile.nativeapp.data.api.ClientTicketRequestDto
import mx.nexara.mobile.nativeapp.data.tickets.PortalProfile
import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiGrid
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.util.openFile
import java.io.File

private fun absoluteAssetUrl(raw: String?): String? {
    val value = raw?.trim().orEmpty()
    if (value.isBlank()) return null
    if (value.startsWith("http://") || value.startsWith("https://")) return value
    if (!value.startsWith("/")) return BuildConfig.API_BASE_URL.trimEnd('/') + "/" + value
    val origin = BuildConfig.API_BASE_URL.replace(Regex("/api/?$"), "").trimEnd('/')
    return origin + value
}

data class TicketsPortalStats(
    val totalTickets: Int = 0,
    val pendingTickets: Int = 0,
    val closedTickets: Int = 0,
    val openRequests: Int = 0,
    val pendingFeedback: Int = 0,
)

data class TicketsPortalUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val downloadingPortalReport: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val profile: PortalProfile? = null,
    val stats: TicketsPortalStats = TicketsPortalStats(),
)

class TicketsPortalViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = TicketsRepository(app.applicationContext)

    private val _state = MutableStateFlow(TicketsPortalUiState())
    val state: StateFlow<TicketsPortalUiState> = _state

    init {
        refresh(initial = true)
    }

    fun refresh(initial: Boolean = false) {
        _state.update {
            if (initial) it.copy(isLoading = true, error = null)
            else it.copy(isRefreshing = true, error = null)
        }
        viewModelScope.launch {
            try {
                val summary = withContext(Dispatchers.IO) {
                    val profile = repo.profile()
                    val tickets = repo.tickets()
                    val requests = repo.requests()
                    val feedback = if (profile?.kind == PortalProfile.Kind.CLIENT) repo.pendingFeedback() else emptyList()
                    PortalLoadResult(profile, tickets, requests, feedback)
                }
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        profile = summary.profile,
                        stats = computeStats(summary.tickets, summary.requests, summary.feedback),
                        error = null,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo cargar el portal",
                    )
                }
            }
        }
    }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    fun downloadPortalReportPdf() {
        _state.update { it.copy(downloadingPortalReport = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) { repo.portalReportPdfBytes() }
                val app = getApplication<Application>()
                val dir = File(app.cacheDir, "downloads").apply { mkdirs() }
                val file = File(dir, "reporte-portal.pdf")
                file.writeBytes(bytes)
                openFile(app, file, "application/pdf")
                _state.update { it.copy(downloadingPortalReport = false, message = "Reporte descargado") }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        downloadingPortalReport = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo descargar el reporte",
                    )
                }
            }
        }
    }

    private data class PortalLoadResult(
        val profile: PortalProfile?,
        val tickets: List<ClientPortalTicketDto>,
        val requests: List<ClientTicketRequestDto>,
        val feedback: List<mx.nexara.mobile.nativeapp.data.api.PendingFeedbackTicketDto>,
    )

    private fun computeStats(
        tickets: List<ClientPortalTicketDto>,
        requests: List<ClientTicketRequestDto>,
        feedback: List<mx.nexara.mobile.nativeapp.data.api.PendingFeedbackTicketDto>,
    ): TicketsPortalStats {
        val closed = tickets.count { !it.isOpen() }
        val pending = tickets.count { it.isOpen() }
        val openRequests = requests.count { (it.status ?: "").uppercase() != "CLOSED" }
        return TicketsPortalStats(
            totalTickets = tickets.size,
            pendingTickets = pending,
            closedTickets = closed,
            openRequests = openRequests,
            pendingFeedback = feedback.size,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TicketsPortalScreen(
    onExitToPanels: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenBranches: () -> Unit,
    onOpenRequests: () -> Unit,
    onOpenTickets: () -> Unit,
    onOpenFeedbackPending: () -> Unit,
    onOpenInventories: () -> Unit,
    onOpenChat: () -> Unit = {},
    onOpenServices: () -> Unit = {},
    onOpenHelp: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val vm: TicketsPortalViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.isLoading) {
        Column(
            modifier = modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            NxLoadingBlock("Cargando portal…")
        }
        return
    }

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(NxColors.Surface)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (!state.error.isNullOrBlank()) {
                item {
                    NxErrorBlock(state.error!!, onRetry = { vm.refresh(initial = true) })
                }
            }
            if (!state.message.isNullOrBlank()) {
                item {
                    Text(state.message!!, color = MaterialTheme.colorScheme.primary)
                    OutlinedButton(onClick = vm::dismissMessage) { Text("Cerrar aviso") }
                }
            }

            val profile = state.profile
            if (profile == null || profile.name.isBlank()) {
                item {
                    Text("No se encontró perfil del portal.", color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = onExitToPanels) { Text("Salir a paneles") }
                }
                return@LazyColumn
            }

            item {
                NxPanelShell(contentPadding = PaddingValues(16.dp)) {
                    val logo = absoluteAssetUrl(profile.logoUrl)
                    if (logo != null) {
                        AsyncImage(
                            model = logo,
                            contentDescription = "Logo cliente",
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(96.dp),
                        )
                        Spacer(Modifier.height(8.dp))
                    }
                    Text(profile.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = NxColors.Slate)
                    if (profile.kind == PortalProfile.Kind.BRANCH && !profile.branchNumber.isNullOrBlank()) {
                        Text(
                            text = "Sucursal: ${profile.branchNumber}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = NxColors.Muted,
                        )
                    }
                    Text(
                        "Seguimiento de servicio y soporte",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                }
            }

            item {
                NxKpiGrid(
                    items = listOf(
                        NxKpi("Tickets", "${state.stats.totalTickets}", tone = NxTone.Brand),
                        NxKpi("En proceso", "${state.stats.pendingTickets}", tone = if (state.stats.pendingTickets > 0) NxTone.Warning else NxTone.Success),
                        NxKpi("Cerrados", "${state.stats.closedTickets}", tone = NxTone.Neutral),
                        NxKpi("Solicitudes", "${state.stats.openRequests}", tone = if (state.stats.openRequests > 0) NxTone.Info else NxTone.Neutral),
                    ),
                )
            }

            item {
                NxSectionHeader("Módulos", "Acceso rápido al portal")
            }

            item {
                PortalNavCard(
                    title = "Estado de tickets",
                    subtitle = "${state.stats.pendingTickets} en proceso · ${state.stats.closedTickets} cerrados",
                    onClick = onOpenTickets,
                )
            }
            item {
                PortalNavCard(
                    title = "Solicitudes",
                    subtitle = if (state.stats.openRequests > 0) "${state.stats.openRequests} activas" else "Levantar o revisar solicitudes",
                    badge = if (state.stats.openRequests > 0) "${state.stats.openRequests}" else null,
                    onClick = onOpenRequests,
                )
            }
            if (profile.kind == PortalProfile.Kind.CLIENT && state.stats.pendingFeedback > 0) {
                item {
                    PortalNavCard(
                        title = "Confirmación de servicio",
                        subtitle = "Evalúa servicios finalizados",
                        badge = "${state.stats.pendingFeedback}",
                        tone = NxTone.Warning,
                        onClick = onOpenFeedbackPending,
                    )
                }
            }
            if (profile.kind == PortalProfile.Kind.CLIENT) {
                item {
                    PortalNavCard(
                        title = "Mis servicios",
                        subtitle = "Contratos, facturas y cotizaciones",
                        onClick = onOpenServices,
                    )
                }
            }
            item {
                PortalNavCard(title = "Inventarios", subtitle = "Snapshots y mantenimiento", onClick = onOpenInventories)
            }
            item {
                PortalNavCard(
                    title = "Centro de ayuda",
                    subtitle = "Preguntas frecuentes y guías",
                    onClick = onOpenHelp,
                )
            }
            item {
                PortalNavCard(title = "Mi perfil", subtitle = "Datos corporativos", onClick = onOpenProfile)
            }
            if (profile.kind == PortalProfile.Kind.CLIENT) {
                item {
                    PortalNavCard(title = "Sucursales", subtitle = "Gestión de sitios", onClick = onOpenBranches)
                }
                if (state.stats.pendingFeedback == 0) {
                    item {
                        PortalNavCard(title = "Feedback", subtitle = "Sin pendientes", onClick = onOpenFeedbackPending)
                    }
                }
                item {
                    PortalNavCard(
                        title = "Reporte del portal",
                        subtitle = if (state.downloadingPortalReport) "Descargando…" else "PDF de actividad y tickets",
                        onClick = { if (!state.downloadingPortalReport) vm.downloadPortalReportPdf() },
                    )
                }
            }
            item {
                PortalNavCard(title = "Chat", subtitle = "Mensajes con soporte", onClick = onOpenChat)
            }
            item {
                OutlinedButton(onClick = onExitToPanels, modifier = Modifier.fillMaxWidth()) {
                    Text("Salir a paneles")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PortalNavCard(
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    badge: String? = null,
    tone: NxTone = NxTone.Brand,
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .semantics {
                contentDescription = if (badge != null) {
                    "$title, $subtitle, $badge pendientes"
                } else {
                    "$title, $subtitle"
                }
                role = Role.Button
            },
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
        elevation = CardDefaults.cardElevation(NxDimens.PanelElevation),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
            }
            if (badge != null) {
                NxStatusChip(badge, tone)
            }
        }
    }
}
