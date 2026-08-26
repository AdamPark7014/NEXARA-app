package mx.nexara.mobile.nativeapp.ui.tickets.screens



import android.app.Application

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

import androidx.compose.material3.Text

import androidx.compose.material3.pulltorefresh.PullToRefreshBox

import androidx.compose.runtime.Composable

import androidx.compose.runtime.LaunchedEffect

import androidx.compose.runtime.collectAsState

import androidx.compose.runtime.getValue

import androidx.compose.ui.Modifier

import androidx.compose.ui.graphics.Color

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

import mx.nexara.mobile.nativeapp.data.api.ClientPortalTicketDto

import mx.nexara.mobile.nativeapp.data.api.toUserMessage

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



data class TicketDetailUiState(

    val isLoading: Boolean = true,

    val isRefreshing: Boolean = false,

    val error: String? = null,

    val ticket: ClientPortalTicketDto? = null,

    val downloading: Boolean = false,

)



class TicketDetailViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = TicketsRepository(app.applicationContext)

    private val _state = MutableStateFlow(TicketDetailUiState())

    val state: StateFlow<TicketDetailUiState> = _state

    private var activeId: Long? = null



    init {

        refreshOnModels(

            models = setOf("Activity", "ActivityEvidence", "ServiceSheet"),

            refresh = { load(activeId, initial = false) },

        )

    }



    fun load(ticketId: Long?, initial: Boolean = true) {

        activeId = ticketId

        if (ticketId == null) {

            _state.update { it.copy(isLoading = false, error = "Ticket inválido") }

            return

        }

        _state.update {

            if (initial) it.copy(isLoading = true, error = null)

            else it.copy(isRefreshing = true, error = null)

        }

        viewModelScope.launch {

            try {

                val t = withContext(Dispatchers.IO) { repo.ticket(ticketId) }

                _state.update { it.copy(isLoading = false, isRefreshing = false, ticket = t, error = null) }

            } catch (e: Exception) {

                _state.update {

                    it.copy(

                        isLoading = false,

                        isRefreshing = false,

                        error = e.toUserMessage("No se pudo cargar el ticket"),

                    )

                }

            }

        }

    }



    fun downloadReport(ticketId: Long?) {

        if (ticketId == null) return

        _state.update { it.copy(downloading = true) }

        viewModelScope.launch {

            try {

                val bytes = withContext(Dispatchers.IO) { repo.ticketReportPdfBytes(ticketId) }

                val app = getApplication<Application>()

                val dir = File(app.cacheDir, "downloads").apply { mkdirs() }

                val file = File(dir, "reporte-ticket-$ticketId.pdf")

                file.writeBytes(bytes)

                openFile(app, file, "application/pdf")

            } catch (e: Exception) {

                _state.update {

                    it.copy(

                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo descargar el PDF",

                    )

                }

            } finally {

                _state.update { it.copy(downloading = false) }

            }

        }

    }

}



private fun ticketStatusTone(status: String?): NxTone {

    val s = (status ?: "").uppercase()

    return when {

        s.contains("CERR") || s.contains("CLOS") || s.contains("FIN") -> NxTone.Success

        s.contains("ALTA") || s.contains("HIGH") || s.contains("URG") -> NxTone.Danger

        s.contains("PROC") || s.contains("OPEN") || s.contains("ASIG") -> NxTone.Warning

        else -> NxTone.Info

    }

}



@OptIn(ExperimentalMaterial3Api::class)

@Composable

fun TicketsTicketDetailScreen(

    ticketId: Long?,

    onBack: () -> Unit,

    modifier: Modifier = Modifier,

) {

    val vm: TicketDetailViewModel = viewModel()

    val state by vm.state.collectAsState()



    LaunchedEffect(ticketId) {

        vm.load(ticketId, initial = true)

    }



    Column(modifier = modifier.fillMaxSize()) {

        Row(

            horizontalArrangement = Arrangement.spacedBy(8.dp),

            modifier = Modifier

                .fillMaxWidth()

                .padding(horizontal = 16.dp, vertical = 16.dp),

        ) {

            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Volver") }

            OutlinedButton(onClick = { vm.load(ticketId, initial = false) }, modifier = Modifier.weight(1f)) { Text("Actualizar") }

        }



        if (state.isLoading) {

            NxLoadingBlock("Cargando ticket…")

            return@Column

        }



        PullToRefreshBox(

            isRefreshing = state.isRefreshing,

            onRefresh = { vm.load(ticketId, initial = false) },

            modifier = Modifier.fillMaxSize(),

        ) {

            when {

                state.ticket == null -> {

                    Column(

                        modifier = Modifier

                            .fillMaxSize()

                            .background(NxColors.Surface)

                            .padding(16.dp),

                    ) {

                        if (!state.error.isNullOrBlank()) {

                            NxErrorBlock(state.error!!) { vm.load(ticketId, initial = true) }

                        } else {

                            NxEmptyState("Ticket no encontrado", "No hay datos para este ticket.")

                        }

                    }

                }

                else -> {

                    val t = state.ticket!!

                    val ageH = ticketAgeHours(t)

                    val responsable = ticketPersonName(t.responsable)

                    val evidencias = ticketMapList(t.evidencias) + ticketMapList(t.activityEvidence)

                    val serviceSheet = ticketAsMap(t.serviceSheet)

                    val location = listOfNotNull(t.branchName, t.branchCity, t.branchState).filter { it.isNotBlank() }.joinToString(" · ")



                    LazyColumn(

                        modifier = Modifier

                            .fillMaxSize()

                            .background(NxColors.Surface)

                            .padding(horizontal = 16.dp),

                        verticalArrangement = Arrangement.spacedBy(12.dp),

                    ) {

                        if (!state.error.isNullOrBlank()) {

                            item { NxErrorBlock(state.error!!) { vm.load(ticketId, initial = true) } }

                        }



                        item {

                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {

                                Column(Modifier.weight(1f)) {

                                    Text(t.titulo ?: "Ticket #${t.id}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)

                                    Text(

                                        listOfNotNull(

                                            t.anNumber?.takeIf { it.isNotBlank() },

                                        ).joinToString(" · "),

                                        color = MaterialTheme.colorScheme.onSurfaceVariant,

                                        style = MaterialTheme.typography.bodySmall,

                                    )

                                }

                                t.estatus?.takeIf { it.isNotBlank() }?.let {

                                    NxStatusChip(it, ticketStatusTone(it))

                                }

                            }

                        }



                        item {

                            NxPanelShell(contentPadding = PaddingValues(14.dp)) {

                                Text("Operación / SLA", fontWeight = FontWeight.SemiBold)

                                TicketDetailRow("Prioridad", t.displayPriority())

                                TicketDetailRow("Tipo", t.ticketType ?: t.urgency)

                                TicketDetailRow("Responsable", responsable)

                                if (location.isNotBlank()) TicketDetailRow("Ubicación", location)

                                TicketDetailRow("Compromiso", t.dueAt?.take(16))

                                TicketDetailRow("SLA", t.slaDueAt?.take(16))

                                TicketDetailRow("Asignación", t.fechaAsignacion?.take(16))

                                TicketDetailRow("Inicio", t.fechaInicio?.take(16))

                                TicketDetailRow("Cierre", t.fechaFinalizacion?.take(16))

                                if (t.isOpen()) {

                                    Text(

                                        "Antigüedad: ${ageH}h${if (ageH >= 48) " · fuera de ventana" else ""}",

                                        color = if (ageH >= 48) Color(0xFFEF4444) else MaterialTheme.colorScheme.onSurfaceVariant,

                                        fontWeight = FontWeight.SemiBold,

                                        style = MaterialTheme.typography.bodySmall,

                                    )

                                }

                            }

                        }



                        if (serviceSheet != null) {

                            item {

                                NxPanelShell(contentPadding = PaddingValues(14.dp)) {

                                    Text("Hoja de servicio", fontWeight = FontWeight.SemiBold)

                                    TicketDetailRow("Estado", ticketMapStr(serviceSheet, "status", "estatus", "estado"))

                                    TicketDetailRow("Técnico", ticketMapStr(serviceSheet, "technicianName", "userName", "responsable"))

                                    TicketDetailRow("Resumen", ticketMapStr(serviceSheet, "workSummary", "summary"))

                                    TicketDetailRow("Observaciones", ticketMapStr(serviceSheet, "observations", "observaciones", "notes"))

                                    TicketDetailRow("Firmado por", ticketMapStr(serviceSheet, "signedName", "clientSignature"))

                                }

                            }

                        }



                        if (evidencias.isNotEmpty()) {

                            item { Text("Evidencias (${evidencias.size})", fontWeight = FontWeight.SemiBold) }

                            items(evidencias.take(8), key = { it.hashCode() }) { ev ->

                                NxPanelShell(contentPadding = PaddingValues(12.dp)) {

                                    Text(

                                        ticketMapStr(ev, "description", "descripcion", "name", "tipo").ifBlank { "Evidencia" },

                                        fontWeight = FontWeight.Medium,

                                    )

                                    val whenAt = ticketMapStr(ev, "createdAt", "fecha", "uploadedAt")

                                    if (whenAt.isNotBlank()) {

                                        Text(whenAt.take(16), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

                                    }

                                }

                            }

                        }



                        item {

                            Button(

                                onClick = { vm.downloadReport(ticketId) },

                                enabled = !state.downloading,

                                modifier = Modifier.fillMaxWidth(),

                            ) { Text(if (state.downloading) "Descargando…" else "Descargar reporte (PDF)") }

                        }



                        item { Spacer(Modifier.height(8.dp)) }

                    }

                }

            }

        }

    }

}



@Composable

private fun TicketDetailRow(label: String, value: String?) {

    if (value.isNullOrBlank()) return

    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {

        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)

    }

}



@Suppress("UNCHECKED_CAST")

private fun ticketAsMap(value: Any?): Map<String, Any?>? = value as? Map<String, Any?>



@Suppress("UNCHECKED_CAST")

private fun ticketMapList(value: Any?): List<Map<String, Any?>> = when (value) {

    is List<*> -> value.mapNotNull { it as? Map<String, Any?> }

    is Map<*, *> -> listOf(value as Map<String, Any?>)

    else -> emptyList()

}



private fun ticketMapStr(map: Map<String, Any?>, vararg keys: String): String {

    for (k in keys) {

        val v = map[k] ?: continue

        val s = v.toString()

        if (s.isNotBlank() && s != "null") return s

    }

    return ""

}



private fun ticketPersonName(value: Any?): String? {

    return when (value) {

        is String -> value.takeIf { it.isNotBlank() }

        is Map<*, *> -> ticketMapStr(value as Map<String, Any?>, "nombre", "name").ifBlank { null }

        else -> null

    }

}


